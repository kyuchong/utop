# -*- coding: utf-8 -*-
"""Jira · 결함 — main.py 에서 글자 그대로 옮겨 왔다(2026-09-28, 분리 2호).

바뀐 것은 셋뿐이다: @app→@router, main 의 이름→core.<이름>(앞 밑줄 뗀 것),
그리고 임포트 머리. 주소는 하나도 안 바뀐다.

이 파일이 대는 길:
  /api/jira/…             설정·연결 시험·사용자 찾기·이슈 조회/생성/첨부/댓글·
                          캐시(저장본)·JQL 묻기(ask)·칸(fields/columns)·버전
  /api/issues/…           프로젝트별 이슈 저장본 동기화
  /api/release-summary    릴리즈 요약 저장
  /api/defects/…          결함 — 플랜에서 걸고 Jira 로 민다
  /api/tc/{tcid}/crumb    결함 창이 세우는 빵부스러기(시험 항목 폴더 길)

main 에 남긴 것: Jira 계정 로그인(인증 쪽), 사이클이 결함을 자동으로 거는
_auto_defect·_jira_defect_defaults(사이클 쪽), Confluence(AI·RAG 묶음과 함께 갈 것).
그것들이 여기 것을 쓰면 main 이 접합부에서 이름을 받아 간다(_jira_cfg 등).
"""
import asyncio
import json
import os
import re
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request

import core
import db

router = APIRouter()


# ══════════════ Jira 연동 (Server 8.14, REST API v2) ══════════════
def _jira_cfg():
    if core.JIRA_FILE.exists():
        try:
            return core.load_json(core.JIRA_FILE)
        except Exception:
            return {}
    return {}

def _jira_headers(cfg):
    auth = (cfg.get("auth") or "basic").lower()
    tok = cfg.get("token") or ""
    user = cfg.get("user") or ""
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if auth == "bearer":
        h["Authorization"] = "Bearer " + tok        # Jira Server PAT
    else:
        import base64 as _b64
        h["Authorization"] = "Basic " + _b64.b64encode((user + ":" + tok).encode("utf-8")).decode("ascii")
    return h

def _jira_call(method, path, cfg=None, **kw):
    import httpx
    cfg = cfg or _jira_cfg()
    base = (cfg.get("url") or "").rstrip("/")
    if not base:
        return None, {"ok": False, "error": "Jira URL이 설정되지 않았습니다 (시스템 → Jira 연동 설정)"}
    try:
        with httpx.Client(timeout=25, verify=cfg.get("verify", True)) as c:
            r = c.request(method, base + path, headers=_jira_headers(cfg), **kw)
        return r, None
    except Exception as e:
        return None, {"ok": False, "error": str(e)[:300]}

@router.get("/api/jira/defect/schema")
async def api_defect_schema():
    """분류 스키마(드롭다운 옵션) 반환."""
    return {"ok": True, "device": _DEF_DEVICE, "category_field": _DEF_CAT_FIELD,
            "category_live": _DEF_CAT_LIVE, "item": _DEF_ITEM, "type3": _DEF_TYPE3}

@router.get("/api/jira/defect/class")
async def api_defect_class_get():
    """저장된 전체 분류 반환 {key: {...}}."""
    return {"ok": True, "classes": _load_defect_class()}

@router.post("/api/jira/defect/class")
async def api_defect_class_save(payload: dict):
    """수동 분류 저장/수정. payload={key, class:{source,device,category,item,type3}}."""
    key = str(payload.get("key") or "").strip()
    if not key:
        raise HTTPException(400, "이슈 키가 없습니다")
    store = _load_defect_class()
    cls = _defect_norm(payload.get("class") or {})
    cls["by"] = "manual"
    import datetime as _dt
    cls["at"] = _dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    store[key] = cls
    _save_defect_class(store)
    return {"ok": True, "key": key, "class": cls}

@router.post("/api/jira/defect/classify")
async def api_defect_classify(payload: dict):
    """이슈키 목록을 LLM(제마)으로 자동 분류 → 저장. payload={keys:[...], overwrite:bool}."""
    keys = [str(k).strip() for k in (payload.get("keys") or []) if str(k).strip()]
    if not keys:
        raise HTTPException(400, "분류할 이슈가 없습니다")
    overwrite = bool(payload.get("overwrite"))
    store = _load_defect_class()
    todo = keys if overwrite else [k for k in keys if not (store.get(k) or {}).get("source")]
    if not todo:
        return {"ok": True, "classified": 0, "skipped": len(keys), "message": "이미 모두 분류됨(덮어쓰기 아님)"}
    # 쓸 LLM 도 **설정이 정한다** — 용도에 붙여 둔 것이 있으면 그것(지시)
    llm = core.llm_pick("jira_defect")
    if not llm:
        raise HTTPException(400, "쓸 수 있는 LLM 이 없습니다 (SETUP → LLM 설정)")
    texts = await _jira_texts_for(todo)
    # 프롬프트는 **SETUP 의 용도별 프롬프트**에서 온다(지시). 고를 수 있는 값
    # 목록만 코드가 뒤에 붙인다 — 그것은 글이 아니라 스키마라, 사람이 프롬프트를
    # 손보다 지우면 LLM 이 없는 값을 지어내기 시작한다.
    sys_p = (core.prompt_of("jira_defect").get("system") or "") + "\n" + _defect_schema_text()
    import json as _json, datetime as _dt, re as _re, asyncio as _aio
    now = _dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    fails = []

    # 한 건씩 줄 세우면 백 건에 몇 분이다. 다섯 갈래로 나란히 부른다 —
    # 더 늘리면 로컬 LLM 이 큐에서 밀려 되레 느려진다.
    gate = _aio.Semaphore(5)

    async def one(k: str):
        txt = texts.get(k) or ""
        if not txt:
            return k, None
        async with gate:
            try:
                out = await _jira_llm_complete(
                    llm, sys_p, "이슈:\n" + txt + "\n분류 JSON:", max_tokens=200, temp=0.0,
                    purpose="jira_defect")
                m = _re.search(r"\{[\s\S]*\}", str(out or ""))
                return k, _defect_norm(_json.loads(m.group(0)) if m else {})
            except Exception:
                return k, _defect_norm({})

    done = 0
    for k, cls in await _aio.gather(*[one(k) for k in todo]):
        if cls is None:
            fails.append(k); continue
        if not cls.get("source"):
            # 못 가른 것은 **센 수에 넣지 않는다** — 넣으면 「200건 갈랐고
            # 200건 못 갈랐다」 처럼 두 숫자가 서로를 부정한다
            fails.append(k)
        else:
            done += 1
        cls["by"] = "llm"; cls["at"] = now
        store[k] = cls
    _save_defect_class(store)
    return {"ok": True, "classified": done, "failed": fails, "total": len(todo),
            "llm": llm.get("name") or llm.get("model") or ""}

@router.get("/api/jira/config")
async def jira_get_config():
    return _jira_cfg()


@router.post("/api/jira/issue/{key}/description")
async def jira_set_description(key: str, data: dict):
    """올린 뒤 **본문만** 다시 쓴다.

    그림은 이슈를 만든 뒤에야 붙일 수 있는데, 지라가 첨부 이름을 그대로
    받아 준다는 보장이 없다(한글 이름은 서버 인코딩에 따라 바뀐다). 본문이
    부르는 이름과 실제 첨부 이름이 어긋나면 **깨진 그림 자리**만 남는다
    (지적: 지라에서 이미지가 안 보인다). 그래서 붙여 본 뒤, 실제 이름으로
    본문을 한 번 고쳐 준다.
    """
    desc = str(data.get("description") or "")
    if not desc:
        return {"ok": False, "error": "본문이 비었습니다"}
    r, err = _jira_call("PUT", f"/rest/api/2/issue/{key}", json={"fields": {"description": desc}})
    if err:
        return err
    if r is None or not r.is_success:
        return {"ok": False, "error": f"{getattr(r, 'status_code', '?')} · {getattr(r, 'text', '')[:300]}"}
    return {"ok": True}


_JIRA_BASE_CACHE: list = []


@router.get("/api/jira/base")
async def jira_base():
    """지라 **주소만** 알려 준다 — 표에서 이슈로 건너뛰는 데 쓴다(지시).

    /api/jira/config 는 조회 계정의 토큰까지 들고 있다. 결함 표가 주소 한 줄
    쓰자고 그것을 통째로 받아 갈 이유가 없다.

    **지라가 스스로 말하는 주소**(serverInfo.baseUrl)를 먼저 쓴다. 우리가
    설정에 적은 주소는 API 를 부르는 길일 뿐이고, 사람이 브라우저로 여는
    주소는 다를 수 있다 — 그 둘이 갈리면 링크가 엉뚱한 데로 간다.
    """
    cfg_url = str((_jira_cfg() or {}).get("url") or "").rstrip("/")
    if _JIRA_BASE_CACHE:
        return {"ok": True, "url": _JIRA_BASE_CACHE[0] or cfg_url}
    url = cfg_url
    try:
        r, err = _jira_call("GET", "/rest/api/2/serverInfo")
        if not err and r is not None and r.is_success:
            url = str((r.json() or {}).get("baseUrl") or "").rstrip("/") or cfg_url
    except Exception:
        pass
    _JIRA_BASE_CACHE.append(url)
    return {"ok": True, "url": url}

@router.post("/api/jira/config")
async def jira_save_config(data: dict):
    cur = _jira_cfg()
    for k in ["url", "user", "token", "auth", "default_project", "default_issuetype", "verify", "fav_projects", "ai", "panel_templates", "login_enabled", "login_auto_create", "login_url"]:
        if k in data:
            cur[k] = data[k]
    core.save_json(core.JIRA_FILE, cur)
    return {"ok": True}

def _jira_fetch_users(q: str = "", limit: int = 2000) -> tuple:
    """Jira 사용자 목록 — 활성·비활성을 함께 가져온다.

    조회 계정(연동 설정의 user/token)으로 부른다. 한 번에 다 안 오므로
    startAt 을 밀며 여러 번 받는다 — 200명 넘는 곳에서 첫 50명만 들어오면
    「왜 저 사람만 없나」 를 영원히 못 찾는다.
    """
    cfg = _jira_cfg()
    # 조회 계정이 없으면 Jira 는 **로그인 화면(HTML)** 을 401 로 돌려준다.
    # 그것을 그대로 화면에 뿌리면 「이건 뭐야」 가 된다(지적) — 먼저 막는다.
    if not str(cfg.get("user") or "").strip() or not str(cfg.get("token") or "").strip():
        return [], {"ok": False, "error": (
            "Jira 조회 계정이 없습니다 — SETUP → Jira 연동에서 아이디와 토큰(PAT)을 넣고 "
            "「연결 테스트」 가 통과한 뒤에 다시 누르세요. (로그인은 각자 비밀번호로 되지만, "
            "**명단을 통째로 읽는 것**은 조회 계정이 있어야 합니다)")}
    search = (q or cfg.get("user_search") or core.ALLOWED_EMAIL_DOMAIN or "ubiquoss.com").strip()
    out, seen, start = [], set(), 0
    while start < int(limit):
        r, err = _jira_call(
            "GET", "/rest/api/2/user/search",
            params={"username": search, "startAt": start, "maxResults": 200,
                    "includeActive": "true", "includeInactive": "true"},
        )
        if err:
            return [], err
        if not r.is_success:
            # Jira 는 실패를 **HTML 한 장**으로 준다. 사람이 읽을 한 줄로 바꾼다.
            why = {
                401: "Jira 가 조회 계정을 받지 않았습니다(401) — 아이디·토큰을 확인하세요. "
                     "Jira Server 라면 비밀번호 대신 PAT(개인 액세스 토큰)를 권합니다",
                403: "조회 계정에 사용자 조회 권한이 없습니다(403) — Jira 관리자에게 요청하세요",
                404: "Jira 주소가 잘못됐습니다(404) — REST 경로를 못 찾았습니다",
            }.get(r.status_code)
            if not why:
                body = re.sub(r"<[^>]+>", " ", r.text or "")
                body = " ".join(body.split())[:160]
                why = f"Jira 가 {r.status_code} 로 답했습니다 — {body}"
            return [], {"ok": False, "error": why}
        rows = r.json() or []
        if not rows:
            break
        for u in rows:
            name = str(u.get("name") or "").strip()
            if not name or name in seen:
                continue
            seen.add(name)
            _disp = str(u.get("displayName") or name).strip()
            # 이름 괄호에 부서가 든다: 「강경묵(생산)」·「권민수(검증)_중…」.
            # 소속 칸이 비어 있으면 이걸 채운다(직급/소속을 보고 싶다는 지적).
            _m = re.search(r"\(([^)]+)\)", _disp)
            out.append({
                "username": name,
                "jira_key": str(u.get("key") or u.get("accountId") or "").strip(),
                "name": _disp,
                "email": str(u.get("emailAddress") or "").strip(),
                "jira_active": bool(u.get("active")),
                "dept": (_m.group(1).strip() if _m else ""),
            })
        if len(rows) < 200:
            break
        start += 200
    return out, None


def _jira_leaders(cfg=None) -> set:
    """Jira 에서 **직급(리더)** 을 유추한다 — 팀장·그룹장.

    Jira 사용자 API 에는 직급 필드가 없다. 다만 「팀장」·「그룹장」 은 **그룹**
    으로 남아 있어(팀장·기술팀 팀장·연구소 팀장/그룹장·그룹장/담당 …), 그
    구성원을 읽으면 누가 리더인지 알 수 있다. 사원·선임·책임·수석은 그룹이
    없어 Jira 로는 가릴 수 없다 — 그건 못 채운다.

    비싼 짓(사람마다 조회)이 아니다: picker 로 리더 그룹 이름을 몇 개 찾고,
    그 그룹의 구성원만 읽는다(십수 번의 호출).
    """
    cfg = cfg or _jira_cfg()
    gnames = set()
    for q in ("팀장", "그룹장"):
        r, err = _jira_call("GET", "/rest/api/2/groups/picker",
                            cfg=cfg, params={"query": q, "maxResults": 50})
        if err or not r.is_success:
            continue
        for g in (r.json().get("groups") or []):
            nm = str(g.get("name") or "").strip()
            # 이름에 팀장/그룹장이 든 그룹만 — picker 는 느슨히 걸린다
            if nm and ("팀장" in nm or "그룹장" in nm):
                gnames.add(nm)
    leaders = set()
    for nm in gnames:
        start = 0
        while start < 2000:
            r, err = _jira_call("GET", "/rest/api/2/group/member", cfg=cfg,
                                params={"groupname": nm, "startAt": start,
                                        "maxResults": 200, "includeInactiveUsers": "true"})
            if err or not r.is_success:
                break
            j = r.json() or {}
            vals = j.get("values") or []
            for m in vals:
                un = str(m.get("name") or "").strip().lower()
                if un:
                    leaders.add(un)
            if j.get("isLast") or len(vals) < 200:
                break
            start += 200
    return leaders


@router.post("/api/jira/login-test")
async def api_jira_login_test(payload: dict, token: str = ""):
    """**Jira 계정으로 로그인이 되는지** 관리자 자리에서 확인한다.

    화면에서 아이디·비밀번호를 넣어 눌러 보는 것 말고는 「왜 저 사람은 안
    되나」 를 알 길이 없었다. 비밀번호는 확인에만 쓰고 **어디에도 담지 않는다** —
    저장도, 로그도 안 한다. 여기서 성공해도 세션은 안 만든다.
    """
    core.require_admin(token)
    uname = str(payload.get("username") or "").strip()
    pw = str(payload.get("password") or "")
    if not uname or not pw:
        return {"ok": False, "error": "아이디와 비밀번호를 넣으세요"}
    if not core.jira_login_on():
        return {"ok": False, "error": "Jira 계정 로그인이 꺼져 있습니다 — 위에서 켜세요"}
    ju, why = await core.jira_verify_login(uname, pw)
    if ju:
        known = core.find_user(uname)
        return {"ok": True, "jira": {
            "username": str(ju.get("name") or uname),
            "key": str(ju.get("key") or ju.get("accountId") or ""),
            "name": str(ju.get("displayName") or ""),
            "email": str(ju.get("emailAddress") or ""),
            "active": ju.get("active"),
        }, "in_utop": bool(known), "auto_create": core.jira_auto_create()}
    msg = {
        "denied": "Jira 가 아이디·비밀번호를 받지 않았습니다",
        "captcha": "Jira 가 CAPTCHA 를 걸었습니다 — 그 계정으로 Jira 웹에 한 번 로그인해 푸세요",
        "cert": "Jira 인증서 문제(만료 등) — 「TLS 인증서 검증」 을 끄거나 인증서를 갱신하세요",
        "unreachable": "Jira 에 닿지 못했습니다",
        "no-url": "Jira 주소가 없습니다",
    }.get(why, why or "확인하지 못했습니다")
    return {"ok": False, "why": why, "error": msg}


@router.get("/api/jira/login-check")
async def jira_login_check(token: str = ""):
    """**Jira 로그인이 지금 되는 상태인가** — 계정 관리 화면이 묻는다.

    「Jira 계정으로 로그인이 안 된다」 는 말은 셋 중 하나다: 꺼져 있거나,
    주소가 없거나, Jira 가 거절하거나. 셋을 갈라 보여 주지 않으면 어디를
    고쳐야 하는지 알 수 없다. 비밀번호는 여기에 없다.
    """
    core.require_admin(token)
    cfg = _jira_cfg()
    url = core.jira_login_base(cfg)
    out = {
        "enabled": bool(cfg.get("login_enabled")),
        "url": url,
        "issue_url": str(cfg.get("url") or "").strip().rstrip("/"),
        "separate": bool(str(cfg.get("login_url") or "").strip()),
        "auto_create": core.jira_auto_create(),
        "last_fail": dict(core.JIRA_LAST_FAIL) or None,
        # Jira Cloud 는 계정 비밀번호로 REST 인증이 안 된다 — 그것을 모르면
        # 「비밀번호가 맞는데 왜 안 되나」 를 끝없이 헤맨다
        "cloud": "atlassian.net" in url.lower(),
    }
    if not url:
        out["reachable"] = False
        out["reason"] = "Jira 주소가 없습니다 — 「Jira 연동」 에서 먼저 넣으세요"
        return out
    out["verify"] = core.jira_verify_flag(cfg)
    import httpx as _hx
    try:
        async with _hx.AsyncClient(timeout=8, verify=out["verify"]) as c:
            r = await c.get(url + "/rest/api/2/serverInfo")
        out["reachable"] = r.status_code < 500
        out["status"] = r.status_code
        out["reason"] = "" if r.status_code < 500 else f"Jira 가 {r.status_code} 로 답했습니다"
    except Exception as exc:
        msg = str(exc)
        out["reachable"] = False
        if "CERTIFICATE" in msg.upper() or "SSL" in msg.upper():
            out["cert"] = True
            out["reason"] = (
                "Jira 인증서에 문제가 있습니다(만료 등) — 위 「TLS 인증서 검증」 을 끄거나 "
                "인증서를 갱신하세요"
            )
        else:
            out["reason"] = f"닿지 못했습니다 — {msg[:120]}"
    return out


@router.post("/api/jira/test")
async def jira_test(data: dict = None):
    cfg = data if (data and data.get("url")) else _jira_cfg()
    r, err = _jira_call("GET", "/rest/api/2/myself", cfg=cfg)
    if err:
        return err
    if not r.is_success:
        return {"ok": False, "error": f"{r.status_code} · {r.text[:200]}"}
    j = r.json()
    return {"ok": True, "name": j.get("name"), "displayName": j.get("displayName"), "email": j.get("emailAddress")}

@router.get("/api/jira/user-search")
async def jira_user_search(q: str = "", project: str = "", limit: int = 100):
    """담당자 목록/검색. project 지정 시 그 프로젝트에 할당 가능한 사용자 전체(assignable),
    q 지정 시 이름/메일/ID 부분일치 필터 (Jira user/assignable/search · user/search 프록시)."""
    mx = max(1, min(int(limit or 100), 500))
    qs = str(q).strip()
    if project:
        params = {"project": project, "maxResults": mx}
        if qs:
            params["username"] = qs
        r, err = _jira_call("GET", "/rest/api/2/user/assignable/search", params=params)
        if (err or (r is not None and not r.is_success)) and not qs:
            # 일부 Jira 버전은 username 파라미터 필수 → '.'(대부분 메일에 포함)로 폴백
            r, err = _jira_call("GET", "/rest/api/2/user/assignable/search",
                                params={"project": project, "username": ".", "maxResults": mx})
    else:
        if not qs:
            return {"ok": True, "users": []}
        r, err = _jira_call("GET", "/rest/api/2/user/search", params={"username": qs, "maxResults": mx})
    if err:
        return err
    if not r.is_success:
        return {"ok": False, "error": f"{r.status_code} · {r.text[:200]}"}
    return {"ok": True, "users": [{"name": u.get("name", ""), "displayName": u.get("displayName", ""),
                                   "email": u.get("emailAddress", "")} for u in (r.json() or [])]}

@router.get("/api/jira/components")
async def jira_components(project: str):
    """프로젝트 구성요소 + 컴포넌트 리드(기본 담당자) 목록 — 구성요소 선택 시 담당자 자동 지정용."""
    r, err = _jira_call("GET", f"/rest/api/2/project/{project}/components")
    if err:
        return err
    if not r.is_success:
        return {"ok": False, "error": f"{r.status_code} · {r.text[:200]}"}
    out = []
    for c in (r.json() or []):
        lead = c.get("lead") or {}
        out.append({"id": str(c.get("id", "")), "name": c.get("name", ""),
                    "lead": lead.get("name", ""), "leadDisplay": lead.get("displayName", "")})
    return {"ok": True, "components": out}

@router.get("/api/jira/projects")
async def jira_projects(expand: str = ""):
    # expand=description → /project 리스트에 description 필드도 함께 조회 (Jira 8+)
    _url = "/rest/api/2/project" + ("?expand=description" if "description" in (expand or "") else "")
    r, err = _jira_call("GET", _url)
    if err:
        return err
    if not r.is_success:
        return {"ok": False, "error": f"{r.status_code} · {r.text[:200]}"}
    _out = []
    for p in r.json():
        _out.append({"key": p.get("key"), "name": p.get("name"), "id": p.get("id"),
                     "description": (p.get("description") or "")})
    return {"ok": True, "projects": _out}

# ── Jira Issue 화면 — 프로젝트를 골라 훑는다 ──────────────────────
#
# 지라에는 8만 건이 넘게 있다. 다 가져오는 것은 뜻이 없고 지라도 못 견딘다.
# 화면에서 **프로젝트를 골라** 그것만 훑는다(지시).
#
# 열 이름은 화면(목업)이 쓰는 것에 맞춘다. 커스텀 필드 id 는 지라에 물어
# 확인한 실제 값이다 — 목업이 지어낸 것이 아니라 이 지라의 필드다.
JIRA_CF = {
    "customer": "customfield_10301",     # 사업자
    "stage": "customfield_10302",        # 이슈단계
    "probtype": "customfield_10303",     # 문제유형
    "freq": "customfield_10304",         # 발생빈도
    "hwsw": "customfield_10305",         # 이슈분류(HW,SW)
    "lab": "customfield_11301",          # 시험시설
    "start": "customfield_10200",        # 시작일(WBSGantt)
    "due": "customfield_10201",          # 완료일(WBSGantt)
    "crkind": "customfield_10300",       # CR 구분
    "bsptest": "customfield_10399",      # BSP 시험버전
    "bspfix": "customfield_10311",       # BSP 해결버전
    "fwver": "customfield_10394",        # F/W Version
}


def _jf_txt(v) -> str:
    """지라 필드 하나를 **사람이 읽는 한 줄**로.

    지라는 같은 뜻을 세 꼴로 준다 — 글자, {name|value} 객체, 그 배열.
    화면마다 풀면 열 스무 개에 같은 코드가 스무 번 생긴다."""
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, dict):
        for k in ("name", "value", "displayName", "key"):
            if v.get(k):
                return str(v[k])
        return ""
    if isinstance(v, list):
        return ", ".join(x for x in (_jf_txt(i) for i in v) if x)
    return str(v)


def _jf_one(v, kind: str, items: str) -> str:
    """더한 칸 하나를 글자로 편다 — **타입을 보고** 편다.

    날짜를 그대로 두면 `2026-09-08T12:00:00.000+0900` 이 열에 박히고,
    긴 글은 JSONB 를 붓게 한다."""
    if kind in ("date", "datetime"):
        return str(v or "")[:10]
    txt = _jf_txt(v)
    return txt[:4000] if kind == "string" and items == "" else txt


def _jira_row(it: dict, extra: list[dict] | None = None) -> dict:
    """지라 이슈 하나 → **표가 그대로 그리는 한 줄**."""
    f = it.get("fields") or {}
    row = {
        "issuekey": it.get("key") or "",
        "summary": _jf_txt(f.get("summary")),
        "status": _jf_txt(f.get("status")),
        "issuetype": _jf_txt(f.get("issuetype")),
        "priority": _jf_txt(f.get("priority")),
        "reporter": _jf_txt(f.get("reporter")),
        "assignee": _jf_txt(f.get("assignee")),
        # 날짜는 앞 열 자만 — 표에 시분초까지 있으면 눈이 숫자를 센다
        "created": str(f.get("created") or "")[:10],
        "updated": str(f.get("updated") or "")[:10],
        "labels": _jf_txt(f.get("labels")),
        # 프로젝트는 **key** 다 — _jf_txt 는 name 을 먼저 집는데, 지라 프로젝트
        # 이름이 「@제품검증1팀」 처럼 팀 이름인 곳이 있어 key 로 못 찾게 된다
        "project": str((f.get("project") or {}).get("key") or _jf_txt(f.get("project"))),
        "projectname": _jf_txt(f.get("project")),
        "description": str(_jf_txt(f.get("description")) or "")[:4000],
    }
    for name, cf in JIRA_CF.items():
        row[name] = _jf_txt(f.get(cf))
    row["start"] = str(row.get("start") or "")[:10]
    row["due"] = str(row.get("due") or "")[:10]
    # 사람이 더한 칸 — 열쇠는 지라의 칸 id 그대로다(customfield_12345).
    # 이름으로 두면 지라에서 칸 이름을 바꾸는 날 열이 통째로 빈다.
    for c in (extra or []):
        fid = str(c.get("id") or "")
        if not fid or fid in row:
            continue
        row[fid] = _jf_one(f.get(fid), str(c.get("type") or ""), str(c.get("items") or ""))
    return row


JIRA_BASE_FIELDS = [
    "summary", "status", "issuetype", "priority", "reporter", "assignee",
    "created", "updated", "labels", "project", "description", *JIRA_CF.values(),
]
JIRA_FIELDS = ",".join(JIRA_BASE_FIELDS)


def _jira_fields_str(extra: list[dict] | None = None) -> str:
    """지라에 달라고 할 칸 — 붙박이 + 사람이 더한 것."""
    ids = list(JIRA_BASE_FIELDS)
    for c in (extra or []):
        fid = str(c.get("id") or "")
        if fid and fid not in ids:
            ids.append(fid)
    return ",".join(ids)


@router.get("/api/jira/issues")
async def jira_issues(projects: str = "", q: str = "", limit: int = 2000):
    """**우리 DB 에서** 읽는다 — 지라에 가지 않는다.

    화면을 열 때마다 지라를 부르면 여덟 만 건 앞에서 늘 기다린다.
    가져오는 것은 Sync 가 하고, 화면은 저장된 것을 본다."""
    keys = [x.strip() for x in str(projects or "").split(",") if x.strip()]
    cap = max(1, min(int(limit or 2000), 20000))
    where, args = [], []
    if keys:
        args.append(keys)
        where.append(f"project = ANY(${len(args)}::text[])")
    if q.strip():
        args.append(f"%{q.strip()}%")
        where.append(f"(key ILIKE ${len(args)} OR data->>'summary' ILIKE ${len(args)})")
    sql = "SELECT key, project, data FROM jira_issue"
    if where:
        sql += " WHERE " + " AND ".join(where)
    args.append(cap)
    sql += f" ORDER BY updated DESC NULLS LAST LIMIT ${len(args)}"
    async with db.pool().acquire() as c:
        rows = await c.fetch(sql, *args)
        cnt = await c.fetchval(
            "SELECT count(*) FROM jira_issue" + (" WHERE " + " AND ".join(where) if where else ""),
            *args[:-1])
    out = []
    for r in rows:
        d = r["data"] if isinstance(r["data"], dict) else json.loads(r["data"] or "{}")
        out.append(d)
    st = await db.kv_get("jira.issues.sync") or {}
    return {"ok": True, "rows": out, "total": int(cnt or 0), "shown": len(out),
            "sync": {k: st.get(k) for k in keys} if keys else st}


@router.post("/api/jira/issues/backfill")
async def jira_issues_backfill(payload: dict):
    """더한 칸의 값을 **이미 받아 둔 이슈에** 채운다.

    Sync 는 증분이라 안 바뀐 이슈를 다시 주지 않는다. 그래서 칸을 새로
    더하면 그 열이 통째로 빈 채로 남는다 — 사람은 그것을 고장으로 읽는다.
    여기서는 **그 칸만** 달라고 해 기존 값에 **덧댄다**(통째 대체가 아니라
    합치기다. 몇 칸만 받아 통째로 덮으면 나머지가 다 날아간다).

    받은 시각 표시(jira.issues.sync)는 건드리지 않는다 — 건드리면 다음
    증분의 기준이 흐트러져 그 사이에 바뀐 이슈가 통째로 빠진다."""
    keys = [str(x).strip() for x in (payload.get("projects") or []) if str(x).strip()]
    if not keys:
        return {"ok": False, "error": "프로젝트를 고르세요"}
    extra = await _jira_extra_cols()
    if not extra:
        return {"ok": True, "filled": 0, "message": "더한 칸이 없습니다"}
    cap = max(1, min(int(payload.get("cap") or 20000), 50000))
    cfg = _jira_cfg()
    ids = [str(c.get("id") or "") for c in extra if c.get("id")]
    fields = ",".join(ids)
    t0 = datetime.now()
    filled = 0
    for pk in keys:
        jql = f'project = "{pk}" ORDER BY key ASC'
        start = 0
        for _ in range(500):
            r, err = _jira_call("GET", "/rest/api/2/search", cfg=cfg,
                                params={"jql": jql, "startAt": start, "maxResults": 100,
                                        "fields": fields})
            if err:
                return err
            if not r.is_success:
                return {"ok": False, "error": f"{pk} — {r.status_code} · {str(r.text)[:200]}"}
            j = r.json()
            batch = j.get("issues") or []
            if not batch:
                break
            async with db.pool().acquire() as c:
                for it in batch:
                    k = str(it.get("key") or "")
                    if not k:
                        continue
                    f = it.get("fields") or {}
                    patch = {
                        str(x.get("id")): _jf_one(
                            f.get(str(x.get("id"))), str(x.get("type") or ""), str(x.get("items") or ""))
                        for x in extra if x.get("id")
                    }
                    n = await c.execute(
                        """UPDATE jira_issue SET data = data || $2::jsonb WHERE key = $1""",
                        k, patch)
                    if str(n).endswith("1"):
                        filled += 1
            start += len(batch)
            total = j.get("total", start)
            if start >= (total or 0) or start >= cap:
                break
    return {"ok": True, "filled": filled, "cols": len(extra),
            "ms": int((datetime.now() - t0).total_seconds() * 1000)}


@router.post("/api/jira/issues/sync")
async def jira_issues_sync(payload: dict):
    """고른 프로젝트를 지라에서 **증분으로** 가져와 저장한다.

    마지막으로 받은 갱신 시각 뒤에 바뀐 것만 부른다 — 두 번째부터는 몇 건씩
    이라 금방 끝난다. `full` 이면 처음부터 다시 받는다.

    시각은 **5 분 앞에서부터** 부른다. 지라의 JQL 은 분 단위라, 같은 분 안에
    바뀐 이슈가 마지막 한 건 뒤에 더 있으면 그것이 통째로 빠진다."""
    from datetime import timezone as _tz, timedelta as _td
    keys = [str(x).strip() for x in (payload.get("projects") or []) if str(x).strip()]
    if not keys:
        return {"ok": False, "error": "프로젝트를 고르세요"}
    full = bool(payload.get("full"))
    cap = max(1, min(int(payload.get("cap") or 5000), 20000))
    st = await db.kv_get("jira.issues.sync") or {}
    cfg = _jira_cfg()
    extra = await _jira_extra_cols()
    fields = _jira_fields_str(extra)
    res: dict = {"added": 0, "updated": 0, "same": 0, "got": 0, "projects": {}}
    t0 = datetime.now(_tz.utc)

    for pk in keys:
        mark = "" if full else str((st.get(pk) or {}).get("last_updated") or "")
        jql = f'project = "{pk}"'
        if mark:
            try:
                m = datetime.fromisoformat(mark) - _td(minutes=5)
                jql += f' AND updated >= "{m.strftime("%Y-%m-%d %H:%M")}"'
            except Exception:
                mark = ""
        jql += " ORDER BY updated ASC"
        issues: list[dict] = []
        start = 0
        total = None
        for _ in range(200):
            r, err = _jira_call("GET", "/rest/api/2/search", cfg=cfg,
                                params={"jql": jql, "startAt": start, "maxResults": 100,
                                        "fields": fields})
            if err:
                return err
            if not r.is_success:
                return {"ok": False, "error": f"{pk} — {r.status_code} · {str(r.text)[:200]}"}
            j = r.json()
            batch = j.get("issues") or []
            issues.extend(batch)
            total = j.get("total", len(issues))
            start += len(batch)
            if not batch or start >= (total or 0) or len(issues) >= cap:
                break

        added = upd = same = 0
        newest = mark
        async with db.pool().acquire() as c:
            for it in issues[:cap]:
                row = _jira_row(it, extra)
                key = row["issuekey"]
                if not key:
                    continue
                raw_upd = str(((it.get("fields") or {}).get("updated")) or "")
                if raw_upd > (newest or ""):
                    newest = raw_upd
                old = await c.fetchrow("SELECT updated, data FROM jira_issue WHERE key=$1", key)
                if old is None:
                    added += 1
                else:
                    od = old["data"] if isinstance(old["data"], dict) else json.loads(old["data"] or "{}")
                    if od == row:
                        same += 1
                        continue
                    upd += 1
                await c.execute(
                    """INSERT INTO jira_issue (key, project, updated, data, synced_at)
                       VALUES ($1,$2,$3,$4::jsonb, now())
                       ON CONFLICT (key) DO UPDATE
                         SET project=EXCLUDED.project, updated=EXCLUDED.updated,
                             data=EXCLUDED.data, synced_at=now()""",
                    key, str(row.get("project") or pk),
                    # dict 를 그대로 넘긴다 — 풀의 jsonb 코덱(db._init_conn)이
                    # 스스로 json.dumps 한다. 여기서 또 dumps 하면 **문자열
                    # 하나가 통째로** JSONB 에 들어가 data->>'summary' 같은
                    # 질의가 영영 안 맞는다(검색·집계가 조용히 빈다).
                    _iso_ts(raw_upd), row)
        st[pk] = {"at": t0.isoformat(), "last_updated": newest,
                  "n": len(issues), "total": total or len(issues)}
        res["projects"][pk] = {"got": len(issues), "added": added, "updated": upd, "same": same}
        res["added"] += added
        res["updated"] += upd
        res["same"] += same
        res["got"] += len(issues)

    await db.kv_set("jira.issues.sync", st)
    res["ms"] = int((datetime.now(_tz.utc) - t0).total_seconds() * 1000)
    res["ok"] = True
    res["sync"] = {k: st.get(k) for k in keys}
    return res


def _iso_ts(v: str):
    """지라가 준 시각 글자를 TIMESTAMPTZ 로. 못 읽으면 비운다."""
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


@router.get("/api/jira/issuetypes")
async def jira_issuetypes(project: str):
    r, err = _jira_call("GET", f"/rest/api/2/issue/createmeta?projectKeys={project}&expand=projects.issuetypes")
    if err:
        return err
    if not r.is_success:
        return {"ok": False, "error": f"{r.status_code} · {r.text[:200]}"}
    types = []
    for p in (r.json().get("projects") or []):
        for t in (p.get("issuetypes") or []):
            types.append({"id": t.get("id"), "name": t.get("name"), "subtask": t.get("subtask", False)})
    return {"ok": True, "issuetypes": types}

@router.get("/api/jira/createmeta")
async def jira_createmeta(project: str, issuetype: str = None):
    r, err = _jira_call("GET", f"/rest/api/2/issue/createmeta?projectKeys={project}&expand=projects.issuetypes.fields")
    if err:
        return err
    if not r.is_success:
        return {"ok": False, "error": f"{r.status_code} · {r.text[:200]}"}
    projs = r.json().get("projects") or []
    if not projs:
        return {"ok": False, "error": "프로젝트 접근 불가 또는 없음(권한 확인)"}
    out = []
    for it in projs[0].get("issuetypes", []):
        if issuetype and str(it.get("id")) != str(issuetype) and it.get("name") != issuetype:
            continue
        for fid, f in (it.get("fields") or {}).items():
            sch = f.get("schema") or {}
            av = f.get("allowedValues")
            opts = None
            if isinstance(av, list):
                opts = [{"id": o.get("id"), "name": (o.get("name") or o.get("value") or o.get("key") or str(o.get("id") or ""))} for o in av]
            out.append({
                "id": fid, "name": f.get("name"), "required": bool(f.get("required")),
                "type": sch.get("type"), "items": sch.get("items"), "custom": sch.get("custom"),
                "options": opts, "hasDefault": f.get("hasDefaultValue", False),
            })
        break
    return {"ok": True, "fields": out}

@router.post("/api/jira/issue")
async def jira_create_issue(data: dict):
    project = data.get("project")
    itype = data.get("issuetype")
    summary = (data.get("summary") or "(제목 없음)")[:250]
    if not project or not itype:
        return {"ok": False, "error": "프로젝트/이슈유형이 필요합니다"}
    it = {"id": str(itype)} if str(itype).isdigit() else {"name": str(itype)}
    fields = {"project": {"key": project}, "issuetype": it, "summary": summary, "description": data.get("description") or ""}
    if data.get("labels"):
        fields["labels"] = data["labels"]
    if data.get("priority"):
        fields["priority"] = {"name": data["priority"]}
    if isinstance(data.get("fields"), dict):
        fields.update(data["fields"])
    r, err = _jira_call("POST", "/rest/api/2/issue", json={"fields": fields})
    if err:
        return err
    dropped = []
    if not r.is_success:
        # 생성 화면에 없는/알 수 없는 필드(labels 등)는 자동 제거 후 1회 재시도
        try:
            bad = list((r.json().get("errors") or {}).keys())
        except Exception:
            bad = []
        removable = [k for k in bad if k in fields and k not in ("project", "issuetype", "summary")]
        if removable:
            for k in removable:
                fields.pop(k, None)
            dropped = removable
            r, err = _jira_call("POST", "/rest/api/2/issue", json={"fields": fields})
            if err:
                return err
    if not r.is_success:
        return {"ok": False, "error": f"{r.status_code} · {r.text[:400]}"}
    j = r.json()
    cfg = _jira_cfg()
    key = j.get("key", "")
    return {"ok": True, "key": key, "url": (cfg.get("url", "").rstrip("/") + "/browse/" + key), "dropped": dropped}

@router.post("/api/jira/issue/{key}/attach")
async def jira_attach(key: str, data: dict):
    import base64 as _b64, httpx
    cfg = _jira_cfg()
    base = (cfg.get("url") or "").rstrip("/")
    if not base:
        return {"ok": False, "error": "Jira URL 미설정"}
    # **서버에 있는 그림은 주소로 받는다**(지적: 지라에서 이미지가 안 보인다).
    # 구성도는 data URL 이 아니라 `/api/req-images/…png` 로 저장돼 있는데,
    # 그 주소 글자를 base64 인 양 디코드하고 있었다. b64decode 는 모르는
    # 글자를 조용히 버리므로 예외도 없이 **쓰레기 바이트**가 올라갔고,
    # 지라는 깨진 그림 자리를 보여 줬다.
    src = str(data.get("src") or "").strip()
    if src:
        nm = src.rsplit("/", 1)[-1].split("?", 1)[0]
        if "/api/req-images/" not in src or not nm or "\\" in nm or nm.startswith("."):
            return {"ok": False, "error": "붙일 수 없는 주소입니다: " + src[:120]}
        f = core.REQ_IMG_DIR / nm
        if not f.is_file():
            return {"ok": False, "error": "그림 파일을 찾지 못했습니다: " + nm}
        content = f.read_bytes()
    else:
        raw = data.get("data") or ""
        if raw.strip().startswith("data:") and "," in raw:
            raw = raw.split(",", 1)[1]
        try:
            content = _b64.b64decode(raw, validate=True)
        except Exception as e:
            return {"ok": False, "error": "이미지 디코드 실패: " + str(e)[:120]}
    if not content:
        return {"ok": False, "error": "내용이 비었습니다"}
    fn = data.get("filename") or "구성도.png"
    mime = data.get("mime") or "image/png"   # txt 첨부(running-config 등)도 지원
    h = _jira_headers(cfg)
    h.pop("Content-Type", None)        # multipart 경계는 httpx가 설정
    h["X-Atlassian-Token"] = "no-check"
    try:
        with httpx.Client(timeout=40, verify=cfg.get("verify", True)) as c:
            r = c.post(base + f"/rest/api/2/issue/{key}/attachments", headers=h,
                       files={"file": (fn, content, mime)})
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}
    if not r.is_success:
        return {"ok": False, "error": f"{r.status_code} · {r.text[:300]}"}
    return {"ok": True, "attachments": [a.get("filename") for a in r.json()]}


# Release Summary — 이슈 상세(설명+댓글+첨부) lazy load
# ───────────────────────────────────────────
# Jira 이슈 상세 — UTOP 저장소 (승인: ⑵안)
# ───────────────────────────────────────────
#
# 드로어·검색이 지라를 실시간으로 두드리면 지라에 부하가 간다(지적).
# 그래서 이슈 상세를 **UTOP 에 저장**하고 화면은 저장본을 읽는다.
#
#   · 저장: data/state/jira_cache/{키}.json — 첨부 **파일은 안 받는다**
#     (용량의 대부분이 파일이다). 그림은 드로어가 볼 때만 지라에서 중계.
#   · names(칸 id→이름 표)는 모든 이슈가 똑같아 KV 에 **한 벌만** 둔다.
#   · 매일 07:00(KST) 지라에 「마지막 이후 바뀐 것」 만 물어(JQL updated)
#     바뀐 이슈만 다시 받아 저장한다 — 하루 검색 1회 + 변경 N건이 전부다.
#   · 첫 실행은 화면(release_summary)에 선 이슈 전부를 백필한다.
_JIRA_CACHE_DIR = core.DATA_DIR / "state" / "jira_cache"
_JCACHE_BUSY = False
# 진행률 — 첫 백필은 수백 건이라 몇 분 걸린다. 붙잡고 기다리게 하지 않고
# 상태로 내보내 화면이 「받는 중 n/전체」 를 그리게 한다.
_JCACHE_PROG = {"running": False, "mode": "", "done": 0, "total": 0, "started": ""}


def _jira_cache_path(key: str):
    import re as _re
    return _JIRA_CACHE_DIR / (_re.sub(r"[^A-Za-z0-9_-]", "_", key) + ".json")


def _jira_cache_read(p):
    try:
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        pass
    return None


async def _jira_cache_reply(j: dict, cached: bool) -> dict:
    names = await db.kv_get("jira.cache.names") or {}
    out = {k: v for k, v in j.items() if k != "_fetched_at"}
    return {"ok": True, "cached": cached, "fetched_at": j.get("_fetched_at", ""), "names": names, **out}


def _jira_issue_fetch_sync(key: str):
    """블로킹 지라 호출 — 반드시 to_thread 로만 부른다. 백필이 수백 건일 때
    이걸 이벤트 루프에서 그대로 돌리면 그 몇 분간 서버 전체가 버벅인다."""
    r, err = _jira_call("GET", f"/rest/api/2/issue/{key}",
                        params={"fields": "*all", "expand": "renderedFields,names,changelog"})
    if err:
        return None, err
    if not r.is_success:
        return None, {"ok": False, "error": f"{r.status_code} · {r.text[:300]}"}
    return r.json(), None


async def _jira_issue_fetch_store(key: str):
    """지라에서 한 건 받아 저장한다. (payload, None) 또는 (None, 오류)."""
    j, err = await asyncio.to_thread(_jira_issue_fetch_sync, key)
    if err or j is None:
        return None, err or {"ok": False, "error": "이슈를 읽지 못했습니다"}
    names = j.pop("names", None) or {}
    if names:
        cur = await db.kv_get("jira.cache.names") or {}
        if any(k not in cur or cur[k] != v for k, v in names.items()):
            cur.update(names)
            await db.kv_set("jira.cache.names", cur)
    from datetime import timezone as _tz
    j["_fetched_at"] = datetime.now(_tz.utc).isoformat()
    try:
        _JIRA_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        p = _jira_cache_path(key)
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(j, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, p)
    except Exception as e:
        print(f"[jira-cache] {key} 저장 실패: {e}")
    return j, None


async def _jira_cache_sync(full: bool = False, manual: bool = False) -> dict:
    """바뀐 이슈만 받아 저장한다(full 이면 화면의 이슈 전부).

    **수동 단추는 full 을 못 쓴다**(지적: 변경분이라더니 모두 가져온다) —
    전부 받기는 밤 07:00 이 제 몫이다. 사람이 낮에 누르는 것은 언제나
    변경분뿐이라 몇 초면 끝난다."""
    global _JCACHE_BUSY
    if _JCACHE_BUSY:
        return {"ok": False, "error": "이미 동기화가 돌고 있습니다"}
    _JCACHE_BUSY = True
    try:
        from zoneinfo import ZoneInfo
        from datetime import timedelta, timezone as _tz
        KST = ZoneInfo("Asia/Seoul")
        st = await db.kv_get("jira.cache.sync") or {}
        d = core.kv_load_sync("release_summary", {"releases": []})
        bags = d.get("releases") if isinstance(d, dict) else {}
        bags = bags if isinstance(bags, dict) else {}
        projs = sorted({k.split("@@")[0] for k in bags if "@@" in k and k.split("@@")[0]})
        listed = sorted({ik for bag in bags.values() if isinstance(bag, dict) for ik in bag})
        keys: list[str] = []
        last = str(st.get("last") or "")
        if full:
            # 밤 백필 — 화면에 선 이슈 전부. 자는 시간이라 몇 분 걸려도 된다
            keys = listed
        elif not last:
            # 수동 첫 실행 — 받을 「변경분」 의 기준이 아직 없다. 기준만 지금
            # 으로 맞추고 끝낸다(0건). 전부 받기는 오늘 밤 07:00 이 한다.
            keys = []
        elif projs:
            # 바뀐 것만 — 겹침 10분을 두어 시각 어긋남에 안전하게
            try:
                t0 = datetime.fromisoformat(last) - timedelta(minutes=10)
            except Exception:
                t0 = datetime.now(_tz.utc) - timedelta(days=1)
            jql = (
                "project in (" + ",".join(projs) + ") AND updated >= \""
                + t0.astimezone(KST).strftime("%Y/%m/%d %H:%M") + "\" ORDER BY updated ASC"
            )
            start = 0
            while start < 5000:
                r, err = await asyncio.to_thread(
                    lambda: _jira_call("GET", "/rest/api/2/search",
                                       params={"jql": jql, "fields": "key", "maxResults": 100, "startAt": start}))
                if err or not r.is_success:
                    e = err or {"error": f"{r.status_code} · {r.text[:200]}"}
                    return {"ok": False, "error": f"지라 검색 실패 — {e.get('error')}"}
                jj = r.json()
                got = [str(i.get("key")) for i in jj.get("issues") or [] if i.get("key")]
                keys.extend(got)
                start += len(got)
                if start >= int(jj.get("total") or 0) or not got:
                    break
        stored = failed = 0
        _JCACHE_PROG.update(running=True, mode=("backfill" if not last else "incr"),
                            done=0, total=len(keys),
                            started=datetime.now(_tz.utc).isoformat())
        for ik in keys:
            _, err = await _jira_issue_fetch_store(ik)
            if err:
                failed += 1
            else:
                stored += 1
            _JCACHE_PROG["done"] = stored + failed
            await asyncio.sleep(0.15)  # 지라를 몰아치지 않는다
        now = datetime.now(_tz.utc)
        today = now.astimezone(KST).strftime("%Y-%m-%d")
        prev = int(st.get("changed_today") or 0) if st.get("date") == today else 0
        # 배지 셈(지적: 백필 544 가 「바뀜」 으로 섰다) —
        #   백필: 씨뿌리기지 변경이 아니다. 배지에 안 센다.
        #   아침: 그날 바뀐 것으로 쌓는다.
        #   수동: 누른 것이 곧 「확인했다」 다 — 이번에 새로 온 것만 남는다
        #         (대개 0 이라 배지가 걷힌다).
        changed = prev if full else (stored if manual else prev + stored)
        await db.kv_set("jira.cache.sync", {
            "last": now.isoformat(), "last_run": now.isoformat(),
            "date": today, "changed_today": changed,
            # 백필을 한 번 마쳤나 — 07:00 잡이 이걸 보고 전부/변경분을 고른다
            "seeded": bool(st.get("seeded")) or (full and failed == 0),
        })
        print(f"[jira-cache] 동기화 — 확인 {len(keys)} · 저장 {stored} · 실패 {failed}")
        # 끝난 결과를 상태에 남긴다 — 단추는 곧장 돌아가므로, 화면은 이걸
        # 읽어 「바뀐 것 없음 / N건 저장」 을 말한다(지적: 아무 반응이 없다).
        _JCACHE_PROG["last_result"] = {
            "checked": len(keys), "stored": stored, "failed": failed,
            "at": now.isoformat(), "manual": manual,
        }
        return {"ok": True, "checked": len(keys), "stored": stored, "failed": failed}
    finally:
        _JCACHE_BUSY = False
        _JCACHE_PROG["running"] = False


async def _jira_cache_scheduler():
    """매일 07:00(KST) 에 변경분을 받아 둔다 — 출근하면 이미 최신이다(승인)."""
    from zoneinfo import ZoneInfo
    from datetime import timedelta
    KST = ZoneInfo("Asia/Seoul")
    while True:
        now = datetime.now(KST)
        nxt = now.replace(hour=7, minute=0, second=0, microsecond=0)
        if nxt <= now:
            nxt += timedelta(days=1)
        await asyncio.sleep(max(60, (nxt - now).total_seconds()))
        try:
            st = await db.kv_get("jira.cache.sync") or {}
            await _jira_cache_sync(full=not st.get("seeded"))
        except Exception as e:
            print(f"[jira-cache] 아침 동기화 실패: {e}")


@router.get("/api/jira/cache-status")
async def jira_cache_status():
    st = await db.kv_get("jira.cache.sync") or {}
    try:
        total = sum(1 for f in _JIRA_CACHE_DIR.iterdir() if f.suffix == ".json") if _JIRA_CACHE_DIR.exists() else 0
    except Exception:
        total = 0
    return {"ok": True, "total": total, **_JCACHE_PROG,
            **{k: st.get(k) for k in ("last_run", "date", "changed_today")}}


@router.post("/api/jira/cache-sync")
async def jira_cache_sync_now():
    """**곧장 돌아온다** — 일은 뒤에서 돈다(지적: 왜 이리 오래 걸려).
    첫 실행은 수백 건 백필이라 몇 분 걸리는데, 단추가 그걸 붙잡고 있으면
    멎은 것으로 보이고 앞단(nginx) 60초에 끊기기도 한다. 진행은
    cache-status 가 말한다."""
    if _JCACHE_BUSY:
        return {"ok": True, "started": False, "already": True, **_JCACHE_PROG}
    asyncio.create_task(_jira_cache_sync(manual=True))
    return {"ok": True, "started": True}


@router.get("/api/jira/issue/{key}")
async def jira_issue_detail(key: str, fresh: int = 0):
    # **저장소 우선**(승인: ⑵안). 저장본이 있으면 지라에 안 가고 그것을
    # 낸다 — 드로어를 백 번 열어도 지라는 조용하다. `?fresh=1` 이면(드로어의
    # 「지금 갱신」·목록의 ↻) 지라에서 새로 받아 저장까지 하고 낸다.
    # 지라가 죽었을 때는 저장본이 있으면 그것을 stale 표시와 함께 낸다.
    if not fresh:
        j0 = _jira_cache_read(_jira_cache_path(key))
        if j0 is not None:
            return await _jira_cache_reply(j0, cached=True)
    j1, err1 = await _jira_issue_fetch_store(key)
    if j1 is not None:
        return await _jira_cache_reply(j1, cached=False)
    j0 = _jira_cache_read(_jira_cache_path(key))
    if j0 is not None:
        out = await _jira_cache_reply(j0, cached=True)
        out["stale"] = True
        out["stale_error"] = str((err1 or {}).get("error") or "")
        return out
    return err1 or {"ok": False, "error": "이슈를 읽지 못했습니다"}

@router.post("/api/jira/issue/{key}/comment")
async def jira_add_comment(key: str, data: dict):
    body = data.get("body", "")
    if not body:
        return {"ok": False, "error": "body is empty"}
    # 계정 오버라이드: user/pw가 오면 그 계정(basic 인증)으로 등록 — 없으면 기존 설정 계정
    cfg = None
    _u = str(data.get("user") or "").strip()
    _p = str(data.get("pw") or data.get("password") or "")
    if _u and _p:
        cfg = {**_jira_cfg(), "auth": "basic", "user": _u, "token": _p}
    r, err = _jira_call("POST", f"/rest/api/2/issue/{key}/comment", cfg=cfg, json={"body": body})
    if err:
        return err
    if not r.is_success:
        return {"ok": False, "error": f"{r.status_code} · {r.text[:300]}"}
    return {"ok": True, "comment": r.json()}

# Release Summary — Jira 첨부(이미지) 인증 프록시 (브라우저가 직접 못 받으므로 백엔드가 인증해서 중계)
@router.get("/api/jira/attachment")
async def jira_attachment(url: str):
    import httpx
    from fastapi import Response
    cfg = _jira_cfg()
    base = (cfg.get("url") or "").rstrip("/")
    if not base:
        return Response(content=b"", status_code=400)
    if url.startswith("/"):
        url = base + url
    if not url.startswith(base):           # 보안: 설정된 Jira 호스트만 프록시 허용
        return Response(content=b"", status_code=403)
    try:
        with httpx.Client(timeout=30, verify=cfg.get("verify", True), follow_redirects=True) as c:
            rr = c.get(url, headers=_jira_headers(cfg))
        ct = rr.headers.get("content-type", "application/octet-stream")
        return Response(content=rr.content, media_type=ct)
    except Exception as e:
        return Response(content=str(e)[:200].encode(), status_code=502)

# Release Summary — 트랙2 데이터 저장(이슈·TC·스텝·판정)
RELEASE_SUMMARY_FILE = core.DATA_DIR / "state" / "release_summary.json"
@router.get("/api/release-summary")
async def release_summary_get():
    d = core.kv_load_sync("release_summary", {"releases": []})
    return d if isinstance(d, dict) else {"releases": []}

@router.post("/api/release-summary")
async def release_summary_save(data: dict):
    core.kv_save_sync("release_summary", data or {"releases": []})
    return {"ok": True}

async def _jira_llm_complete(llm, sys_p, user_p, max_tokens=400, temp=0.0, purpose: str = ""):
    """LLM 1회 호출 → 텍스트 반환 (JQL 자동생성 등 보조용). 실패 시 ''."""
    import httpx as _hx
    if not llm: return ""
    _pp = core.purpose_params(purpose)   # 용도 파라미터가 코드 기본을 이긴다(지시)
    ltype = str(llm.get("type") or "").lower(); ep = str(llm.get("endpoint") or "")
    try:
        if ltype in ("claude", "anthropic") or "anthropic.com" in ep:
            import anthropic as _ah
            _kw = {"temperature": _pp["temperature"]} if "temperature" in _pp else {}
            m = _ah.Anthropic(api_key=llm.get("apikey") or "").messages.create(
                model=llm.get("model") or "claude-sonnet-4-6",
                max_tokens=int(_pp.get("max_tokens") or max_tokens), system=sys_p,
                messages=[{"role": "user", "content": user_p}], **_kw)
            return "".join(getattr(b, "text", "") for b in m.content).strip()
        body = {"model": llm.get("model") or "", "messages": [{"role": "system", "content": sys_p}, {"role": "user", "content": user_p}], "temperature": temp, "max_tokens": max_tokens}
        core.apply_purpose_params(body, purpose)
        headers = {"Content-Type": "application/json"}; ak = llm.get("apikey")
        if ak and not str(ak).lower().startswith("http"): headers["Authorization"] = f"Bearer {ak}"
        async with _hx.AsyncClient(timeout=120) as client:
            rr = await client.post(ep.rstrip("/") + "/chat/completions", headers=headers, json=body)
            if rr.status_code == 200:
                return (((rr.json().get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    except Exception:
        return ""
    return ""

# ══════════════ Issue Sync · Defect 분류 (현장장애 / 상용망검증) ══════════════
# 발생상황: 현장장애 | 상용망검증  (LLM이 이슈 내용으로 판단)
#  · 현장장애 → device(L2/L3/FTTH) + category(서비스·기능·운용·IPv6)
#  · 상용망검증 → device(L2/L3/FTTH) + category(서비스·기능·운용·IPv6·신규기능·신규기능Side)
#              AND item(RFP·표준Config·CR_Defect·UTS(SNMP)·부팅·반복Aging) + type3(서비스·기능·운용·IPv6·BMS·신규기능Side)
_DEF_DEVICE = ["L2", "L3", "FTTH"]
_DEF_CAT_FIELD = ["서비스", "기능", "운용", "IPv6"]          # 현장장애 카테고리
_DEF_CAT_LIVE = ["서비스", "기능", "운용", "IPv6", "신규기능", "신규기능Side"]  # 상용망 카테고리
_DEF_ITEM = ["RFP", "표준Config", "CR_Defect", "UTS(SNMP)", "부팅", "반복Aging"]
_DEF_TYPE3 = ["서비스", "기능", "운용", "IPv6", "BMS", "신규기능Side"]

def _load_defect_class() -> dict:
    try:
        if core.DEFECT_CLASS_FILE.exists():
            return core.load_json(core.DEFECT_CLASS_FILE) or {}
    except Exception:
        pass
    return {}

def _save_defect_class(d: dict):
    core.save_json(core.DEFECT_CLASS_FILE, d or {})

def _defect_schema_text():
    return (
        "분류 체계(값은 아래 목록 중에서만 선택):\n"
        "- source(발생상황): 현장장애 | 상용망검증\n"
        "- device(유형/장비): " + " | ".join(_DEF_DEVICE) + "\n"
        "- category(카테고리): " + " | ".join(_DEF_CAT_LIVE) + "  (단, 현장장애는 " + " | ".join(_DEF_CAT_FIELD) + " 중에서만)\n"
        "- item(상용망 항목, 상용망검증일 때만): " + " | ".join(_DEF_ITEM) + "\n"
        "- type3(상용망 유형, 상용망검증일 때만): " + " | ".join(_DEF_TYPE3) + "\n"
    )

def _defect_norm(cls: dict) -> dict:
    """LLM/수동 분류값을 스키마에 맞게 정규화(허용값 외/누락은 '')."""
    def pick(v, allow):
        v = str(v or "").strip()
        for a in allow:
            if v == a or v.lower() == a.lower():
                return a
        return ""
    src = pick((cls or {}).get("source"), ["현장장애", "상용망검증"])
    dev = pick((cls or {}).get("device"), _DEF_DEVICE)
    cat = pick((cls or {}).get("category"), _DEF_CAT_LIVE if src == "상용망검증" else _DEF_CAT_FIELD)
    out = {"source": src, "device": dev, "category": cat}
    if src == "상용망검증":
        out["item"] = pick((cls or {}).get("item"), _DEF_ITEM)
        out["type3"] = pick((cls or {}).get("type3"), _DEF_TYPE3)
    else:
        out["item"] = ""; out["type3"] = ""
    return out

async def _jira_texts_for(keys):
    """이슈 본문 — **우리 DB 를 먼저 본다**.

    _jira_issue_texts 는 키 하나에 지라 왕복 한 번이라 백 건이면 백 번이다.
    Sync 로 받아 둔 것이 이미 표에 있으니 그것을 쓰고, **없는 것만** 지라에
    묻는다. 표에는 댓글이 없는 대신 문제유형·이슈분류·시험시설·이슈단계가
    있어 가르는 데에는 오히려 쓸 만하다.
    """
    have: dict = {}
    try:
        async with db.pool().acquire() as c:
            rows = await c.fetch(
                "SELECT key, data FROM jira_issue WHERE key = ANY($1::text[])", list(keys))
        for r in rows:
            d = r["data"] if isinstance(r["data"], dict) else json.loads(r["data"] or "{}")
            have[str(r["key"])] = d or {}
    except Exception:
        have = {}
    out, miss = {}, []
    for k in keys:
        d = have.get(k)
        if not d:
            miss.append(k)
            continue
        out[k] = (
            f"[제목] {d.get('summary') or ''}\n"
            f"[유형] {d.get('issuetype') or ''}\n"
            f"[문제유형] {d.get('probtype') or ''}\n"
            f"[이슈분류] {d.get('hwsw') or ''}\n"
            f"[이슈단계] {d.get('stage') or ''}\n"
            f"[시험시설] {d.get('lab') or ''}\n"
            f"[라벨] {d.get('labels') or ''}\n"
            f"[설명] {str(d.get('description') or '')[:1500]}"
        ).strip()
    if miss:
        out.update(_jira_issue_texts(miss))
    return out


def _jira_issue_texts(keys):
    """이슈키 목록 → {key: '제목 + 설명 + 댓글요약'} (LLM 분류 입력용). Jira에서 fetch."""
    out = {}
    for k in keys:
        try:
            r, err = _jira_call("GET", "/rest/api/2/issue/" + str(k) + "?fields=summary,description,issuetype,labels,components,comment")
            if err or r is None or r.status_code != 200:
                out[k] = ""; continue
            f = (r.json().get("fields") or {})
            summ = str(f.get("summary") or "")
            desc = str(f.get("description") or "")[:1500]
            itype = str(((f.get("issuetype") or {}).get("name")) or "")
            labels = ", ".join([str(x) for x in (f.get("labels") or [])])
            comps = ", ".join([str((c or {}).get("name") or "") for c in (f.get("components") or [])])
            cmts = (f.get("comment") or {}).get("comments") or []
            cmt_txt = " / ".join([str((c or {}).get("body") or "")[:200] for c in cmts[:3]])
            out[k] = (f"[제목] {summ}\n[유형] {itype}\n[컴포넌트] {comps}\n[라벨] {labels}\n[설명] {desc}\n[댓글] {cmt_txt}").strip()
        except Exception:
            out[k] = ""
    return out

# ── Jira 메타데이터(프로젝트·이슈유형·상태·모델매핑) 조회·캐시 — JQL 생성 정확도용 (하드코딩 없음, 10분 TTL) ──
_JIRA_META_CACHE = {"ts": 0.0, "data": None}
def _jira_meta(cfg=None):
    import time as _t
    if _JIRA_META_CACHE["data"] is not None and (_t.time() - _JIRA_META_CACHE["ts"]) < 600:
        return _JIRA_META_CACHE["data"]
    meta = {"projects": [], "issuetypes": [], "statuses": [], "model_proj": {}}
    cfg = cfg or _jira_cfg()
    try:
        r, err = _jira_call("GET", "/rest/api/2/project", cfg=cfg)
        if (r is not None) and r.is_success:
            meta["projects"] = [{"key": str(p.get("key") or ""), "name": str(p.get("name") or "")} for p in (r.json() or []) if p.get("key")][:80]
    except Exception:
        pass
    try:
        r, err = _jira_call("GET", "/rest/api/2/issuetype", cfg=cfg)
        if (r is not None) and r.is_success:
            seen = []
            for it in (r.json() or []):
                n = str(it.get("name") or "")
                if n and n not in seen:
                    seen.append(n)
            meta["issuetypes"] = seen[:40]
    except Exception:
        pass
    try:
        r, err = _jira_call("GET", "/rest/api/2/status", cfg=cfg)
        if (r is not None) and r.is_success:
            seen = []
            for st in (r.json() or []):
                n = str(st.get("name") or "")
                if n and n not in seen:
                    seen.append(n)
            meta["statuses"] = seen[:60]
    except Exception:
        pass
    # 모델명 → 프로젝트 키 (Jira 프로젝트 패널 설정의 이슈 키 매핑 auto_models — 설정 데이터)
    try:
        pts = cfg.get("panel_templates") or {}
        for pk, t in pts.items():
            for m in ((t or {}).get("auto_models") or []):
                m = str(m).strip()
                if m:
                    meta["model_proj"][m.upper()] = str(pk)
    except Exception:
        pass
    _JIRA_META_CACHE["ts"] = _t.time(); _JIRA_META_CACHE["data"] = meta
    return meta

# 담당자/보고자 이름 → Jira username 리졸브 (user search API, 세션 캐시)
_JIRA_USER_CACHE = {}
def _jira_resolve_user(name, cfg=None):
    key = str(name or "").strip()
    if not key:
        return name
    if key in _JIRA_USER_CACHE:
        return _JIRA_USER_CACHE[key]
    out = key
    try:
        r, err = _jira_call("GET", "/rest/api/2/user/search", cfg=cfg, params={"username": key, "maxResults": 5})
        if (r is not None) and r.is_success:
            arr = r.json() or []
            if arr:
                out = str(arr[0].get("name") or key)
    except Exception:
        pass
    _JIRA_USER_CACHE[key] = out
    return out

def _jira_fix_assignees(jql, cfg=None):
    """assignee/reporter 값이 한글 표시명이면 username으로 치환 (ASCII id는 그대로)."""
    import re as _r
    def _need(v):
        return any(ord(ch) > 127 for ch in v) or (" " in v.strip())
    def _rep_in(m):
        parts = [p.strip().strip('"').strip("'") for p in m.group(2).split(",")]
        rs = [(_jira_resolve_user(p, cfg) if _need(p) else p) for p in parts if p]
        return m.group(1) + " in (" + ", ".join('"%s"' % x for x in rs) + ")"
    def _rep_eq(m):
        v = m.group(2)
        return m.group(1) + ' = "' + (_jira_resolve_user(v, cfg) if _need(v) else v) + '"'
    jql = _r.sub(r'\b(assignee|reporter)\s+in\s*\(([^)]*)\)', _rep_in, jql, flags=_r.I)
    jql = _r.sub(r'\b(assignee|reporter)\s*=\s*"([^"]+)"', _rep_eq, jql, flags=_r.I)
    return jql

def _jira_expand_text(jql, question):
    """text ~ "키워드"를 붙임/띄움 두 표기 OR로 확장 — 띄어쓰기에 따라 결과가 갈리는 문제 방지.
    LLM 이 이미 확장한 경우(같은 확장이 원본 JQL 에 이미 존재)엔 재확장하지 않아 중복 그룹 생성 방지."""
    import re as _r
    toks = [t for t in _r.split(r"\s+", str(question or "")) if t]
    # JQL 안에 이미 등장한 text ~ 값을 모아 중복 확장 판정에 쓴다
    _existing = set(_r.findall(r'text\s*~\s*"([^"]+)"', jql))
    def _rep(m):
        term = m.group(1).strip()
        var = {term}
        if " " in term:
            var.add(term.replace(" ", ""))
        else:
            # 질문에서 "A B"로 띄어 쓴 연속 토큰의 결합이 이 키워드와 같으면 띄운 표기도 추가
            for i in range(len(toks) - 1):
                if (toks[i] + toks[i + 1]) == term:
                    var.add(toks[i] + " " + toks[i + 1])
        if len(var) <= 1:
            return m.group(0)
        # 이미 다른 표기(붙임/띄움)가 JQL 안에 존재 → LLM 이 이미 확장한 상태이므로 재확장 스킵
        if any((v != term and v in _existing) for v in var):
            return m.group(0)
        return "(" + " OR ".join('text ~ "%s"' % v for v in sorted(var)) + ")"
    return _r.sub(r'text\s*~\s*"([^"]+)"', _rep, jql)

async def _jira_gen_jql(q, llm, proj, meta=None):
    """자연어 질문 → LLM이 Jira JQL 생성. 실제 Jira 값(프로젝트·이슈유형·상태·모델매핑)을 주입해 필터 정확도 확보. 실패 시 ''."""
    import re as _r, datetime as _dt
    today = _dt.date.today().isoformat()
    meta = meta or {}
    _mLines = ""
    if meta.get("projects"):
        _mLines += "\n[프로젝트 목록 (key:이름) — project 조건은 반드시 이 key만 사용]\n" + ", ".join((p["key"] + ":" + p["name"]) for p in meta["projects"])
    if meta.get("model_proj"):
        _mLines += "\n[모델→프로젝트 매핑 — 질문에 모델명이 있으면 해당 project 조건 포함]\n" + ", ".join((m + "→" + k) for m, k in sorted(meta["model_proj"].items()))
    if meta.get("issuetypes"):
        _mLines += "\n[이슈유형 목록 — issuetype 조건은 이 값만 사용]\n" + ", ".join(meta["issuetypes"])
    if meta.get("statuses"):
        _mLines += "\n[상태 목록 — status 조건은 이 값만 사용. '미처리/진행중' 같은 표현은 이 목록의 실제 상태명(여러 개면 status in (...))으로 매핑]\n" + ", ".join(meta["statuses"])
    sysp = ("너는 Jira(Server, JQL v2) 검색식 생성기다. 사용자 질문을 JQL '한 줄'로만 출력한다. 설명·코드펜스·접두어 금지, JQL만.\n"
            "필드: project, issuetype, status, priority, assignee, reporter, created, updated, text(제목·설명·댓글 전체검색), summary, labels, component.\n"
            "규칙:\n"
            "- 질문에서 추출 가능한 조건(프로젝트·이슈유형·상태·담당자·기간)은 해당 JQL 필터로 만들고, 나머지 키워드만 text ~ \"키워드\" 검색으로 남긴다.\n"
            "- 담당자/보고자 이름이 언급되면 assignee in (\"이름\") 형태 (이름 그대로, 시스템이 계정으로 변환).\n"
            "- 복합 명사 키워드는 붙임/띄움 두 표기를 OR로 포함: (text ~ \"현장이슈\" OR text ~ \"현장 이슈\").\n"
            "- 기간은 created(또는 updated) >= \"YYYY-MM-DD\" AND < \"YYYY-MM-DD\". 오늘=" + today + ".\n"
            "- 위 목록에 없는 프로젝트/이슈유형/상태 값을 지어내지 않는다. 확실하지 않은 조건은 넣지 않는다.\n"
            "- 끝에 ORDER BY created DESC.\n"
            + (('반드시 project = "%s" 포함.\n' % proj) if proj else "")
            + _mLines + "\n"
            + "예) '2025년 1월 U9500H Defect 미처리 목록' → " + (('project = "%s" AND ' % proj) if proj else "")
            + "issuetype = Defect AND status in (\"Open\", \"Assign\") AND text ~ \"U9500H\" AND created >= \"2025-01-01\" AND created < \"2025-02-01\" ORDER BY created DESC")
    out = await _jira_llm_complete(llm, sysp, "질문: " + str(q) + "\nJQL:", max_tokens=300, temp=0.0)
    s = _r.sub(r"```[a-zA-Z]*", "", str(out or "")).replace("`", "").replace("\r", " ").strip()
    for line in ([s] + s.split("\n")):
        line = _r.sub(r'^\s*(JQL|jql)\s*[:=]\s*', "", line.strip()).strip()
        if len(line) >= 5 and _r.search(r'(~|=|>|<|ORDER\s+BY)', line, _r.I):
            s = line; break
    s = s.strip()
    if not _r.search(r'(~|=|>|<|ORDER\s+BY|issuetype|project|text|created)', s, _r.I):
        return ""
    if proj and ('project' not in s.lower()):
        m = _r.search(r'\s+ORDER\s+BY\s', s, _r.I)
        s = (s[:m.start()] + (' AND project = "%s"' % proj) + s[m.start():]) if m else (s + (' AND project = "%s"' % proj))
    return s

async def _jira_ask_prep(payload: dict):
    """Jira 검색 + 컨텍스트·프롬프트·LLM 선택까지 공통 준비 (일반/스트리밍 공유)."""
    import re as _re5
    q = str(payload.get("question") or payload.get("query") or "").strip()
    img = str(payload.get("image") or "").strip()   # 첨부 캡처 이미지(data URL) — 비전 LLM에 전달
    if not q and img:
        q = "첨부한 이미지를 참고해 관련 이슈를 분석해줘"
    if not q:
        return {"error": "질문을 입력하세요"}
    def _jtext(v):
        if v is None: return ""
        if isinstance(v, str): return v
        if isinstance(v, (dict, list)):
            out = []
            def _walk(n):
                if isinstance(n, dict):
                    if n.get("type") == "text" and n.get("text"): out.append(n["text"])
                    for c in (n.get("content") or []): _walk(c)
                elif isinstance(n, list):
                    for c in n: _walk(c)
            _walk(v); return " ".join(out)
        return str(v)
    cfg = _jira_cfg(); ai = cfg.get("ai") if isinstance(cfg.get("ai"), dict) else {}
    _SAFE = 500   # 안전 상한(프롬프트 폭발·OOM 방지) — 사실상 무제한
    _rawmax = ai.get("max_issues")
    if _rawmax is None or str(_rawmax).strip() == "": _rawmax = payload.get("max")
    if _rawmax is None:
        _want = 30   # 미설정 기본
    else:
        try: _want = int(_rawmax)
        except Exception: _want = 30
        _want = _SAFE if _want <= 0 else min(_want, _SAFE)   # 0(=설정에서 빈칸 저장) → 개수 제한 없음(=안전상한 500)
    # desc_len / comment_n : 빈 값(None/"") → 무제한(전체) — max_issues 와 동일한 규칙
    _rawdesc = ai.get("desc_len"); _rawcmt = ai.get("comment_n")
    if _rawdesc is None or str(_rawdesc).strip() == "":
        _desclen = None   # None = 자르지 않음(전체)
    else:
        try: _desclen = int(_rawdesc)
        except Exception: _desclen = 2800
        if _desclen <= 0: _desclen = None
        elif _desclen < 200: _desclen = 200   # 너무 짧은 값은 최소 200 보호
    if _rawcmt is None or str(_rawcmt).strip() == "":
        _cmtn = None   # None = 모든 댓글
    else:
        try: _cmtn = int(_rawcmt)
        except Exception: _cmtn = 8
        if _cmtn < 0: _cmtn = 0
    try: _temp = float(ai.get("temperature")) if str(ai.get("temperature") or "").strip() != "" else 0.35
    except Exception: _temp = 0.35
    _maxtok = max(256, int(ai.get("max_tokens") or 3500)); _proj = str(ai.get("project") or "").strip()
    _aj = ai.get("auto_jql"); _autojql = True if _aj is None else (str(_aj).lower() not in ("false", "0", "off", "no", ""))
    # LLM 선택 (JQL 자동생성·답변 공용)
    llms = (core.load_json(core.LLMS_FILE).get("llms") or [])
    active = [l for l in llms if l.get("status", "active") == "active" and l.get("endpoint")]
    _lid = str(ai.get("llm_id") or "").strip()
    llm = (next((l for l in active if str(l.get("id") or "") == _lid), None) if _lid else None) \
          or next((l for l in active if str(l.get("type") or "").lower() not in ("claude", "anthropic") and "anthropic.com" not in str(l.get("endpoint", ""))), None) \
          or (active[0] if active else None)
    def _kw_jql():
        _stop = set("관련 이슈 이슈들 알려줘 알려 정리 정리해줘 정리해 해줘 현황 상태 보여줘 보여 대해 대한 뭐야 무엇 어떤 무슨 그리고 좀 해 줘 어디 누가 어떻게 있어 있나 인가 인지 대하여 모두 전부 list 리스트".split())
        toks = [t for t in _re5.split(r"[\s,./]+", _re5.sub(r'["\\]', " ", q)) if t and len(t) >= 2 and t not in _stop]
        tp = ("(" + " OR ".join('text ~ "' + t.replace('"', " ") + '"' for t in toks[:6]) + ")") if toks else ('text ~ "' + _re5.sub(r'["\\]', " ", q)[:60].strip() + '"')
        return ((('project = "%s" AND ' % _proj.replace('"', " ")) if _proj else "") + tp + " ORDER BY updated DESC")
    _fields = "summary,description,status,issuetype,priority,assignee,reporter,project,created,updated,comment,labels,components"
    def _page(_jql, _start, _cnt): return _jira_call("GET", "/rest/api/2/search", params={"jql": _jql, "startAt": _start, "maxResults": max(1, _cnt), "fields": _fields})
    # JQL 결정: ① 직접입력 → ② AI 자동생성(설정 on) → ③ 키워드 OR
    # (질문에 모델명이 있으면 아래에서 제목매칭 이슈를 추가 수집·병합하고 제목매칭/본문언급 태그를 붙인다)
    jql = str(payload.get("jql") or "").strip(); jql_mode = "직접"
    # 모델 토큰(영문 1~3자 + 숫자 3~5자 + 접미: U9532H, E7500, U9024A-10G 등) 감지
    _mdls = ([t for t in _re5.findall(r"\b[A-Za-z]{1,3}\d{3,5}[A-Za-z0-9-]*\b", q)][:3]) if not jql else []
    _meta = (_jira_meta(cfg) if not jql else {})   # 실제 Jira 값(프로젝트·유형·상태·모델매핑) — JQL 필터 정확도
    _preInj = ""   # 모델→프로젝트 주입 전 JQL (0건 시 전체 폴백용)
    if not jql:
        if _autojql and llm:
            try: _g = await _jira_gen_jql(q, llm, _proj, _meta)
            except Exception: _g = ""
            if _g: jql = _g; jql_mode = "AI생성"
        if not jql:
            jql = _kw_jql(); jql_mode = "키워드"
        # 후처리 ①: 키워드 붙임/띄움 두 표기 OR 확장 (띄어쓰기로 결과 갈리는 문제 방지)
        try: jql = _jira_expand_text(jql, q)
        except Exception: pass
        # 후처리 ②: 담당자/보고자 한글 이름 → Jira 계정 리졸브
        try: jql = _jira_fix_assignees(jql, cfg)
        except Exception: pass
        # 후처리 ③: 모델→프로젝트 매핑(패널 설정 auto_models) 결정적 주입 — project 조건이 없을 때만
        try:
            if _mdls and _meta.get("model_proj") and ("project" not in jql.lower()):
                _pk = next((_meta["model_proj"][m.upper()] for m in _mdls if m.upper() in _meta["model_proj"]), "")
                if _pk:
                    _m6 = _re5.search(r"\s+ORDER\s+BY\s", jql, _re5.I)
                    _body = (jql[:_m6.start()] if _m6 else jql).strip()
                    _tail = (jql[_m6.start():] if _m6 else "")
                    _preInj = jql
                    jql = ('project = "%s" AND (%s)%s' % (_pk, _body, _tail))
                    jql_mode += "+프로젝트매핑(" + _pk + ")"
        except Exception:
            pass
    r, err = _page(jql, 0, min(_want, 100))
    if err: return err
    if (r is not None) and (not r.is_success) and jql_mode == "AI생성":   # AI생성 JQL 문법오류 → 키워드로 1회 폴백
        jql = _kw_jql(); jql_mode = "키워드(AI생성 실패→폴백)"
        r, err = _page(jql, 0, min(_want, 100))
        if err: return err
    if not r.is_success:
        return {"error": f"Jira {r.status_code} · {r.text[:200]} (JQL: {jql})"}
    _j0 = r.json(); issues = list(_j0.get("issues") or []); _total = int(_j0.get("total") or len(issues))
    # 매핑 프로젝트로 제한했는데 0건이면 전체(주입 전 JQL)로 폴백 — 참고성 질문 커버
    if _total == 0 and _preInj:
        jql = _preInj; jql_mode += "→0건 전체폴백"
        _r0, _e0 = _page(jql, 0, min(_want, 100))
        if (not _e0) and (_r0 is not None) and _r0.is_success:
            _j0 = _r0.json(); issues = list(_j0.get("issues") or []); _total = int(_j0.get("total") or len(issues))
    while len(issues) < min(_want, _total) and len(issues) < _SAFE:   # 추가 페이지로 더 수집 (개수 제한 없음, 안전상한까지)
        _rr, _e = _page(jql, len(issues), min(100, _want - len(issues)))
        if _e or (_rr is None) or (not _rr.is_success): break
        _b = _rr.json().get("issues") or []
        if not _b: break
        issues.extend(_b)
    issues = issues[:_want]
    # 모델명 제목매칭 보강: 질문에 모델 토큰이 있으면 summary 매칭 이슈를 추가 수집해 병합(중복 제거, 최신순)
    if _mdls:
        try:
            _mq = "(" + " OR ".join('summary ~ "%s"' % m.replace('"', " ") for m in _mdls) + ")"
            _mjql = ((('project = "%s" AND ' % _proj.replace('"', " ")) if _proj else "") + _mq + " ORDER BY created DESC")
            _rm, _em = _page(_mjql, 0, min(_want, 100))
            if (not _em) and (_rm is not None) and _rm.is_success:
                _mis = list(_rm.json().get("issues") or [])
                _seen = {it.get("key") for it in issues}
                _added = [it for it in _mis if it.get("key") not in _seen]
                if _added:
                    issues = sorted(issues + _added, key=lambda it: str((it.get("fields") or {}).get("created") or ""), reverse=True)[: max(_want, len(issues))]
                    jql_mode = (jql_mode or "") + "+모델제목"
        except Exception:
            pass
    def _tmatch(it):
        if not _mdls: return ""
        _s = str((it.get("fields") or {}).get("summary") or "").lower()
        return "제목매칭" if any(m.lower() in _s for m in _mdls) else "본문언급"
    cited = []; ctx = []
    def _nm(d): return str((d or {}).get("displayName") or (d or {}).get("name") or "") if isinstance(d, dict) else ""
    _detn = min(len(issues), 25)   # 앞 25건까지 상세, 나머지는 요약줄 (개수 제한 없이 수집하되 프롬프트는 관리)
    for idx, it in enumerate(issues):
        key = it.get("key", ""); f = it.get("fields") or {}
        summ = str(f.get("summary") or ""); st = ((f.get("status") or {}).get("name") or "")
        itype = ((f.get("issuetype") or {}).get("name") or ""); prio = ((f.get("priority") or {}).get("name") or "")
        asgn = _nm(f.get("assignee")) or "미지정"; rep = _nm(f.get("reporter"))
        upd = str(f.get("updated") or "")[:10]; crt = str(f.get("created") or "")[:10]
        cited.append({"key": key, "summary": summ, "status": st})
        _tg = _tmatch(it); _tgs = (f" / {_tg}" if _tg else "")
        if idx < _detn:
            _d = _jtext(f.get("description")); desc = _d if _desclen is None else _d[:_desclen]
            cms = ((f.get("comment") or {}).get("comments") or [])
            # _cmtn None = 전체 댓글, 0 = 제외, N = 최근 N개
            if _cmtn is None: _pick = cms
            elif _cmtn == 0: _pick = []
            else: _pick = cms[-_cmtn:]
            cmt = "\n".join("  · [" + str(c.get("created") or "")[:10] + " " + _nm(c.get("author")) + "] " + _jtext(c.get("body"))[:700] for c in _pick)
            labels = ", ".join([str(x) for x in (f.get("labels") or [])][:8])
            comps = ", ".join([_nm(x) for x in (f.get("components") or [])][:6])
            meta = f"유형:{itype} / 상태:{st} / 우선순위:{prio} / 담당:{asgn} / 보고:{rep} / 생성:{crt} / 수정:{upd}{_tgs}"
            if labels: meta += f" / 라벨:{labels}"
            if comps: meta += f" / 컴포넌트:{comps}"
            ctx.append(f"### 이슈키 [{key}] 제목: {summ}\n  {meta}\n  [설명]\n{desc or '(설명 없음)'}" + (f"\n  [댓글 {len(cms)}개 중 최근]\n{cmt}" if cmt.strip() else "\n  [댓글 없음]"))
        else:
            ctx.append(f"### 이슈키 [{key}] 제목: {summ}\n  유형:{itype} / 상태:{st} / 우선순위:{prio} / 담당:{asgn} / 생성:{crt}{_tgs}  (요약)")
    # 프롬프트 문자 예산 — 이슈가 많을 때(수백 건) 컨텍스트 폭발 → LLM 컨텍스트 초과·빈 응답 방지
    try: _ctx_budget = int(ai.get("ctx_chars") or 60000)
    except Exception: _ctx_budget = 60000
    _acc, _used, _cut = [], 0, 0
    for _seg in ctx:
        if _acc and (_used + len(_seg) > _ctx_budget):
            _cut += 1; continue
        _acc.append(_seg); _used += len(_seg)
    if _cut:
        _acc.append(f"(프롬프트 길이 제한으로 {_cut}건 생략 — 검색 매칭 총 {len(issues)}건)")
    context = "\n\n══════════════\n\n".join(_acc) if _acc else "(검색 결과 없음)"
    sys_p = ("너는 사내 Jira 이슈를 분석해 주는 전문 어시스턴트다. 아래 '검색된 Jira 이슈'(제목·유형·상태·우선순위·담당·설명·댓글)만을 근거로, "
             "사용자 질문에 한국어로 **상세하고 구조적으로** 답한다. 다음 형식을 반드시 따른다:\n\n"
             "## 핵심 요약\n질문에 대한 답을 3~5문장으로 먼저 제시한다.\n\n"
             "## 이슈별 상세\n관련된 각 이슈마다 다음을 작성한다:\n"
             "- **[PROJ-123] 제목** — (상태/우선순위/담당)\n"
             "- 무엇이 문제/요청인지, 원인, 진행/조치 내용, 댓글에서 드러난 핵심 논의·결론을 2~5줄로 구체적으로.\n\n"
             "## 종합 결론\n공통 원인·패턴, 미해결(Open) 항목, 우선 처리 권고, 추가로 확인이 필요한 점을 정리한다.\n\n"
             "[규칙] 근거가 된 이슈는 반드시 이슈 키([P106-2436]처럼 '프로젝트코드-숫자' 형태, 각 이슈의 '이슈키 [...]' 값)로 인용한다. "
             "이슈 제목 안의 [U9532H]·[LGU]·[상용망] 같은 대괄호 태그는 이슈 키가 아니므로 절대 키 자리에 쓰지 않는다. "
             "이슈에 '제목매칭/본문언급' 표시가 있으면: 질문의 모델명이 제목에 있는 '제목매칭' 이슈를 그 모델의 이슈로 우선하고, '본문언급' 이슈는 참고로만 다룬다. "
             "설명·댓글이 없는 관리성 이슈(산출물·릴리즈 등)가 최신이면 그 사실을 명시하고, 실질 내용이 있는 최신 이슈도 함께 제시한다. "
             "설명·댓글에 실제로 있는 내용만 쓰고 추측·창작은 금지한다. "
             "검색식(JQL)을 임의로 만들어 답변에 표시하지 않는다 — 실제 사용된 JQL은 시스템이 하단에 별도 표시한다. "
             "정보가 부족하면 '해당 이슈의 설명/댓글에 정보가 부족함'이라고 명시한다. 검색 결과 자체가 없으면 '관련 이슈를 찾지 못했습니다'라고만 답한다. "
             "충분히 길고 빠짐없이, 마크다운(##, **, -)으로 가독성 있게 작성한다.")
    if str(ai.get("prompt") or "").strip(): sys_p = str(ai.get("prompt"))   # 설정에서 프롬프트 직접 지정 시 사용
    # Jira 프로젝트 Key ↔ 이름 매핑 — 설정된 게 있으면 시스템 프롬프트 끝에 붙여 LLM 이 프로젝트 판단에 활용
    _km = ai.get("key_mappings") if isinstance(ai.get("key_mappings"), list) else []
    _km = [x for x in _km if isinstance(x, dict) and str(x.get("key") or "").strip()]
    if _km:
        _kml = "\n\n[Jira 프로젝트 Key 매핑 — 질문의 프로젝트명을 이 표에서 Key 로 해석하라]"
        for _x in _km:
            _k = str(_x.get("key") or "").strip()
            _n = str(_x.get("name") or "").strip()
            _d = str(_x.get("desc") or "").strip()
            _kml += f"\n- {_k}"
            if _n: _kml += f" = {_n}"
            if _d: _kml += f" · {_d}"
        sys_p += _kml
    if img:
        sys_p += "\n[첨부 이미지] 사용자가 캡처 이미지를 첨부했다. 이미지 속 로그·CLI 출력·화면 내용을 판독해 질문·이슈 분석에 활용하고, 이미지에서 확인한 내용은 그 사실을 명시한다."
    _hdr = (f"[검색된 Jira 이슈 — 분석 {len(issues)}건" + (f" / 전체 매칭 {_total}건" if _total > len(issues) else "") + "]")
    user_p = f"{_hdr}\n\n{context}\n\n[사용자 질문]\n{q}\n\n위 이슈들을 근거로 형식에 맞춰 상세히 답하라."
    return {"cited": cited, "count": len(issues), "total": _total, "sys_p": sys_p, "user_p": user_p, "llm": llm, "temp": _temp, "maxtok": _maxtok, "jql": jql, "jql_mode": jql_mode, "img": img}

def _jira_mm_openai(user_p: str, img: str):
    """OpenAI 호환 user content — 이미지(data URL) 있으면 멀티모달 배열."""
    if not img:
        return user_p
    return [{"type": "text", "text": user_p}, {"type": "image_url", "image_url": {"url": img}}]

def _jira_mm_claude(user_p: str, img: str):
    """Anthropic user content — data URL → base64 이미지 블록."""
    if not img:
        return user_p
    try:
        head, b64 = img.split(",", 1)
        mt = head.split(":", 1)[1].split(";", 1)[0] if ":" in head else "image/png"
        return [{"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}},
                {"type": "text", "text": user_p}]
    except Exception:
        return user_p

@router.post("/api/jira/ask")
async def jira_ask(payload: dict):
    """질문 → Jira 이슈 검색 → LLM 답변 (비스트리밍)."""
    import httpx as _hx
    p = await _jira_ask_prep(payload)
    if p.get("error"): return {"ok": False, "error": p["error"]}
    llm = p["llm"]; cited = p["cited"]; count = p["count"]; sys_p = p["sys_p"]; user_p = p["user_p"]; _temp = p["temp"]; _maxtok = p["maxtok"]; jql = p["jql"]
    if not llm:
        return {"ok": False, "error": "등록된 LLM이 없습니다 (AI Assistant에서 LLM을 먼저 등록하세요)", "cited": cited, "count": count}
    answer = None; llm_err = None
    ltype = str(llm.get("type") or "").lower(); ep = str(llm.get("endpoint") or "")
    if ltype in ("claude", "anthropic") or "anthropic.com" in ep:
        try:
            import anthropic as _ah
            m = _ah.Anthropic(api_key=llm.get("apikey") or "").messages.create(
                model=llm.get("model") or "claude-sonnet-4-6", max_tokens=_maxtok, system=sys_p,
                messages=[{"role": "user", "content": _jira_mm_claude(user_p, p.get("img") or "")}])
            answer = "".join(getattr(b, "text", "") for b in m.content).strip()
        except Exception as e:
            llm_err = "Claude: " + str(e)[:200]
    else:
        body = {"model": llm.get("model") or "", "messages": [{"role": "system", "content": sys_p}, {"role": "user", "content": _jira_mm_openai(user_p, p.get("img") or "")}], "temperature": _temp, "max_tokens": _maxtok}
        headers = {"Content-Type": "application/json"}
        ak = llm.get("apikey")
        if ak and not str(ak).lower().startswith("http"):
            headers["Authorization"] = f"Bearer {ak}"
        url = ep.rstrip("/") + "/chat/completions"
        try:
            async with _hx.AsyncClient(timeout=180) as client:
                rr = await client.post(url, headers=headers, json=body)
                if rr.status_code == 200:
                    answer = (((rr.json().get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
                else:
                    llm_err = f"LLM {rr.status_code}: {rr.text[:160]} (URL {url})"
        except Exception as e:
            llm_err = str(e)[:200]
    if not answer:
        return {"ok": False, "error": "LLM 호출 실패 — " + (llm_err or "빈 응답"), "cited": cited, "count": count, "llm": llm.get("name")}
    return {"ok": True, "answer": answer, "cited": cited, "count": count, "total": p.get("total"), "jql": jql, "llm": llm.get("name")}

@router.post("/api/jira/ask-stream")
async def jira_ask_stream(payload: dict):
    """질문 → Jira 검색 → LLM 답변 스트리밍 (SSE) — 느린 응답을 토큰 단위로 즉시 표시."""
    import httpx as _hx, json as _json
    from fastapi.responses import StreamingResponse
    p = await _jira_ask_prep(payload)
    async def gen():
        def sse(o): return "data: " + _json.dumps(o, ensure_ascii=False) + "\n\n"
        if p.get("error"):
            yield sse({"error": p["error"]}); return
        llm = p["llm"]
        yield sse({"meta": {"cited": p["cited"], "count": p["count"], "total": p.get("total"), "jql": p["jql"], "jql_mode": p.get("jql_mode"), "llm": (llm or {}).get("name")}})
        if not llm:
            yield sse({"error": "등록된 LLM이 없습니다 (AI Assistant에서 LLM을 먼저 등록하세요)"}); yield sse({"done": True}); return
        sys_p = p["sys_p"]; user_p = p["user_p"]; _temp = p["temp"]; _maxtok = p["maxtok"]; _img = p.get("img") or ""
        ltype = str(llm.get("type") or "").lower(); ep = str(llm.get("endpoint") or ""); got = False
        if ltype in ("claude", "anthropic") or "anthropic.com" in ep:
            try:
                import anthropic as _ah
                with _ah.Anthropic(api_key=llm.get("apikey") or "").messages.stream(
                        model=llm.get("model") or "claude-sonnet-4-6", max_tokens=_maxtok, system=sys_p,
                        messages=[{"role": "user", "content": _jira_mm_claude(user_p, _img)}]) as _st:
                    for _txt in _st.text_stream:
                        if _txt: got = True; yield sse({"delta": _txt})
            except Exception as e:
                yield sse({"error": "Claude: " + str(e)[:200]})
        else:
            body = {"model": llm.get("model") or "", "messages": [{"role": "system", "content": sys_p}, {"role": "user", "content": _jira_mm_openai(user_p, _img)}], "temperature": _temp, "max_tokens": _maxtok, "stream": True}
            headers = {"Content-Type": "application/json"}
            ak = llm.get("apikey")
            if ak and not str(ak).lower().startswith("http"):
                headers["Authorization"] = f"Bearer {ak}"
            url = ep.rstrip("/") + "/chat/completions"
            try:
                async with _hx.AsyncClient(timeout=300) as client:
                    async with client.stream("POST", url, headers=headers, json=body) as rr:
                        if rr.status_code != 200:
                            _tx = (await rr.aread()).decode("utf-8", "replace")[:200]
                            yield sse({"error": f"LLM {rr.status_code}: {_tx}"})
                        else:
                            async for line in rr.aiter_lines():
                                if not line or not line.startswith("data:"): continue
                                _d = line[5:].strip()
                                if _d == "[DONE]": break
                                try: _j = _json.loads(_d)
                                except Exception: continue
                                _delta = (((_j.get("choices") or [{}])[0].get("delta") or {}).get("content")) or ""
                                if _delta: got = True; yield sse({"delta": _delta})
            except Exception as e:
                yield sse({"error": str(e)[:200]})
        if not got:
            yield sse({"error": "빈 응답"})
        yield sse({"done": True})
    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive", "Content-Encoding": "identity"})

@router.get("/api/jira/search-all")
async def jira_search_all(jql: str, fields: str = "summary,status,issuetype,reporter,project", cap: int = 10000):
    cfg = _jira_cfg()
    issues = []
    start = 0
    total = None
    for _ in range(200):   # 안전망: 최대 200페이지(=20000건)
        r, err = _jira_call("GET", "/rest/api/2/search", cfg=cfg,
                            params={"jql": jql, "startAt": start, "maxResults": 100, "fields": fields})
        if err:
            return err
        if not r.is_success:
            return {"ok": False, "error": f"{r.status_code} · {r.text[:300]}"}
        j = r.json()
        batch = j.get("issues", [])
        issues.extend(batch)
        total = j.get("total", len(issues))
        start += len(batch)
        if not batch or start >= total or len(issues) >= cap:
            break
    return {"ok": True, "issues": issues, "total": total if total is not None else len(issues)}

# ── Issue Sync: utop 서버 저장 + 증분 동기화 ──
def _issue_path(project: str):
    import re as _re
    safe = _re.sub(r"[^A-Za-z0-9_.-]", "_", str(project or "")) or "_"
    return core.DATA_DIR / "issue_sync" / (safe + ".json")

def _issue_load(project: str) -> dict:
    p = _issue_path(project)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}

def _issue_save(project: str, store: dict):
    p = _issue_path(project)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(store, ensure_ascii=False), encoding="utf-8")

@router.get("/api/issues/{project}")
async def issues_get(project: str):
    """utop에 저장된 이슈를 그대로 반환 (Jira 호출 없음)."""
    store = _issue_load(project)
    issues = store.get("issues", [])
    return {"ok": True, "project": project, "issues": issues,
            "count": len(issues), "last_synced_at": store.get("last_synced_at", "")}

@router.post("/api/issues/sync")
async def issues_sync(payload: dict):
    """프로젝트 이슈를 Jira에서 가져와 utop에 저장. 마지막 마커 이후 변경분만(증분), full=True면 전체."""
    from datetime import datetime as _dt, timedelta as _td
    projects = [str(x) for x in (payload.get("projects") or []) if str(x).strip()]
    # 옛 화면은 {project: key} 하나를 보낸다. projects 목록으로 오면 첫 것을 쓴다(2026-09-29 미정의 이름 고침).
    project = str(payload.get("project") or (projects[0] if projects else "")).strip()
    if not project:
        return {"ok": False, "error": "프로젝트가 없습니다"}
    fields = str(payload.get("fields") or "summary,status,issuetype,assignee,priority,updated")
    fset = [f.strip() for f in fields.split(",") if f.strip()]
    if "updated" not in fset:
        fset.append("updated")
    fields = ",".join(fset)
    full = bool(payload.get("full"))
    store = _issue_load(project)
    marker = store.get("updated_marker", "")
    existing = store.get("issues", []) or []
    if full or not marker or not existing:
        jql = f'project = "{project}" ORDER BY updated DESC'
        mode = "full"
    else:
        jql = f'project = "{project}" AND updated >= "{marker}" ORDER BY updated DESC'
        mode = "incremental"
    res = await jira_search_all(jql=jql, fields=fields, cap=20000)
    if not res.get("ok"):
        return {"ok": False, "error": res.get("error") or "Jira 조회 실패"}
    fetched = res.get("issues", []) or []
    by_key = {}
    if mode == "incremental":
        for it in existing:
            k = it.get("key")
            if k:
                by_key[k] = it
    added = 0; updated_n = 0
    for it in fetched:
        k = it.get("key")
        if not k:
            continue
        if k in by_key:
            updated_n += 1
        else:
            added += 1
        by_key[k] = it
    merged = list(by_key.values())
    def _upd(it):
        return ((it.get("fields") or {}).get("updated")) or ""
    merged.sort(key=_upd, reverse=True)
    # 다음 증분용 마커: Jira updated 최댓값 - 2분 버퍼 ("yyyy-MM-dd HH:mm")
    max_upd = ""
    for it in merged:
        u = _upd(it)
        if u > max_upd:
            max_upd = u
    new_marker = marker
    if max_upd:
        try:
            dt = _dt.strptime(max_upd[:19], "%Y-%m-%dT%H:%M:%S") - _td(minutes=2)
            new_marker = dt.strftime("%Y-%m-%d %H:%M")
        except Exception:
            new_marker = marker
    now_iso = _dt.now().strftime("%Y-%m-%d %H:%M:%S")
    _issue_save(project, {"project": project, "issues": merged, "fields": fields,
                          "updated_marker": new_marker, "last_synced_at": now_iso})
    return {"ok": True, "project": project, "mode": mode, "added": added,
            "updated": updated_n, "total": len(merged), "fetched": len(fetched),
            "last_synced_at": now_iso, "issues": merged}

@router.get("/api/jira/fields")
async def jira_fields(refresh: int = 0):
    """지라의 칸 목록 — **타입까지** 준다.

    이름만으로는 날짜인지 사람인지 여럿인지 알 수 없어, 받아 와도 글자로
    펴는 규칙을 정할 수 없다(2026-09-08T12:00:00.000+0900 이 그대로 열에
    박히는 식). schema 를 함께 넘긴다.

    246 개가 자주 바뀔 리 없어 30 분 담아 둔다 — 화면을 열 때마다 지라를
    부를 까닭이 없다. `?refresh=1` 이면 새로 받는다."""
    import time as _t
    if not refresh:
        c = await db.kv_get("jira.fields.cache", None) or {}
        if c.get("fields") and (_t.time() - float(c.get("at") or 0)) < 1800:
            return {"ok": True, "fields": c["fields"], "cached": True}
    r, err = _jira_call("GET", "/rest/api/2/field")
    if err:
        return err
    if not r.is_success:
        return {"ok": False, "error": f"{r.status_code} · {r.text[:300]}"}
    out = []
    for f in (r.json() or []):
        sch = f.get("schema") or {}
        out.append({
            "id": f.get("id"),
            "name": f.get("name"),
            "custom": bool(f.get("custom")),
            # string · number · date · datetime · user · array · option · …
            "type": str(sch.get("type") or ""),
            # 배열이면 무엇의 배열인가(option·user·string)
            "items": str(sch.get("items") or ""),
        })
    await db.kv_set("jira.fields.cache", {"at": _t.time(), "fields": out})
    return {"ok": True, "fields": out}


# ── 사람이 더한 지라 칸 ────────────────────────────────────────
# **온 서버에 한 벌**이다. Sync 도 한 벌이고 jira_issue.data 도 한 벌이라,
# 계정마다 다른 칸을 받으면 뒤에 Sync 한 사람이 앞사람 칸을 지운다.
# 그래서 「무엇을 받아 오는가」 는 공용이고, 「그중 무엇을 보는가」 는
# 계정별(prefSet · 보기 탭)이다. 더하는 것은 관리자만 — 칸을 더하는 일이
# 곧 모두의 Sync 를 무겁게 하는 일이라 문턱이 있어야 한다.
JIRA_COL_CAP = 40


@router.get("/api/jira/columns")
async def jira_columns_get():
    d = await db.kv_get("jira.columns", None) or {}
    return {"ok": True, "columns": list(d.get("columns") or [])}


@router.post("/api/jira/columns")
async def jira_columns_set(payload: dict, token: str = ""):
    core.require_admin(token)
    cols = []
    seen = set()
    for c in (payload.get("columns") or []):
        fid = str((c or {}).get("id") or "").strip()
        if not fid or fid in seen or fid in JIRA_CF.values():
            continue      # 이미 붙박이로 있는 칸을 또 세우지 않는다
        seen.add(fid)
        cols.append({
            "id": fid,
            "label": str((c or {}).get("label") or fid)[:40],
            "type": str((c or {}).get("type") or ""),
            "items": str((c or {}).get("items") or ""),
        })
        if len(cols) >= JIRA_COL_CAP:
            break
    await db.kv_set("jira.columns", {"columns": cols})
    return {"ok": True, "columns": cols}


async def _jira_extra_cols() -> list[dict]:
    d = await db.kv_get("jira.columns", None) or {}
    return list(d.get("columns") or [])

@router.get("/api/jira/versions")
async def jira_versions(project: str):
    r, err = _jira_call("GET", f"/rest/api/2/project/{project}/versions")
    if err:
        return err
    if not r.is_success:
        return {"ok": False, "error": f"{r.status_code} · {r.text[:300]}"}
    vs = []
    for v in (r.json() or []):
        vs.append({"id": v.get("id"), "name": v.get("name"),
                   "released": bool(v.get("released")), "archived": bool(v.get("archived")),
                   "releaseDate": v.get("releaseDate") or "", "startDate": v.get("startDate") or "",
                   "description": v.get("description") or ""})
    return {"ok": True, "versions": vs}

# ===== Release Summary 적부 판정 (Jira 버전 이슈를 시험 항목으로) =====
RELEASE_JUDGE_FILE = core.DATA_DIR / "config" / "release_judge.json"

def _rj_load():
    if RELEASE_JUDGE_FILE.exists():
        try:
            return core.load_json(RELEASE_JUDGE_FILE)
        except Exception:
            return {}
    return {}


# ══════════════════════════════════════════════════════════════════════
# 결함 (defect) — 플랜에서 「이슈 생성」 으로 걸고, Defects 화면에서 Jira 로 민다
#
# 항목 하나에 결함 하나. 바로 Jira 로 올리지 않는다 — 64건 돌려 20건 깨지면
# 그중 열여덟은 같은 원인이거나 시험이 잘못된 것이다. UTOP 에 모아 사람이
# 추린 뒤에 민다.
# ══════════════════════════════════════════════════════════════════════

@router.get("/api/defects")
async def defect_list_api(status: str = "", cycle_id: str = ""):
    return {"defects": await db.defect_list(status, cycle_id)}


@router.get("/api/defects/for-item")
async def defect_for_item(cycle_id: str, tcid: str):
    """이 항목에 이미 건 결함이 있나 — 버튼이 「생성」/「봄」 을 가른다."""
    return {"defect": await db.defect_by_item(cycle_id, tcid)}


@router.post("/api/defects")
async def defect_create_api(payload: dict, request: Request):
    """플랜 항목에서 결함을 하나 만든다. 깨진 스텝 내용을 통째로 담는다."""
    cid = str(payload.get("cycle_id") or "").strip()
    tcid = str(payload.get("tcid") or "").strip()
    if not tcid:
        raise HTTPException(400, "tcid 가 필요합니다")
    # 같은 항목에 이미 있으면 그것을 돌려준다 — 항목 하나에 하나만.
    exist = await db.defect_by_item(cid, tcid)
    if exist:
        return {"defect": exist, "existed": True}
    who = ""
    try:
        who = core.user_of(core.token_from(request)) or ""
    except Exception:
        pass
    # ID 는 **모델그룹-DF0001** · 고른 유형이 CR 이면 모델그룹-CR0001(지시).
    # 모델그룹은 사이클이 들고 있다.
    # 동시에 두 건이 같은 번호를 집으면 PK 가 겹치므로 그때만 다시 받아 온다.
    _cy = await db.cycle_get(cid) or {}
    _mg = str(payload.get("model_group") or "").strip() or await core.model_group_of(_cy)
    _it = str(payload.get("issue_type") or "").strip()
    # **어느 Jira 프로젝트인지 서버가 정해 준다**(지적: Jira 이슈 필드가 안
    # 나온다). 화면은 사람이 고르기 전까지 빈 값을 보내는데, 프로젝트가
    # 없으면 그 프로젝트가 요구하는 칸(우선순위·사업자·이슈단계…)을 물어볼
    # 데가 없어 창이 그 자리를 통째로 비워 둔다. 자동 결함은 이미 이 길로
    # 정하고 있었다 — 사람이 만드는 결함만 빠져 있었다.
    _dflt = {}
    if not str(payload.get("jira_project") or "").strip():
        try:
            _dflt = await core.jira_defect_defaults(_cy) or {}
        except Exception:
            _dflt = {}          # Jira 가 안 붙어 있어도 결함은 만들어져야 한다
    d = None
    did = ""
    for _ in range(3):
        did = await db.defect_next_id(_mg, _it)
        try:
            d = await db.defect_create({
                "id": did,
                "title": str(payload.get("title") or payload.get("tc_name") or tcid),
                "severity": payload.get("severity"),
                "cycle_id": cid,
                "cycle_name": payload.get("cycle_name"),
                "tcid": tcid,
                "tc_name": payload.get("tc_name"),
                "model": payload.get("model"),
                "version": payload.get("version"),
                "steps": payload.get("steps") or [],
                "note": payload.get("note"),
                # 이슈 등록 칸 — 프로젝트 키·프로젝트명·이슈유형·우선순위·수정버전·구성요소·보고자
                "jira_project": payload.get("jira_project") or _dflt.get("jira_project"),
                # 프로젝트명도 채운다(지적: 수동은 안 채워진다) — 화면은
                # 프로젝트 목록이 늦게 오면 이름을 못 찾는다.
                "project_name": payload.get("project_name") or _dflt.get("project_name"),
                "issue_type": payload.get("issue_type") or _dflt.get("issue_type"),
                # 우선순위·구성요소도 설정이 아는 값으로(지적: 수동만 400).
                # 자동 결함은 이미 이 값으로 채워지는데 사람이 만드는 결함만
                # 비어 있었고, 비면 지라가 필수라며 거절한다.
                "priority": payload.get("priority") or _dflt.get("priority"),
                "fix_version": payload.get("fix_version"),
                "component": payload.get("component") or _dflt.get("component"),
                "reporter": payload.get("reporter"),
                "panels": payload.get("panels") or {},
                "created_by": who,
            })
            break
        except Exception as e:
            if "duplicate key" not in str(e):
                raise
    if d is None:
        raise HTTPException(500, "결함 번호 발급이 계속 겹칩니다 — 다시 시도하세요")
    try: asyncio.create_task(core.broadcast({"type": "defect_updated", "id": did}))
    except Exception: pass
    return {"defect": d, "existed": False}


# 이슈 본문의 여섯 판 — 화면(Jira 프로젝트 패널 설정)과 같은 차례·같은 이름.
# 번호를 붙이는 것은 사람이 「3번 비었다」 고 말할 수 있게 하기 위해서다.
# 이슈 본문 판 — 웹의 WIKI_PANELS 와 **같은 차례·같은 열쇠**여야 한다.
# 여덟 판으로 바꿨다(지시). 이름이 바뀐 판도 열쇠는 그대로 두었다:
# 열쇠를 새로 지으면 이미 저장된 결함의 그 판이 빈 칸이 된다.
_DEFECT_PANELS = [
    ("symptom", "현상"),
    ("topo", "시험구성도"),
    ("steps", "시험절차"),
    ("detail", "시험내역"),
    ("config", "Configuration File (Config File)"),
    ("core", "Core File (Upload Core file)"),
    ("kernel", "Kernel Log & Syslog 조회"),
    ("attach", "첨부파일"),
]


def _defect_jira_body(d: dict) -> str:
    """결함을 Jira wiki 마크업 설명으로 편다.

    사람이 화면에서 채운 **여덟 판**이 있으면 그것으로 쓴다. 없으면 예전처럼
    깨진 스텝만 편다 — 옛 결함도 그대로 올라가야 한다.

    「시험절차」 는 비어 있으면 스텝으로 채운다. 그 판만큼은 화면이
    자동으로 만들어 주는 것이라, 사람이 손대지 않았다고 빼면 안 된다.
    """
    p = d.get("panels") or {}
    if any(str(p.get(k) or "").strip() for k, _ in _DEFECT_PANELS):
        L = []
        for i, (k, label) in enumerate(_DEFECT_PANELS, 1):
            v = str(p.get(k) or "").strip()
            if k == "steps" and not v:
                v = _defect_steps_body(d)
            # **뒤 네 판은 비면 「없음」**(지시) — 코어 파일이 없는 결함이
            # 훨씬 많다. 판을 통째로 빼면 「빠뜨린 것인가」 를 되묻게 되고,
            # 「（내용 없음）」 이라 적으면 아직 안 적은 것처럼 읽힌다.
            if not v and k in ("config", "core", "kernel", "attach"):
                v = "없음"
            if not v:
                continue
            L.append("{panel:title=%d. %s}" % (i, label))
            L.append(v)
            L.append("{panel}")
            L.append("")
        return "\n".join(L)
    return _defect_steps_body(d)


def _defect_steps_body(d: dict) -> str:
    """깨진 스텝을 Jira wiki 마크업으로 편다."""
    L = []
    L.append("h3. 시험 정보")
    L.append("|| 항목 || 내용 |")
    L.append(f"| 플랜 | {d.get('cycle_name') or d.get('cycle_id') or '-'} |")
    L.append(f"| 시험 | {d.get('tc_name') or ''} ({d.get('tcid') or ''}) |")
    L.append(f"| 모델 | {d.get('model') or '-'} |")
    L.append(f"| 버전 | {d.get('version') or '-'} |")
    steps = d.get("steps") or []
    if steps:
        L.append("")
        L.append("h3. 시험 절차 및 결과")
        for s in steps:
            no = s.get("no") or ""
            st = s.get("status") or ""
            desc = (s.get("desc") or s.get("cli") or "").strip()
            L.append(f"h4. #{no} {desc}  ({st})")
            if s.get("cli"):
                L.append("*명령*")
                L.append("{code}" + str(s["cli"]) + "{code}")
            if s.get("criteria"):
                L.append(f"*판정 기준*: {s['criteria']}")
            if s.get("reason"):
                L.append(f"*판정 근거*: {s['reason']}")
            out = str(s.get("output") or "").strip()
            if out:
                L.append("*출력*")
                L.append("{code}" + out[:3000] + "{code}")
    return "\n".join(L)


@router.post("/api/defects/{did}/push")
async def defect_push_jira(did: str, payload: dict = None):
    """결함을 Jira 이슈로 올린다. 프로젝트 키·이슈유형·우선순위·수정버전·구성요소·보고자를 함께 실어 보낸다."""
    payload = payload or {}
    d = await db.defect_get(did)
    if d is None:
        raise HTTPException(404, "결함을 찾을 수 없습니다")
    if d.get("jira_key"):
        return {"ok": True, "key": d["jira_key"], "existed": True, "defect": d}
    # 화면에서 고친 칸이 오면 그것으로 덮는다(먼저 저장하지 않았어도 밀 수 있게)
    proj = payload.get("jira_project") or d.get("jira_project")
    itype = payload.get("issue_type") or d.get("issue_type") or "Defect"
    if not proj:
        return {"ok": False, "error": "프로젝트 키가 필요합니다"}
    fields = {}
    fv = payload.get("fix_version") or d.get("fix_version")
    if fv:
        # **지라가 아는 이름일 때만 싣는다**(지적: 400 — 버전 이름
        # 'R100_2026_09_14'(은)는 유효하지 않습니다).
        # 우리 수정버전은 사이클 버전명(R100_2026_09_14)인데 지라의 버전은
        # 빌드 이름(E6100.r100.FE_260911.bin)이라 서로 다른 말이다. 모르는
        # 이름을 그대로 실으면 지라가 이슈를 통째로 거절한다 — 결함을 못
        # 올리느니 그 칸만 비우고 올린다. 사람이 창에서 골라 넣으면 된다.
        known: set[str] = set()
        try:
            vr, verr = _jira_call("GET", f"/rest/api/2/project/{proj}/versions")
            if not verr and vr is not None and vr.is_success:
                known = {str(x.get("name") or "") for x in (vr.json() or [])}
        except Exception:
            known = set()   # 못 물어보면 여태처럼 그대로 싣는다(아래 not known)
        if not known or fv in known:
            fields["fixVersions"] = [{"name": fv}]
        else:
            print(f"[jira] 수정버전 '{fv}' 은 {proj} 에 없어 빼고 올립니다", flush=True)
    comp = payload.get("component") or d.get("component")
    if comp:
        # 구성요소도 같은 함정이다 — 지라에 없는 이름이면 이슈가 통째로 막힌다
        kc: set[str] = set()
        try:
            cr, cerr = _jira_call("GET", f"/rest/api/2/project/{proj}/components")
            if not cerr and cr is not None and cr.is_success:
                kc = {str(x.get("name") or "") for x in (cr.json() or [])}
        except Exception:
            kc = set()
        if not kc or comp in kc:
            fields["components"] = [{"name": comp}]
        else:
            print(f"[jira] 구성요소 '{comp}' 은 {proj} 에 없어 빼고 올립니다", flush=True)
    rep = payload.get("reporter") or d.get("reporter")
    if rep:
        # 결함에는 **이름**으로 적혀 있다(화면에서 읽는 값) — Jira 의 reporter
        # 는 계정 아이디를 받으므로 여기서 옮긴다. 이미 아이디면 그대로 간다.
        fields["reporter"] = {"name": core.user_id_of(str(rep))}
    # 화면에서 방금 고친 판이 오면 그것으로 쓴다 — 「변경 저장」 을 먼저
    # 누르지 않고 바로 올리는 사람이 있다. 저장 안 했다고 옛 본문이 올라가면
    # 무엇이 올라갔는지 아무도 모른다.
    if isinstance(payload.get("panels"), dict):
        d = {**d, "panels": payload["panels"]}
    # 화면이 만든 본문이 오면 **그것을 그대로** 올린다. 미리보기와 같은
    # 함수에서 나온 글이라, 서버가 다시 만들면 화면에서 본 것과 Jira 에 남는
    # 것이 갈린다 — 그 어긋남은 이슈를 연 사람이 아니라 읽는 개발자가 겪는다.
    desc = str(payload.get("description") or "").strip() or _defect_jira_body(d)
    body = {
        "project": proj,
        "issuetype": itype,
        "summary": payload.get("title") or d.get("title") or d.get("tc_name") or did,
        "description": desc,
        "labels": [x for x in (payload.get("labels") or ["utop"]) if str(x).strip()],
    }
    prio = payload.get("priority") or d.get("priority")
    if prio:
        body["priority"] = prio
    # 화면이 그린 Jira 칸(createmeta)이 오면 함께 싣는다. 프로젝트마다 필수가
    # 다르고(사업자·이슈분류·시험시설…), 여기 없으면 Jira 가 그냥 물린다.
    # 화면이 준 값이 뒤에 온다 — 사람이 방금 고른 것이 이겨야 한다.
    if isinstance(payload.get("fields"), dict):
        fields.update(payload["fields"])
    if fields:
        body["fields"] = fields
    res = await jira_create_issue(body)
    if not res.get("ok"):
        return res
    key = res.get("key", "")
    upd = await db.defect_update(did, {
        "status": "pushed", "jira_key": key,
        "jira_project": proj, "issue_type": itype,
        "priority": prio, "fix_version": fv, "component": comp, "reporter": rep,
        **({"panels": payload["panels"]} if isinstance(payload.get("panels"), dict) else {}),
    })
    try: asyncio.create_task(core.broadcast({"type": "defect_updated", "id": did}))
    except Exception: pass
    return {"ok": True, "key": key, "url": res.get("url"), "defect": upd}


async def _tc_crumb(tcid: str) -> dict:
    """시험 항목의 **빵부스러기** — `Coverage / 111. LGUPLUS E6100 / SW / MAINT / 시험명`.

    이슈를 받는 사람은 대개 UTOP 계정이 없다. 열쇠(E61xx-T0001)만 적어 두면
    그것이 어느 제품의 무슨 갈래인지 알 길이 없어, 「어디 시험이냐」 를 되묻는
    메일이 한 번 더 오간다. 폴더 길을 그대로 적으면 그 물음이 사라진다.

    길은 요구사항이 들고 있다(req.cat1~cat4) — 시험 항목은 요구사항에 달리고,
    폴더는 요구사항 쪽에만 있다.
    """
    out = {"tcid": tcid, "name": "", "path": []}
    if not tcid:
        return out
    try:
        async with db.pool().acquire() as c:
            r = await c.fetchrow(
                "SELECT t.name AS tcname, c1.name AS n1, c2.name AS n2, "
                "       c3.name AS n3, c4.name AS n4 "
                "  FROM tc t "
                "  LEFT JOIN req r ON r.id = t.req_id "
                "  LEFT JOIN req_category c1 ON c1.id = r.cat1 "
                "  LEFT JOIN req_category c2 ON c2.id = r.cat2 "
                "  LEFT JOIN req_category c3 ON c3.id = r.cat3 "
                "  LEFT JOIN req_category c4 ON c4.id = r.cat4 "
                " WHERE t.tcid = $1",
                tcid,
            )
        if r:
            out["name"] = str(r["tcname"] or "")
            out["path"] = [str(r[k] or "") for k in ("n1", "n2", "n3", "n4") if r[k]]
    except Exception:
        pass
    return out


def _crumb_line(head: str, parts: list, tail: str, url: str, tag: str = "") -> str:
    """빵부스러기 한 줄을 위키 링크로 — 주소가 없으면 글자만 남긴다."""
    txt = " / ".join([head, *[x for x in parts if x], *([tail] if tail else [])])
    if tag:
        txt += f" ({tag})"
    return f"[{txt}|{url}]" if url else txt


@router.get("/api/tc/{tcid}/crumb")
async def api_tc_crumb(tcid: str):
    """결함 창이 3. 시험절차 머리에 세울 빵부스러기."""
    return {"ok": True, **(await _tc_crumb(tcid))}


_JIRA_DEFSTAT_CACHE: dict = {}


@router.get("/api/defects/jira-status")
async def defects_jira_status(keys: str = ""):
    """등록한 이슈들의 **지금 지라 상태**를 한 번에 물어 온다.

    결함 표의 「상태」 는 UTOP 이 아는 값(미등록·등록함)이 아니라 **지라가
    아는 값**이라야 한다(지시) — 개발자가 지라에서 「해결됨」 으로 옮겨도
    UTOP 만 여태 「등록함」 이라 적고 있으면, 표를 보고 일을 나눌 수가 없다.

    이슈를 하나씩 묻지 않는다. JQL `key in (…)` 한 번이면 백 건도 한 번에
    온다 — 스무 건짜리 표에 스무 번 왕복하면 표가 늦게 뜬다.

    같은 답을 60초 동안 다시 쓴다. 상태는 사람이 손으로 옮기는 값이라
    1 분 안에 두 번 바뀌는 일이 없고, 표를 열 때마다 지라를 두드리면 지라
    쪽에 미안한 부하가 된다.
    """
    want = [k.strip() for k in str(keys or "").split(",") if k.strip()][:200]
    if not want:
        return {"ok": True, "statuses": {}}
    import time as _time
    now = _time.time()
    out: dict = {}
    ask: list = []
    for k in want:
        hit = _JIRA_DEFSTAT_CACHE.get(k)
        if hit and now - hit[0] < 60:
            out[k] = hit[1]
        else:
            ask.append(k)
    def _pick(st: dict) -> dict:
        # 지라의 갈래(new · indeterminate · done)를 그대로 받는다 — 상태
        # 이름은 프로젝트마다 다르지만 갈래는 셋뿐이라, 칩 색을 이름이 아니라
        # 갈래로 고를 수 있다
        return {
            "name": str(st.get("name") or ""),
            "cat": str(((st.get("statusCategory") or {}).get("key")) or ""),
        }

    if ask:
        jql = "key in (%s)" % ",".join(f'"{k}"' for k in ask)
        r, err = _jira_call(
            "GET", "/rest/api/2/search",
            params={"jql": jql, "fields": "status", "maxResults": len(ask)},
        )
        got = set()
        if not err and r is not None and r.is_success:
            for it in (r.json().get("issues") or []):
                k = str(it.get("key") or "")
                v = _pick(((it.get("fields") or {}).get("status") or {}))
                if v["name"]:
                    out[k] = v
                    _JIRA_DEFSTAT_CACHE[k] = (now, v)
                    got.add(k)
        # **하나가 없으면 전부 못 받는다.** 지운 이슈가 한 건만 섞여도 지라는
        # JQL 전체를 400 으로 물린다("키가 'P88-4341'인 이슈가 존재하지
        # 않습니다"). 그 한 건 때문에 표의 상태가 통째로 비면 안 되니, 그때는
        # 하나씩 묻는다 — 없는 것은 없다고 적어 두고 다시 묻지 않는다.
        rest = [k for k in ask if k not in got]
        for k in rest[:40]:
            r2, e2 = _jira_call("GET", f"/rest/api/2/issue/{k}", params={"fields": "status"})
            if e2 or r2 is None:
                continue
            if r2.status_code == 404:
                v = {"name": "", "cat": "gone"}
            elif r2.is_success:
                v = _pick(((r2.json().get("fields") or {}).get("status") or {}))
            else:
                continue
            out[k] = v
            _JIRA_DEFSTAT_CACHE[k] = (now, v)
    return {"ok": True, "statuses": out}


@router.patch("/api/defects/{did}")
async def defect_update_api(did: str, payload: dict):
    d = await db.defect_update(did, payload)
    if d is None:
        raise HTTPException(404, "결함을 찾을 수 없습니다")
    try: asyncio.create_task(core.broadcast({"type": "defect_updated", "id": did}))
    except Exception: pass
    return {"defect": d}


@router.delete("/api/defects/{did}")
async def defect_delete_api(did: str):
    ok = await db.defect_delete(did)
    try: asyncio.create_task(core.broadcast({"type": "defect_updated", "id": did}))
    except Exception: pass
    return {"ok": ok}
