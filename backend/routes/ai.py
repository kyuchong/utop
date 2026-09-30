# -*- coding: utf-8 -*-
"""AI — main.py 에서 글자 그대로 옮겨 왔다(2026-09-28, 분리 4호).

바뀐 것은 셋뿐이다: @app→@router, main 의 이름→core.<이름>(앞 밑줄 뗀 것),
그리고 임포트 머리. 주소는 하나도 안 바뀐다.

이 파일이 대는 길:
  /api/llms · /api/llm/… · /api/llm-choices · /api/anthropic|openai/models   LLM 등록·용도·고르기
  /api/prompts · /api/page-ai · /api/ai/settings|usage|feedback|stats        프롬프트·설정·사용량
  /api/ai/cov-chat · /api/ai/search-all · /api/ai/nl-exec                    Coverage AI
  /api/kai/…  /api/kb/…                                                      Knowledge AI
  /api/rag/… · /api/req/{id}/embed · /api/knowledge-sources                  RAG 색인·검색
  /api/confluence/…                                                           Confluence 검색·동기화
  /api/manual… · /api/learn/…                                                매뉴얼·학습한 절차
  /api/chat… · /api/dify/… · /api/nl/…                                        챗·Dify·자연어 절차
  /api/tc/{id}/generate|describe|ai-manual · /api/req/{id}/ai-*|make-tcs     시험 항목 생성·설명

여기 있는 LLM 부속(_ai_chat·_llm_pick·_prompt_of·RAG 색인 …)은 사이클·Jira 쪽도 쓴다 —
main 이 접합부에서 이름을 받아 가고, 다른 routes 파일은 core 를 거친다.
"""
import anthropic
import asyncio
import json
import os
import re
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from pathlib import Path
from pydantic import BaseModel
from typing import Optional

import core
import db
from routes import jira

router = APIRouter()


# ───────────────────────────────────────────
# 라우터 - LLM 관리
# ───────────────────────────────────────────
def init_llms_file():
    if not core.LLMS_FILE.exists():
        core.save_json(core.LLMS_FILE, {"llms": []})

@router.get("/api/llms")
async def get_llms():
    init_llms_file()
    return core.load_json(core.LLMS_FILE)


class LLMCreate(BaseModel):
    name: str
    type: str
    endpoint: str
    model: str
    apikey: str = ""
    max_tokens: int = 4096
    context_size: int = 262144
    temperature: float = 0.7
    # 파라미터(선택) — 프론트 편집 화면에서 저장
    completion_mode: str = "chat"
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    presence_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    # 고급 옵션 — 저장 시 유실되던 필드들
    compat_mode: str = "openai"
    thinking_mode: str = "none"
    function_call_type: str = "not_support"
    stream_function_call: str = "not_support"
    vision_support: str = "not_support"
    structured_output: str = "not_support"
    stream_mode_auth: str = "not_use"
    stream_delimiter: str = "\n\n"
    system_prompt: str = ""
    greeting: str = ""
    placeholder: str = ""
    uses: list = []
    status: str = "active"
    field_prompts: dict = {}
    kb_group: str = ""   # 지식 검색 노출 그룹: '' | general | kb | jira | external

@router.post("/api/llms")
async def add_llm(llm: LLMCreate):
    init_llms_file()
    data = core.load_json(core.LLMS_FILE)
    new_id = f"llm{len(data['llms'])+1:03d}_{int(datetime.now().timestamp())}"
    new_llm = {"id": new_id, **llm.model_dump()}
    data["llms"].append(new_llm)
    core.save_json(core.LLMS_FILE, data)
    return {"success": True, "llm": new_llm}

# ★ /api/llms/{llm_id} 보다 반드시 앞에 위치해야 함
@router.post("/api/llms/import")
async def import_llms(payload: dict):
    """localStorage LLM 목록 일괄 import"""
    init_llms_file()
    data = core.load_json(core.LLMS_FILE)
    llms = payload.get("llms", [])
    added = 0
    for llm in llms:
        exists = any(
            l.get("name") == llm.get("name") and l.get("endpoint") == llm.get("endpoint")
            for l in data["llms"]
        )
        if not exists:
            new_id = llm.get("id") or f"llm{len(data['llms'])+1:03d}_{int(datetime.now().timestamp())}"
            data["llms"].append({"id": new_id, **{k:v for k,v in llm.items() if k!="id"}})
            added += 1
    core.save_json(core.LLMS_FILE, data)
    return {"success": True, "added": added, "total": len(data["llms"])}

@router.post("/api/llms/reorder")
async def reorder_llms(payload: dict):
    """LLM 목록 순서 재배치 (드래그)"""
    init_llms_file()
    data = core.load_json(core.LLMS_FILE)
    ids = payload.get("ids", [])
    order = {lid: i for i, lid in enumerate(ids)}
    data["llms"].sort(key=lambda l: order.get(l.get("id"), 9999))
    core.save_json(core.LLMS_FILE, data)
    return {"success": True, "count": len(data["llms"])}

@router.put("/api/llms/{llm_id}")
async def update_llm(llm_id: str, llm: LLMCreate):
    init_llms_file()
    data = core.load_json(core.LLMS_FILE)
    for i, l in enumerate(data["llms"]):
        if l["id"] == llm_id:
            data["llms"][i] = {"id": llm_id, **llm.model_dump()}
            core.save_json(core.LLMS_FILE, data)
            return {"success": True}
    raise HTTPException(404, "LLM을 찾을 수 없습니다")

@router.delete("/api/llms/{llm_id}")
async def delete_llm(llm_id: str):
    init_llms_file()
    data = core.load_json(core.LLMS_FILE)
    data["llms"] = [l for l in data["llms"] if l["id"] != llm_id]
    core.save_json(core.LLMS_FILE, data)
    return {"success": True}


@router.post("/api/anthropic/models")
async def anthropic_models(body: dict):
    """Claude 에서 쓸 수 있는 모델 목록 — **모델명을 손으로 치지 않게**(지시).

    저장 전에도 물어볼 수 있어야 해서 키를 몸통으로 받는다(주소에 실으면
    서버 로그에 키가 남는다). 키가 없거나 못 닿으면 **아는 모델**을 돌려준다 —
    목록이 비면 고를 수가 없다.
    """
    import httpx
    fallback = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5-20251001"]
    key = str((body or {}).get("apikey") or "").strip()
    base = str((body or {}).get("endpoint") or "https://api.anthropic.com").rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    if not key:
        return {"ok": True, "models": fallback, "source": "기본 목록 (키를 넣으면 실제 목록을 읽습니다)"}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                base + "/v1/models",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
            )
        if r.status_code == 200:
            ids = [str(m.get("id") or "") for m in (r.json().get("data") or []) if m.get("id")]
            return {"ok": True, "models": ids or fallback, "source": "Anthropic"}
        if r.status_code in (401, 403):
            return {"ok": False, "models": fallback, "error": f"키를 받지 않았습니다 ({r.status_code})"}
        return {"ok": False, "models": fallback, "error": f"{r.status_code} · {r.text[:120]}"}
    except Exception as e:
        return {"ok": False, "models": fallback, "error": f"닿지 못했습니다 — {str(e)[:120]}"}


@router.post("/api/openai/models")
async def openai_models(body: dict):
    """OpenAI 호환 서버에서 고를 모델 목록 — Claude 와 같은 손놀림으로(지시).

    OpenAI 규격은 `GET {주소}/models` 한 번이면 된다. 랩의 vLLM 도 같은
    말을 하므로 사내 서버에도 그대로 통한다 — 주소만 다르다.

    키를 몸통으로 받는 까닭은 Anthropic 쪽과 같다: 주소에 실으면 서버
    로그에 키가 남고, 저장 전에도 물어볼 수 있어야 한다.
    """
    import httpx
    fallback = ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3-mini"]
    key = str((body or {}).get("apikey") or "").strip()
    base = str((body or {}).get("endpoint") or "https://api.openai.com/v1").rstrip("/")
    if not base.endswith("/v1") and "api.openai.com" in base:
        base += "/v1"
    if not key and "api.openai.com" in base:
        # 공식 주소는 키 없이 목록을 안 준다 — 아는 것부터 보여 준다
        return {"ok": True, "models": fallback, "source": "기본 목록 (키를 넣으면 실제 목록을 읽습니다)"}
    try:
        headers = {"Authorization": "Bearer " + key} if key else {}
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(base + "/models", headers=headers)
        if r.status_code == 200:
            ids = [str(m.get("id") or "") for m in (r.json().get("data") or []) if m.get("id")]
            # 임베딩·음성·이미지까지 다 나온다 — 글 짓는 것만 남긴다
            chat = [m for m in ids if not any(
                w in m for w in ("embedding", "whisper", "tts", "dall-e", "moderation", "audio", "realtime")
            )]
            return {"ok": True, "models": sorted(chat) or ids or fallback,
                    "source": "OpenAI" if "api.openai.com" in base else base}
        if r.status_code in (401, 403):
            return {"ok": False, "models": fallback, "error": f"키를 받지 않았습니다 ({r.status_code})"}
        return {"ok": False, "models": fallback, "error": f"{r.status_code} · {r.text[:120]}"}
    except Exception as e:
        return {"ok": False, "models": fallback, "error": f"닿지 못했습니다 — {str(e)[:120]}"}


@router.post("/api/llms/{llm_id}/test")
async def test_llm(llm_id: str):
    """저장된 설정으로 실제로 한 번 불러 본다.

    주소·모델명·키가 맞는지는 눌러 보기 전에는 알 수 없다. 사내 서버는
    자주 내려가 있어서, 답이 안 나올 때 '설정이 틀렸나 서버가 죽었나' 를
    가려주지 않으면 매번 처음부터 의심하게 된다.

    /v1/models 로 먼저 확인한다 — 토큰을 쓰지 않고 인증과 주소만 본다.
    그것이 없는 서버(일부 vLLM 구성)를 위해 짧은 chat 요청으로 한 번 더 시도한다.
    """
    import httpx

    init_llms_file()
    data = core.load_json(core.LLMS_FILE)
    llm = next((l for l in data["llms"] if l.get("id") == llm_id), None)
    if llm is None:
        raise HTTPException(404, "LLM 을 찾을 수 없습니다")

    base = (llm.get("endpoint") or "").rstrip("/")
    ltype = str(llm.get("type") or "").lower()
    model = (llm.get("model") or "").strip()

    # ── Claude(Anthropic) 는 말이 다르다 ──────────────────────────
    #
    # OpenAI 계열은 `/v1/models` 에 Bearer 를 얹지만, Anthropic 은 `x-api-key`
    # 와 `anthropic-version` 을 쓴다. 그래서 여기까지 오면 늘 실패했고, 설정이
    # 맞는데도 「연결 테스트」 가 안 된다는 말을 들었다(지적).
    if ltype in ("claude", "anthropic") or "anthropic.com" in base:
        key = str(llm.get("apikey") or "").strip()
        if not key:
            return {"ok": False, "detail": "API Key 가 비어 있습니다 (sk-ant-… 키를 넣으세요)"}
        url = (base or "https://api.anthropic.com").rstrip("/")
        if url.endswith("/v1"):
            url = url[:-3]
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    url + "/v1/models",
                    headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                )
            if r.status_code == 200:
                names = [str(m.get("id") or "") for m in (r.json().get("data") or [])]
                if model and names and model not in names:
                    return {
                        "ok": False,
                        "detail": f"키는 맞는데 '{model}' 모델이 없습니다",
                        "models": names[:20],
                    }
                return {"ok": True, "detail": f"연결됨 (모델 {len(names)}개)", "models": names[:20]}
            if r.status_code in (401, 403):
                return {"ok": False, "detail": f"키를 받지 않았습니다 ({r.status_code})"}
            return {"ok": False, "detail": f"{r.status_code} · {r.text[:160]}"}
        except Exception as e:
            return {"ok": False, "detail": f"닿지 못했습니다 — {str(e)[:160]}"}

    if not base:
        return {"ok": False, "detail": "엔드포인트가 비어 있습니다"}
    # 사람은 보통 .../v1 까지 적어 둔다. 안 적었으면 붙여 준다.
    root = base[:-3].rstrip("/") if base.endswith("/v1") else base
    headers = {}
    if llm.get("apikey"):
        headers["Authorization"] = f"Bearer {llm['apikey']}"

    async with httpx.AsyncClient(timeout=12) as client:
        try:
            r = await client.get(f"{root}/v1/models", headers=headers)
            if r.status_code == 200:
                names = [m.get("id") for m in (r.json().get("data") or []) if m.get("id")]
                if model and names and model not in names:
                    # 주소는 맞는데 모델 이름이 틀린 경우. 가장 흔한 실수다.
                    return {
                        "ok": False,
                        "detail": f"서버는 응답하는데 '{model}' 모델이 없습니다",
                        "models": names[:20],
                    }
                return {"ok": True, "detail": f"연결됨 (모델 {len(names)}개)", "models": names[:20]}
            if r.status_code in (401, 403):
                return {"ok": False, "detail": f"인증 실패 ({r.status_code}) — API Key 를 확인하세요"}
        except Exception as e:
            return {"ok": False, "detail": f"연결하지 못했습니다 — {e}"}

        # /v1/models 가 없는 서버. 가장 짧은 요청으로 한 번 더 본다.
        try:
            r = await client.post(
                f"{root}/v1/chat/completions",
                headers={**headers, "Content-Type": "application/json"},
                json={"model": model, "messages": [{"role": "user", "content": "ping"}],
                      "max_tokens": 1},
            )
            if r.status_code == 200:
                return {"ok": True, "detail": "연결됨 (chat 응답 확인)"}
            return {"ok": False, "detail": f"응답 코드 {r.status_code} — {r.text[:200]}"}
        except Exception as e:
            return {"ok": False, "detail": f"연결하지 못했습니다 — {e}"}


# ── 시험 절차 학습: 검증된 절차 스냅샷 저장소 (LLM few-shot + 회귀 baseline) ──
LEARNED_FILE = core.DATA_DIR / "state" / "learned_procedures.json"
def _load_learned() -> dict:
    d = core.kv_load_sync("learned_procedures", {"items": []})
    if isinstance(d, dict) and isinstance(d.get("items"), list):
        return d
    return {"items": []}
def _save_learned(d):
    core.kv_save_sync("learned_procedures", d)

@router.post("/api/learn/procedure")
async def learn_procedure_save(payload: dict, token: str = ""):
    import time as _tt
    store = _load_learned()
    item = {
        "id": "lp-" + str(int(_tt.time() * 1000)),
        "tcid": str(payload.get("tcid") or ""),
        "title": str(payload.get("title") or ""),
        "models": payload.get("models") if isinstance(payload.get("models"), list) else [],
        "role": str(payload.get("role") or ""),
        "vendor": str(payload.get("vendor") or ""),
        "steps": payload.get("steps") if isinstance(payload.get("steps"), list) else [],
        "outputs": payload.get("outputs") if isinstance(payload.get("outputs"), list) else [],
        "by": str(payload.get("by") or ""),
        "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    if item["tcid"]:   # 같은 TC+모델그룹 재학습 → 덮어쓰기(모델그룹별 항목은 각각 보존)
        _msig = ",".join(sorted(item.get("models") or []))
        store["items"] = [it for it in store["items"]
                          if not (it.get("tcid") == item["tcid"] and ",".join(sorted(it.get("models") or [])) == _msig)]
    store["items"].insert(0, item)
    _save_learned(store)
    return {"ok": True, "id": item["id"], "count": len(store["items"])}

@router.get("/api/learn/procedures")
async def learn_procedures_list(model: str = "", role: str = "", q: str = "", limit: int = 50):
    items = _load_learned().get("items", [])
    def _match(it):
        if model and model not in (it.get("models") or []):
            return False
        if role and it.get("role") != role:
            return False
        if q:
            hay = (str(it.get("title", "")) + " " + " ".join(it.get("models") or []) + " "
                   + json.dumps(it.get("steps") or [], ensure_ascii=False)).lower()
            if q.lower() not in hay:
                return False
        return True
    out = [it for it in items if _match(it)][:max(1, min(limit, 500))]
    return {"ok": True, "items": out, "total": len(items)}

@router.delete("/api/learn/procedure/{lp_id}")
async def learn_procedure_delete(lp_id: str, token: str = ""):
    store = _load_learned()
    n0 = len(store["items"])
    store["items"] = [it for it in store["items"] if it.get("id") != lp_id]
    _save_learned(store)
    return {"ok": True, "removed": n0 - len(store["items"])}

#
# 용도별 프롬프트.
#
# 프롬프트를 코드에 박아 두면 한 글자 고치는 데도 배포를 해야 한다. 랩에
# 쓰는 말은 현장에서 자꾸 바뀌고(장비 계열이 늘거나 부르는 이름이 다르거나),
# 그때마다 사람이 기다려야 한다. 설정에 두고 화면에서 고친다.
#
# 여기 적은 것은 **기본값**이다. 설정에 없으면 이것을 쓴다 — 처음 쓰는
# 사람이 빈 화면을 보지 않도록.
#
LLM_PURPOSES: dict[str, dict] = {
    # ── 요구사항 ────────────────────────────────────────────────
    "req_intent": {
        "label": "REQ-Intent",
        "hint": "요구사항 › 구현내용(Intent) — 한 줄 요청을 구현의도로 다듬습니다.",
        "system": (
            "당신은 네트워크 장비 시험 조직의 요구사항 작성자다. 사람이 적은 "
            "짧은 요청을 **구현의도**로 다듬는다.\n"
            "규칙:\n"
            "1) 제목은 한 줄, 측정 가능한 동작으로 적는다.\n"
            "2) 설명에는 대상 장비·조건·기대 동작을 적는다.\n"
            "3) 검증 기준은 시험으로 확인할 수 있는 문장으로 적는다 — "
            "'빨라야 한다' 가 아니라 '몇 초 안에' 로.\n"
            "4) 지어내지 않는다. 사람이 말하지 않은 수치는 (확인 필요) 로 남긴다."
        ),
    },
    "req_coverage": {
        "label": "REQ-Coverage",
        "hint": "요구사항 › 구현내용을 근거로 **시험 항목 목록**을 뽑습니다.",
        "system": (
            "당신은 네트워크 장비 시험 설계자다. 주어진 요구사항의 구현의도를 읽고 "
            "그것을 덮는 **시험 항목 목록**을 만든다.\n"
            "규칙:\n"
            "1) 항목 하나는 한 가지만 확인한다. 여러 개를 한 항목에 묶지 마라.\n"
            "2) 이름은 '무엇을 어떻게 확인하는가' 로 적는다 — 명령 이름을 그대로 쓰지 마라.\n"
            "3) 정상 동작뿐 아니라 경계·실패 조건도 빠뜨리지 않는다.\n"
            "4) 구현의도에 없는 기능은 만들지 않는다.\n"
            "5) 스텝은 여기서 만들지 않는다 — 항목 이름과 목적까지다."
        ),
    },
    # ── 시험 항목 ───────────────────────────────────────────────
    "coverage_object": {
        "label": "Coverage-Object",
        "hint": "시험항목 › 시험 목적(Object)과 사전 준비 조건을 씁니다.",
        "system": (
            "당신은 네트워크 장비 시험 항목의 목적과 사전 조건을 쓴다.\n"
            "규칙:\n"
            "1) 목적은 '무엇을 확인하는 시험인가' 한두 문장으로.\n"
            "2) 사전 조건은 장비 상태·배선·설정을 줄로 나눠 적는다.\n"
            "3) 주어진 시험 이름·스텝·배선에 있는 사실만 쓴다. 지어내지 않는다.\n"
            "4) 결과서에 그대로 실리는 글이다 — 존댓말 없이 개조식으로."
        ),
    },
    # ── 토폴로지 — 목적을 적었으면 그다음이 배선이다(지시: 3번 뒤) ──
    "wiring": {
        "label": "Topology-Wiring",
        "hint": "토폴로지 › 말로 적은 랩 배선을 「장비 포트 ↔ 계측기 포트」 줄로 옮깁니다.",
        "system": (
            "당신은 네트워크 시험 랩의 배선을 정리한다. 사람이 말한 연결을 "
            "'장비 포트 ↔ 계측기 포트' 줄로 옮긴다.\n"
            "규칙:\n"
            "1) dev·meter 는 반드시 주어진 목록의 id 를 그대로 쓴다.\n"
            "2) port·meterPort 는 반드시 그 장비/계측기의 ports 목록에 있는 값을 그대로 쓴다.\n"
            "3) 목록에 없으면 그 줄은 만들지 않는다. 비슷한 이름을 지어내지 마라.\n"
            "4) 한 포트는 한 번만 쓴다.\n"
            "5) JSON 만 출력한다."
        ),
    },
    "coverage_manual": {
        "label": "Coverage-Manual",
        "hint": "시험항목 › Manual 절차 — 사람이 손으로 하는 순서를 씁니다.",
        "system": (
            "당신은 네트워크 장비 시험의 **수동 절차**를 쓴다. 사람이 손으로 하는 "
            "순서라 장비 명령이 아니라 **행동**으로 적는다.\n"
            "규칙:\n"
            "1) 한 줄에 한 가지 행동. '무엇을 한다 → 무엇을 본다' 차례로.\n"
            "2) 눈으로 확인할 수 있는 것만 적는다(LED·화면·소리·측정기 값).\n"
            "3) **판정 기준은 비워 둔다** — 돌려 본 뒤 사람이 정한다.\n"
            "4) 되돌리는 절차가 필요하면 마지막에 적는다."
        ),
    },
    "coverage_automation": {
        "label": "Coverage-Automation",
        "hint": "시험항목 › Automation 스텝 · AI 화면의 고급 갈래(절차 짓기)가 함께 씁니다.",
        "system": "",  # 비우면 코드가 든 긴 규칙(nl_test.py)을 그대로 쓴다
    },
    # ── 플랜 ──────────────────────────────────────────────────
    "cycle_summary": {
        "label": "Cycle-Test Summary",
        "hint": "플랜 실행 › 시험 진행 요약의 AI 요약을 씁니다.",
        # 인사말·맺음말·시험 표는 **코드가** 붙인다(숫자와 이름을 지어내지 않게).
        # 여기 적는 것은 그 사이에 들어갈 **본문 두 문단**의 규칙이다.
        # 비우면 이 기본값으로 내려앉는다(_prompt_of).
        "system": (
            "너는 네트워크 장비 시험(QA) 결과를 사내에 공유하는 **메일 본문**을 쓴다. "
            "아래 결과만 근거로 한국어로 짧게 쓴다.\n"
            "**표를 만들지 마라** — 시험 결과 표는 네 글 아래에 이미 붙는다. "
            "**인사말도 쓰지 마라** — 첫 줄은 이미 붙어 있다. 머리(##)도 붙이지 마라.\n"
            "두 문단만 쓴다:\n"
            "1) 무엇을 돌렸는지 한 줄 — 「{제품명} 신규 OS({버전명}) 자동화 시험 결과 공유 드립니다.」 꼴.\n"
            "2) 결과 한두 줄 — 깨진 것이 없으면 「이전 버전 대비 특이사항 확인되지 않았습니다.」, "
            "있으면 「자동화 시험 진행 결과 Fail N건(무엇이 깨졌는지 짧게) 확인되었습니다.」 꼴. "
            "미실행이 많으면 그 사실도 한 마디 적는다.\n"
            "**「이슈」 라는 말은 [등록된 이슈] 에 적힌 건수에만 쓴다.** Fail 은 깨진 시험이고 "
            "이슈는 사람이 Defects 에 올린 것이라 서로 다르다 — Fail 건수를 「이슈 N건」 이라 "
            "부르지 마라. 등록된 이슈가 0건이면 이슈를 아예 말하지 않는다.\n"
            "건수는 **주어진 숫자만** 쓴다. 지어내지 마라. 군더더기 없이 사무적으로."
        ),
    },
    # ── Coverage AI 잡담 갈래(지시: Knowledge AI 왼쪽) ───────────
    # **판단까지 이 프롬프트가 한다**(지시: 프롬프트로 판단하도록) — 시험
    # 실행 요청인지 가르는 규칙([판단])과 답하는 말투([답변])가 모두 여기
    # 있어 SETUP 에서 고칠 수 있다. 코드는 출력 형식(JSON)만 강제한다.
    "cai_basic": {
        "label": "Coverage AI · Basic",
        "hint": ("Coverage AI › Basic mode — 시험 요청인지 가르는 판단, 일반 질문 답변, 그리고 [다음 행동]"
                 "(장비를 묻을지·확정할지·항목을 물을지)을 이 프롬프트가 정합니다. 행동 이름: confirm_device · "
                 "ask_device · use_device · repick_device · ask_tc · wait_tc · none. 판단 재료는 [현황]과 "
                 "[선택 상태](대상 장비·모델, 먼저 정해진 항목과 그 모델, 말에 적힌 모델의 장비 후보 수, "
                 "떠 있는 카드)로 매 턴 함께 실립니다."),
        "system": (
            "너는 UBIQUOSS 네트워크 장비 시험 플랫폼(UTOP)의 Coverage AI 도우미다. "
            "Basic mode 는 이미 만들어진 시험 항목을 골라 장비에서 돌리는 자리다.\n\n"
            "[판단] 사용자의 말을 읽고 먼저 test 를 가른다.\n"
            "1) 장비 모델명·명령·시험 항목 이름이 보이거나 「시험해줘 · 돌려줘 · 확인해줘 · "
            "절차 만들어줘」 같은 실행 의도가 보이면 test=true 로 하고 answer 는 빈 문자열로 둔다.\n"
            "2) 인사·잡담·일반 지식 질문·뜻 없는 글자(예: asdf)는 test=false 로 하고 "
            "[답변] 규칙으로 answer 를 적는다.\n"
            "3) 「시험 가능한 장비는? · 실행 가능한 시험항목은?」 처럼 **현황을 묻는 말**은 "
            "실행 요청이 아니다 — test=false 로 하고, 함께 주어지는 [현황] 사실만으로 답한다. "
            "[현황] 에 없는 장비·항목은 없다고 답하고, 수를 지어내지 마라.\n"
            "4) 애매하면 test=true 다 — 이 화면의 본분은 시험이다.\n"
            "5) model 에는 말에 **적힌 그대로의** 장비 모델명(예: E6100)을 적는다. "
            "없으면 빈 문자열 — 지어내지 마라. 등록 여부는 화면이 검사한다.\n\n"
            "[답변]\n"
            "1) 한국어로 답한다. 인사말·군더더기는 빼되, 질문에 필요한 만큼 자세히 답한다.\n"
            "2) [현황] 에 담긴 장비·시험 항목 데이터가 근거다 — 장비 목록·사업자·LAB·상태 같은 "
            "현황을 물으면 화면으로 미루지 말고 마크다운 표(모델 · IP · 상태 · 사업자 · LAB)나 "
            "- 목록으로 정리해 직접 답한다. 답은 채팅 글(텍스트·마크다운)로만 한다. "
            "목록이 30건을 넘으면 앞 30건만 보여 주고 「외 N건은 시험 항목 찾기에서 볼 수 "
            "있습니다」 라고 덧붙인다.\n"
            "3) [현황] 에 없는 장비·항목·수치·명령은 없다고 답한다 — 지어내지 않는다.\n"
            "4) 지금 어디까지 왔는지는 **[선택 상태]가 정본**이다 — 대상 장비·시험 항목·"
            "절차·실행 결과를 그것으로 답하고, 화면과 다른 말을 하지 않는다.\n"
            "5) 답 끝에 **다음 한 단계**만 짧게 안내한다 — 장비가 정해졌으면 「이어서 시험 "
            "항목을 선택해 주세요」, 절차가 준비됐으면 「시험 시작이라고 말씀하시면 실행합니다」.\n"
            "6) 네트워크 장비·시험 지식 범위에서 답하고, 모르는 것은 모른다고 말한다.\n"
            "7) 화면 사용법을 물으면 「장비 선택 → 시험 항목 선택 → 시험 시작」 순서를 안내한다.\n"
            "8) 시험을 하고 싶어 하는 말이면 장비 모델명(예: E6100)과 무엇을 확인할지를 "
            "함께 적어 다시 요청하도록 안내한다.\n\n"
            "[다음 행동] 매 답에 next 를 하나 적는다 — 화면은 그 행동만 한다. [선택 상태]가 근거다.\n"
            "1) confirm_device — 말한 모델·IP 의 장비 후보가 **한 대뿐**이고 아직 항목이 정해지지 "
            "않았을 때, 묻지 않고 그 장비로 확정한다.\n"
            "2) ask_device — 후보가 여럿일 때. 그리고 **항목이 먼저 정해진 뒤** 장비를 고를 때는 "
            "한 대뿐이어도 묻는다(항목이 정해졌으면 어느 장비로 보낼지 한 번은 확인한다).\n"
            "3) repick_device — 고른 장비의 모델과 항목의 모델이 다를 때, 항목 모델의 장비를 다시 "
            "고르게 한다. 사용자가 「그래도 이 장비로」 라고 분명히 말한 때만 use_device.\n"
            "4) ask_tc — 장비가 정해졌고 무엇을 시험할지가 말에 있으면 항목 후보를 보여 준다.\n"
            "5) wait_tc — 장비만 말했고 무엇을 시험할지가 없으면 항목을 말해 달라고만 한다. "
            "장비 후보를 다시 깔지 않는다.\n"
            "6) 「선택해 줘」 처럼 대상이 없는 말이고 이미 후보 카드가 떠 있으면 none 으로 두고 "
            "위 후보에서 고르라고 answer 에 적는다.\n"
            "7) 어느 것도 아니면 none."
        ),
    },
    "cai_advanced": {
        "label": "Coverage AI · Advanced",
        "hint": "Coverage AI › Advanced mode — 시험·절차 생성 요청인지 가르는 판단과 일반 질문 답변을 이 프롬프트가 정합니다.",
        "system": (
            "너는 UBIQUOSS 네트워크 장비 시험 플랫폼(UTOP)의 Coverage AI 도우미다. "
            "Advanced mode 는 자연어로 시험 절차를 새로 만들고 고치는 자리다.\n\n"
            "[판단] 사용자의 말을 읽고 먼저 test 를 가른다.\n"
            "1) 장비 모델명·명령·시험 항목 이름이 보이거나 「시험해줘 · 돌려줘 · 확인해줘 · "
            "절차 만들어줘」 같은 실행·생성 의도가 보이면 test=true 로 하고 answer 는 빈 문자열로 둔다.\n"
            "2) 인사·잡담·일반 지식 질문·뜻 없는 글자(예: asdf)는 test=false 로 하고 "
            "[답변] 규칙으로 answer 를 적는다.\n"
            "3) 「시험 가능한 장비는? · 실행 가능한 시험항목은?」 처럼 **현황을 묻는 말**은 "
            "실행 요청이 아니다 — test=false 로 하고, 함께 주어지는 [현황] 사실만으로 답한다. "
            "[현황] 에 없는 장비·항목은 없다고 답하고, 수를 지어내지 마라.\n"
            "4) 애매하면 test=true 다 — 이 화면의 본분은 시험이다.\n"
            "5) model 에는 말에 **적힌 그대로의** 장비 모델명(예: E6100)을 적는다. "
            "없으면 빈 문자열 — 지어내지 마라. 등록 여부는 화면이 검사한다.\n\n"
            "[답변]\n"
            "1) 한국어로 답한다. 인사말·군더더기는 빼되, 질문에 필요한 만큼 자세히 답한다.\n"
            "2) [현황] 에 담긴 장비·시험 항목 데이터가 근거다 — 장비 목록·사업자·LAB·상태 같은 "
            "현황을 물으면 화면으로 미루지 말고 마크다운 표(모델 · IP · 상태 · 사업자 · LAB)나 "
            "- 목록으로 정리해 직접 답한다. 답은 채팅 글(텍스트·마크다운)로만 한다. "
            "목록이 30건을 넘으면 앞 30건만 보여 주고 「외 N건은 시험 항목 찾기에서 볼 수 "
            "있습니다」 라고 덧붙인다.\n"
            "3) [현황] 에 없는 장비·항목·수치·명령은 없다고 답한다 — 지어내지 않는다.\n"
            "4) 지금 어디까지 왔는지는 **[선택 상태]가 정본**이다 — 대상 장비·시험 항목·"
            "절차·실행 결과를 그것으로 답하고, 화면과 다른 말을 하지 않는다.\n"
            "5) 답 끝에 **다음 한 단계**만 짧게 안내한다 — 장비가 정해졌으면 「이어서 시험 "
            "항목을 선택해 주세요」, 절차가 준비됐으면 「시험 시작이라고 말씀하시면 실행합니다」.\n"
            "6) 네트워크 장비·시험 지식 범위에서 답하고, 모르는 것은 모른다고 말한다.\n"
            "7) 화면 사용법을 물으면 「장비 선택 → 시험 항목 → 절차 만들기·고치기 → 시험 시작」 을 안내한다.\n"
            "8) 시험을 만들고 싶어 하는 말이면 장비 모델명과 확인하려는 동작을 "
            "함께 적어 다시 요청하도록 안내한다."
        ),
    },
    # ── 지식 ──────────────────────────────────────────────────
    "kai_answer": {
        "label": "Knowledge AI",
        "hint": "Knowledge AI › 쌓인 자료(WIKI · 시험 · 사이클 · Jira)에서 찾아 답합니다.",
        "system": (
            "너는 네트워크 장비 시험 조직의 지식 도우미다. 아래 근거만으로 한국어로 "
            "간결히 답하라.\n"
            "규칙:\n"
            "1) 근거를 쓸 때는 문장 끝에 [번호] 로 짚는다.\n"
            "2) 근거에 없는 것은 없다고 말한다 — 지어내지 않는다.\n"
            "3) 표가 어울리면 마크다운 표를 쓴다.\n"
            "4) 수치·버전·판정은 근거에 적힌 그대로 옮긴다."
        ),
    },
    "jira_defect": {
        "label": "Jira-분류",
        "hint": "Jira Issue › 「LLM 분류」 — 이슈를 발생상황·장비·카테고리로 가릅니다. "
                "고를 수 있는 값 목록은 코드가 뒤에 붙입니다.",
        "system": (
            "너는 네트워크 장비 시험 이슈(Jira)를 defect 로 가르는 분류기다. "
            "아래 스키마의 허용값 중에서만 골라 JSON 으로만 답한다. 설명·코드펜스 금지.\n"
            "판단 기준:\n"
            "1) 현장(운용망·고객사)에서 난 장애면 source=현장장애, "
            "상용망 검증(BMT·사전검증)에서 났으면 source=상용망검증.\n"
            "2) 장비군은 L2 · L3 · FTTH(OLT·광가입자) 중 하나.\n"
            "3) 카테고리는 가장 맞는 하나만.\n"
            "4) 상용망검증이면 item 과 type3 도 채운다.\n"
            "5) **모르면 빈 문자열로 둔다** — 지어내지 않는다. 반쯤 맞는 값을 채우면 "
            "집계가 통째로 어긋난다.\n"
            '출력 형식: {"source":"","device":"","category":"","item":"","type3":""}'
        ),
    },
    # ── 화면에 안 세우는 것 ─────────────────────────────────────
    # 위의 것들은 사람이 손보는 자리다(지시). 이것은 고를 것이 없는
    # 붙박이라 목록에서 감춘다 — 지우면 AI 「일반」 갈래가 시험을 못 고른다.
    "similar": {
        "hidden": True,
        "label": "닮은 시험 찾기",
        "hint": "AI 일반 갈래 — 말과 가장 가까운 기존 시험을 고릅니다.",
        "system": (
            "당신은 네트워크 시험 담당자다. 사람이 하려는 시험과 가장 가까운 것을 "
            "주어진 목록에서 고른다.\n"
            "규칙:\n"
            "1) 목록에 있는 tcid 만 쓴다. 새로 만들지 마라.\n"
            "2) 가까운 것부터 최대 3개.\n"
            "3) 가까운 것이 없으면 빈 배열을 준다. 억지로 채우지 마라.\n"
            "4) 한글·영어 표현을 뜻으로 대조한다 — 「시스템 이름」=sysName, "
            "「제품명/모델명」=sysDescr·Model Name, 「포트 상태」=ifOperStatus 처럼 "
            "같은 뜻이면 표기가 달라도 가까운 것이다.\n"
            "5) JSON 만 출력한다."
        ),
    },
}

# 옛 이름 → 새 이름. 저장해 둔 프롬프트가 이름이 바뀌었다고 사라지면 안 된다.
LLM_PURPOSE_ALIAS = {
    "requirement": "req_intent",
    "objective": "coverage_object",
    "steps": "coverage_automation",
}


def _prompt_of(purpose: str) -> dict:
    """이 용도에 쓸 프롬프트와 LLM. 설정에 있으면 그것, 없으면 기본값."""
    base = LLM_PURPOSES.get(purpose) or {}
    saved = {}
    if core.PROMPTS_FILE.exists():
        try:
            _all = core.load_json(core.PROMPTS_FILE).get("purposes") or {}
            saved = _all.get(purpose) or {}
            if not saved:
                # 이름을 바꾸기 전에 저장해 둔 것 — 그대로 이어 쓴다
                for _old, _new in LLM_PURPOSE_ALIAS.items():
                    if _new == purpose and _all.get(_old):
                        saved = _all[_old]
                        break
        except Exception:
            saved = {}
    return {
        "label": saved.get("label") or base.get("label") or purpose,
        "hint": base.get("hint") or "",
        "system": (saved.get("system") or "").strip() or base.get("system") or "",
        "llm": saved.get("llm") or "",
        # 채팅 화면 쪽 — 여는 말·입력칸 안내·추천 질문(지시)
        "greeting": saved.get("greeting") or base.get("greeting") or "",
        "placeholder": saved.get("placeholder") or base.get("placeholder") or "",
        "asks": list(saved.get("asks") or base.get("asks") or []),
        # 용도별 파라미터(지시) — 비우면 모델 기본을 따른다
        "params": dict(saved.get("params") or {}),
    }


# 용도에 걸 수 있는 파라미터(지시: 파라미터는 **전부** 용도별 프롬프트로).
# 모델(LLM 설정)에는 옛 저장값이 기본값으로 남고, 용도 값이 있으면 이긴다.
_PURPOSE_PARAM_KEYS = ("max_tokens", "temperature", "top_p", "top_k",
                       "presence_penalty", "frequency_penalty", "context_size")
# 숫자가 아닌 칸 — completion_mode 는 chat|completion 글자다
_PURPOSE_PARAM_STR = ("completion_mode",)


def _purpose_params(purpose: str) -> dict:
    """이 용도에 걸어 둔 파라미터. 빈 칸은 돌려주지 않는다 — 비우면 기본."""
    if not purpose or not core.PROMPTS_FILE.exists():
        return {}
    try:
        saved = (core.load_json(core.PROMPTS_FILE).get("purposes") or {}).get(purpose) or {}
        out = {}
        for k in _PURPOSE_PARAM_KEYS:
            v = (saved.get("params") or {}).get(k)
            if v is None or v == "":
                continue
            out[k] = int(float(v)) if k in ("max_tokens", "top_k", "context_size") else float(v)
        for k in _PURPOSE_PARAM_STR:
            v = str((saved.get("params") or {}).get(k) or "").strip()
            if v:
                out[k] = v
        return out
    except Exception:
        return {}


def _clean_purpose_params(raw) -> dict:
    """저장 전 청소 — 숫자는 숫자로, 못 읽는 값·빈 칸은 버린다."""
    out = {}
    for k in _PURPOSE_PARAM_KEYS:
        v = (raw or {}).get(k)
        if v is None or str(v).strip() == "":
            continue
        try:
            out[k] = int(float(v)) if k in ("max_tokens", "top_k", "context_size") else float(v)
        except (TypeError, ValueError):
            continue
    for k in _PURPOSE_PARAM_STR:
        v = str((raw or {}).get(k) or "").strip()
        if v in ("chat", "completion"):
            out[k] = v
    return out


def _apply_purpose_params(body: dict, purpose: str) -> None:
    """OpenAI 호환 body 에 용도 파라미터를 덮는다 — 사람이 설정에 적은 값이
    코드에 박힌 기본을 이긴다. 요약은 차갑게, 요구사항은 뜨겁게(지시).

    context_size 는 body 로 보내는 값이 아니라 **한도**다 — max_tokens 를
    넘지 못하게 깎는다. completion_mode 는 저장·표시용이다(서버 안 호출은
    전부 chat 방식이라 body 에 실으면 400 만 난다)."""
    p = _purpose_params(purpose)
    for k, v in p.items():
        if k in ("context_size", "completion_mode"):
            continue
        body[k] = v
    if "context_size" in p and isinstance(body.get("max_tokens"), (int, float)):
        body["max_tokens"] = min(int(body["max_tokens"]), int(p["context_size"]))


def _llm_pick(purpose: str = "", llm_id: str = ""):
    """
    쓸 수 있는 로컬 LLM 하나.

    고르는 규칙이 `/api/llm/generate` 안에 박혀 있어서, 다른 곳에서 LLM 을
    쓰려면 그 여든 줄을 통째로 베껴야 했다. 한 곳으로 뺀다.

    용도에 붙여 둔 LLM 이 있으면 그것을 먼저 쓴다 — 배선처럼 짧은 일에는
    작은 모델을, 절차 만들기에는 큰 모델을 붙일 수 있어야 한다.
    """
    init_llms_file()
    llms = core.load_json(core.LLMS_FILE).get("llms") or []

    def _ok(l):
        if not (l.get("status", "active") == "active" and l.get("endpoint")):
            return False
        t = str(l.get("type") or "").lower()
        return t in ("local", "vllm", "openai", "openai-compatible", "")

    # 화면에서 고른 것이 먼저다 — 설정의 기본값은 안 고른 사람을 위한 것
    want = llm_id or (_prompt_of(purpose).get("llm") if purpose else "")
    if want:
        for l in llms:
            if str(l.get("id") or "") == want and _ok(l):
                return l
    for l in llms:
        if _ok(l):
            return l
    return None


@router.get("/api/llm/purposes")
async def llm_purposes():
    """용도 목록 — 화면이 이것으로 설정 칸을 그린다. 기본 프롬프트도 함께 준다."""
    out = []
    for k, v in LLM_PURPOSES.items():
        if v.get("hidden"):
            continue          # 사람이 손볼 자리만 세운다(지시)
        cur = _prompt_of(k)
        out.append({
            "id": k,
            "label": cur["label"],
            "hint": v.get("hint") or "",
            "system": cur["system"],
            "llm": cur["llm"],
            "default": v.get("system") or "",
            # 채팅 화면에서 보이는 것 — 여는 말·입력칸 안내·추천 질문(지시)
            "greeting": cur.get("greeting") or "",
            "placeholder": cur.get("placeholder") or "",
            "asks": cur.get("asks") or [],
            "params": cur.get("params") or {},
        })
    return {"purposes": out}


@router.post("/api/llm/purposes")
async def llm_purposes_save(data: dict):
    """용도별 프롬프트·LLM 저장. 다른 설정(prompts.json)은 건드리지 않는다."""
    cur = core.load_json(core.PROMPTS_FILE) if core.PROMPTS_FILE.exists() else {}
    ps = dict(cur.get("purposes") or {})
    for k, v in (data.get("purposes") or {}).items():
        if k not in LLM_PURPOSES:
            continue
        ps[k] = {
            "system": str((v or {}).get("system") or ""),
            "llm": str((v or {}).get("llm") or ""),
            # 채팅 화면 쪽 값 — 없으면 빈 것으로 둔다(옛 저장본 호환)
            "greeting": str((v or {}).get("greeting") or ""),
            "placeholder": str((v or {}).get("placeholder") or ""),
            "asks": [str(x) for x in ((v or {}).get("asks") or []) if str(x).strip()],
            # 파라미터(지시: 용도별로) — 숫자만 받고 빈 칸은 저장하지 않는다
            "params": _clean_purpose_params((v or {}).get("params")),
        }
    cur["purposes"] = ps
    core.PROMPTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    core.save_json(core.PROMPTS_FILE, cur)
    return {"ok": True}


async def _llm_json(llm, sys_p, user_p, schema, timeout=120, purpose: str = ""):
    """LLM 에게 JSON 하나를 받는다. `guided_json` 이 없는 판이면 한 번 더 물러선다."""
    import httpx
    body = {
        "model": llm.get("model") or "",
        "messages": [{"role": "system", "content": sys_p}, {"role": "user", "content": user_p}],
        "temperature": 0.1,
        "max_tokens": 1536,
        "guided_json": schema,
    }
    _apply_purpose_params(body, purpose)   # 용도 파라미터가 코드 기본을 이긴다(지시)
    headers = {"Content-Type": "application/json"}
    if llm.get("apikey"):
        headers["Authorization"] = f"Bearer {llm['apikey']}"
    url = str(llm["endpoint"]).rstrip("/") + "/chat/completions"
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, headers=headers, json=body)
        if r.status_code != 200:
            body.pop("guided_json", None)
            body["response_format"] = {"type": "json_object"}
            r = await client.post(url, headers=headers, json=body)
        if r.status_code != 200:
            raise RuntimeError(f"LLM {r.status_code}: {r.text[:300]}")
        data = r.json()
        txt = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    m = re.search(r"\{.*\}", txt, re.S)
    return json.loads(m.group(0) if m else txt)


@router.post("/api/llm/similar")
async def llm_similar(payload: dict):
    """
    목적 한 줄과 **닮은 시험**을 찾는다.

    이 시스템에는 이미 검증된 시험이 쌓여 있다. 어떤 것은 여덟 번씩
    돌았고 판정 기준도 그만큼 다듬어졌다. 그런데 새 시험을 만들 때 그것을
    쓰지 않고 매번 빈 화면에서 시작한다 — 가장 좋은 자산을 놀리고 있다.

    그래서 **짓지 않고 찾는다.** AI 는 「성능」 이 「트래픽 2포트 시험」 인
    것을 알아보는 데만 쓴다. 절차·판정은 이미 있는 것을 그대로 옮긴다 —
    지어낼 자리가 없으니 틀릴 자리도 없다.

    LLM 이 없거나 답을 못 줘도 글자 맞춤으로 찾아 준다. 찾는 일이 아예
    안 되는 것보다는 덜 똑똑해도 되는 편이 낫다.
    """
    want = str(payload.get("purpose") or "").strip()
    models = [str(x) for x in (payload.get("models") or []) if str(x).strip()]
    if not want:
        return {"ok": False, "error": "무엇을 시험하려는지 한 줄 적어 주세요"}

    try:
        metas = await db.tc_list_meta()
    except Exception:
        metas = []
    if not metas:
        return {"ok": True, "items": []}

    # 글자 맞춤 — 이름·요구사항에 든 낱말이 몇 개나 겹치나
    words = [w for w in re.split(r"[\s·,/()]+", want) if len(w) > 1]

    def _score(t):
        name = f"{t.get('name') or ''} {t.get('req_id') or ''} {t.get('type') or ''}"
        low = name.lower()
        s = sum(2 for w in words if w.lower() in low)
        # 같은 계열 장비로 돌린 적이 있으면 크게 친다 — 그 랩에서 실제로 된 것이다
        for m in models:
            if m and m.lower() in low:
                s += 3
        # 여러 번 돌아간 것일수록 믿을 만하다
        s += min(3, int(t.get("run_count") or 0))
        if str(t.get("status") or "").upper() == "PASS":
            s += 1
        return s

    #
    # 고를 거리를 넉넉히 준다.
    #
    # 처음에는 글자 맞춤 상위 여덟 개만 LLM 에게 보였다. 그랬더니 「E4320
    # 성능」 을 물었을 때 이름에 E4320 이 든 시험만 올라오고, 정작 맞는
    # 「N2X 트래픽 2포트 시험」 은 후보에도 못 들었다 — 그 이름에는 E4320 이
    # 없기 때문이다. 뜻으로 고르라고 시켜 놓고 글자로 미리 걸러 버린 셈이다.
    ranked = sorted(metas, key=_score, reverse=True)
    top = ranked[:40]

    # LLM 이 있으면 그중에서 고르게 한다 — 낱말이 안 겹쳐도 뜻이 닿는 것이 있다
    llm = _llm_pick("similar")
    picked = []
    if llm and len(top) > 1:
        brief = [
            {"tcid": t.get("tcid"), "name": t.get("name"), "type": t.get("type"), "req": t.get("req_id")}
            for t in top
        ]
        schema = {
            "type": "object",
            "properties": {"tcids": {"type": "array", "items": {"type": "string"}}},
            "required": ["tcids"],
        }
        sys_p = _prompt_of("similar")["system"]
        user_p = (
            "시험 목록:\n" + json.dumps(brief, ensure_ascii=False) +
            "\n\n사람이 하려는 것:\n" + want +
            "\n\n가장 가까운 것부터 최대 3개의 tcid 만 {\"tcids\":[...]} 로 출력하라."
        )
        try:
            got = await _llm_json(llm, sys_p, user_p, schema, timeout=60, purpose="similar")
            ids = [str(x) for x in (got.get("tcids") or [])]
            byid = {str(t.get("tcid")): t for t in top}
            picked = [byid[i] for i in ids if i in byid]
        except Exception:
            picked = []

    order = picked + [t for t in top if t not in picked]
    return {
        "ok": True,
        "items": [
            {
                "tcid": t.get("tcid"),
                "name": t.get("name"),
                "type": t.get("type"),
                "req_id": t.get("req_id"),
                "runs": int(t.get("run_count") or 0),
                "status": t.get("status") or "",
                "why": "AI 가 고름" if t in picked else "이름이 닮음",
            }
            for t in order[:5]
        ],
    }


def _pick_in_q(val, q: str, cap: int) -> str:
    """선택 신호는 **사용자의 말에 실제로 등장한 글자만** 인정한다(지시:
    스스로 판단 금지). LLM 이 현황·이전 맥락에서 가져온 값(질문에 없는
    IP 등)은 신호가 아니다 — 대소문자만 너그럽게 본다."""
    v = str(val or "").strip()[:cap]
    if not v:
        return ""
    return v if v.lower() in str(q or "").lower() else ""


# Coverage AI 가 프롬프트에서 받는 「다음 행동」 — 화면(AskBar)의 실행기와 같은 목록
_NEXT_OK = {"confirm_device", "ask_device", "use_device", "repick_device", "ask_tc", "wait_tc", "none"}


@router.post("/api/ai/cov-chat")
async def cov_chat(payload: dict):
    """Coverage AI 잡담 갈래(지시) — 아무 상관없는 말에 장비 고르기가 뜨던 것.

    화면이 보내기 전에 이걸 먼저 부른다. LLM 이 「시험 실행 요청인가」 를
    가르고, 아니면 SETUP › 용도별 프롬프트 › Coverage AI(Basic/Advanced) 의
    말투로 바로 답한다(test=false + answer). 시험 요청이면 test=true 만
    돌려주고 화면은 원래 흐름(장비 → 항목)으로 간다.

    판별 규칙은 코드가 앞에 얹는다 — 사람이 설정 글을 어떻게 고치든
    가르는 기준은 흔들리지 않아야 한다. LLM 이 없거나 답을 못 주면
    test=true 로 물러선다: 이 화면의 본분은 시험이라, 못 가르면
    하던 대로 하는 편이 안전하다.
    """
    q = str(payload.get("q") or "").strip()
    # 화면은 Advanced 를 'adv' 로 보낸다 — 'advanced' 만 보다가 Advanced 모드도
    # 늘 Basic 프롬프트로 답했다(지적: 모드와 말투가 어긋남).
    purpose = "cai_advanced" if str(payload.get("mode") or "") in ("advanced", "adv") else "cai_basic"
    # 화면이 만든 현황 요약(장비·시험 항목) — LLM 이 이 사실로만 답한다(지시:
    # 「시험 가능한 장비는?」 에 지어낸 「없습니다」 가 나왔다).
    # 장비 한 대당 한 줄(사업자·LAB·벤더까지) + 시험 항목 이름 80건까지
    # 실리므로 상한도 넉넉히(승인).
    facts = str(payload.get("facts") or "").strip()[:16000]
    if not q:
        return {"ok": False, "error": "질문이 비었습니다"}
    llm = _llm_pick(purpose) or _ai_llm() or {}
    if not (llm and llm.get("endpoint")):
        return {"ok": True, "test": True, "answer": ""}
    cfg = _prompt_of(purpose)
    base = str(cfg.get("system") or "").strip() or str(
        (LLM_PURPOSES.get(purpose) or {}).get("system") or "")
    # 판단 규칙은 **프롬프트가** 든다(지시) — SETUP 에서 고친다.
    # 코드는 화면이 읽는 출력 형식 하나만 강제한다.
    fmt = (
        "\n\n[출력 형식 — 반드시 지킨다] JSON 하나만 출력한다: "
        '{"test": true|false, "answer": "...", "model": "...", "show": "..."} — '
        "설명·코드펜스 금지. test 는 시험 실행 요청 여부, answer 는 "
        "test=false 일 때의 답, model 은 말에 적힌 장비 모델명(없으면 빈 문자열)이다. "
        "show 는 사용자가 **목록을 보여 달라**고 한 것일 때만 적는다 — 장비 목록이면 "
        '"devices", 시험 항목 목록이면 "tcs", 그 외에는 빈 문자열. show 를 적었으면 '
        "answer 는 한 줄 요약만 적는다 — 목록 자체는 화면이 카드로 그린다. "
        'state 는 사용자가 **사용 가능한 것만** 보여 달라고 했을 때만 "ok", '
        "그 외에는 빈 문자열 — 화면이 그 상태로 걸러 그린다. "
        "사용자가 **시험 결과를 보여 달라**고 하면([선택 상태]에 실행 결과가 있을 때) "
        'show="result" 로 적는다 — 화면이 결과 보기 판을 연다. '
        "사용자가 **특정 장비를 선택·지정해 달라**고 하면(예: 「220.1.12.3 장비 선택해 줘」) "
        "pick_dev 에 그 장비의 IP(있으면 IP, 없으면 모델명)를 적는다. "
        "**특정 시험 항목을 선택해 달라**고 하면(예: 「E61xx-T0001 선택」·「System 정보 조회 항목 선택」) "
        "pick_tc 에 항목 키 또는 항목 이름을 그대로 적는다. "
        "pick_dev·pick_tc 에는 **사용자의 말에 실제로 등장한 글자만 그대로** 적는다 — "
        "[현황]·[선택 상태]·이전 대화에서 가져오거나 지어내지 마라. "
        "말에 없는 값은 서버가 버린다. "
        "사용자가 **추천해 달라·골라 달라**고 하면 suggest_tc 에 [현황] 항목 중 가장 "
        "맞는 것의 TC키를 적는다(여러 개면 쉼표로 최대 3개) — 화면이 후보 카드로 "
        "세우고 고르는 것은 사람이다. answer 는 왜 그것인지 한 줄만. "
        '예) 「시험 항목 추천해 줘」 → {"test": false, "answer": "기본 상태 확인부터 '
        '권합니다", "suggest_tc": "E61xx-T0001,E61xx-T0004", "model": "E6100", '
        '"show": "", "state": "", "pick_dev": "", "pick_tc": "", "run": false}. '
        "「~항목이 있어?」 처럼 **있는지 묻기만 한 말**에는 pick 을 적지 않는다 — "
        "answer 로 있는지만 답한다. 다만 「~찾아 줘」·「~항목 보여 줘」 처럼 **검색을 "
        "요청**한 말에는 pick_tc 에 찾는 말(질문에 등장한 글자)을 적는다 — 화면이 "
        "후보 카드로 보여 주고, 고르는 것은 사람이다. "
        "pick 을 적었으면 answer 는 **빈 문자열**로 둔다 — 선택 확인이든 후보 카드든 "
        "화면이 답한다. 선택했다거나 진행한다고 화면 대신 말하지 마라. "
        "말에 이미 「대상 장비: …」 맥락이 붙어 있으면, 사용자가 **다른 장비를 콕 집어** "
        "말할 때만 pick_dev 를 적는다 — 대상 없는 말(「장비 선택해 줘」)이면 pick_dev 는 "
        "빈 문자열로 두고 지금 장비가 이미 선택돼 있음을 answer 로 알린다. "
        "run 은 사용자가 **지금 준비된 시험을 시작·실행해 달라**고 할 때만 true 다 — "
        "[선택 상태] 에 절차가 「준비됨」 일 때만 true 로 하고 answer 는 "
        "「시험을 시작합니다」 한 줄만 적는다. 준비 안 됐으면 run=false 로 두고 "
        "[선택 상태] 를 근거로 무엇이 빠졌는지 답한다 — 화면과 다른 말을 지어내지 마라. "
        "질문에 장비 모델명이 명시되어 있으면 함께 실린 「대상 장비」 맥락보다 "
        "**질문의 모델을 우선**해 답하고, model 에도 그 모델을 적는다. "
        "next 에는 [다음 행동] 규칙대로 confirm_device · ask_device · use_device · repick_device · "
        "ask_tc · wait_tc · none 중 하나만 적는다 — 다른 값은 버린다."
    )
    schema = {
        "type": "object",
        "properties": {"test": {"type": "boolean"}, "answer": {"type": "string"},
                       "model": {"type": "string"}, "show": {"type": "string"},
                       "state": {"type": "string"},
                       "pick_dev": {"type": "string"}, "pick_tc": {"type": "string"},
                       "suggest_tc": {"type": "string"},
                       "next": {"type": "string"},
                       "run": {"type": "boolean"}},
        "required": ["test", "answer"],
    }
    user_p = f"사용자의 말: {q}"
    if facts:
        user_p += f"\n\n[현황]\n{facts}"
    try:
        got = await _llm_json(llm, base + fmt, user_p, schema,
                              timeout=60, purpose=purpose)
        _show = str(got.get("show") or "").strip().lower()
        _state = str(got.get("state") or "").strip().lower()
        return {"ok": True, "test": bool(got.get("test")),
                "answer": str(got.get("answer") or "").strip(),
                "model": str(got.get("model") or "").strip(),
                # 화면이 아는 값만 통과시킨다 — LLM 이 지어낸 딴 값은 버린다
                "show": _show if _show in ("devices", "tcs", "result") else "",
                "state": _state if _state == "ok" else "",
                # 선택 신호 — **질문에 실제로 등장한 글자만** 신호다(지시:
                # 스스로 판단 금지). 말에 없는 값은 여기서 버린다 — 케이스별
                # 가드 대신 보편 규칙 하나. 값이 진짜 목록에 있는지는 화면이
                # 대조하고, 확정은 사람이 카드로 한다.
                "pick_dev": _pick_in_q(got.get("pick_dev"), q, 80),
                "pick_tc": _pick_in_q(got.get("pick_tc"), q, 120),
                # 값은 버려도 **의도는 남긴다**(지적: 아무 일도 안 일어나는
                # 죽은 끝) — 화면이 사용자의 원문으로 후보를 찾아 카드로 묻는다
                "dev_intent": bool(str(got.get("pick_dev") or "").strip()
                                   and not _pick_in_q(got.get("pick_dev"), q, 80)),
                "tc_intent": bool(str(got.get("pick_tc") or "").strip()
                                  and not _pick_in_q(got.get("pick_tc"), q, 120)),
                # 추천 신호 — 값은 화면이 실제 목록과 대조하고, 확정은 카드 클릭
                "suggest_tc": str(got.get("suggest_tc") or "").strip()[:200],
                # 실행 신호 — 절차가 준비돼 있는지는 화면이 다시 확인한다
                "run": bool(got.get("run")),
                # 다음 행동(승인: 11·12·13 을 프롬프트로) — 화면이 아는 행동만 통과
                "next": (lambda v: v if v in _NEXT_OK else "")(str(got.get("next") or "").strip().lower())}
    except Exception as e:
        return {"ok": True, "test": True, "answer": "", "model": "", "error": str(e)[:200]}


@router.post("/api/llm/wiring")
async def llm_wiring(payload: dict):
    """
    말로 적은 배선을 줄로 옮긴다.

    「E5724RL 1번 2번 포트를 N2X 4106/3, 4106/4 에 물렸어」 같은 문장을
    받아 배선 줄을 만든다.

    **지어낸 이름은 버린다.** 장비·포트 목록은 이미 자료로 있으므로, 그
    안에 없는 것은 서버에서 걸러 내고 무엇을 버렸는지 함께 알린다.
    로컬 모델은 그럴듯한 포트 이름을 곧잘 지어내는데, 그것이 그대로
    저장되면 실행할 때까지 아무도 모른다 — 조용히 틀리는 것이 제일 나쁘다.

    저장은 하지 않는다. 화면이 그림으로 보여 주고 사람이 정한다.
    """
    say = str(payload.get("text") or "").strip()
    if not say:
        return {"ok": False, "error": "무엇을 어떻게 물렸는지 적어 주세요"}
    devs = payload.get("devices") or []      # [{id,label,ports:[...]}]
    meters = payload.get("meters") or []     # [{id,label,ports:[...]}]
    if not devs or not meters:
        return {"ok": False, "error": "장비와 계측기가 있어야 배선을 그립니다"}

    llm = _llm_pick("wiring", str(payload.get("llm") or ""))
    if not llm:
        return {"ok": False, "error": "등록된 로컬 LLM 이 없습니다 — 설정 › LLM 설정에서 켜세요"}
    sys_p = _prompt_of("wiring")["system"]

    def _one(x):
        return {
            "id": str(x.get("id") or ""),
            "label": str(x.get("label") or x.get("id") or ""),
            "ports": [str(p) for p in (x.get("ports") or [])][:200],
        }

    D = [_one(x) for x in devs]
    M = [_one(x) for x in meters]
    # 계측기 포트를 안 불러왔으면 여기서 멈춘다. 빈 목록으로 LLM 에 보내면
    # 「목록에 없으면 만들지 마라」 규칙 때문에 빈손으로 돌아오는데, 화면은
    # 그걸 「못 알아들었다」 로 보여 줬다 — 이유를 말해야 사람이 고친다.
    if not any(m["ports"] for m in M):
        return {
            "ok": False,
            "error": "계측기 포트 목록이 비어 있습니다 — 결선 줄에서 계측기를 고르고 「불러오기」 를 먼저 누르세요.",
        }
    schema = {
        "type": "object",
        "properties": {
            "wires": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "dev": {"type": "string"},
                        "port": {"type": "string"},
                        "meter": {"type": "string"},
                        "meterPort": {"type": "string"},
                    },
                    "required": ["dev", "port", "meter", "meterPort"],
                },
            }
        },
        "required": ["wires"],
    }
    user_p = (
        "장비:\n" + json.dumps(D, ensure_ascii=False) +
        "\n계측기:\n" + json.dumps(M, ensure_ascii=False) +
        "\n\n사람이 말한 배선:\n" + say +
        "\n\n{\"wires\":[...]} 로만 출력하라."
    )
    try:
        got = await _llm_json(llm, sys_p, user_p, schema, purpose="wiring")
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}

    dmap = {x["id"]: set(x["ports"]) for x in D}
    mmap = {x["id"]: set(x["ports"]) for x in M}
    # 이름으로 부른 것도 받아 준다 — 사람도 모델도 id 보다 이름을 쓴다
    dbyname = {x["label"]: x["id"] for x in D}
    mbyname = {x["label"]: x["id"] for x in M}
    out, dropped = [], []
    seen = set()
    for w in (got.get("wires") or []):
        dv = str(w.get("dev") or "")
        mt = str(w.get("meter") or "")
        dv = dv if dv in dmap else dbyname.get(dv, dv)
        mt = mt if mt in mmap else mbyname.get(mt, mt)
        pt = str(w.get("port") or "")
        mp = str(w.get("meterPort") or "")
        why = ""
        if dv not in dmap:
            why = f"{w.get('dev')} 라는 장비가 없습니다"
        elif pt not in dmap[dv]:
            why = f"{dv} 에 {pt} 포트가 없습니다"
        elif mt not in mmap:
            why = f"{w.get('meter')} 라는 계측기가 없습니다"
        elif mp not in mmap[mt]:
            why = f"{mt} 에 {mp} 포트가 없습니다"
        elif (dv, pt) in seen or (mt, mp) in seen:
            why = "이미 쓴 포트입니다"
        if why:
            dropped.append(why)
            continue
        seen.add((dv, pt))
        seen.add((mt, mp))
        out.append({"dev": dv, "port": pt, "meter": mt, "meterPort": mp})
    if not out and not dropped:
        # LLM 이 규칙대로 「목록에 없으면 안 만든다」 를 지켜 빈손으로 온 것 —
        # 대개 포트 이름이 등록 목록과 다르다. 무엇이 있는지 알려 준다.
        avail = " · ".join(
            f"{x['label']}: {', '.join(x['ports'][:6])}{'…' if len(x['ports']) > 6 else ''}"
            for x in (D + M)[:4] if x["ports"]
        )
        return {
            "ok": False,
            "error": f"문장의 포트 이름이 등록 목록에 없는 것 같습니다. 등록된 포트 — {avail}",
        }
    return {"ok": True, "wires": out, "dropped": dropped}


@router.post("/api/llm/generate")
async def llm_generate(payload: dict, token: str = ""):
    """자연어 시험 목적 → 시험 절차(steps) 생성. 등록 LLM(vLLM) + 학습 예시 few-shot + JSON 강제."""
    import httpx, re as _re
    purpose = str(payload.get("purpose") or "").strip()
    dev_model = str(payload.get("model") or "").strip()
    role = str(payload.get("role") or "").strip()
    if not purpose:
        return {"ok": False, "error": "시험 목적을 입력하세요"}
    # 등록 LLM 선택 — vLLM/OpenAI 호환 로컬 LLM만 지원(/chat/completions 규격). Claude 는 /v1/messages 라 여기선 제외.
    init_llms_file()
    llms = (core.load_json(core.LLMS_FILE).get("llms") or [])
    def _ok(l):
        if not (l.get("status", "active") == "active" and l.get("endpoint")): return False
        t = str(l.get("type") or "").lower()
        # openai 호환 계열만 통과 (local/vllm/openai). claude/anthropic/gemini/bedrock 등 비호환은 제외.
        return t in ("local", "vllm", "openai", "openai-compatible", "") and t not in ("claude", "anthropic")
    llm = next((l for l in llms if _ok(l)), None)
    if not llm:
        return {"ok": False, "error": "등록된 로컬(OpenAI 호환) LLM이 없습니다. AI Assistant에서 vLLM/제마를 활성화하세요."}
    # few-shot: 학습 예시 중 모델/제품군 유사 상위 3건
    items = _load_learned().get("items", [])
    def _rel(it):
        s = 0
        if dev_model and dev_model in (it.get("models") or []): s += 2
        if role and it.get("role") == role: s += 1
        return s
    examples = sorted(items, key=_rel, reverse=True)[:3]
    schema = {"type": "object", "properties": {"steps": {"type": "array", "items": {
        "type": "object",
        "properties": {"desc": {"type": "string"}, "cli": {"type": "string"}, "type": {"type": "string", "enum": ["contains", "contains_all", "notcontains", "line"]}, "criteria": {"type": "string"}},
        "required": ["desc", "cli", "type"]}}}, "required": ["steps"]}
    sys_p = ("당신은 네트워크 장비 시험 절차 설계 전문가다. 사용자의 시험 목적에 맞는 CLI 시험 절차를 만든다. "
             "각 스텝은 desc(이 스텝이 무엇을 확인/시험하는지 한국어 한 줄 설명), cli(실행 명령), "
             "type(contains=출력에 포함되어야 정상 / notcontains=없어야 정상 / line=특정 라인 확인), "
             "criteria(판정에 쓸 문자열)로 구성한다. desc는 반드시 채운다. JSON만 출력하고 그 외 설명/주석은 쓰지 않는다.\n"
             "\n"
             "[Ubiquoss 장비 CLI 정정 규칙 — 반드시 준수]\n"
             "1) QoS Class/Queue: Cisco식 표기 금지. 다음 명령을 그대로 사용하라.\n"
             "   - 조회: 'show class-map' (X: 'show qos class-map'), 'show policy-map' (X: 'show qos policy-map <name>')\n"
             "   - 매치: 'match ip-dscp <0-63>' (X: 'match ip dscp ef'). 예) EF=46, AF11=10\n"
             "   - 큐 지정: 'set queueing <0-7>' (X: 'set queue <N>')\n"
             "   - 판정 문자열 예: 'Set Queueing : 1' (대문자 Q + 콜론), 'Match IP DSCP: 46'\n"
             "   - 원복: 'no service-policy input <NAME>' → 'no policy-map <NAME>' → 'no class-map <NAME>' 순\n"
             "2) IGMP Snooping — CLI 모드 주의:\n"
             "   - 'ip igmp snooping' 은 반드시 'interface vlan 1' 진입 후 설정. global config 에서 하면 '% Incomplete command'.\n"
             "   - 'show ip igmp snooping' 출력은 Global 섹션 + Vlan N 섹션으로 나뉜다. 판정 대상은 'Vlan 1' 섹션.\n"
             "3) IGMP proxy 는 DUT 설정이 아님:\n"
             "   - 'ip igmp proxy-service priority 200' 등은 상위 연동 OLT 설정이다. L2 DUT 스텝에 넣지 말 것.\n"
             "4) VLAN 표기(Ubiquoss):\n"
             "   - VLAN 생성: 'vlan database' 진입 후 'vlan N'. 'configure terminal' 로 바로 생성 금지.\n"
             "   - 포트: 'interface range GigabitEthernet 0/1-8' 또는 'interface GigabitEthernet 0/x' 사용.\n"
             "   - Cisco 표기(예: 'GigabitEthernet 1/0/1', 'gigabitethernet 1/0/x') 금지. Ubiquoss 엔 '1/0/' 계층 없음.\n"
             "   - 포트 모드: 'switchport mode access' / 'switchport mode trunk' / 'switchport mode hybrid'\n"
             "\n"
             "[판정기준 작성 규칙 — 거짓 합격 방지]\n"
             "- 판정에 쓸 값이 출력에 유일하면 값만 쓴다 (예: 'VLAN0010', '1.0.1', 'E5724RL').\n"
             "- 같은 값이 여러 줄에 등장하면 라벨 토큰 + 값을 함께 쓴다. 단 콜론·정렬 공백(2칸 이상)은 넣지 마라(기종별로 폭이 달라 깨진다).\n"
             "- 여러 줄 criteria 는 반드시 type='contains_all' 을 쓴다. 'contains' 는 여러 줄 검색 시 무조건 Fail.\n"
             "- desc 가 가리키는 항목과 criteria 는 반드시 같은 항목이어야 한다 (Main Memory 스텝에 Flash 값 금지).\n"
             "- 근거 없는 CLI/값은 창작하지 말고 criteria 를 '[확인필요]' 로 둔다.")
    ex_text = ""
    for ex in examples:
        ex_text += f"\n[예시] 목적: {ex.get('title','')} (모델 {','.join(ex.get('models') or [])})\n" + json.dumps({"steps": ex.get("steps") or []}, ensure_ascii=False)
    user_p = f"대상 모델: {dev_model or '공통'}\n시험 목적: {purpose}\n"
    if ex_text:
        user_p += "\n아래는 검증된 정상 절차 예시다. 명령 체계/스타일을 참고하라:" + ex_text
    user_p += "\n\n위 목적에 맞는 시험 절차를 {\"steps\":[...]} JSON으로만 출력하라."
    body = {"model": llm.get("model") or "", "messages": [{"role": "system", "content": sys_p}, {"role": "user", "content": user_p}],
            "temperature": 0.2, "max_tokens": 2048, "guided_json": schema}
    headers = {"Content-Type": "application/json"}
    if llm.get("apikey"):
        headers["Authorization"] = f"Bearer {llm['apikey']}"
    url = str(llm["endpoint"]).rstrip("/") + "/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            r = await client.post(url, headers=headers, json=body)
            if r.status_code != 200:   # guided_json 미지원 구버전 → json_object 폴백
                body.pop("guided_json", None)
                body["response_format"] = {"type": "json_object"}
                r = await client.post(url, headers=headers, json=body)
            if r.status_code != 200:
                return {"ok": False, "error": f"LLM {r.status_code}: {r.text[:300]}"}
            data = r.json()
            content = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}
    try:
        m = _re.search(r"\{.*\}", content, _re.DOTALL)
        obj = json.loads(m.group(0) if m else content)
        raw_steps = obj.get("steps") if isinstance(obj, dict) else []
    except Exception:
        return {"ok": False, "error": "응답 JSON 파싱 실패", "raw": content[:500]}
    clean = []
    for s in (raw_steps or []):
        if not isinstance(s, dict):
            continue
        cli = str(s.get("cli") or "").strip()
        if not cli:
            continue
        clean.append({"desc": str(s.get("desc") or ""), "cli": cli, "type": s.get("type") or "contains", "criteria": str(s.get("criteria") or "")})
    return {"ok": True, "steps": clean, "used_examples": len(examples), "model": llm.get("model"), "raw": content[:1200]}

@router.post("/api/llm/ask")
async def llm_ask(payload: dict, token: str = ""):
    """자연어 질문 → 학습 데이터 검색 + LLM(gemma) 요약 답변 (근거 포함)."""
    import httpx, re as _re
    query = str(payload.get("query") or "").strip()
    if not query:
        return {"ok": False, "error": "질문을 입력하세요"}
    items = _load_learned().get("items", [])
    terms = [t for t in _re.split(r"\s+", query.lower()) if t]
    def _hay(it):
        return (str(it.get("title", "")) + " " + " ".join(it.get("models") or []) + " " + str(it.get("role", "")) + " " + str(it.get("vendor", "")) + " "
                + " ".join((str(s.get("desc", "")) + " " + str(s.get("cli", "")) + " " + str(s.get("imageText", ""))) for s in (it.get("steps") or []))).lower()
    def _score(it):
        h = _hay(it); return sum(1 for t in terms if t in h)
    ranked = sorted(items, key=_score, reverse=True)
    matched = [it for it in ranked if _score(it) > 0][:5] or ranked[:3]
    # llm_generate 와 동일 규칙 — vLLM/OpenAI 호환 로컬 LLM만. Claude 등은 /chat/completions 미지원이라 404 원인.
    llms = (core.load_json(core.LLMS_FILE).get("llms") or [])
    def _ok_ask(l):
        if not (l.get("status", "active") == "active" and l.get("endpoint")): return False
        t = str(l.get("type") or "").lower()
        return t in ("local", "vllm", "openai", "openai-compatible", "") and t not in ("claude", "anthropic")
    llm = next((l for l in llms if _ok_ask(l)), None)
    if not llm:
        return {"ok": False, "error": "등록된 로컬(OpenAI 호환) LLM이 없습니다. AI Assistant에서 vLLM/제마를 활성화하세요.", "matched": matched}
    ctx = ""
    for it in matched:
        ctx += f"\n■ 시험항목: {it.get('title','')} (모델 {','.join(it.get('models') or [])} / 제품군 {it.get('role','')})\n"
        for s in (it.get("steps") or []):
            ctx += f"   - {s.get('desc','')}: `{s.get('cli','')}` [판정 {s.get('type','')} \"{s.get('criteria','')}\"]"
            if s.get("imageText"):
                ctx += f" / 이미지인식: {str(s.get('imageText'))[:150]}"
            ctx += "\n"
    sys_p = ("너는 사내 네트워크 장비 시험 절차 지식 어시스턴트다. 아래 '검색된 학습 데이터'만 근거로 사용자 질문에 한국어로 간결하고 명확하게 답한다. "
             "관련 시험항목과 절차(명령/판정)를 정리해 설명한다. 검색 데이터에 없는 내용은 추측하지 말고 '학습된 데이터에 없습니다'라고 답한다.")
    user_p = f"[검색된 학습 데이터]{ctx if ctx.strip() else ' (없음)'}\n\n[질문] {query}"
    body = {"model": llm.get("model") or "", "messages": [{"role": "system", "content": sys_p}, {"role": "user", "content": user_p}],
            "temperature": 0.3, "max_tokens": 1500}
    headers = {"Content-Type": "application/json"}
    if llm.get("apikey"):
        headers["Authorization"] = f"Bearer {llm['apikey']}"
    url = str(llm["endpoint"]).rstrip("/") + "/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            r = await client.post(url, headers=headers, json=body)
            if r.status_code != 200:
                return {"ok": False, "error": f"LLM {r.status_code}: {r.text[:300]}", "matched": matched}
            answer = (((r.json().get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    except Exception as e:
        return {"ok": False, "error": str(e)[:300], "matched": matched}
    return {"ok": True, "answer": answer, "matched": matched}

# ── AI 사용 로그 / 피드백 / 통계 ──
AI_USAGE_FILE = core.DATA_DIR / "state" / "ai_usage.json"


def _est_tokens(text):
    return max(0, round(len(str(text or "")) / 3))   # 한글·혼합 대략 3자/토큰

def _log_ai_usage(token, model, kind, question, answer, usage=None):
    try:
        store = core.load_items_store(AI_USAGE_FILE)
        pin = (usage or {}).get("prompt_tokens")
        pout = (usage or {}).get("completion_tokens")
        if pin is None:
            pin = _est_tokens(question)
        if pout is None:
            pout = _est_tokens(answer)
        store["items"].insert(0, {
            "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "user": core.user_of(token) or "(미상)",
            "model": str(model or ""),
            "kind": str(kind or "chat"),
            "question": str(question or "")[:500],
            "tokens_in": int(pin or 0),
            "tokens_out": int(pout or 0),
            "tokens": int((pin or 0) + (pout or 0)),
            "estimated": usage is None,
        })
        store["items"] = store["items"][:20000]
        core.save_items_store(AI_USAGE_FILE, store)
    except Exception:
        pass

@router.post("/api/ai/usage")
async def ai_usage_post(payload: dict, token: str = ""):
    _log_ai_usage(token, payload.get("model"), payload.get("kind"),
                  payload.get("question"), payload.get("answer"), payload.get("usage"))
    return {"ok": True}

@router.post("/api/ai/feedback")
async def ai_feedback_save(payload: dict, token: str = ""):
    store = core.load_items_store(core.FEEDBACK_FILE)
    item = {
        "id": "fb-" + str(int(datetime.now().timestamp() * 1000)),
        "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "by": core.user_of(token) or str(payload.get("by") or "") or "(미상)",
        "model": str(payload.get("model") or ""),
        "thumb": int(payload.get("thumb") or 0),
        "score": int(payload.get("score") or 0),
        "reasons": [str(r)[:80] for r in (payload.get("reasons") or [])][:12] if isinstance(payload.get("reasons"), list) else [],
        "comment": str(payload.get("comment") or "")[:2000],
        "question": str(payload.get("question") or "")[:2000],
        "answer": str(payload.get("answer") or "")[:4000],
    }
    store["items"].insert(0, item)
    core.save_items_store(core.FEEDBACK_FILE, store)
    return {"ok": True, "id": item["id"], "count": len(store["items"])}

@router.get("/api/ai/feedback")
async def ai_feedback_list(limit: int = 300):
    return {"items": core.load_items_store(core.FEEDBACK_FILE).get("items", [])[:max(1, min(limit, 2000))]}

@router.delete("/api/ai/feedback/{fid}")
async def ai_feedback_del(fid: str, token: str = ""):
    store = core.load_items_store(core.FEEDBACK_FILE)
    store["items"] = [it for it in store["items"] if it.get("id") != fid]
    core.save_items_store(core.FEEDBACK_FILE, store)
    return {"ok": True}

@router.get("/api/ai/stats")
async def ai_stats(days: int = 30):
    from datetime import timedelta
    items = core.load_items_store(AI_USAGE_FILE).get("items", [])
    fb = core.load_items_store(core.FEEDBACK_FILE).get("items", [])
    if days and days > 0:
        cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        items = [it for it in items if str(it.get("at", ""))[:10] >= cutoff]
    # user → 조직 매핑
    umap = {}
    try:
        for u in core.users_load_sync().get("users", []):
            for key in (u.get("name"), u.get("username")):
                if key:
                    umap[key] = u
    except Exception:
        pass
    by_user, by_model, by_org, by_day = {}, {}, {}, {}
    for it in items:
        u = it.get("user") or "(미상)"
        m = it.get("model") or "(미상)"
        day = str(it.get("at", ""))[:10]
        tk = int(it.get("tokens") or 0); ti = int(it.get("tokens_in") or 0); to = int(it.get("tokens_out") or 0)
        du = by_user.setdefault(u, {"user": u, "questions": 0, "tokens_in": 0, "tokens_out": 0, "tokens": 0})
        du["questions"] += 1; du["tokens_in"] += ti; du["tokens_out"] += to; du["tokens"] += tk
        dm = by_model.setdefault(m, {"model": m, "questions": 0, "tokens": 0})
        dm["questions"] += 1; dm["tokens"] += tk
        urec = umap.get(u)
        org = "(미지정)"
        if urec:
            org = " ▸ ".join([x for x in [urec.get("company"), urec.get("dept"), urec.get("team")] if x]) or "(미지정)"
        do = by_org.setdefault(org, {"org": org, "questions": 0, "tokens": 0, "_users": set()})
        do["questions"] += 1; do["tokens"] += tk; do["_users"].add(u)
        if day:
            dd = by_day.setdefault(day, {"day": day, "messages": 0, "tokens": 0})
            dd["messages"] += 1; dd["tokens"] += tk
    users = sorted(by_user.values(), key=lambda x: x["tokens"], reverse=True)
    models = sorted(by_model.values(), key=lambda x: x["tokens"], reverse=True)
    orgs = sorted([{"org": o["org"], "questions": o["questions"], "tokens": o["tokens"], "users": len(o["_users"])} for o in by_org.values()],
                  key=lambda x: x["tokens"], reverse=True)
    daily = sorted(by_day.values(), key=lambda x: x["day"])
    scored = [int(f.get("score") or 0) for f in fb if f.get("score")]
    fb_avg = round(sum(scored) / len(scored), 2) if scored else 0
    return {"users": users, "models": models, "orgs": orgs, "daily": daily,
            "total_questions": len(items), "total_tokens": sum(int(it.get("tokens") or 0) for it in items),
            "distinct_users": len(by_user), "days": days,
            "feedback_count": len(fb), "feedback_avg": fb_avg, "recent": items[:50]}


@router.post("/api/convert/markdown")
async def convert_to_markdown(file: UploadFile = File(...)):
    name = (file.filename or "").strip()
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "빈 파일입니다")
    # 20MB 제한 — 이보다 큰 규격서는 통째로 넣기보다 나눠 올리는 게 낫다
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(413, "20MB 이하 파일만 변환합니다")

    ext = Path(name).suffix.lower()
    if ext in (".md", ".markdown", ".txt"):
        return {"markdown": raw.decode("utf-8", "replace"), "source": name}

    try:
        from markitdown import MarkItDown
    except ImportError:
        raise HTTPException(
            501,
            "문서 변환 기능이 설치되지 않았습니다. requirements.txt 의 markitdown 을 "
            "설치한 뒤 서버를 다시 띄우세요.",
        )

    # markitdown 은 파일 경로를 받는다. 임시 파일로 떨군 뒤 지운다.
    import tempfile
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(suffix=ext or ".bin", delete=False) as fh:
            fh.write(raw)
            tmp = fh.name
        md = MarkItDown(enable_plugins=False).convert(tmp).text_content or ""
    except Exception as e:
        raise HTTPException(422, f"변환하지 못했습니다: {e}") from e
    finally:
        if tmp:
            try:
                os.unlink(tmp)
            except OSError:
                pass

    return {"markdown": md, "source": name}


# ───────────────────────────────────────────
# 요구사항 구현내용 → 벡터 저장
#
# 마크다운을 제목(##) 단위로 자른다. 문단 길이로 자르면 '## 판정 기준' 의
# 표가 반토막 나서, 나중에 이 조각으로 시험항목을 만들 때 기준을 놓친다.
# ───────────────────────────────────────────
def _split_markdown(md: str, max_chars: int = 1200) -> list[str]:
    """제목 단위로 자르되, 한 절이 너무 길면 줄 단위로 더 쪼갠다."""
    lines = (md or "").splitlines()
    blocks: list[list[str]] = [[]]
    for ln in lines:
        if ln.lstrip().startswith("#") and blocks[-1]:
            blocks.append([])
        blocks[-1].append(ln)

    out: list[str] = []
    for b in blocks:
        text = "\n".join(b).strip()
        if not text:
            continue
        if len(text) <= max_chars:
            out.append(text)
            continue
        cur: list[str] = []
        size = 0
        for ln in b:
            if size + len(ln) > max_chars and cur:
                out.append("\n".join(cur).strip())
                cur, size = [], 0
            cur.append(ln)
            size += len(ln) + 1
        if cur:
            out.append("\n".join(cur).strip())
    return [c for c in out if c]


class ReqEmbedIn(BaseModel):
    text: str


@router.post("/api/req/{req_id}/embed")
async def embed_requirement(req_id: str, body: ReqEmbedIn):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "구현내용이 비어 있습니다")

    chunks = _split_markdown(text)
    if not chunks:
        raise HTTPException(400, "저장할 내용이 없습니다")

    vecs = await _embed_texts(chunks)
    if not vecs:
        raise HTTPException(
            503,
            "임베딩 서버가 설정되지 않았습니다. 시스템 > RAG 설정에서 embed_url 을 "
            "지정하세요. (구현내용은 요구사항에 이미 저장되어 있습니다)",
        )

    import numpy as _np
    async with db.pool().acquire() as c:
        async with c.transaction():
            # 같은 요구사항의 옛 조각은 지우고 새로 넣는다 — 수정본과 옛 본이
            # 같이 검색되면 어느 것이 맞는지 알 수 없다.
            await c.execute("DELETE FROM rag_embed WHERE key LIKE $1", f"req:{req_id}#%")
            for i, (chunk, vec) in enumerate(zip(chunks, vecs)):
                await c.execute(
                    "INSERT INTO rag_embed (key, embed, meta) VALUES ($1,$2,$3::jsonb)",
                    f"req:{req_id}#{i}",
                    _np.asarray(vec, dtype="float32").tobytes(),
                    {"req_id": req_id, "chunk": i, "text": chunk},
                )
    return {"success": True, "chunks": len(chunks)}


# ───────────────────────────────────────────
# 라우터 - 매뉴얼 학습 (AI 참고 문서)
# ───────────────────────────────────────────
MANUALS_DIR = core.DATA_DIR / "manuals"
def init_manuals_dir():
    MANUALS_DIR.mkdir(parents=True, exist_ok=True)

MANUAL_FOLDERS_FILE = core.DATA_DIR / "state" / "manual_folders.json"

@router.get("/api/manual-folders")
async def manual_folders_get():
    try:
        if MANUAL_FOLDERS_FILE.exists():
            d = core.load_json(MANUAL_FOLDERS_FILE)
            if isinstance(d, dict) and isinstance(d.get("folders"), list):
                return {"folders": d["folders"]}
    except Exception:
        pass
    return {"folders": []}

@router.post("/api/manual-folders")
async def manual_folders_set(payload: dict, token: str = ""):
    folders = []
    for f in (payload.get("folders") or []):
        nm = str(f or "").strip()[:60]
        if nm and nm not in folders:
            folders.append(nm)
    core.save_json(MANUAL_FOLDERS_FILE, {"folders": folders})
    return {"ok": True, "folders": folders}

@router.get("/api/manuals")
async def get_manuals():
    out = []
    for d in await db.manuals_list_full():
        out.append({
            "id": d.get("id"), "name": d.get("name", ""),
            "chars": d.get("chars", len(d.get("text", ""))),
            "active": d.get("active", True),
            "source": d.get("source", ""),
            "created_at": d.get("created_at", ""),
            "folder": d.get("folder", ""),
            "image_count": len(d.get("images") or []),
        })
    return {"manuals": out}

@router.get("/api/manual/{mid}")
async def get_manual(mid: str, images: bool = True):
    d = await db.manuals_get(mid)
    if d is None:
        raise HTTPException(404, "매뉴얼을 찾을 수 없습니다")
    # 이미지 제외 옵션 — 큰 base64 없이 메타·텍스트만 (기본은 기존 호환)
    if not images and isinstance(d, dict):
        d = {k: v for k, v in d.items() if k != "images"}
    return d

@router.get("/api/manual/{mid}/images")
async def get_manual_images(mid: str):
    """이미지만 별도 fetch — 청크 화면에서 지연 로드용"""
    d = await db.manuals_get(mid)
    if d is None:
        raise HTTPException(404, "매뉴얼을 찾을 수 없습니다")
    return {"images": d.get("images") or []}

@router.post("/api/manual/{mid}")
async def save_manual(mid: str, data: dict):
    data["id"] = mid
    if "chars" not in data:
        data["chars"] = len(data.get("text", ""))
    await db.manuals_upsert(mid, data)
    return {"success": True}

@router.delete("/api/manual/{mid}")
async def delete_manual(mid: str):
    await db.manuals_delete(mid)
    return {"success": True}


@router.get("/api/prompts")
async def get_prompts():
    if core.PROMPTS_FILE.exists():
        return core.load_json(core.PROMPTS_FILE)
    return {}

@router.post("/api/prompts")
async def save_prompts(data: dict):
    core.PROMPTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    core.save_json(core.PROMPTS_FILE, data)
    return {"ok": True}


# AI 채팅 기록(세션) — 전체 공유(서버 단일 저장). 다른 사용자 질문도 보임.
# id 기준 업서트/삭제로 병합(전체 덮어쓰기 방지 → 동시 작성 안전).
def _chat_load_all():
    d = core.kv_load_sync("chat_sessions", {"sessions": []})
    if isinstance(d, dict) and isinstance(d.get("sessions"), list):
        return d["sessions"]
    return []

def _chat_save_all(sessions):
    core.kv_save_sync("chat_sessions", {"sessions": sessions})

@router.get("/api/chat-sessions")
async def get_chat_sessions(token: str = ""):
    # 일반 사용자는 본인 채팅만, 관리자는 전원 채팅을 모두 열람
    alls = _chat_load_all()
    u = core.user_from_token(token)
    if not u:
        return {"sessions": []}
    if u.get("role") == "관리자":
        return {"sessions": alls}
    uname = u.get("username")
    return {"sessions": [s for s in alls if isinstance(s, dict) and s.get("user") == uname]}

@router.post("/api/chat-sessions")
async def upsert_chat_sessions(data: dict, token: str = ""):
    u = core.user_from_token(token)
    uname = u.get("username") if u else None
    is_admin = bool(u and u.get("role") == "관리자")
    sessions = _chat_load_all()
    idx = {}
    for i, s in enumerate(sessions):
        if isinstance(s, dict) and s.get("id"):
            idx[s["id"]] = i
    incoming = []
    if isinstance(data.get("session"), dict):
        incoming = [data["session"]]
    elif isinstance(data.get("sessions"), list):
        incoming = [s for s in data["sessions"] if isinstance(s, dict)]
    for s in incoming:
        sid = s.get("id")
        if not sid:
            continue
        if not s.get("user"):           # 소유자 보장: 누락 시 현재 사용자로
            s["user"] = uname or "default"
        if sid in idx:
            old = sessions[idx[sid]]
            owner = old.get("user") if isinstance(old, dict) else None
            if not is_admin and owner and owner != uname:
                continue                # 일반 사용자는 남의 세션을 덮어쓸 수 없음
            sessions[idx[sid]] = s
        else:
            idx[sid] = len(sessions)
            sessions.append(s)
    _chat_save_all(sessions)
    try:
        await core.broadcast({"type": "chat_update"})
    except Exception:
        pass
    return {"ok": True, "count": len(sessions)}

@router.post("/api/chat-sessions/delete")
async def delete_chat_session(data: dict, token: str = ""):
    u = core.user_from_token(token)
    uname = u.get("username") if u else None
    is_admin = bool(u and u.get("role") == "관리자")
    sid = data.get("id")
    kept = []
    for s in _chat_load_all():
        if isinstance(s, dict) and s.get("id") == sid and (is_admin or s.get("user") == uname or not s.get("user")):
            continue                    # 소유자/관리자/주인없음 → 삭제, 그 외엔 보존
        kept.append(s)
    _chat_save_all(kept)
    try:
        await core.broadcast({"type": "chat_update"})
    except Exception:
        pass
    return {"ok": True}


# ── 자연어로 시험 짜기 ──────────────────────────────────────
#
# 「E5724RL 시스템 정보 시험해줘」 한 줄로 돌아가게 하는 자리.
#
# **LLM 이 시험을 지어내게 하지 않는다.** 있는 TC 중에서 고르게만 한다.
# 스텝을 자유롭게 만들게 하면 그럴듯한데 틀린 시험이 나오고, 그건 사람이
# 검토하는 데 더 오래 걸린다. 고르게 하면 결과가 「이 3건」 이라 눈으로
# 바로 확인된다.
#
# 고른 뒤에 무엇을 할지는 화면이 정한다 — 여기서는 계획만 돌려준다.

_NL_SCHEMA = {
    "type": "object",
    "properties": {
        "model": {"type": "string"},
        "tcids": {"type": "array", "items": {"type": "string"}},
        "device_ip": {"type": "string"},
        "why": {"type": "string"},
    },
    "required": ["tcids", "why"],
}


@router.post("/api/nl/plan")
async def nl_plan(payload: dict):
    """말 한 줄 → 돌릴 시험 목록. 고르기만 하고 실행하지는 않는다."""
    text = str(payload.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "무엇을 시험할지 적어 주세요")

    tcs = await db.tc_list_meta()
    models = [c["name"] for c in await db.catalog_list("model")]
    devices = await db.device_list()
    reqs = await db.req_list_full()

    # 근거를 넓게 준다.
    #
    # TC 이름만 보고 고르면 「시스템 정보」 같은 말에는 맞지만 「Gi0/1 링크
    # 시험」 처럼 장비·포트를 가리키는 말에는 못 맞춘다. 어떤 장비가 있고
    # 무슨 포트가 달렸는지, 그 시험이 어느 요구사항 아래인지까지 함께
    # 준다 — 위에서부터 쌓인 것이 다 근거다.
    req_by_id = {}
    for r in reqs:
        rid = str(r.get("reqid") or r.get("id") or "")
        if rid:
            req_by_id[rid] = str(r.get("title") or "")

    lines = []
    for t in tcs:
        nm = str(t.get("name") or "").strip()
        if not nm:
            continue
        rt = req_by_id.get(str(t.get("req_id") or ""), "")
        lines.append(f"{t.get('tcid')}\t{nm}\t{rt}")

    dev_lines = []
    for d in devices:
        if d.get("role") == "계측기":
            continue
        ifs = [str(i.get("name")) for i in (d.get("interfaces") or [])][:12]
        dev_lines.append(
            f"{d.get('ip')}\t{d.get('model') or ''}\t{d.get('role') or ''}"
            f"\t포트: {', '.join(ifs) or '(등록 안 됨)'}"
        )

    sys_p = (
        "너는 네트워크 장비 시험 담당자를 돕는다. 사람이 한 말에 맞는 시험을 "
        "**아래 목록에서 고르기만** 한다. 목록에 없는 tcid 는 절대 만들지 않는다. "
        "맞는 것이 없으면 tcids 를 빈 배열로 두고 why 에 그렇게 적는다. "
        "말에 장비나 모델이 나오면 model 과 device_ip 에 **등록된 것 중에서** 골라 적는다. "
        "why 는 왜 이것들을 골랐는지 한국어 한두 문장."
    )
    user_p = (
        f"사람이 한 말: {text}\n\n"
        f"등록된 모델: {', '.join(models) or '(없음)'}\n\n"
        "등록된 장비 (IP<TAB>모델<TAB>역할<TAB>포트):\n" + "\n".join(dev_lines) + "\n\n"
        "시험 목록 (tcid<TAB>이름<TAB>요구사항):\n" + "\n".join(lines)
    )

    ans, err = await _ai_chat(
        [{"role": "system", "content": sys_p}, {"role": "user", "content": user_p}],
        max_tokens=800,
        json_schema=_NL_SCHEMA,
    )
    if err:
        raise HTTPException(502, err)

    plan, perr = _json_from_llm(ans)
    if plan is None:
        raise HTTPException(502, f"AI 응답을 읽지 못했습니다 — {perr}")
    if isinstance(plan, list):
        plan = {"tcids": [x for x in plan if isinstance(x, str)], "why": ""}
    if not isinstance(plan, dict):
        raise HTTPException(502, f"AI 응답이 예상 밖입니다 — {str(ans)[:200]}")

    # 지어낸 tcid 를 걸러낸다. 없는 것을 돌리려다 실패하면 왜인지 알기 어렵다
    known = {str(t.get("tcid")) for t in tcs}
    picked = [x for x in (plan.get("tcids") or []) if str(x) in known]
    dropped = [x for x in (plan.get("tcids") or []) if str(x) not in known]
    by_id = {str(t.get("tcid")): t for t in tcs}

    # 장비도 실제로 있는 것만 남긴다
    dev_ips = {str(d.get("ip")) for d in devices}
    dev_ip = str(plan.get("device_ip") or "")
    return {
        "model": plan.get("model") or "",
        "device_ip": dev_ip if dev_ip in dev_ips else "",
        "why": plan.get("why") or "",
        "tcs": [
            {"tcid": x, "name": by_id[str(x)].get("name") or "", "req_id": by_id[str(x)].get("req_id") or ""}
            for x in picked
        ],
        # 지어낸 것이 있었다는 사실도 알려 준다 — 조용히 지우면 왜 빠졌는지 모른다
        "dropped": dropped,
    }


def _json_from_llm(text):
    """LLM 이 돌려준 글에서 JSON 을 꺼낸다.

    `guided_json` 을 줘도 모델이 ```json 울타리를 씌워 보내는 일이 흔하다
    (gemma 가 그렇다). 앞뒤에 설명을 한 줄 붙이기도 한다. 그대로
    `json.loads` 하면 「AI 응답을 읽지 못했습니다」 만 뜨고, 무엇이 왔는지
    알 수가 없다.

    울타리를 벗기고, 그래도 안 되면 첫 `{` 부터 짝이 맞는 `}` 까지를 잘라
    본다. 끝내 못 읽으면 받은 글을 함께 돌려줘 화면이 보여 줄 수 있게 한다.
    """
    s = str(text or "").strip()
    if not s:
        return None, "빈 응답"
    # ```json … ``` 벗기기
    if s.startswith("```"):
        s = s.split("\n", 1)[-1]
        if s.rstrip().endswith("```"):
            s = s.rstrip()[:-3]
        s = s.strip()
    try:
        return json.loads(s), None
    except Exception:
        pass
    # 첫 { 부터 짝이 맞는 } 까지
    start = s.find("{")
    if start >= 0:
        depth, in_str, esc = 0, False, False
        for i in range(start, len(s)):
            ch = s[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(s[start:i + 1]), None
                    except Exception:
                        break
    return None, "받은 글: " + str(text or "")[:300]


@router.post("/api/nl/tc")
async def nl_make_tc(payload: dict):
    """말 한 줄 → **새 시험 초안**. 만들기만 하고 저장·실행은 화면이 한다."""
    text = str(payload.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "무엇을 시험할지 적어 주세요")
    # 설정 시험(링크 down/up 같은 것)은 사람이 켤 때만 만든다. 기본은 조회다.
    allow_config = bool(payload.get("allow_config"))

    devices = [d for d in await db.device_list() if d.get("role") != "계측기"]
    tcs = await db.tc_list_full()

    # 이 랩에서 실제로 통한 명령을 모은다.
    #
    # 이것이 이 기능의 근거다. 일반적인 네트워크 지식으로 명령을 지으면
    # 이 장비에서 안 통하는 것이 나온다. 여기서 실제로 오간 것을 주면
    # 「이 장비가 알아듣는 말」 안에서 고르게 된다.
    seen, cmds = set(), []
    for tc in tcs:
        for c in (tc.get("checks") or []):
            cli = str((c or {}).get("cli") or "").strip()
            if not cli or not core.is_read_only(cli):
                continue
            head = cli.splitlines()[0].strip()
            if head in seen:
                continue
            seen.add(head)
            cmds.append(head)
    cmds = cmds[:120]

    # 비슷한 시험의 판정기준을 예로 준다 — 무엇을 어떻게 보는지의 본
    samples = []
    for tc in tcs[:40]:
        for c in (tc.get("checks") or [])[:3]:
            cli = str((c or {}).get("cli") or "").strip()
            cr = str((c or {}).get("criteria") or "").strip()
            if cli and cr and core.is_read_only(cli):
                samples.append(f"{cli.splitlines()[0]} → [{c.get('type') or 'contains'}] {cr}")
        if len(samples) >= 25:
            break

    dev_lines = [
        f"{d.get('ip')}\t{d.get('model') or ''}\t{d.get('role') or ''}"
        for d in devices
    ]

    sys_p = (
        "너는 네트워크 장비 시험 절차를 짠다. 사람이 말한 것을 확인할 수 있는 "
        "**조회 시험**을 만든다.\n"
        "규칙:\n"
        "1. 명령은 아래 「이 랩에서 통한 명령」 에 있는 것을 그대로 쓰거나 그 꼴을 따른다. "
        "일반적인 지식으로 새 명령을 지어내지 않는다.\n"
        + ("2. **설정 시험이다.** 아래만 쓸 수 있다 — configure terminal · interface <이름> · "
           "shutdown · no shutdown · end · exit, 그리고 조회 명령(show…). "
           "reload·write·copy·erase·factory 는 절대 쓰지 않는다.\n"
           "2-1. 링크를 내렸으면 **반드시 다시 올린다**(no shutdown). 내려 둔 채 끝내면 "
           "다음 시험이 전부 깨진다.\n"
           "2-2. 상태가 반영되기까지 시간이 걸린다 — 내리고/올린 **뒤에 wait 스텝**을 둔다.\n"
           if allow_config else
           "2. **조회 명령만.** configure·write·reload·no·set·clear 같은 것은 절대 쓰지 않는다.\n")
        + "3. **스텝마다 판정기준(criteria)을 반드시 적는다.** 비워 두면 그 스텝은 "
        "돌기만 하고 아무것도 확인하지 못한다. 출력에 늘 나오는 **항목 이름**을 "
        "기준으로 삼으면 안전하다 — 값은 장비마다 다르지만 이름은 같다. "
        "예: `show cpu usage` → `Average CPU load`, `show memory usage` → `Total`. "
        "확인할 문구를 딱 집기 애매하면 **type 을 ok** 로 둔다 — 「명령이 오류 없이 "
        "응답하면 합격」 이라는 뜻이고, 조회 시험은 대개 이것이면 된다. criteria 는 "
        "비워 둔다. type 은 contains(문구 포함) · contains_all(콤마로 여럿, 모두 포함) · "
        "ok(오류만 없으면) 중 하나. none 은 쓰지 않는다.\n"
        "4. 스텝은 2~10개. 많을수록 좋은 것이 아니다.\n"
        "5. desc 는 그 스텝이 무엇을 확인하는지 한국어 한 줄.\n"
        "6. 스텝 종류(kind): cli(명령·기본) · wait(기다리기, waitSec 초) · "
        "loop(여기부터 아래를 loopCount 번 되풀이). loop 는 되풀이할 묶음 **앞**에 한 번 둔다.\n"
        "7. 장비가 둘이면 session 으로 가른다 — 0 이 첫 장비, 1 이 둘째. "
        "device_ips 에 쓴 차례와 같다. 장비가 하나면 session 은 적지 않는다.\n\n"
        "아래 꼴 그대로, **다른 말 없이 JSON 만** 답한다:\n"
        '{"name":"E5724RL 시스템 정보 확인","object":"모델명과 메모리를 확인한다",'
        '"device_ip":"210.1.1.254","steps":['
        '{"desc":"모델명을 확인한다","cli":"show system","type":"contains","criteria":"E5724RL"},'
        '{"desc":"CPU 사용량이 조회되는지 확인한다","cli":"show cpu usage","type":"ok","criteria":""}'
        ']}'
        + ("\n설정 시험 예 (링크를 내렸다 올리며 상대 장비에서 확인):\n"
           '{"name":"gi0/1 링크 down/up 100회","object":"링크를 내렸다 올리며 상대에서 상태를 본다",'
           '"device_ips":["210.1.1.254","210.1.1.253"],"steps":['
           '{"desc":"100회 되풀이","kind":"loop","loopCount":100},'
           '{"desc":"A 장비 gi0/1 을 내린다","kind":"cli","session":0,'
           '"cli":"configure terminal\\ninterface gi0/1\\nshutdown","type":"ok","criteria":""},'
           '{"desc":"상태가 반영되기를 기다린다","kind":"wait","waitSec":2},'
           '{"desc":"B 장비에서 링크가 내려갔는지 본다","kind":"cli","session":1,'
           '"cli":"show interface gi0/2","type":"contains","criteria":"down"},'
           '{"desc":"A 장비 gi0/1 을 올린다","kind":"cli","session":0,'
           '"cli":"configure terminal\\ninterface gi0/1\\nno shutdown","type":"ok","criteria":""},'
           '{"desc":"상태가 반영되기를 기다린다","kind":"wait","waitSec":2},'
           '{"desc":"B 장비에서 링크가 올라왔는지 본다","kind":"cli","session":1,'
           '"cli":"show interface gi0/2","type":"contains","criteria":"up"}'
           ']}'
           if allow_config else "")
    )
    user_p = (
        f"사람이 한 말: {text}\n\n"
        "등록된 장비 (IP<TAB>모델<TAB>역할):\n" + "\n".join(dev_lines) + "\n\n"
        "이 랩에서 통한 명령:\n" + "\n".join(cmds) + "\n\n"
        "판정기준 예:\n" + "\n".join(samples)
    )

    ans, err = await _ai_chat(
        [{"role": "system", "content": sys_p}, {"role": "user", "content": user_p}],
        max_tokens=1400,
        json_schema=core.TC_SCHEMA,
    )
    if err:
        raise HTTPException(502, err)
    draft, perr = _json_from_llm(ans)
    if draft is None:
        raise HTTPException(502, f"AI 응답을 읽지 못했습니다 — {perr}")

    # 최상위를 배열로 보내는 일이 있다. 스키마를 줘도 그렇다.
    #   · [{...steps...}]        → 스텝 목록 그 자체
    #   · [{"name":…, "steps":…}] → 감싼 것이 하나뿐
    # 여기서 받아 주지 않으면 500 이 나고, 화면에는 이유가 안 보인다.
    if isinstance(draft, list):
        if len(draft) == 1 and isinstance(draft[0], dict) and "steps" in draft[0]:
            draft = draft[0]
        else:
            draft = {"name": text[:40], "steps": [x for x in draft if isinstance(x, dict)]}
    if not isinstance(draft, dict):
        raise HTTPException(502, f"AI 응답이 예상 밖입니다 — {str(ans)[:200]}")

    # 조회가 아닌 명령은 잘라낸다. 조용히 지우지 않고 무엇을 왜 뺐는지 알린다
    # 모델이 스키마를 무시하고 제 나름의 이름을 쓴다.
    #
    #   {"cmd": "show version", "criteria": "contains", "value": "E4300"}
    #
    # `cmd` 가 명령이고 `criteria` 자리에 **판정 종류**가, `value` 에 기준이
    # 들어 있다. 이름 하나 다르다고 빈 화면을 보여 줄 이유가 없다.
    _TYPES = {"contains", "contains_all", "notcontains", "line", "ok", "none", "expr", "table"}

    def _pick(s, *names):
        for n in names:
            v = s.get(n)
            if v not in (None, ""):
                return str(v).strip()
        return ""

    def _num(v, dflt=0):
        try:
            return type(dflt)(v)
        except Exception:
            return dflt

    keep, cut = [], []
    for s in (draft.get("steps") or []):
        if not isinstance(s, dict):
            continue

        # 명령이 아닌 스텝 — 되풀이(loop)·기다리기(wait). cli 가 없어도 산다.
        skind = _pick(s, "kind", "step_kind").lower()
        if skind in ("loop", "wait"):
            row = {"desc": _pick(s, "desc", "description", "purpose"), "kind": skind}
            if skind == "loop":
                row["loopCount"] = max(1, _num(s.get("loopCount") or s.get("count"), 1))
            else:
                row["waitSec"] = max(0.1, _num(s.get("waitSec") or s.get("sec"), 1.0))
            keep.append(row)
            continue

        cli = _pick(s, "cli", "cmd", "command", "input")
        if not cli:
            continue
        # 설정 시험이면 허용 목록까지, 아니면 조회만. 어느 쪽이든 되돌릴 수
        # 없는 명령은 못 지나간다.
        ok_cmd = core.config_allowed(cli) if allow_config else core.is_read_only(cli)
        if not ok_cmd:
            cut.append(cli.splitlines()[0])
            continue
        kind = _pick(s, "type", "judge", "mode")
        crit = _pick(s, "criteria", "value", "expected", "expect")
        # `criteria` 자리에 종류가 들어온 경우 — 서로 바꿔 놓는다
        if not kind and crit in _TYPES:
            kind, crit = crit, _pick(s, "value", "expected", "expect")
        if kind not in _TYPES:
            kind = "contains" if crit else "ok"
        # 기준이 비었는데 문구를 보라고 온 것은 판정을 못 한다.
        # 「오류만 없으면 합격」 으로 돌린다 — 조회 시험의 기본값이다.
        if kind in ("contains", "contains_all", "notcontains", "line") and not crit:
            kind = "ok"
        row = {
            "desc": _pick(s, "desc", "description", "purpose"),
            "kind": "cli",
            "cli": cli,
            "type": kind,
            "criteria": crit,
        }
        # 장비가 둘 이상일 때만 세션을 싣는다 — 하나뿐이면 0 이 당연해서 군더더기다
        if s.get("session") is not None:
            row["session"] = max(0, _num(s.get("session"), 0))
        keep.append(row)

    dev_ips = {str(d.get("ip")) for d in devices}
    ip = str(draft.get("device_ip") or "")
    ips = [str(x) for x in (draft.get("device_ips") or []) if str(x) in dev_ips]
    if not ips and ip in dev_ips:
        ips = [ip]
    return {
        "name": str(draft.get("name") or draft.get("title") or "").strip() or text[:40],
        "object": str(draft.get("object") or "").strip(),
        "device_ip": ips[0] if ips else "",
        "device_ips": ips,
        "steps": keep,
        "cut": cut,
        "allow_config": allow_config,
    }


# ───────────────────────────────────────────
# 라우터 - 로컬 LLM 프록시
# ───────────────────────────────────────────
class LocalLLMRequest(BaseModel):
    endpoint: str
    model: str
    messages: list
    max_tokens: int = 4096
    context_size: int = 262144
    temperature: float = 0.7
    apikey: str = ""

@router.get("/api/chat/local/models")
async def get_local_models(endpoint: str):
    import httpx
    url = endpoint.rstrip("/") + "/models"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            return r.json()
    except Exception as e:
        return {"error": str(e)}

@router.post("/api/chat/local/stream")
async def chat_local_stream(req: LocalLLMRequest):
    import httpx
    from fastapi.responses import StreamingResponse
    url = req.endpoint.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if req.apikey:
        headers["Authorization"] = f"Bearer {req.apikey}"
    safe_max_tokens = min(req.max_tokens, req.context_size, 4096)
    body = {
        "model": req.model,
        "messages": req.messages,
        "max_tokens": safe_max_tokens,
        "temperature": req.temperature,
        "stream": True,
    }
    async def generate():
        import json as _json
        # timeout: read=None(무제한 스트림). aiter_bytes 로 즉시 오는 바이트를 라인 단위로 파싱해 각 delta 를 곧바로 yield
        # (aiter_lines 는 라인이 완성될 때까지 잡아두는 구현이 있어 첫 청크가 지연 도착하면 전체가 한꺼번에 오는 것처럼 보일 수 있음)
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=None, write=10.0, pool=10.0)) as client:
            async with client.stream("POST", url, headers=headers, json=body) as r:
                _buf = b""
                async for _chunk in r.aiter_bytes():
                    if not _chunk:
                        continue
                    _buf += _chunk
                    while True:
                        _nl = _buf.find(b"\n")
                        if _nl < 0:
                            break
                        _line = _buf[:_nl].decode("utf-8", errors="ignore").rstrip("\r")
                        _buf = _buf[_nl+1:]
                        if not _line.startswith("data: "):
                            continue
                        data = _line[6:]
                        if data.strip() == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return
                        try:
                            ch = _json.loads(data)
                            delta = ch["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield f"data: {_json.dumps({'text': delta})}\n\n"
                        except Exception:
                            pass
    # X-Accel-Buffering: no — Nginx/역방향 프록시 앞단이 있을 때 SSE 청크 버퍼링 방지(즉시 flush)
    # Content-Encoding: identity — 상위 GZipMiddleware 가 이미 인코딩된 응답으로 인식해 재압축을 스킵함
    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache",
                                      "Connection": "keep-alive", "Content-Encoding": "identity"})

# ───────────────────────────────────────────
# 라우터 - Dify ChatFlow 지식 어시스턴트 (OpenWebUI Functions 이식)
# API 키/URL 은 서버에만 보관(브라우저로 노출하지 않음). 환경변수로 덮어쓸 수 있다.
# 프론트는 assistant id(specs/qag/trouble) 만 보낸다.
# ───────────────────────────────────────────
DIFY_BASE_URL = os.environ.get("DIFY_BASE_URL", "http://10.10.30.219:3897/v1")
# file_var: 첨부 파일을 받을 ChatFlow 입력변수 이름(Dify Start 노드의 File 변수). 빈 값이면 message files 로 전달.
_DIFY_FILE_VAR = os.environ.get("DIFY_FILE_VAR", "log_file")
# 지식 어시스턴트는 하드코딩하지 않는다 — LLM 설정 화면에서 관리(dify_assistants.json). API 키는 그 파일(서버)에만 존재한다.

# ── 지식 어시스턴트(Dify) 동적 관리 — 서버측 저장(dify_assistants.json). API 키는 프론트로 노출하지 않음 ──
DIFY_FILE = core.DATA_DIR / "integrations" / "dify_assistants.json"

def _dify_load():
    """저장된 Dify 어시스턴트 목록 — LLM 설정(dify_assistants.json)에서만 관리. 하드코딩/자동 시드 없음."""
    try:
        data = core.load_json(DIFY_FILE)
    except Exception:
        data = None
    lst = data.get("assistants") if isinstance(data, dict) else None
    return lst or []

def _dify_save(lst):
    core.save_json(DIFY_FILE, {"assistants": lst})

def _dify_get(aid):
    aid = (aid or "").strip()
    for a in _dify_load():
        if a.get("id") == aid:
            return a
    return None

def _dify_slug(name, lst):
    base = "".join(ch if (ord(ch) < 128 and ch.isalnum()) else "-" for ch in (name or "").lower()).strip("-") or ("dify" + str(len(lst) + 1))
    aid, n = base, 2
    while any(a.get("id") == aid for a in lst):
        aid = base + "-" + str(n); n += 1
    return aid

@router.get("/api/dify/assistants")
async def dify_assistants_list():
    # 키는 빼고 has_key 만 반환 — 브라우저로 API 키를 보내지 않는다
    out = []
    for a in _dify_load():
        out.append({"id": a.get("id"), "name": a.get("name"), "endpoint": a.get("endpoint", ""),
                    "file_var": a.get("file_var", ""), "icon": a.get("icon", ""), "has_key": bool(a.get("key")),
                    "greeting": a.get("greeting", ""), "placeholder": a.get("placeholder", ""),
                    "public": a.get("public", True),
                    "type": a.get("type", "dify"), "llm_id": a.get("llm_id", ""),
                    "prompt": a.get("prompt", ""), "rag": bool(a.get("rag", False)),
                    "kb_group": a.get("kb_group", "external")})
    return {"assistants": out}

@router.get("/api/dify/assistants/{aid}")
async def dify_assistant_detail(aid: str):
    # 관리 화면(LLM 설정) 전용 — API 키 포함 반환(편집 필드에 실제 값 표시용). 채팅 목록(GET /assistants)은 여전히 키 마스킹.
    a = _dify_get(aid)
    if not a:
        return {"ok": False, "error": "어시스턴트를 찾을 수 없습니다."}
    return {"id": a.get("id"), "name": a.get("name"), "endpoint": a.get("endpoint", ""),
            "file_var": a.get("file_var", ""), "icon": a.get("icon", ""), "key": a.get("key", ""),
            "greeting": a.get("greeting", ""), "placeholder": a.get("placeholder", ""),
            "public": a.get("public", True),
            "type": a.get("type", "dify"), "llm_id": a.get("llm_id", ""),
            "prompt": a.get("prompt", ""), "rag": bool(a.get("rag", False)),
            "rag_sources": a.get("rag_sources") or [],   # 저장된 소스별 활성화+우선순위 (편집 폼 복원)
            "kb_group": a.get("kb_group", "external")}

@router.post("/api/dify/assistants")
async def dify_assistants_add(data: dict):
    name = str(data.get("name", "")).strip()
    if not name:
        return {"ok": False, "error": "이름은 필수입니다."}
    lst = _dify_load()
    aid = str(data.get("id", "")).strip() or _dify_slug(name, lst)
    if any(a.get("id") == aid for a in lst):
        aid = _dify_slug(aid, lst)
    _type = str(data.get("type", "dify")).strip() or "dify"
    lst.append({"id": aid, "name": name,
                "type": _type,
                "llm_id": str(data.get("llm_id", "")).strip(),
                "prompt": str(data.get("prompt", "")),
                "rag": bool(data.get("rag", False)),
                "kb_group": str(data.get("kb_group", "external")).strip() or "external",
                "endpoint": str(data.get("endpoint", "")).strip() or (DIFY_BASE_URL if _type == "dify" else ""),
                "key": str(data.get("key", "")).strip(),
                "file_var": str(data.get("file_var", _DIFY_FILE_VAR)).strip(),
                "icon": str(data.get("icon", "")).strip(),
                "greeting": str(data.get("greeting", "")),
                "placeholder": str(data.get("placeholder", "")),
                "public": bool(data.get("public", True))})
    _dify_save(lst)
    return {"ok": True, "id": aid}

@router.put("/api/dify/assistants/{aid}")
async def dify_assistants_update(aid: str, data: dict):
    lst = _dify_load()
    for a in lst:
        if a.get("id") == aid:
            if str(data.get("name", "")).strip():
                a["name"] = str(data.get("name")).strip()
            if "type" in data:
                a["type"] = str(data.get("type", "")).strip() or a.get("type", "dify")
            if "llm_id" in data:
                a["llm_id"] = str(data.get("llm_id", "")).strip()
            if "prompt" in data:
                a["prompt"] = str(data.get("prompt", ""))
            if "rag" in data:
                a["rag"] = bool(data.get("rag"))
            if "rag_sources" in data:
                # 소스별 활성화+우선순위: [{"source":"tc"|"manual"|"confluence","enabled":bool,"priority":int}, ...]
                rs = data.get("rag_sources")
                if isinstance(rs, list):
                    clean = []
                    for it in rs:
                        if not isinstance(it, dict):
                            continue
                        src = str(it.get("source", "")).strip()
                        if src not in ("tc", "manual", "confluence"):
                            continue
                        clean.append({
                            "source": src,
                            "enabled": bool(it.get("enabled")),
                            "priority": int(it.get("priority") or 0),
                        })
                    a["rag_sources"] = clean
            if "kb_group" in data:
                a["kb_group"] = str(data.get("kb_group", "")).strip()
            if "endpoint" in data:
                a["endpoint"] = str(data.get("endpoint", "")).strip() or a.get("endpoint", "")
            if "file_var" in data:
                a["file_var"] = str(data.get("file_var", "")).strip()
            if "icon" in data:
                a["icon"] = str(data.get("icon", "")).strip()
            if "public" in data:
                a["public"] = bool(data.get("public"))
            if "greeting" in data:
                a["greeting"] = str(data.get("greeting", ""))
            if "placeholder" in data:
                a["placeholder"] = str(data.get("placeholder", ""))
            k = str(data.get("key", "")).strip()
            if k:  # 키는 새로 입력했을 때만 교체(빈값이면 기존 키 유지)
                a["key"] = k
            _dify_save(lst)
            return {"ok": True}
    return {"ok": False, "error": "어시스턴트를 찾을 수 없습니다."}

@router.delete("/api/dify/assistants/{aid}")
async def dify_assistants_delete(aid: str):
    lst = _dify_load()
    new = [a for a in lst if a.get("id") != aid]
    if len(new) == len(lst):
        return {"ok": False, "error": "어시스턴트를 찾을 수 없습니다."}
    _dify_save(new)
    return {"ok": True}

@router.post("/api/dify/chat")
async def dify_chat(data: dict):
    import httpx
    from fastapi.responses import StreamingResponse
    assistant = (data.get("assistant") or "").strip()
    query = (data.get("query") or "").strip()
    conv_id = (data.get("conversation_id") or "").strip()
    user = (data.get("user") or "utop-user").strip() or "utop-user"
    cfg = _dify_get(assistant)

    async def generate():
        def sse(obj):
            return "data: " + json.dumps(obj, ensure_ascii=False) + "\n\n"
        if not cfg:
            yield sse({"text": "알 수 없는 어시스턴트입니다."}); yield "data: [DONE]\n\n"; return
        if not query:
            yield sse({"text": "빈 메시지입니다."}); yield "data: [DONE]\n\n"; return
        headers = {"Authorization": "Bearer " + cfg["key"], "Content-Type": "application/json"}
        payload = {"inputs": {}, "query": query, "response_mode": "streaming", "user": user}
        if conv_id:
            payload["conversation_id"] = conv_id
        # 첨부 파일(미리 /api/dify/upload 로 올려 받은 upload_file_id)
        dify_files = []
        for f in (data.get("files") or []):
            fid = ((f.get("upload_file_id") or f.get("id") or "").strip()) if isinstance(f, dict) else ""
            if fid:
                dify_files.append({"type": (f.get("type") or "document"), "transfer_method": "local_file", "upload_file_id": fid})
        if dify_files:
            fvar = (cfg.get("file_var") or "").strip()
            if fvar:
                # ChatFlow 입력변수(예: log_file)로 전달 — Start 노드의 File 변수
                payload["inputs"][fvar] = dify_files[0]
            else:
                # 입력변수 미지정 시 message files(vision/sys.files)로 전달
                payload["files"] = dify_files
        url = (cfg.get("endpoint") or DIFY_BASE_URL).rstrip("/") + "/chat-messages"
        timeout = httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)
        accumulated = ""
        has_output = False
        new_conv = conv_id
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as resp:
                    if resp.status_code != 200:
                        b = await resp.aread()
                        yield sse({"text": "Dify API 오류 (%d): %s" % (resp.status_code, b.decode(errors="replace")[:400])})
                        yield "data: [DONE]\n\n"
                        return
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        try:
                            d = json.loads(line[6:])
                        except Exception:
                            continue
                        event = d.get("event", "")
                        if event in ("message", "agent_message"):
                            answer = d.get("answer", "")
                            if not answer:
                                continue
                            cid = d.get("conversation_id", "")
                            if cid:
                                new_conv = cid
                            if accumulated and answer.startswith(accumulated):
                                delta = answer[len(accumulated):]
                                accumulated = answer
                            else:
                                delta = answer
                                accumulated += answer
                            if delta:
                                has_output = True
                                yield sse({"text": delta})
                        elif event == "message_end":
                            cid = d.get("conversation_id", "")
                            if cid:
                                new_conv = cid
                        elif event == "message_replace":
                            answer = d.get("answer", "")
                            if answer:
                                has_output = True
                                yield sse({"text": answer})
                        elif event == "text_chunk":
                            chunk = (d.get("data") or {}).get("text", "")
                            if chunk:
                                has_output = True
                                yield sse({"text": chunk})
                        elif event == "workflow_finished":
                            wf = d.get("data", {}) or {}
                            if wf.get("status") == "failed":
                                yield sse({"text": "\n\n❌ 워크플로우 실패: " + str(wf.get("error", ""))})
                                break
                            if not has_output:
                                outputs = wf.get("outputs", {})
                                if isinstance(outputs, dict):
                                    text = outputs.get("answer", "") or outputs.get("result", "") or outputs.get("text", "")
                                    if text:
                                        has_output = True
                                        yield sse({"text": text})
                        elif event == "node_finished":
                            nd = d.get("data", {}) or {}
                            if nd.get("status") == "failed":
                                yield sse({"text": "\n\n❌ 노드 실패 [%s]: %s" % (nd.get("title", ""), nd.get("error", ""))})
                                break
                        elif event == "error":
                            emsg = d.get("message", "") or d.get("msg", "")
                            code = d.get("code", "")
                            yield sse({"text": "\n\n❌ Dify 오류 [%s]: %s" % (code, emsg)})
                            break
        except httpx.TimeoutException:
            yield sse({"text": "\n\n⏰ 타임아웃(300초)"})
        except httpx.ConnectError:
            yield sse({"text": "\n\n❌ 연결 실패: " + DIFY_BASE_URL})
        except Exception as e:
            yield sse({"text": "\n\n❌ %s: %s" % (type(e).__name__, e)})
        if new_conv:
            yield sse({"conv": new_conv})
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@router.post("/api/dify/upload")
async def dify_upload(assistant: str = Form(...), user: str = Form("utop-user"), file: UploadFile = File(...)):
    # 파일을 Dify(/v1/files/upload)에 올려 upload_file_id 를 받아 프론트에 돌려준다. 키는 서버 보관.
    import httpx
    cfg = _dify_get(assistant)
    if not cfg:
        return {"ok": False, "error": "알 수 없는 어시스턴트입니다."}
    try:
        content = await file.read()
    except Exception as e:
        return {"ok": False, "error": "파일 읽기 실패: %s" % e}
    files = {"file": (file.filename or "upload", content, file.content_type or "application/octet-stream")}
    form = {"user": (user or "utop-user")}
    headers = {"Authorization": "Bearer " + cfg["key"]}
    url = (cfg.get("endpoint") or DIFY_BASE_URL).rstrip("/") + "/files/upload"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=120.0, write=120.0, pool=10.0)) as client:
            r = await client.post(url, headers=headers, files=files, data=form)
        if r.status_code not in (200, 201):
            low = (r.text or "").lower()
            if r.status_code == 413 or "file_too_large" in low or "too large" in low:
                return {"ok": False, "error": "파일이 Dify 허용 크기를 초과했습니다(413). 더 작은 파일을 쓰거나, 이미지는 축소/캡처 후 첨부하세요. (제한은 Dify 서버 설정)"}
            return {"ok": False, "error": "Dify 업로드 오류 (%d): %s" % (r.status_code, r.text[:300])}
        j = r.json()
        fid = j.get("id")
        if not fid:
            return {"ok": False, "error": "Dify 응답에 파일 id 가 없습니다."}
        mime = (j.get("mime_type") or file.content_type or "").lower()
        ext = (j.get("extension") or "").lower().lstrip(".")
        is_img = mime.startswith("image/") or ext in ("jpg", "jpeg", "png", "gif", "webp", "bmp", "svg")
        return {"ok": True, "id": fid, "type": ("image" if is_img else "document"), "name": j.get("name") or file.filename}
    except httpx.ConnectError:
        return {"ok": False, "error": "연결 실패: " + DIFY_BASE_URL}
    except httpx.TimeoutException:
        return {"ok": False, "error": "업로드 타임아웃"}
    except Exception as e:
        return {"ok": False, "error": "%s: %s" % (type(e).__name__, e)}

@router.post("/api/chat/local")
async def chat_local(req: LocalLLMRequest):
    import httpx
    url = req.endpoint.rstrip("/") + "/chat/completions"
    print(f"[LocalLLM] URL: {url}")
    print(f"[LocalLLM] Model: {req.model}")
    headers = {"Content-Type": "application/json"}
    if req.apikey:
        headers["Authorization"] = f"Bearer {req.apikey}"
    # max_tokens는 context_size를 초과할 수 없음 (Dify 방식)
    safe_max_tokens = min(req.max_tokens, req.context_size, 4096)
    body = {
        "model": req.model,
        "messages": req.messages,
        "max_tokens": safe_max_tokens,
        "temperature": req.temperature,
    }
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(url, headers=headers, json=body)
            print(f"[LocalLLM] Status: {r.status_code}")
            print(f"[LocalLLM] Response: {r.text[:500]}")
            if not r.is_success:
                return {"reply": f"[로컬 LLM 오류] {r.status_code}\n\n{r.text}"}
            data = r.json()
            reply = data["choices"][0]["message"]["content"]
            return {"reply": reply}
    except Exception as e:
        print(f"[LocalLLM] Error: {e}")
        return {"reply": f"[로컬 LLM 오류] {e}"}

# ───────────────────────────────────────────
# 라우터 - Claude 채팅
# ───────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    history: list = []
    max_tokens: int = 2048

# ══════════ RAG: 청킹 + BM25 검색 (Phase1 희소검색, 임베딩은 후속) ══════════
RAG_CHUNK_SIZE = 500
RAG_CHUNK_OVERLAP = 80
_RAG_CACHE = {"sig": None, "corpus": None}
# ── 청크 임베딩 캐시 (numpy .npy 바이너리) — 재시작/파일변경 시 전체 재임베딩 방지 + 빠른 로드/검색 ──
EMBED_NPY_FILE = core.DATA_DIR / "state" / "rag_embed.npy"
EMBED_KEYS_FILE = core.DATA_DIR / "state" / "rag_embed_keys.json"
EMBED_CACHE_FILE = core.DATA_DIR / "state" / "rag_embed_cache.json"   # 구버전(JSON) — 자동 변환
_EMBED = {"keys": None, "rows": None, "mat": None, "norm": None, "dirty": False}
def _embed_key(text, model):
    import hashlib
    return hashlib.md5((str(model) + "|" + str(text)).encode("utf-8")).hexdigest()
def _embed_renorm():
    import numpy as np
    m = _EMBED["mat"]
    if m is None or not len(m):
        _EMBED["norm"] = None; return
    n = np.linalg.norm(m, axis=1, keepdims=True); n[n == 0] = 1.0
    _EMBED["norm"] = (m / n).astype("float32")
def _embed_load():
    if _EMBED["keys"] is not None:
        return
    import numpy as np
    keys = []; mat = None
    try:
        if EMBED_NPY_FILE.exists() and EMBED_KEYS_FILE.exists():
            mat = np.load(str(EMBED_NPY_FILE)); keys = core.load_json(EMBED_KEYS_FILE) or []
        elif EMBED_CACHE_FILE.exists():   # 구버전 {key:vec} JSON → 행렬로 변환
            old = core.load_json(EMBED_CACHE_FILE) or {}; keys = list(old.keys())
            if keys:
                mat = np.asarray([old[k] for k in keys], dtype="float32")
    except Exception:
        keys = []; mat = None
    if mat is None or not len(keys):
        _EMBED["keys"] = {}; _EMBED["rows"] = []; _EMBED["mat"] = None; _EMBED["norm"] = None
    else:
        _EMBED["mat"] = np.asarray(mat, dtype="float32"); _EMBED["rows"] = list(keys)
        _EMBED["keys"] = {k: i for i, k in enumerate(keys)}; _embed_renorm()
        if not EMBED_NPY_FILE.exists():   # JSON→npy 1회 변환 저장 후 구파일 제거
            _EMBED["dirty"] = True; _embed_save()
            try: EMBED_CACHE_FILE.unlink()
            except Exception: pass
def _embed_add(keys, vecs):
    import numpy as np
    _embed_load()
    newk = []; newv = []
    for k, v in zip(keys, vecs):
        if k in _EMBED["keys"]: continue
        _EMBED["keys"][k] = len(_EMBED["rows"]) + len(newk); newk.append(k); newv.append(v)
    if not newk: return
    nv = np.asarray(newv, dtype="float32")
    _EMBED["mat"] = nv if _EMBED["mat"] is None else np.vstack([_EMBED["mat"], nv])
    _EMBED["rows"].extend(newk); _EMBED["dirty"] = True; _embed_renorm()
def _embed_save():
    import numpy as np
    if not _EMBED.get("dirty"): return
    try:
        if _EMBED["mat"] is not None:
            np.save(str(EMBED_NPY_FILE), _EMBED["mat"]); core.save_json(EMBED_KEYS_FILE, _EMBED["rows"])
        _EMBED["dirty"] = False
    except Exception:
        pass


def _rag_tokenize(s):
    import re as _re
    s = str(s or "").lower()
    toks = _re.findall(r"[a-z0-9]+|[가-힣]+", s)
    out = []
    for t in toks:
        out.append(t)
        if len(t) >= 2 and ('가' <= t[0] <= '힣'):
            for i in range(len(t) - 1):
                out.append(t[i:i + 2])   # 한글 2-gram → 부분일치
    return out

def _chunk_text(text, size=RAG_CHUNK_SIZE, overlap=RAG_CHUNK_OVERLAP):
    import re as _re
    text = str(text or "").strip()
    if not text:
        return []
    paras = [p.strip() for p in _re.split(r"\n\s*\n", text) if p.strip()]
    chunks, buf = [], ""
    for p in paras:
        if len(buf) + len(p) + 1 <= size:
            buf = (buf + "\n" + p).strip()
        else:
            if buf:
                chunks.append(buf)
            if len(p) <= size:
                buf = p
            else:
                step = max(1, size - overlap)
                for i in range(0, len(p), step):
                    chunks.append(p[i:i + size])
                buf = ""
    if buf:
        chunks.append(buf)
    return chunks

async def _manual_chunk_corpus_async():
    """DB 에서 manuals + **위키 문서**를 가져와 청크 코퍼스 생성 — async 네이티브.

    위키가 코퍼스에 합류한 까닭(지시): 제품 스펙이 위키 문서로 살고,
    Knowledge AI 가 그것을 뜻으로 찾아야 한다. 서명에 위키 갱신 시각이
    들어 있어 문서를 저장·삭제하면 다음 질문 때 저절로 다시 색인된다.
    """
    # 캐시 히트 fast path — 시그니처만 조회
    async with db.pool().acquire() as c:
        sig_rows = await c.fetch("SELECT id, updated_at FROM manuals WHERE active=true ORDER BY id")
        wsig_rows = await c.fetch("SELECT id, updated_at FROM wiki_page ORDER BY id")
    sig_only = (
        tuple((r["id"], r["updated_at"].timestamp() if r["updated_at"] else 0) for r in sig_rows),
        tuple((r["id"], r["updated_at"].timestamp() if r["updated_at"] else 0) for r in wsig_rows),
    )
    if _RAG_CACHE.get("sig") == sig_only and _RAG_CACHE.get("corpus") is not None:
        return _RAG_CACHE["corpus"]
    # 캐시 미스 → 전체 fetch
    async with db.pool().acquire() as c:
        rows_full = await c.fetch(
            "SELECT id, data, updated_at FROM manuals WHERE active=true ORDER BY id"
        )
        rows = [(r["id"], r["data"], r["updated_at"]) for r in rows_full]
        wiki_rows = await c.fetch(
            "SELECT id, project, title, plain FROM wiki_page WHERE coalesce(plain,'') <> ''"
        )
    # 코퍼스 조립 (CPU 작업 — 이벤트 루프 잠깐 잡음. 매뉴얼 100개 정도면 문제 없음)
    return _build_corpus_from_rows(rows, sig_only, wiki_rows=wiki_rows)


def _build_corpus_from_rows(rows, sig, wiki_rows=None):
    """rows 를 corpus 리스트로 변환 + 캐시 저장. CPU-only 라 sync.

    wiki_rows 가 오면 위키 문서도 source='wiki' 로 합류한다 — 청크에
    문서 id·프로젝트를 실어 근거 카드가 그 문서로 갈 수 있게 한다."""
    corpus = []
    _emodel = str((_rag_cfg().get("embed_model") if callable(globals().get("_rag_cfg")) else None) or "bge-m3")
    for _rid, d, _ua in rows:
        try:
            name = d.get("name", "")
            imgs = d.get("images") or []
            _src = str(d.get("source") or "").strip().lower()
            stag = "confluence" if _src.startswith("conf") else (_src if _src in ("tc", "req", "jira", "manual") else "manual")
            for ch in _chunk_text(d.get("text", "")):
                corpus.append({"name": name, "text": ch, "tokens": _rag_tokenize(ch), "key": _embed_key(ch, _emodel), "images_ref": imgs, "source": stag})
        except Exception:
            pass
    _emodel2 = str((_rag_cfg().get("embed_model") if callable(globals().get("_rag_cfg")) else None) or "bge-m3")
    for w in (wiki_rows or []):
        try:
            title = str(w["title"] or "(이름 없음)")
            for ch in _chunk_text(str(w["plain"] or "")):
                corpus.append({
                    "name": title, "text": ch, "tokens": _rag_tokenize(ch),
                    "key": _embed_key(ch, _emodel2), "images_ref": [], "source": "wiki",
                    "wiki_id": str(w["id"]), "project": str(w["project"] or ""),
                })
        except Exception:
            pass
    _RAG_CACHE["sig"] = sig
    _RAG_CACHE["corpus"] = corpus
    return corpus


def _manual_chunk_corpus():
    """레거시 sync 진입점 — 워밍업 스레드 등에서만 호출. async 컨텍스트에서는 _manual_chunk_corpus_async 사용."""
    # 새 이벤트 루프 + 별도 asyncpg 연결로 조회 (풀 재사용 불가 — 다른 루프에 바인딩됨)
    async def _work():
        conn = await __import__('asyncpg').connect(dsn=db.DSN)
        try:
            sig_rows = await conn.fetch("SELECT id, updated_at FROM manuals WHERE active=true ORDER BY id")
            wsig_rows = await conn.fetch("SELECT id, updated_at FROM wiki_page ORDER BY id")
            sig_only = (
                tuple((r["id"], r["updated_at"].timestamp() if r["updated_at"] else 0) for r in sig_rows),
                tuple((r["id"], r["updated_at"].timestamp() if r["updated_at"] else 0) for r in wsig_rows),
            )
            if _RAG_CACHE.get("sig") == sig_only and _RAG_CACHE.get("corpus") is not None:
                return _RAG_CACHE["corpus"]
            rows_full = await conn.fetch("SELECT id, data, updated_at FROM manuals WHERE active=true ORDER BY id")
            rows = [(r["id"], r["data"], r["updated_at"]) for r in rows_full]
            wiki_rows = await conn.fetch("SELECT id, project, title, plain FROM wiki_page WHERE coalesce(plain,'') <> ''")
        finally:
            try: await conn.close()
            except Exception: pass
        return _build_corpus_from_rows(rows, sig_only, wiki_rows=wiki_rows)
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_work())
    finally:
        try: loop.close()
        except Exception: pass


def _finalize_corpus(rows, sig):   # 하위호환용 shim (사용 안 함)
    return _build_corpus_from_rows(rows, sig)
    # updated_at 시그니처로 캐시 히트 판정
    sig = tuple((rid, ua.timestamp() if ua else 0) for rid, _d, ua in rows)
    if _RAG_CACHE["sig"] == sig and _RAG_CACHE["corpus"] is not None:
        return _RAG_CACHE["corpus"]
    corpus = []
    _emodel = str((_rag_cfg().get("embed_model") if callable(globals().get("_rag_cfg")) else None) or "bge-m3")
    for _rid, d, _ua in rows:
        try:
            name = d.get("name", "")
            imgs = d.get("images") or []
            _src = str(d.get("source") or "").strip().lower()
            stag = "confluence" if _src.startswith("conf") else (_src if _src in ("tc", "req", "jira", "manual") else "manual")
            for ch in _chunk_text(d.get("text", "")):
                corpus.append({"name": name, "text": ch, "tokens": _rag_tokenize(ch), "key": _embed_key(ch, _emodel), "images_ref": imgs, "source": stag})
        except Exception:
            pass
    _RAG_CACHE["sig"] = sig
    _RAG_CACHE["corpus"] = corpus
    return corpus

def _bm25_search(query, corpus, top_k=6, k1=1.5, b=0.75):
    import math as _m
    if not corpus:
        return []
    q = set(_rag_tokenize(query))
    if not q:
        return []
    N = len(corpus)
    avgdl = sum(len(c["tokens"]) for c in corpus) / max(1, N)
    df = {}
    for c in corpus:
        for t in set(c["tokens"]):
            if t in q:
                df[t] = df.get(t, 0) + 1
    scored = []
    for c in corpus:
        dl = len(c["tokens"]) or 1
        tf = {}
        for t in c["tokens"]:
            if t in q:
                tf[t] = tf.get(t, 0) + 1
        if not tf:
            continue
        s = 0.0
        for t, f in tf.items():
            idf = _m.log(1 + (N - df.get(t, 0) + 0.5) / (df.get(t, 0) + 0.5))
            s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / avgdl))
        scored.append((s, c))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for s, c in scored[:top_k] if s > 0]

# ── 임베딩(bge-m3) + 리랭커(bge-reranker) 하이브리드 ──
RAG_CONFIG_FILE = core.DATA_DIR / "config" / "rag_config.json"
_RAG_DEFAULT_CFG = {"embed_url": "", "embed_model": "bge-m3", "rerank_url": "", "rerank_model": "bge-reranker-v2-m3", "use_embed": True, "use_rerank": True, "min_score": 0.0}

def _rag_cfg():
    try:
        if RAG_CONFIG_FILE.exists():
            d = core.load_json(RAG_CONFIG_FILE)
            if isinstance(d, dict):
                return {**_RAG_DEFAULT_CFG, **d}
    except Exception:
        pass
    return dict(_RAG_DEFAULT_CFG)


async def _embed_texts_raw(texts):
    """(벡터, 실패이유) 를 함께 돌려준다.

    검색 경로는 실패하면 그냥 넘어가면 되지만, 연결 테스트는 '왜' 안 되는지를
    답해야 한다. 예전에는 둘 다 None 만 받아서 화면에 '실패' 한 단어만 떴고,
    주소가 틀린 건지 서버가 죽은 건지 모델 이름이 틀린 건지 알 수 없었다.
    """
    cfg = _rag_cfg(); url = str(cfg.get("embed_url") or "").rstrip("/")
    if not url:
        return None, "서버 주소가 비어 있습니다"
    if not texts:
        return None, "보낼 내용이 없습니다"
    import httpx
    model = cfg.get("embed_model") or "bge-m3"
    out = []
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            for i in range(0, len(texts), 64):
                batch = texts[i:i + 64]
                r = await client.post(url + "/v1/embeddings",
                                      json={"model": model, "input": batch})
                if r.status_code != 200:
                    return None, await core.why_http(client, url, model, r)
                data = sorted(r.json().get("data") or [], key=lambda x: x.get("index", 0))
                out.extend([d.get("embedding") for d in data])
        return out, ""
    except Exception as e:
        return None, f"연결하지 못했습니다 — {e}"


async def _embed_texts(texts):
    v, _ = await _embed_texts_raw(texts)
    return v


async def _rerank_raw(query, docs, top_k):
    """(결과, 실패이유). _embed_texts_raw 와 같은 이유로 나눠 둔다."""
    cfg = _rag_cfg(); url = str(cfg.get("rerank_url") or "").rstrip("/")
    if not url:
        return None, "서버 주소가 비어 있습니다"
    if not docs:
        return None, "보낼 내용이 없습니다"
    import httpx
    model = cfg.get("rerank_model") or "bge-reranker-v2-m3"
    payload = {"model": model, "query": query, "documents": docs, "top_n": top_k}
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            # 서버마다 경로가 갈린다(vLLM 은 /v1/rerank, TEI 는 /rerank).
            # 먼저 것이 아니면 두 번째로 한 번 더 본다.
            r = await client.post(url + "/v1/rerank", json=payload)
            if r.status_code != 200:
                r2 = await client.post(url + "/rerank", json=payload)
                # 둘 다 실패면 앞의 응답으로 이유를 말한다 — 보통 그쪽이
                # 진짜 경로라 메시지가 더 쓸모 있다.
                if r2.status_code == 200:
                    r = r2
                else:
                    return None, await core.why_http(client, url, model, r)
            res = r.json().get("results") or []
            return [(it.get("index"), it.get("relevance_score", it.get("score", 0))) for it in res], ""
    except Exception as e:
        return None, f"연결하지 못했습니다 — {e}"


async def _rerank(query, docs, top_k):
    v, _ = await _rerank_raw(query, docs, top_k)
    return v


async def _ensure_embeddings(corpus):
    """캐시에 없는 청크만 임베딩 후 .npy 캐시에 추가 (다음부터 재사용)."""
    _embed_load()
    todo = [i for i, c in enumerate(corpus) if c.get("key") and c["key"] not in _EMBED["keys"]]
    if not todo:
        return True
    # 캐시에 이미 있는 동일 텍스트(키)는 한 번만 임베딩
    seen = {}; uniq = []
    for i in todo:
        k = corpus[i]["key"]
        if k not in seen and k not in _EMBED["keys"]:
            seen[k] = True; uniq.append(i)
    if not uniq:
        return True
    vecs = await _embed_texts([corpus[i]["text"] for i in uniq])
    if not vecs or len(vecs) != len(uniq):
        return False
    _embed_add([corpus[i]["key"] for i in uniq], vecs)
    _embed_save()
    return True

async def _hybrid_search(query, top_k=6, min_score=None, sources=None):
    cfg = _rag_cfg()
    corpus = await _manual_chunk_corpus_async()
    if sources:   # 소스 필터: tc/req/manual/confluence/jira
        _ss = {str(s).strip().lower() for s in sources if str(s).strip()}
        if _ss:
            corpus = [c for c in corpus if c.get("source", "manual") in _ss]
    if not corpus:
        return [], "none"
    # 1) BM25 후보
    bm = _bm25_search(query, corpus, top_k=max(top_k * 4, 20))
    mode = "bm25"
    cand = list(bm)
    # 2) 임베딩 의미검색 후보 합치기
    if cfg.get("use_embed") and cfg.get("embed_url"):
        ok = await _ensure_embeddings(corpus)
        qv = (await _embed_texts([query])) if ok else None
        if ok and qv and _EMBED.get("norm") is not None:
            try:
                import numpy as np
                q = np.asarray(qv[0], dtype="float32"); qn = float(np.linalg.norm(q)) or 1.0; q = q / qn
                km = _EMBED["keys"]; rows = []; ci = []
                for i, c in enumerate(corpus):
                    r = km.get(c.get("key"))
                    if r is not None and r < len(_EMBED["norm"]):
                        rows.append(r); ci.append(i)
                if rows:
                    sims = _EMBED["norm"][rows] @ q          # numpy 벡터화 (22K도 수십 ms)
                    kk = min(max(top_k * 4, 20), len(sims))
                    top = np.argpartition(-sims, kk - 1)[:kk]; top = top[np.argsort(-sims[top])]
                    seen = set(id(c) for c in cand)
                    for t in top:
                        c = corpus[ci[int(t)]]
                        if id(c) not in seen:
                            cand.append(c); seen.add(id(c))
                    mode = "hybrid"
            except Exception:
                pass
    if not cand:
        cand = corpus[:max(top_k * 4, 20)]
    cand = cand[:max(top_k * 4, 24)]   # 리랭커 부하 제한 (후보 과다 방지)
    # 3) 리랭킹
    if cfg.get("use_rerank") and cfg.get("rerank_url") and cand:
        rr = await _rerank(query, [c["text"] for c in cand], top_k * 2)
        if rr:
            try:
                ms = float(min_score if min_score is not None else (cfg.get("min_score") or 0))
            except Exception:
                ms = 0.0
            ordered = [(cand[i], (float(sc) if sc is not None else None)) for i, sc in rr
                       if 0 <= i < len(cand) and (sc is None or float(sc) >= ms)]
            return ordered[:top_k], mode + "+rerank"
    return [(c, None) for c in cand[:top_k]], mode

@router.get("/api/kb/wiki-status")
async def kb_wiki_status():
    """위키 색인 상태 — RAG 설정 화면의 「위키 색인」 카드가 읽는다."""
    corpus = await _manual_chunk_corpus_async()
    wk = [c for c in corpus if c.get("source") == "wiki"]
    cfg = _rag_cfg()
    embed_on = bool(cfg.get("use_embed") and cfg.get("embed_url"))
    embedded = 0
    if embed_on and wk:
        _embed_load()
        embedded = sum(1 for c in wk if c.get("key") in _EMBED["keys"])
    return {"pages": len({c.get("wiki_id") for c in wk}), "chunks": len(wk),
            "embedded": embedded, "embed_on": embed_on}


@router.post("/api/kb/wiki-reindex")
async def kb_wiki_reindex():
    """위키 다시 색인 — 캐시를 버려 코퍼스를 새로 짓고, 임베딩 서버가
    설정돼 있으면 위키 청크 임베딩까지 미리 만들어 둔다(첫 질문이 안 느리게)."""
    _RAG_CACHE["sig"] = None
    _RAG_CACHE["corpus"] = None
    corpus = await _manual_chunk_corpus_async()
    wk = [c for c in corpus if c.get("source") == "wiki"]
    cfg = _rag_cfg()
    embed_on = bool(cfg.get("use_embed") and cfg.get("embed_url"))
    ok = True
    if embed_on and wk:
        ok = await _ensure_embeddings(wk)
    return {"ok": ok, "pages": len({c.get("wiki_id") for c in wk}), "chunks": len(wk),
            "embed_on": embed_on,
            **({} if ok else {"error": "임베딩을 만들지 못했습니다 — RAG 설정의 임베딩 서버를 확인하세요"})}


@router.post("/api/rag/search")
async def rag_search(payload: dict):
    import re as _re
    q = str(payload.get("query") or "")
    k = max(1, min(int(payload.get("top_k") or 6), 20))
    _ms = payload.get("min_score")
    srcs = payload.get("sources") or ([payload.get("source")] if payload.get("source") else None)
    hits, mode = await _hybrid_search(q, top_k=k, min_score=(float(_ms) if _ms is not None else None), sources=srcs)
    out = []
    for h, sc in hits:
        txt = str(h.get("text") or "")
        imgs = []
        for mk in _re.findall(r"\[\[IMG:(\d+)\]\]", txt):
            try:
                idx = int(mk); ref = h.get("images_ref") or []
                if 0 <= idx < len(ref):
                    imgs.append(ref[idx])
            except Exception:
                pass
        clean = _re.sub(r"\[\[IMG:\d+\]\]", "", txt).strip()
        out.append({"name": h["name"], "text": clean, "images": imgs[:6], "score": (round(sc, 3) if sc is not None else None), "source": h.get("source", "manual")})
    # 라이브 Confluence 검색 결과를 앞에 합침 (Dify식 — import 불필요). confluence=False면 생략(단계별 표시용)
    if payload.get("confluence", True):
        conf = await _confluence_live_search(q, 3)
        if conf:
            out = [{"name": c["name"], "text": str(c.get("text") or "")[:600], "images": (c.get("images") or [])[:3], "url": c.get("url", "")} for c in conf] + out
            mode = mode + "+confluence"
    _corpus_tc = await _manual_chunk_corpus_async()
    return {"hits": out, "total_chunks": len(_corpus_tc), "mode": mode}

@router.post("/api/confluence/search")
async def conf_search(payload: dict):
    """라이브 Confluence 검색만 (FAB 단계별 표시용). live_query 꺼져있으면 빈 결과."""
    q = str((payload or {}).get("query") or "")
    lim = max(1, min(int((payload or {}).get("limit") or 4), 8))
    hits = await _confluence_live_search(q, lim)
    return {"hits": hits, "count": len(hits)}

_CONF_MODELS_CACHE = {"models": None}

@router.get("/api/confluence/models")
async def conf_models():
    """11.Feature List 하위 스펙 페이지에서 실제 모델명 추출 (HITL 모델 칩용, 캐시)."""
    if _CONF_MODELS_CACHE.get("models") is not None:
        return {"models": _CONF_MODELS_CACHE["models"]}
    cfg = _conf_cfg(); base = str(cfg.get("base_url") or "").rstrip("/")
    models = []
    if base:
        import httpx, re as _ri
        headers = _conf_headers(cfg); auth = _conf_auth(cfg)
        try:
            async with httpx.AsyncClient(timeout=40, verify=False) as client:
                children = await _conf_children(client, base, headers, auth, "11.Feature List")
                for c in children:
                    try:
                        hit = await client.get(base + f"/rest/api/content/{c.get('id')}", headers=headers, auth=auth, params={"expand": "body.storage"})
                        if hit.status_code != 200:
                            continue
                        body = (((hit.json().get("body") or {}).get("storage") or {}).get("value")) or ""
                        txt = _html_to_text(body)
                        m = _ri.search(r"Model\s*Name\s*[:：]\s*([^\n]+)", txt, _ri.I)
                        added = False
                        if m:
                            for tok in _ri.findall(r"[A-Za-z]{1,4}\d{3,}[A-Za-z0-9]*", m.group(1)):
                                if tok not in models:
                                    models.append(tok); added = True
                        if not added:
                            ttl = str(c.get("title") or "").replace("_Series_Spec", "")
                            if ttl and ttl not in models:
                                models.append(ttl)
                    except Exception:
                        continue
        except Exception:
            pass
    _CONF_MODELS_CACHE["models"] = models
    return {"models": models}

@router.get("/api/rag/config")
async def rag_config_get(token: str = ""):
    return _rag_cfg()

@router.post("/api/rag/config")
async def rag_config_set(payload: dict, token: str = ""):
    core.require_admin(token)
    cfg = _rag_cfg()
    for k in ("embed_url", "embed_model", "rerank_url", "rerank_model"):
        if k in payload:
            cfg[k] = str(payload.get(k) or "").strip()
    for k in ("use_embed", "use_rerank"):
        if k in payload:
            cfg[k] = bool(payload.get(k))
    if "min_score" in payload:
        try:
            cfg["min_score"] = max(0.0, float(payload.get("min_score") or 0))
        except Exception:
            pass
    core.save_json(RAG_CONFIG_FILE, cfg)
    _RAG_CACHE["corpus"] = None  # 임베딩 재계산 유도
    return {"ok": True, **cfg}

@router.post("/api/rag/test")
async def rag_test(payload: dict, token: str = ""):
    """임베딩·리랭커 연결 테스트. 실패하면 왜 안 되는지까지 돌려준다."""
    out = {}
    ev, ew = await _embed_texts_raw(["연결 테스트", "embedding test"])
    out["embed"] = {"ok": bool(ev), "dim": (len(ev[0]) if ev else 0), "detail": ew}
    rr, rw = await _rerank_raw("테스트 질문", ["문서1 테스트", "관계없는 문서"], 2)
    out["rerank"] = {"ok": bool(rr), "results": len(rr or []), "detail": rw}
    return out

# ══════════ AI 통합: RAG 색인 API · Cycle 요약 · Fail→Jira · 통합 검색 · 자연어 실행 ══════════
AI_SETTINGS_FILE = core.DATA_DIR / "config" / "ai_settings.json"
RAG_INDEX_FOLDER = "AI 자동 색인"

def _ai_settings():
    """AI 자동화 스위치. auto_jira 만 기본 꺼짐(이슈 대량생성 방지) — 나머지는 로컬 LLM이라 부담 없음."""
    base = {"auto_index_tc": True, "auto_index_req": True, "auto_summary": True, "auto_jira": False}
    try:
        if AI_SETTINGS_FILE.exists():
            d = core.load_json(AI_SETTINGS_FILE)
            if isinstance(d, dict):
                base.update({k: bool(d[k]) for k in base if k in d})
    except Exception:
        pass
    return base

@router.get("/api/ai/settings")
async def ai_settings_get():
    return _ai_settings()

@router.post("/api/ai/settings")
async def ai_settings_set(payload: dict, token: str = ""):
    cur = _ai_settings()
    for k in cur:
        if k in (payload or {}):
            cur[k] = bool(payload[k])
    core.save_json(AI_SETTINGS_FILE, cur)
    return {"ok": True, **cur}

# ── 페이지별 AI(fab) 설정: Tests/Cycle/Reports 각각의 LLM + 시스템 프롬프트 (전 계정 공유) ──
PAGE_AI_FILE = core.DATA_DIR / "config" / "page_ai.json"
_PAGE_AI_KEYS = ("tests", "cycle", "report", "jira_ai")

_PAGE_AI_FIELDS = ("llm_id", "prompt", "greeting", "placeholder")

def _clean_rag_sources(rs):
    """지식 소스 3종(TC 절차/매뉴얼/Confluence) 활성화+우선순위 목록 정제 — dify 어시스턴트와 동일 스키마."""
    if not isinstance(rs, list):
        return []
    out = []
    for it in rs:
        if not isinstance(it, dict):
            continue
        src = str(it.get("source", "")).strip()
        if src not in ("tc", "manual", "confluence"):
            continue
        out.append({"source": src, "enabled": bool(it.get("enabled")), "priority": int(it.get("priority") or 0)})
    return out

def _clean_quick(qs):
    """추천 질문(퀵 질문 칩) 목록 정제 — 문자열 배열, 빈 값/중복 제거, 최대 20개."""
    if not isinstance(qs, list):
        return []
    out = []
    for q in qs:
        s = str(q or "").strip()
        if s and s not in out:
            out.append(s)
    return out[:20]

def _page_ai_settings():
    base = {k: {f: "" for f in _PAGE_AI_FIELDS} for k in _PAGE_AI_KEYS}
    for k in _PAGE_AI_KEYS:
        base[k]["rag_sources"] = []
        base[k]["quick"] = []
    try:
        if PAGE_AI_FILE.exists():
            d = core.load_json(PAGE_AI_FILE)
            if isinstance(d, dict):
                for k in _PAGE_AI_KEYS:
                    v = d.get(k)
                    if isinstance(v, dict):
                        for f in _PAGE_AI_FIELDS:
                            base[k][f] = str(v.get(f) or "")
                        base[k]["rag_sources"] = _clean_rag_sources(v.get("rag_sources"))
                        base[k]["quick"] = _clean_quick(v.get("quick"))
    except Exception:
        pass
    return base

@router.get("/api/page-ai")
async def page_ai_get():
    return _page_ai_settings()

@router.post("/api/page-ai")
async def page_ai_set(payload: dict, token: str = ""):
    cur = _page_ai_settings()
    p = payload or {}
    for k in _PAGE_AI_KEYS:
        v = p.get(k)
        if isinstance(v, dict):
            for f in _PAGE_AI_FIELDS:
                if f in v:
                    cur[k][f] = str(v.get(f) or "")
            if "rag_sources" in v:
                cur[k]["rag_sources"] = _clean_rag_sources(v.get("rag_sources"))
            if "quick" in v:
                cur[k]["quick"] = _clean_quick(v.get("quick"))
    core.save_json(PAGE_AI_FILE, cur)
    return {"ok": True, **cur}

def _rag_doc_id(raw):
    import re as _re
    s = _re.sub(r"[^0-9A-Za-z._-]", "_", str(raw or ""))[:120]
    return s or "doc"

def _rag_index_doc(doc_id, name, text, source, folder=RAG_INDEX_FOLDER, url=""):
    """RAG 문서 업서트 — 매뉴얼 저장소(DB.manuals) 재활용: 기존 청킹·임베딩·검색 파이프라인 그대로 탄다."""
    text = str(text or "").strip()
    if not text:
        return False
    mid = _rag_doc_id(doc_id)
    payload = {
        "id": mid, "name": str(name or mid), "text": text, "chars": len(text),
        "source": str(source or "manual"), "active": True, "folder": folder, "url": url,
        "created_at": datetime.now().strftime("%Y-%m-%d"),
    }
    # sync → async 브리지
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(db.manuals_upsert(mid, payload), loop).result(timeout=10)
        else:
            asyncio.run(db.manuals_upsert(mid, payload))
    except RuntimeError:
        asyncio.run(db.manuals_upsert(mid, payload))
    _RAG_CACHE["corpus"] = None
    return True

async def _rag_index_warm():
    """색인 후 새 청크 임베딩을 백그라운드로 미리 계산 (첫 검색 지연 방지)."""
    try:
        _corpus_w = await _manual_chunk_corpus_async()
        await _ensure_embeddings(_corpus_w)
    except Exception:
        pass

@router.post("/api/rag/index")
async def rag_index(payload: dict, token: str = ""):
    """RAG 색인 추가/갱신 — {id?, name, text, source?, folder?, url?}. 같은 id 재전송 = 덮어쓰기(업서트)."""
    name = str((payload or {}).get("name") or "").strip()
    text = str((payload or {}).get("text") or "").strip()
    if not text:
        return {"ok": False, "error": "text가 비어 있습니다"}
    source = str(payload.get("source") or "manual").strip().lower()
    doc_id = str(payload.get("id") or "").strip() or ("rag-" + _embed_key(source + "|" + (name or text[:80]), "id")[:16])
    ok = _rag_index_doc(doc_id, name or doc_id, text, source, folder=str(payload.get("folder") or RAG_INDEX_FOLDER), url=str(payload.get("url") or ""))
    if ok:
        asyncio.create_task(_rag_index_warm())
    return {"ok": ok, "id": doc_id, "source": source}

# ── 로컬 LLM(gemma) 공용 호출 ──
def _ai_llm(llm_id: str = ""):
    """AI 통합 기능용 LLM 선택 — 로컬(vLLM/OpenAI 호환) 우선. claude 타입은 스키마가 달라 제외.

    `llm_id` 는 화면에서 사람이 고른 것이다(지시: 탭마다 드롭바). 고른 것이
    있으면 그것을 쓴다 — 목록에서 사라졌으면 여느 때처럼 고른다.
    """
    init_llms_file()
    llms = (core.load_json(core.LLMS_FILE).get("llms") or [])
    if llm_id:
        got = next((l for l in llms if str(l.get("id") or "") == llm_id), None)
        if got and got.get("endpoint"):
            return got
    act = [l for l in llms if l.get("status", "active") == "active" and l.get("endpoint") and str(l.get("type") or "").lower() != "claude"]
    loc = [l for l in act if str(l.get("type") or "").lower() == "local"]
    return (loc[0] if loc else (act[0] if act else None))

async def _ai_chat(messages, max_tokens=1800, temperature=0.3, json_schema=None, timeout=180,
                   llm_id: str = "", purpose: str = ""):
    """OpenAI 호환 chat/completions 1회 호출 → (content, error). json_schema 지정 시 vLLM guided_json."""
    llm = _ai_llm(llm_id)
    if not llm:
        return None, "등록된 로컬 LLM이 없습니다 — AI Assistant ▸ LLM 설정에서 등록하세요."
    import httpx
    body = {"model": llm.get("model") or "", "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
    _apply_purpose_params(body, purpose)   # 용도 파라미터가 코드 기본을 이긴다(지시)
    if json_schema:
        body["guided_json"] = json_schema
    headers = {"Content-Type": "application/json"}
    _key = str(llm.get("apikey") or "")
    if _key and not _key.startswith("http"):   # 일부 등록건은 apikey 칸에 URL이 들어있음 — 방어
        headers["Authorization"] = f"Bearer {_key}"
    url = str(llm["endpoint"]).rstrip("/") + "/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(url, headers=headers, json=body)
            if r.status_code != 200 and json_schema:   # guided_json 미지원 → json_object 폴백
                body.pop("guided_json", None)
                body["response_format"] = {"type": "json_object"}
                r = await client.post(url, headers=headers, json=body)
            if r.status_code != 200:
                return None, f"LLM {r.status_code}: {r.text[:200]}"
            content = (((r.json().get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
            return content, None
    except Exception as e:
        return None, str(e)[:200]

def _ai_json(content):
    """LLM 응답에서 JSON 오브젝트 추출."""
    import re as _re
    try:
        m = _re.search(r"\{.*\}", str(content or ""), _re.DOTALL)
        return json.loads(m.group(0) if m else content)
    except Exception:
        return None


def _tc_item_md(item, cycle):
    """Cycle 항목(스텝 포함)을 검색용 Markdown으로 직렬화."""
    lines = [f"# [TC] {item.get('tcid','')} {item.get('name','')}",
             f"- 모델: {cycle.get('model','')} / 버전: {cycle.get('version','')} ({cycle.get('version_group','')})",
             f"- 결과: {item.get('result') or item.get('status') or '-'} · 실행 {str(item.get('last_run') or '')[:16]}", ""]
    for i, s in enumerate(item.get("steps") or [], 1):
        if not isinstance(s, dict):
            continue
        lines.append(f"## Step {i}. {s.get('desc') or ''}")
        if s.get("cli"):
            lines.append(f"- CLI: `{s['cli']}`")
        if s.get("criteria"):
            lines.append(f"- 판정({s.get('type','')}): {s.get('criteria')}")
        out = str(s.get("output") or "").strip()
        if out:
            lines.append("```\n" + out[:800] + "\n```")
    return "\n".join(lines)

async def _rag_index_cycle(cycle):
    """Cycle 완료 → Pass 항목 절차를 RAG(source=tc)로 자동 색인. 같은 TC는 최신 실행으로 덮어씀."""
    n = 0
    for it in (cycle.get("items") or []):
        if core.item_verdict(it) != "PASS":
            continue
        tcid = str(it.get("tcid") or "").strip()
        if not tcid:
            continue
        if _rag_index_doc("ragtc-" + tcid, f"[TC] {tcid} {it.get('name','')}", _tc_item_md(it, cycle), "tc"):
            n += 1
    if n:
        await _rag_index_warm()
    return n

def _req_to_md(req):
    """REQ 문서를 검색용 Markdown으로 직렬화."""
    lines = [f"# [REQ] {req.get('reqid') or req.get('id','')} {req.get('title') or req.get('name','')}"]
    meta = []
    for k, lb in (("folder", "폴더"), ("status", "상태"), ("priority", "우선순위")):
        if req.get(k):
            meta.append(f"{lb}: {req[k]}")
    prods = req.get("products")
    if isinstance(prods, list) and prods:
        meta.append("제품군: " + ", ".join(str(p) for p in prods))
    if meta:
        lines.append("- " + " · ".join(meta))
    for k, lb in (("overview", "개요"), ("object", "목적"), ("desc", "설명")):
        v = str(req.get(k) or "").strip()
        if v:
            lines.append(f"\n## {lb}\n{v}")
    scen = req.get("scenarios")
    if isinstance(scen, list) and scen:
        lines.append("\n## 시험 시나리오")
        for i, s in enumerate(scen, 1):
            if isinstance(s, dict):
                lines.append(f"{i}. " + " / ".join(str(v) for v in s.values() if v and isinstance(v, (str, int, float))))
            elif s:
                lines.append(f"{i}. {s}")
    cf = req.get("custom_fields")
    if isinstance(cf, dict) and cf:
        lines.append("\n## 추가 필드")
        for k, v in cf.items():
            if v:
                lines.append(f"- {k}: {v}")
    tcs = [t for t in (req.get("tc") or []) if isinstance(t, dict) and t.get("tcid")]
    if tcs:
        lines.append("\n## 연결 TC")
        for t in tcs:
            lines.append(f"- {t.get('tcid')} {t.get('name','')} ({t.get('status','')})")
    return "\n".join(lines)

async def _rag_index_req(req_id, req_data):
    # _rag_index_doc 은 sync 함수인데 그 안에서 run_coroutine_threadsafe(...).result(timeout=10) 을
    # 호출한다. 이 호출을 현재 async 이벤트 루프 안에서 그대로 실행하면 자기 자신 blocking 대기가
    # 발생해 다른 API 요청까지 몇 초 이상 지연된다. → 별도 스레드로 위임해서 이벤트 루프에서 분리.
    try:
        doc_id = "ragreq-" + req_id
        name = f"[REQ] {req_data.get('reqid') or req_id} {req_data.get('title','')}"
        text = _req_to_md(req_data)
        # sync 호출을 별도 스레드로 실행 → 이벤트 루프 blocking 방지
        ok = await asyncio.get_event_loop().run_in_executor(
            None, _rag_index_doc, doc_id, name, text, "req"
        )
        if ok:
            await _rag_index_warm()
    except Exception:
        pass


# ── S7: 통합 검색 오케스트레이터 (RAG + Confluence + Jira → Rerank → 단일 답변) ──
@router.post("/api/ai/search-all")
async def ai_search_all(payload: dict):
    q = str((payload or {}).get("query") or "").strip()
    if not q:
        return {"ok": False, "error": "query가 비어 있습니다"}
    top_k = max(1, min(int(payload.get("top_k") or 8), 16))

    async def _jira_task():
        try:
            _q = q.replace('"', ' ').strip()
            r, err = await asyncio.to_thread(jira._jira_call, "GET", "/rest/api/2/search",
                                             params={"jql": f'text ~ "{_q}" ORDER BY updated DESC',
                                                     "maxResults": 5, "fields": "summary,status,issuetype,resolution"})
            if err or not r.is_success:
                return []
            out = []
            cfg = jira._jira_cfg()
            for iss in (r.json().get("issues") or []):
                fl = iss.get("fields") or {}
                out.append({"source": "jira", "name": iss.get("key", ""),
                            "text": f"[{((fl.get('issuetype') or {}).get('name',''))} · {((fl.get('status') or {}).get('name',''))}] {fl.get('summary','')}",
                            "url": (str(cfg.get('url') or '').rstrip('/') + "/browse/" + iss.get("key", ""))})
            return out
        except Exception:
            return []

    async def _rag_task():
        try:
            hits, _m = await _hybrid_search(q, top_k=top_k, sources=payload.get("sources"))
            return [{"source": h.get("source", "manual"), "name": h.get("name", ""), "text": str(h.get("text") or ""), "url": ""} for h, _sc in hits]
        except Exception:
            return []

    async def _conf_task():
        try:
            conf = await _confluence_live_search(q, 3)
            return [{"source": "confluence", "name": c.get("name", ""), "text": str(c.get("text") or "")[:800], "url": c.get("url", "")} for c in (conf or [])]
        except Exception:
            return []

    rag_hits, conf_hits, jira_hits = await asyncio.gather(_rag_task(), _conf_task(), _jira_task())
    cand = rag_hits + conf_hits + jira_hits
    if not cand:
        return {"ok": True, "answer": "관련 자료를 찾지 못했습니다. RAG 색인·Confluence·Jira 연동 상태를 확인하세요.", "sources": []}
    # 전체 후보 통합 리랭킹 (소스 간 순위 정렬)
    rr = await _rerank(q, [c["text"][:1200] for c in cand], min(top_k, len(cand)))
    if rr:
        cand = [cand[i] for i, _sc in rr if 0 <= i < len(cand)]
    cand = cand[:top_k]
    ctx = ""
    for i, c in enumerate(cand, 1):
        ctx += f"\n[{i}] ({c['source']}) {c['name']}\n{c['text'][:900]}\n"
    sys_p = ("너는 사내 시험 지식 통합 어시스턴트다. 아래 검색 자료([번호] (소스) 제목)만 근거로 한국어로 답한다. "
             "문장 근거에 [1][2] 형태로 출처 번호를 붙이고, 마지막 줄에 '출처: [1] 이름, [2] 이름' 목록을 쓴다. "
             "자료에 없는 내용은 추측하지 말고 없다고 답한다.")
    ans, err = await _ai_chat([{"role": "system", "content": sys_p}, {"role": "user", "content": f"[검색 자료]{ctx}\n\n[질문] {q}"}], max_tokens=1600)
    if err:
        return {"ok": False, "error": err, "sources": [{"n": i + 1, "source": c["source"], "name": c["name"], "url": c.get("url", "")} for i, c in enumerate(cand)]}
    return {"ok": True, "answer": ans, "sources": [{"n": i + 1, "source": c["source"], "name": c["name"], "url": c.get("url", "")} for i, c in enumerate(cand)]}

# ── S6: 자연어 시험 진행 (실험적) — 자연어 → CLI 변환 → 실행 → 결과 판정 ──
def _nl_cmd_allowed(cmd, allow_config=False):
    """생성된 CLI 안전 필터.

    allow_config 면 설정 허용 목록(_config_allowed)까지 열고, 아니면 조회만.
    어느 쪽이든 _NEVER_WORDS 는 못 지나간다 — TC 초안과 **같은 정책**을 쓴다.
    """
    c = str(cmd or "").strip().lower()
    if not c:
        return False
    if any(b in c for b in core.NEVER_WORDS):
        return False
    if allow_config:
        return core.config_allowed(cmd)
    head = c.split()[0]
    return head in ("show", "display", "ping", "traceroute", "dir", "more", "cat", "get", "status", "monitor")

@router.post("/api/ai/nl-exec")
async def ai_nl_exec(payload: dict):
    """자연어 지시 → CLI 생성(Gemma) → (execute=true면) 실행 → 출력 해석·판정.
    기본은 조회성 명령만 허용. 장비 접속 파라미터는 /api/run-cli 와 동일하게 전달."""
    text = str((payload or {}).get("text") or "").strip()
    if not text:
        return {"ok": False, "error": "지시문(text)이 비어 있습니다"}
    dev_model = str(payload.get("model") or "").strip()
    schema = {"type": "object", "properties": {
        "commands": {"type": "array", "items": {"type": "string"}},
        "purpose": {"type": "string"}, "criteria": {"type": "string"}}, "required": ["commands"]}
    sys_p = ("너는 네트워크 장비 CLI 전문가다. 사용자의 자연어 지시를 장비에서 실행할 CLI 명령 목록으로 변환한다. "
             "조회(show/display/ping 등) 명령만 생성하고 설정 변경·재부팅 명령은 절대 만들지 않는다. "
             "purpose에는 무엇을 확인하는지, criteria에는 출력에서 확인할 판정 포인트를 쓴다. JSON만 출력한다.")
    content, err = await _ai_chat([{"role": "system", "content": sys_p},
                                   {"role": "user", "content": (f"대상 모델: {dev_model or '공통'}\n지시: {text}")}],
                                  max_tokens=800, json_schema=schema)
    if err:
        return {"ok": False, "error": err}
    obj = _ai_json(content) or {}
    raw_cmds = [str(c).strip() for c in (obj.get("commands") or []) if str(c or "").strip()]
    allow_cfg = bool(payload.get("allow_config"))
    cmds = [c for c in raw_cmds if _nl_cmd_allowed(c, allow_cfg)]
    blocked = [c for c in raw_cmds if c not in cmds]
    result = {"ok": True, "commands": cmds, "blocked": blocked, "purpose": obj.get("purpose", ""), "criteria": obj.get("criteria", "")}
    if not cmds:
        result.update({"ok": False, "error": "실행 가능한(안전한) 명령이 생성되지 않았습니다"})
        return result
    if not payload.get("execute"):
        return result   # 프리뷰 모드: 명령만 반환 (기본)
    run = await asyncio.to_thread(core.run_cli, {**payload, "commands": cmds})
    outputs = run.get("outputs") or []
    result["outputs"] = outputs
    if not run.get("ok", True) and run.get("error"):
        result.update({"ok": False, "error": run.get("error")})
        return result
    # 출력 해석·판정
    jschema = {"type": "object", "properties": {"verdict": {"type": "string", "enum": ["Pass", "Fail", "Unknown"]}, "reason": {"type": "string"}}, "required": ["verdict", "reason"]}
    out_txt = json.dumps(outputs, ensure_ascii=False)[:6000]
    sys_j = ("너는 네트워크 장비 시험 판정 전문가다. 실행 출력이 판정 포인트를 만족하면 Pass, 아니면 Fail, 판단 불가는 Unknown. "
             "reason에 근거(출력 인용)를 한국어로 쓴다. JSON만 출력한다.")
    jcontent, jerr = await _ai_chat([{"role": "system", "content": sys_j},
                                     {"role": "user", "content": f"지시: {text}\n판정 포인트: {obj.get('criteria','')}\n[실행 출력]\n{out_txt}"}],
                                    max_tokens=700, json_schema=jschema)
    jobj = _ai_json(jcontent) if jcontent else None
    result["verdict"] = (jobj or {}).get("verdict", "Unknown")
    result["reason"] = (jobj or {}).get("reason", jerr or "")
    return result

# ══════════ 지식 소스 통합 설정 (① 일반 gemma ② UTOP 내부 지식(시험절차+매뉴얼) ③ Jira ④ Confluence — 전역 On/Off) ══════════
KNOWLEDGE_SRC_FILE = core.DATA_DIR / "state" / "knowledge_sources.json"
_KNOWLEDGE_SRC_DEFAULT = {"general": True, "internal": True, "jira": True, "confluence": True}

def _knowledge_src_cfg():
    try:
        if KNOWLEDGE_SRC_FILE.exists():
            d = core.load_json(KNOWLEDGE_SRC_FILE)
            if isinstance(d, dict):
                return {**_KNOWLEDGE_SRC_DEFAULT, **{k: bool(d.get(k, v)) for k, v in _KNOWLEDGE_SRC_DEFAULT.items()}}
    except Exception:
        pass
    return dict(_KNOWLEDGE_SRC_DEFAULT)

@router.get("/api/knowledge-sources")
async def knowledge_sources_get():
    cfg = _knowledge_src_cfg()
    cfg["confluence_scopes"] = _conf_cfg().get("scopes") or []
    return cfg

@router.post("/api/knowledge-sources")
async def knowledge_sources_set(payload: dict, token: str = ""):
    core.require_admin(token)
    cur = _knowledge_src_cfg()
    p = payload or {}
    for k in _KNOWLEDGE_SRC_DEFAULT:
        if k in p:
            cur[k] = bool(p.get(k))
    core.save_json(KNOWLEDGE_SRC_FILE, cur)
    return {"ok": True, **cur}

# ══════════ Confluence 연동 (페이지→매뉴얼 동기화: 트리=폴더, 첨부=이미지) ══════════
CONFLUENCE_CONFIG_FILE = core.DATA_DIR / "integrations" / "confluence_config.json"
_CONF_DEFAULT = {"base_url": "", "auth_type": "bearer", "token": "", "username": "", "password": "", "space_key": "", "enabled": False, "live_query": False, "scopes": []}
# scopes: [{"id","label","space_key","parent_title","enabled"}, ...] — 검색 범위를 "스페이스 + 상위 페이지(하위 포함)"
# 여러 개 등록해 관리자가 각각 On/Off. 비어 있으면 기존 하드코딩 경로(11.Feature List/12.How to debuging, 전역 space_key)로 폴백.

def _clean_conf_scopes(scopes):
    if not isinstance(scopes, list):
        return []
    out = []
    for it in scopes:
        if not isinstance(it, dict):
            continue
        parent = str(it.get("parent_title", "")).strip()
        page_id = str(it.get("page_id", "")).strip()
        url = str(it.get("url", "")).strip()
        space = str(it.get("space_key", "")).strip()
        label = str(it.get("label", "")).strip()
        # 최소 하나의 식별자(page_id / parent_title / space_key / url) 라도 있어야 저장
        if not (parent or page_id or space or url):
            continue
        # id 자동 생성 — page_id 우선, 없으면 parent+space, 없으면 url
        _seed = page_id or (parent + space) or url
        try:
            _depth = int(it.get("depth")) if it.get("depth") not in (None, "") else None
        except Exception:
            _depth = None
        out.append({
            "id": str(it.get("id") or _rag_doc_id(_seed)),
            "label": label or parent or space or (("pageId=" + page_id) if page_id else url),
            "url": url,
            "space_key": space,
            "parent_title": parent,
            "page_id": page_id,
            "depth": _depth if (_depth is not None and 1 <= _depth <= 10) else None,
            "enabled": bool(it.get("enabled", True)),
        })
    return out

def _conf_cfg():
    try:
        if CONFLUENCE_CONFIG_FILE.exists():
            d = core.load_json(CONFLUENCE_CONFIG_FILE)
            if isinstance(d, dict):
                merged = {**_CONF_DEFAULT, **d}
                merged["scopes"] = _clean_conf_scopes(merged.get("scopes"))
                return merged
    except Exception:
        pass
    return dict(_CONF_DEFAULT)

def _conf_headers(cfg):
    h = {"Accept": "application/json"}
    if cfg.get("auth_type") == "bearer" and cfg.get("token"):
        h["Authorization"] = "Bearer " + str(cfg["token"])
    return h

def _conf_auth(cfg):
    if cfg.get("auth_type") == "basic" and cfg.get("username"):
        return (str(cfg["username"]), str(cfg.get("password") or cfg.get("token") or ""))
    return None

def _html_to_text(html):
    import re as _rh
    s = str(html or "")
    s = _rh.sub(r"(?is)<(script|style).*?</\1>", "", s)
    s = _rh.sub(r"(?i)<br\s*/?>", "\n", s)
    s = _rh.sub(r"(?i)</(p|div|li|tr|h[1-6]|td)>", "\n", s)
    s = _rh.sub(r"<[^>]+>", " ", s)
    for a, b in (("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"')):
        s = s.replace(a, b)
    s = _rh.sub(r"[ \t]+", " ", s)
    s = _rh.sub(r"\n\s*\n\s*\n+", "\n\n", s)
    return s.strip()

@router.get("/api/confluence/config")
async def conf_config_get():
    c = _conf_cfg()
    c2 = dict(c)
    c2["token"] = "***" if c.get("token") else ""
    c2["password"] = "***" if c.get("password") else ""
    return c2

@router.post("/api/confluence/config")
async def conf_config_set(payload: dict, token: str = ""):
    core.require_admin(token)
    cfg = _conf_cfg()
    for k in ("base_url", "auth_type", "username", "space_key"):
        if k in payload:
            cfg[k] = str(payload.get(k) or "").strip()
    for k in ("token", "password"):
        if k in payload and payload.get(k) not in (None, "", "***"):
            cfg[k] = str(payload.get(k))
    for k in ("enabled", "live_query"):
        if k in payload:
            cfg[k] = bool(payload.get(k))
    if "default_depth" in payload:
        try:
            _dd = int(payload.get("default_depth"))
            if 1 <= _dd <= 10:
                cfg["default_depth"] = _dd
        except Exception:
            pass
    if "scopes" in payload:
        cfg["scopes"] = _clean_conf_scopes(payload.get("scopes"))
    core.save_json(CONFLUENCE_CONFIG_FILE, cfg)
    return {"ok": True}

# 로고·아이콘·장식 제외 + 큰 이미지(콘텐츠성) 우선해서 페이지 대표 이미지 추출
_CONF_IMG_SKIP = ("logo", "icon", "banner", "button", "arrow", "bullet", "emoticon",
                  "avatar", "badge", "favicon", "header", "footer", "divider", "spacer",
                  "thumb", "small", "line.", "dot.", "bg.", "background")

def _conf_mark_images(body):
    """storage 본문의 <ac:image>를 [[CIMG:파일명]] 마커로 치환 → 텍스트 추출 시 이미지 위치 보존."""
    import re as _ri
    def repl(m):
        block = m.group(0)
        fm = _ri.search(r'ri:filename="([^"]+)"', block)
        if fm:
            return f" [[CIMG:{fm.group(1)}]] "
        return " "
    return _ri.sub(r"(?is)<ac:image.*?</ac:image>", repl, str(body or ""))

def _conf_inline_image_urls(text_marked, base, att_map):
    """[[CIMG:파일명]] → 마크다운 이미지 ![image](공개URL). (위키 공개라 URL 직접 렌더 — Dify식)"""
    import re as _ri
    def repl(m):
        fn = m.group(1)
        info = att_map.get(fn)
        if not info or not info.get("dl") or "image" not in str(info.get("mt")):
            return ""
        fnl = fn.lower()
        if any(b in fnl for b in _CONF_IMG_SKIP) or fnl.endswith(".gif") or "svg" in str(info.get("mt")):
            return ""
        url = (base + info["dl"]) if info["dl"].startswith("/") else info["dl"]
        return f"\n![image]({url})\n"
    return _ri.sub(r"\[\[CIMG:([^\]]+)\]\]", repl, text_marked)

async def _conf_page_attachments(client, base, headers, auth, pid):
    """페이지 첨부 맵 {파일명:{mt,dl,fs}} + 비이미지 파일목록(PDF 등) 반환."""
    att_map = {}; files = []
    try:
        ar = await client.get(base + f"/rest/api/content/{pid}/child/attachment", headers=headers, auth=auth, params={"limit": 50})
        if ar.status_code == 200:
            for att in (ar.json().get("results") or []):
                fn = att.get("title") or ""
                mt = ((att.get("metadata") or {}).get("mediaType")) or ""
                dl = ((att.get("_links") or {}).get("download")) or ""
                try:
                    fs = int(((att.get("extensions") or {}).get("fileSize")) or 0)
                except Exception:
                    fs = 0
                if not fn or not dl:
                    continue
                att_map[fn] = {"mt": mt, "dl": dl, "fs": fs}
                fnl = fn.lower()
                if "image" not in str(mt) and any(fnl.endswith(e) for e in (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".hwp", ".txt", ".csv")):
                    files.append({"name": fn, "url": base + dl})
    except Exception:
        pass
    return att_map, files

# ── Dify식 트리 스코핑 + 모델 정밀 매칭 ──
_CONF_TREE_CACHE = {}  # 부모 제목 -> [{"id","title"}] (메모리 캐시)

_CONF_PID_CACHE = {}
async def _conf_parent_id(client, base, headers, auth, parent_title, space_key=None):
    """페이지 제목 → pageId 조회. 결과 캐시. space 미지정이면 전역(모든 space)에서 정확 title 매치.
    (CQL 대신 페이지 API 로만 조회 — space 제약 없이 동작)."""
    sp = space_key or _conf_cfg().get("space_key") or ""
    _key = f"{sp or '*'}::{parent_title}"
    if _key in _CONF_PID_CACHE:
        return _CONF_PID_CACHE[_key]
    _pid = None
    try:
        _params = {"title": parent_title, "limit": 10}
        if sp: _params["spaceKey"] = sp
        r = await client.get(base + "/rest/api/content", headers=headers, auth=auth, params=_params)
        if r.status_code == 200:
            for pg in (r.json().get("results") or []):
                if (pg.get("title") or "").strip() == parent_title:
                    _pid = pg.get("id"); break
        # 지정 space 에서 못 찾았으면 전역 재조회
        if not _pid and sp:
            r2 = await client.get(base + "/rest/api/content", headers=headers, auth=auth, params={"title": parent_title, "limit": 10})
            if r2.status_code == 200:
                for pg in (r2.json().get("results") or []):
                    if (pg.get("title") or "").strip() == parent_title:
                        _pid = pg.get("id"); break
    except Exception:
        pass
    _CONF_PID_CACHE[_key] = _pid
    return _pid

async def _conf_children(client, base, headers, auth, parent_title, space_key=None, depth=1):
    """부모 페이지의 직계 자식 목록 (모델코드 정밀 매칭용). depth 는 사용 안 함 — 하위 전체 검색은 CQL ancestor 로.
    (예전 동작 유지 — 재귀 순회는 매우 느려서 depth 파라미터를 프론트 UX 로만 남기고 여기선 무시)."""
    cache_key = f"{space_key or ''}::{parent_title}"
    if cache_key in _CONF_TREE_CACHE:
        return _CONF_TREE_CACHE[cache_key]
    out = []
    pid = await _conf_parent_id(client, base, headers, auth, parent_title, space_key)
    if pid:
        try:
            r = await client.get(base + f"/rest/api/content/{pid}/child/page", headers=headers, auth=auth, params={"limit": 100})
            if r.status_code == 200:
                out = [{"id": p.get("id"), "title": p.get("title") or ""} for p in (r.json().get("results") or [])]
        except Exception:
            pass
    _CONF_TREE_CACHE[cache_key] = out
    return out

def _spec_title_regex(title):
    """'E61xx_Series_Spec' → ^E61\\d\\d$ (소문자 x = 숫자 와일드카드). 모델코드 정밀 매칭용."""
    import re as _rs
    b = str(title or "").replace("_Series_Spec", "").replace("_Series", "")
    pat = "".join((r"\d" if ch == "x" else _rs.escape(ch)) for ch in b)
    try:
        return _rs.compile("^" + pat + "$", _rs.I)
    except Exception:
        return None

# 페이지 본문 hit 캐시 (pageId → hit dict). TTL 로 오래된 것 자동 폐기 (변경 감지 어려워 짧게).
_CONF_HIT_CACHE = {}
_CONF_HIT_TTL = 600   # 10분

async def _conf_fetch_page_hit(client, base, headers, auth, pid, title, toks=None):
    """페이지 1개를 풀 조회 → 본문(이미지 인라인 URL)+첨부파일 hit 구성. 결과 10분 캐시."""
    import time as _tm
    _now = _tm.time()
    _cached = _CONF_HIT_CACHE.get(pid)
    if _cached and (_now - _cached[0]) < _CONF_HIT_TTL:
        return _cached[1]
    try:
        r = await client.get(base + f"/rest/api/content/{pid}", headers=headers, auth=auth, params={"expand": "body.storage"})
        if r.status_code != 200:
            return None
        pg = r.json()
        body = (((pg.get("body") or {}).get("storage") or {}).get("value")) or ""
        att_map, files = await _conf_page_attachments(client, base, headers, auth, pid)
        files = [f for f in files if f.get("name") and (f["name"] in body or (toks and any(t.lower() in f["name"].lower() for t in toks)))]
        text = _conf_inline_image_urls(_html_to_text(_conf_mark_images(body))[:7000], base, att_map)
        _hit = {"name": "Confluence · " + (title or pg.get("title") or ""), "text": text, "images": [],
                "files": files, "url": base + (((pg.get("_links") or {}).get("webui")) or "")}
        _CONF_HIT_CACHE[pid] = (_now, _hit)
        return _hit
    except Exception:
        return None

def _spec_digit_regex(title):
    """제목의 숫자 시그니처 → 정규식 ('E71xx'→71\\d\\d, 'E4300'→4300). 숫자만 입력(7100·4300) 매칭용."""
    import re as _rs
    b = str(title or "").replace("_Series_Spec", "").replace("_Series", "")
    sig = "".join(ch for ch in b if ch.isdigit() or ch == "x")
    if not sig or not any(c.isdigit() for c in sig):
        return None
    pat = "".join((r"\d" if ch == "x" else ch) for ch in sig)
    try:
        return _rs.compile("^" + pat + "$")
    except Exception:
        return None

_CONF_MODEL_INDEX = {"map": None}
async def _conf_model_index(client, base, headers, auth):
    """본문 'Model Name' 라인에서 실제 모델명 추출 → {모델명(소문자): 페이지} 매핑 (E4320·E7148T 등 형제모델 포함, 캐시)."""
    if _CONF_MODEL_INDEX.get("map") is not None:
        return _CONF_MODEL_INDEX["map"]
    import re as _ri
    mp = {}
    children = await _conf_children(client, base, headers, auth, "11.Feature List")
    for c in children:
        try:
            r = await client.get(base + f"/rest/api/content/{c.get('id')}", headers=headers, auth=auth, params={"expand": "body.storage"})
            if r.status_code != 200:
                continue
            body = (((r.json().get("body") or {}).get("storage") or {}).get("value")) or ""
            m = _ri.search(r"Model\s*Name\s*[:：]\s*([^\n]+)", _html_to_text(body), _ri.I)
            if not m:
                continue
            for mod in _ri.findall(r"[A-Za-z]{1,4}\d{3,}[A-Za-z0-9]*", m.group(1)):
                ref = {"id": c.get("id"), "title": c.get("title")}
                mp[mod.lower()] = ref
                dg = _ri.sub(r"\D", "", mod)
                if dg:
                    mp.setdefault("#" + dg, ref)   # 숫자만(4320) 키
        except Exception:
            continue
    _CONF_MODEL_INDEX["map"] = mp
    return mp

async def _conf_children_tree(client, base, headers, auth, page_id, depth=3, cache=None):
    """pageId 하위 페이지 트리 (자기 자신 포함) 재귀 수집 — child/page API 직접 호출.
    cache: (page_id, depth) → 결과 리스트 캐시 (프로세스 생존 동안)."""
    if cache is None:
        cache = _CONF_TREE_ID_CACHE
    _key = f"{page_id}::d{depth}"
    if _key in cache:
        return cache[_key]
    out = []
    # 자기 자신 (title 조회)
    try:
        r0 = await client.get(base + f"/rest/api/content/{page_id}", headers=headers, auth=auth)
        if r0.status_code == 200:
            j = r0.json()
            out.append({"id": j.get("id"), "title": j.get("title") or ""})
    except Exception:
        cache[_key] = out
        return out
    frontier = [page_id]
    for _ in range(max(1, int(depth or 1))):
        next_ids = []
        _tasks = [client.get(base + f"/rest/api/content/{pid}/child/page", headers=headers, auth=auth, params={"limit": 200}) for pid in frontier]
        _rs = await asyncio.gather(*_tasks, return_exceptions=True)
        for _r in _rs:
            if not _r or isinstance(_r, Exception) or _r.status_code != 200:
                continue
            try:
                for p in (_r.json().get("results") or []):
                    _id = p.get("id"); _t = p.get("title") or ""
                    if _id:
                        out.append({"id": _id, "title": _t})
                        next_ids.append(_id)
            except Exception:
                continue
        if not next_ids: break
        frontier = next_ids
    cache[_key] = out
    return out

_CONF_TREE_ID_CACHE = {}

async def _conf_match_under_id(client, base, headers, auth, query, page_id, depth=3):
    """pageId 기반 매칭 — child/page API 로 트리 확보 후 제목/본문 매칭.
    CQL 완전 걷어냄 — space 제약 없이 페이지 트리 자체가 검색 대상."""
    import re as _rq
    pages = await _conf_children_tree(client, base, headers, auth, page_id, depth)
    if not pages:
        return None
    raw = str(query).replace('"', " ").strip()
    if not raw:
        return None
    _stop = {"알려", "정보", "대해", "무엇", "어떻", "해줘", "해주", "있나", "뭐야", "어디", "그리고",
             "주세요", "알려줘", "확인", "내용", "추가", "질문", "정확", "어떤", "찾으", "중에", "대한", "관련"}
    _allt = []
    for t in _rq.findall(r"[A-Za-z0-9]{2,}|[가-힣]{2,}", raw):
        if t not in _stop and t not in _allt:
            _allt.append(t)
    _alnum = [t for t in _allt if _rq.match(r"^[A-Za-z0-9]+$", t)]
    toks = (_alnum + [t for t in _allt if t not in _alnum])[:6]
    if not toks:
        # 키워드 없으면 자기 자신(루트) 본문만 반환
        top = pages[:1]
    else:
        # 제목 매칭 스코어 + 날짜 최신순 tiebreaker (주간 업무처럼 날짜가 title 에 있으면 최근 우선)
        _date_rx = _rq.compile(r'(\d{2})[년._-]\s*(\d{1,2})[월._-]\s*(\d{1,2})|(\d{4})[-._]?(\d{2})[-._]?(\d{2})')
        def _title_date(pg):
            t = str(pg.get("title") or "")
            m = _date_rx.search(t)
            if not m: return 0
            try:
                g = m.groups()
                if g[3]:  # YYYYMMDD
                    return int(g[3])*10000 + int(g[4])*100 + int(g[5])
                # YY년MM월DD (26년05월21일 → 20260521)
                return (2000+int(g[0]))*10000 + int(g[1])*100 + int(g[2])
            except Exception:
                return 0
        def _title_score(pg):
            t = str(pg.get("title") or "").lower()
            sc = 0
            for tk in _alnum:
                if tk.lower() in t: sc += 5
            for tk in toks:
                if tk in t: sc += 1
            return sc
        # 1차: 매칭 스코어 내림차순, 2차: 날짜 최신 우선
        pages_sorted = sorted(pages, key=lambda p: (_title_score(p), _title_date(p)), reverse=True)
        top = pages_sorted[:3]
        # 매칭 스코어가 전부 0 이면 날짜 최신 우선 + 자기 자신
        if all(_title_score(p) == 0 for p in top):
            top = sorted(pages, key=_title_date, reverse=True)[:3]
    # 상위 페이지 본문 병렬 fetch
    fetch_tasks = [_conf_fetch_page_hit(client, base, headers, auth, pg.get("id"), pg.get("title") or "", toks) for pg in top]
    hits_top = await asyncio.gather(*fetch_tasks, return_exceptions=True)
    merged_parts = []
    combined_files = []
    first_hit = None
    pages_meta = []
    for hit in hits_top:
        if not hit or isinstance(hit, Exception): continue
        if first_hit is None: first_hit = hit
        merged_parts.append(f"=== {hit['name']} ===\n{hit['text']}")
        combined_files.extend(hit.get("files") or [])
        pages_meta.append({"name": hit.get("name") or "", "url": hit.get("url") or ""})
    if not merged_parts:
        return None
    return {
        "name": (first_hit or {}).get("name") if first_hit else "Confluence · 여러 페이지",
        "text": "\n\n".join(merged_parts),
        "images": [],
        "files": combined_files,
        "url": (first_hit or {}).get("url", "") if first_hit else "",
        "pages": pages_meta,
    }

async def _conf_match_under_id_OLD_CQL(client, base, headers, auth, query, page_id, depth=3):
    """(사용 안 함) 옛 CQL ancestor 방식 — 참고용 보존."""
    import re as _rq
    raw = str(query).replace('"', " ").strip()
    if not raw:
        return None
    _stop = {"알려", "정보", "대해", "무엇", "어떻", "해줘", "해주", "있나", "뭐야", "어디", "그리고",
             "주세요", "알려줘", "확인", "내용", "추가", "질문", "정확", "어떤", "찾으", "중에", "대한", "관련"}
    _allt = []
    for t in _rq.findall(r"[A-Za-z0-9]{2,}|[가-힣]{2,}", raw):
        if t not in _stop and t not in _allt:
            _allt.append(t)
    _alnum = [t for t in _allt if _rq.match(r"^[A-Za-z0-9]+$", t)]
    toks = (_alnum + [t for t in _allt if t not in _alnum])[:6]
    if not toks:
        return None
    terms = " OR ".join(f'text ~ "{t}"' for t in toks)
    # ancestor 는 pageId 하위 전체 트리 (자기 자신 제외) → 자기 자신 포함하려면 OR 추가
    cql = f'({terms}) AND (ancestor = "{page_id}" OR id = {page_id}) AND type = page'
    try:
        r = await client.get(base + "/rest/api/content/search", headers=headers, auth=auth,
                              params={"cql": cql, "limit": 6, "expand": "body.storage"})
        if r.status_code != 200:
            return None
        results = r.json().get("results") or []
        if not results:
            return None
        # 스코어링: 제목/본문에 alnum 토큰 매칭 우선
        def _score(pg):
            title = str(pg.get("title") or ""); body = str((((pg.get("body") or {}).get("storage") or {}).get("value")) or "")
            sc = 0
            for t in _alnum:
                if t.lower() in title.lower(): sc += 5
                if t in body: sc += 1
            for t in toks:
                if t in body: sc += 1
            return sc
        results.sort(key=_score, reverse=True)
        top = results[:3]
        fetch_tasks = [_conf_fetch_page_hit(client, base, headers, auth, pg.get("id"), pg.get("title") or "", toks) for pg in top]
        hits_top = await asyncio.gather(*fetch_tasks, return_exceptions=True)
        # 상위 페이지들을 병합해 컨텍스트로 보내되, 각 hit 마다 자기 페이지 URL 을 유지 (프론트가 출처 링크로 표시)
        merged_parts = []
        combined_files = []
        first_hit = None
        pages_meta = []
        for hit in hits_top:
            if not hit or isinstance(hit, Exception):
                continue
            if first_hit is None:
                first_hit = hit
            merged_parts.append(f"=== {hit['name']} ===\n{hit['text']}")
            combined_files.extend(hit.get("files") or [])
            pages_meta.append({"name": hit.get("name") or "", "url": hit.get("url") or ""})
        if not merged_parts:
            return None
        return {
            "name": (first_hit or {}).get("name", "Confluence · 여러 페이지"),
            "text": "\n\n".join(merged_parts),
            "images": [],
            "files": combined_files,
            "url": (first_hit or {}).get("url", ""),
            "pages": pages_meta,   # 각 페이지 개별 URL — 프론트 출처 표시용
        }
    except Exception:
        return None

async def _conf_match_under(client, base, headers, auth, query, parent_title, use_index=False, space_key=None, depth=1):
    """parent_title → pageId → 트리 순회 방식으로 매칭 (CQL 안 씀)."""
    import re as _ri
    pid = await _conf_parent_id(client, base, headers, auth, parent_title, space_key)
    if pid:
        _hit = await _conf_match_under_id(client, base, headers, auth, query, pid, depth)
        if _hit:
            return _hit
    # pageId 못 찾은 경우: 기존 직계 자식 조회 (모델코드 정밀 매칭용)
    children = await _conf_children(client, base, headers, auth, parent_title, space_key)
    if not children:
        return None
    toks = _ri.findall(r"[A-Za-z]{0,4}\d{3,}[A-Za-z0-9]*", str(query))  # 숫자만(4300)도 허용
    idx = (await _conf_model_index(client, base, headers, auth)) if (use_index and toks) else {}
    for tok in toks:
        tl = tok.lower(); dg = _ri.sub(r"\D", "", tok)
        page = None
        # ① 실제 모델명 정확 일치 (E4320, E7148T …) — 스펙 인덱스 사용 시
        if use_index and tl in idx:
            page = idx[tl]
        # ② 제목 정규식 (E61xx→E61\d\d) — 풀 토큰 매칭
        if not page:
            for c in children:
                rgx = _spec_title_regex(c.get("title"))
                if rgx and rgx.match(tok):
                    page = {"id": c.get("id"), "title": c.get("title")}; break
        # ③ 숫자 시그니처 매칭 (7100→E71xx, 4300→E4300)
        if not page and dg:
            if use_index and ("#" + dg) in idx:
                page = idx["#" + dg]
            else:
                for c in children:
                    drx = _spec_digit_regex(c.get("title"))
                    if drx and drx.match(dg):
                        page = {"id": c.get("id"), "title": c.get("title")}; break
        if page:
            hit = await _conf_fetch_page_hit(client, base, headers, auth, page["id"], page["title"], toks)
            if hit:
                return hit
    # 폴백: 모델코드 매칭이 안 됐으면(토큰 없음 또는 전부 실패) 이 하위 페이지들 안에서 일반 CQL 텍스트검색
    return await _conf_search_within(client, base, headers, auth, query, children)

async def _conf_search_within(client, base, headers, auth, query, pages):
    """주어진 페이지 목록(하위 트리) 안에서 CQL 텍스트 검색.
    상위 1개만이 아니라 관련 페이지 여러 개를 합쳐 반환 — 세부 페이지가 있을 때 최상위 목록만 뽑히는 문제 해결."""
    import re as _rq
    raw = str(query).replace('"', " ").strip()
    if not raw or not pages:
        return None
    _stop = {"알려", "정보", "대해", "무엇", "어떻", "해줘", "해주", "있나", "뭐야", "어디", "그리고",
             "주세요", "알려줘", "확인", "내용", "추가", "질문", "정확", "어떤", "찾으", "중에", "대한", "관련"}
    toks = [t for t in _rq.findall(r"[A-Za-z0-9]{2,}|[가-힣]{2,}", raw) if t not in _stop][:6]
    if not toks:
        return None
    ids = [p.get("id") for p in pages if p.get("id")]
    if not ids:
        return None
    # 전체 페이지 목록을 조각(chunk) 으로 나눠 각 조각마다 CQL 실행 → 40개 하드 제한 회피
    _alnum = [t for t in toks if _rq.match(r"^[A-Za-z0-9]+$", t)]
    hits_all = []
    chunk_size = 35   # id_clause 길이 여유
    try:
        for _ci in range(0, len(ids), chunk_size):
            _chunk = ids[_ci:_ci+chunk_size]
            terms = " OR ".join(f'text ~ "{t}"' for t in toks)
            id_clause = " OR ".join(f'id = {pid}' for pid in _chunk)
            cql = f'({terms}) AND ({id_clause}) AND type = page'
            r = await client.get(base + "/rest/api/content/search", headers=headers, auth=auth,
                                  params={"cql": cql, "limit": 6, "expand": "body.storage"})
            if r.status_code != 200:
                continue
            for pg in (r.json().get("results") or []):
                hits_all.append(pg)
        if not hits_all:
            return None
        # 스코어링: 제목/본문에 영숫자 토큰(모델코드) 정확 매칭 우선. 그 다음 텍스트 매칭 개수.
        def _score(pg):
            title = str(pg.get("title") or ""); body = str((((pg.get("body") or {}).get("storage") or {}).get("value")) or "")
            sc = 0
            for t in _alnum:
                if t.lower() in title.lower(): sc += 5   # 제목 매치는 강한 신호
                if t in body: sc += 1
            for t in toks:
                if t in body: sc += 1
            return sc
        hits_all.sort(key=_score, reverse=True)
        # 상위 3개 페이지 hit 을 하나의 텍스트 블록으로 합쳐 반환 (LLM 컨텍스트 확장)
        top = hits_all[:3]
        merged_parts = []
        combined_files = []
        for pg in top:
            hit = await _conf_fetch_page_hit(client, base, headers, auth, pg.get("id"), pg.get("title") or "", toks)
            if not hit:
                continue
            merged_parts.append(f"=== {hit['name']} ===\n{hit['text']}")
            combined_files.extend(hit.get("files") or [])
        if not merged_parts:
            return None
        # 상위 페이지들 병렬 fetch → 페이지별 URL 개별 유지 (프론트 출처 하이퍼링크용)
        top_pages = hits_all[:2]
        fetch_tasks = [_conf_fetch_page_hit(client, base, headers, auth, pg.get("id"), pg.get("title") or "", toks) for pg in top_pages]
        top_hits = await asyncio.gather(*fetch_tasks, return_exceptions=True)
        pages_meta = []
        first_hit = None
        for _h in top_hits:
            if not _h or isinstance(_h, Exception): continue
            if first_hit is None: first_hit = _h
            pages_meta.append({"name": _h.get("name") or "", "url": _h.get("url") or ""})
        return {
            "name": (first_hit or {}).get("name") if first_hit else "Confluence · 여러 페이지",
            "text": "\n\n".join(merged_parts),
            "images": [],
            "files": combined_files,
            "url": (first_hit or {}).get("url", "") if first_hit else "",
            "pages": pages_meta,
        }
    except Exception:
        return None

async def _conf_match_spec(client, base, headers, auth, query):
    return await _conf_match_under(client, base, headers, auth, query, "11.Feature List", use_index=True)

async def _confluence_live_search(query, limit=4):
    """질문 시 Confluence를 CQL로 라이브 검색 → 관련 페이지(본문·이미지) 반환 (Dify식)."""
    if not _knowledge_src_cfg().get("confluence", True):
        return []   # 지식 소스 통합 설정에서 Confluence 검색 자체를 껐으면 즉시 중단
    cfg = _conf_cfg()
    base = str(cfg.get("base_url") or "").rstrip("/")
    if not base or not cfg.get("live_query") or not str(query or "").strip():
        return []
    import httpx
    headers = _conf_headers(cfg); auth = _conf_auth(cfg)
    space = str(cfg.get("space_key") or "").strip()
    import re as _rq
    raw = str(query).replace('"', " ").strip()
    _stop = {"알려", "정보", "대해", "무엇", "어떻", "해줘", "해주", "있나", "뭐야", "어디", "그리고",
             "주세요", "알려줘", "확인", "내용", "추가", "질문", "정확", "어떤", "찾으", "중에", "대한", "관련"}
    _allt = []
    for t in _rq.findall(r"[A-Za-z0-9]{2,}|[가-힣]{2,}", raw):
        if t not in _stop and t not in _allt:
            _allt.append(t)
    # 영숫자(모델코드·식별자) 토큰을 앞에 배치 → CQL/부스트에서 누락 방지 (긴 되물음 답변에서도 모델코드 보존)
    _alnum = [t for t in _allt if _rq.match(r"^[A-Za-z0-9]+$", t)]
    toks = (_alnum + [t for t in _allt if t not in _alnum])[:6]
    if not toks and raw:
        toks = [raw[:40]]
    if not toks:
        return []
    scopes = [s for s in (cfg.get("scopes") or []) if s.get("enabled")]
    # 여러 스페이스를 등록했으면 CQL에서도 그 스페이스들만 대상으로(전역 space_key 하나만 걸던 것 확장)
    scope_spaces = sorted({s["space_key"] for s in scopes if s.get("space_key")})
    space_clause = ""
    if scope_spaces:
        space_clause = " AND (" + " OR ".join(f'space = "{sp}"' for sp in scope_spaces) + ")"
    elif space:
        space_clause = f' AND space = "{space}"'
    terms = " OR ".join(f'text ~ "{t}"' for t in toks)
    cql = f"({terms})" + space_clause + " AND type = page"
    out = []
    fetch_n = min(max(limit * 3, 10), 18)   # 후보를 넉넉히 받아 리랭크/스펙우선 정렬 후 상위만 사용
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            if scopes:
                # 등록된 모든 scope 병렬 검색 → 각 scope 결과를 개별 hit 으로 리턴 (병합 X)
                # 프론트가 hit 개수만큼 프롬프트에 담아 슬라이스가 균등 분배됨
                default_depth = int(cfg.get("default_depth") or 3)
                async def _one(sc):
                    _depth = int(sc.get("depth") or default_depth or 3)
                    try:
                        if sc.get("page_id"):
                            return await _conf_match_under_id(client, base, headers, auth, query, sc["page_id"], _depth)
                        if sc.get("parent_title"):
                            return await _conf_match_under(client, base, headers, auth, query, sc["parent_title"], use_index=False, space_key=(sc.get("space_key") or None), depth=_depth)
                    except Exception:
                        return None
                    return None
                _hits = await asyncio.gather(*[_one(sc) for sc in scopes], return_exceptions=True)
                # 각 scope 결과를 개별 hit 으로 (병합 안 함)
                out_hits = []
                seen_urls = set()
                for h in _hits:
                    if not h or isinstance(h, Exception): continue
                    _u = h.get("url") or ""
                    if _u and _u in seen_urls: continue
                    if _u: seen_urls.add(_u)
                    out_hits.append(h)
                if out_hits:
                    return out_hits[:8]   # 최대 8개 scope hit
            else:
                # scopes 미설정 시 기존 하드코딩 경로로 폴백(11.Feature List/12.How to debuging) — 기존 동작 유지
                _is_dbg = bool(_rq.search(r"디버깅|디버그|debug|트러블|장애|문제\s*해결|how\s*to", str(query), _rq.I))
                if _is_dbg:
                    _dbg = await _conf_match_under(client, base, headers, auth, query, "12.How to debuging")
                    if _dbg:
                        return [_dbg]
                else:
                    # Dify식 정밀 매칭: 모델코드 → 11.Feature List 하위 스펙 페이지 1개 (노이즈 0)
                    _spec = await _conf_match_spec(client, base, headers, auth, query)
                    if _spec:
                        return [_spec]
            # ② 폴백: 전체 CQL 전문검색 + 리랭크
            r = await client.get(base + "/rest/api/content/search", headers=headers, auth=auth,
                                  params={"cql": cql, "limit": fetch_n, "expand": "body.storage"})
            if r.status_code != 200:
                return []
            for pg in (r.json().get("results") or []):
                pid = pg.get("id"); title = pg.get("title") or ""
                body = (((pg.get("body") or {}).get("storage") or {}).get("value")) or ""
                att_map, files = await _conf_page_attachments(client, base, headers, auth, pid)
                # '관련 파일'은 본문에 링크됐거나(=ri:filename) 질의어와 일치하는 첨부만 (무관 첨부 제외)
                files = [f for f in files if (f.get("name") and (f["name"] in body or any(t.lower() in f["name"].lower() for t in toks)))]
                # 본문 이미지 위치에 마커 → 텍스트 추출 → [[IMG:n]]로 치환 + 인라인 이미지 다운로드
                text_marked = _html_to_text(_conf_mark_images(body))[:7000]
                text = _conf_inline_image_urls(text_marked, base, att_map)   # 이미지=공개URL 마크다운 인라인
                out.append({"name": "Confluence · " + title, "text": text, "images": [],
                            "files": files, "url": base + (((pg.get("_links") or {}).get("webui")) or "")})
    except Exception:
        return []
    # 의미 기반 리랭커로 적합도 재정렬 (제목/패턴 하드코딩 없이 모든 질문 유형에 일반 적용).
    # 리랭크 입력은 '제목 + 본문' — 제목 신호도 반영되어 인덱스/내비 페이지가 자연히 후순위로 밀림.
    if len(out) > 1:
        try:
            docs = [(str(h.get("name") or "").replace("Confluence · ", "") + "\n" + str(h.get("text") or ""))[:1800] for h in out]
            ranked = await _rerank(query, docs, len(out))
            if ranked:
                out = [out[i] for i, _sc in ranked if 0 <= i < len(out)]
        except Exception:
            pass
    # 식별 토큰(모델코드 등 영숫자 4자+) 포함 페이지 우선 — 일반 IR 부스트(특정 페이지 하드코딩 아님).
    # 안정 정렬이라 리랭크 의미순서는 그대로 두고, 식별어가 든 페이지만 앞으로 끌어올림.
    ents = [t for t in toks if _rq.match(r"^[A-Za-z0-9]{4,}$", t)]
    if ents:
        def _has_ent(h):
            blob = (str(h.get("name") or "") + " " + str(h.get("text") or "")).lower()
            return any(e.lower() in blob for e in ents)
        out.sort(key=lambda h: 0 if _has_ent(h) else 1)
    return out[:limit]

@router.post("/api/confluence/test")
async def conf_test(token: str = ""):
    cfg = _conf_cfg()
    base = str(cfg.get("base_url") or "").rstrip("/")
    if not base:
        return {"ok": False, "error": "base_url 미설정"}
    import httpx
    space = str(cfg.get("space_key") or "").strip()
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            if space:
                # 설정한 스페이스(kb)에 실제 접근 가능한지 직접 확인
                r = await client.get(base + f"/rest/api/space/{space}", headers=_conf_headers(cfg), auth=_conf_auth(cfg))
                if r.status_code == 200:
                    s = r.json()
                    # 페이지 수도 함께 확인
                    cnt = None
                    try:
                        pr = await client.get(base + "/rest/api/content", headers=_conf_headers(cfg), auth=_conf_auth(cfg), params={"spaceKey": space, "type": "page", "limit": 1})
                        if pr.status_code == 200:
                            cnt = (pr.json().get("size"))
                    except Exception:
                        pass
                    return {"ok": True, "space": {"key": s.get("key"), "name": s.get("name")}, "page_probe": cnt}
                # 접근 불가 → 접근 가능한 스페이스 목록 안내
                lr = await client.get(base + "/rest/api/space", headers=_conf_headers(cfg), auth=_conf_auth(cfg), params={"limit": 25})
                spaces = [{"key": x.get("key"), "name": x.get("name")} for x in (lr.json().get("results") or [])] if lr.status_code == 200 else []
                return {"ok": False, "error": f"설정한 스페이스 '{space}' 접근 불가 (HTTP {r.status_code}). 이 계정으로 접근 가능한 스페이스에서 골라 Space Key를 바꾸세요.", "spaces": spaces}
            # 스페이스 미지정 → 전체 목록
            r = await client.get(base + "/rest/api/space", headers=_conf_headers(cfg), auth=_conf_auth(cfg), params={"limit": 25})
            if r.status_code != 200:
                return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
            spaces = [{"key": s.get("key"), "name": s.get("name")} for s in (r.json().get("results") or [])]
            return {"ok": True, "spaces": spaces}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}

@router.post("/api/confluence/sync")
async def conf_sync(payload: dict, token: str = ""):
    core.require_admin(token)
    cfg = _conf_cfg()
    base = str(cfg.get("base_url") or "").rstrip("/")
    space = str((payload or {}).get("space_key") or cfg.get("space_key") or "").strip()
    if not base:
        return {"ok": False, "error": "base_url 미설정"}
    import httpx, base64 as _b64
    headers = _conf_headers(cfg); auth = _conf_auth(cfg)
    init_manuals_dir()
    saved = 0
    try:
        async with httpx.AsyncClient(timeout=90, verify=False) as client:
            start = 0; limit = 25; fetched = 0
            while fetched < 1000:
                params = {"type": "page", "limit": limit, "start": start, "expand": "body.storage,ancestors,space"}
                if space:
                    params["spaceKey"] = space
                r = await client.get(base + "/rest/api/content", headers=headers, auth=auth, params=params)
                if r.status_code != 200:
                    return {"ok": False, "error": f"목록 HTTP {r.status_code}: {r.text[:200]}", "saved": saved}
                results = r.json().get("results") or []
                if not results:
                    break
                for pg in results:
                    fetched += 1
                    pid = pg.get("id"); title = pg.get("title") or ""
                    body = (((pg.get("body") or {}).get("storage") or {}).get("value")) or ""
                    text = _html_to_text(body)
                    anc = pg.get("ancestors") or []
                    folder = (anc[0].get("title") if anc else None) or ((pg.get("space") or {}).get("name")) or space or "Confluence"
                    images = []
                    try:
                        ar = await client.get(base + f"/rest/api/content/{pid}/child/attachment", headers=headers, auth=auth, params={"limit": 25})
                        if ar.status_code == 200:
                            for att in (ar.json().get("results") or []):
                                mt = ((att.get("metadata") or {}).get("mediaType")) or ""
                                dl = ((att.get("_links") or {}).get("download")) or ""
                                if dl and "image" in str(mt):
                                    iu = (base + dl) if dl.startswith("/") else dl
                                    ir = await client.get(iu, headers=headers, auth=auth)
                                    if ir.status_code == 200 and len(ir.content) < 3_000_000:
                                        idx = len(images)
                                        images.append("data:" + str(mt) + ";base64," + _b64.b64encode(ir.content).decode())
                                        text += f"\n[[IMG:{idx}]]\n"
                                if len(images) >= 15:
                                    break
                    except Exception:
                        pass
                    if not text and not images:
                        continue
                    mid = "conf-" + str(pid)
                    await db.manuals_upsert(mid, {
                        "id": mid, "name": title, "text": text, "chars": len(text), "source": "Confluence",
                        "active": True, "folder": folder, "images": images,
                        "created_at": datetime.now().strftime("%Y-%m-%d"), "confluence_id": pid,
                        "url": base + (((pg.get("_links") or {}).get("webui")) or ""),
                    })
                    saved += 1
                start += limit
                if len(results) < limit:
                    break
    except Exception as e:
        return {"ok": False, "error": str(e)[:300], "saved": saved}
    _RAG_CACHE["corpus"] = None
    return {"ok": True, "saved": saved}

@router.get("/api/rag/info")
async def rag_info():
    corpus = await _manual_chunk_corpus_async()
    by = {}
    for c in corpus:
        by[c["name"]] = by.get(c["name"], 0) + 1
    return {"total_chunks": len(corpus), "by_manual": by, "chunk_size": RAG_CHUNK_SIZE, "overlap": RAG_CHUNK_OVERLAP}

@router.get("/api/rag/chunks")
async def rag_chunks(manual: str = "", limit: int = 800):
    # 특정 매뉴얼만 조회하는 경우: 전체 코퍼스 만들지 말고 그 매뉴얼만 SELECT
    # (전체 코퍼스는 매뉴얼 수십개의 data(JSONB, 이미지 base64 포함) 를 모두 가져와 무거움)
    lim = max(1, min(limit, 2000))
    if manual:
        async with db.pool().acquire() as c:
            row = await c.fetchrow(
                "SELECT data FROM manuals WHERE active=true AND data->>'name'=$1 LIMIT 1",
                manual,
            )
        if not row:
            return {"manual": manual, "count": 0, "chunks": []}
        d = row["data"] or {}
        # 청크는 캐시된 코퍼스 없이도 텍스트만 있으면 즉시 분할 가능
        chunks = _chunk_text(d.get("text", ""))
        return {"manual": manual, "count": len(chunks), "chunks": chunks[:lim]}
    # 전체 조회는 executor 로 (blocking 회피)
    corpus = await asyncio.get_event_loop().run_in_executor(None, _manual_chunk_corpus)
    sel = [c["text"] for c in corpus]
    return {"manual": manual, "count": len(sel), "chunks": sel[:lim]}

def _retrieve_knowledge(query: str, max_chars: int = 4500):
    """사용자 질문과 관련된 사내 지식을 검색해 컨텍스트 문자열로 반환 — 시험절차 학습 + 매뉴얼(RAG)."""
    import re as _re
    terms = [t for t in _re.split(r"\s+", (query or "").lower()) if len(t) >= 2]
    if not terms:
        return ""
    parts = []
    # 1) 시험절차 학습 데이터
    try:
        items = _load_learned().get("items", [])
        def _lscore(it):
            hay = (str(it.get("title", "")) + " " + " ".join(it.get("models") or []) + " " + str(it.get("role", "")) + " "
                   + " ".join((str(s.get("desc", "")) + " " + str(s.get("cli", "")) + " " + str(s.get("imageText", ""))) for s in (it.get("steps") or []))).lower()
            return sum(1 for t in terms if t in hay)
        lhits = sorted([it for it in items if _lscore(it) > 0], key=_lscore, reverse=True)[:4]
        if lhits:
            seg = "【시험절차 학습 데이터】\n"
            for it in lhits:
                seg += f"· 시험항목: {it.get('title','')} (모델 {','.join(it.get('models') or [])} / 제품군 {it.get('role','')})\n"
                for s in (it.get("steps") or []):
                    seg += f"   - {s.get('desc','')}: `{s.get('cli','')}` [판정 {s.get('type','')} \"{s.get('criteria','')}\"]"
                    if s.get("imageText"):
                        seg += f" / 이미지인식: {str(s.get('imageText'))[:150]}"
                    seg += "\n"
            parts.append(seg)
    except Exception:
        pass
    # 2) 매뉴얼/지식 문서 — 청킹 + BM25 검색 (RAG)
    try:
        hits = _bm25_search(query, _manual_chunk_corpus(), top_k=6)
        if hits:
            seg = "【매뉴얼/지식 문서 (RAG 발췌)】\n"
            for h in hits:
                _t = _re.sub(r"\[\[IMG:\d+\]\]", "", str(h.get("text") or ""))[:600]
                seg += f"· [{h['name']}] {_t}\n"
            parts.append(seg)
    except Exception:
        pass
    ctx = "\n\n".join(parts).strip()
    if len(ctx) > max_chars:
        ctx = ctx[:max_chars] + " …(생략)"
    return ctx

def _build_chat_messages(req: "ChatRequest"):
    devices = core.load_json(core.DEVICES_FILE)["devices"]
    device_summary = "\n".join([f"- {d['group']} / {d['model']} ({d['ip']}, {d['protocol']})" for d in devices])
    system_prompt = f"""당신은 유비쿼스(Ubiquoss) 네트워크 장비 시험 자동화 전문가 AI입니다.

현재 등록된 장비:
{device_summary}

주요 역할:
1. 유비쿼스 스위치(E7124, E6124, U9024A), OLT(E61XX) CLI 명령어 안내
2. VLAN, QoS, LACP, EPON, IGMP, SNMP 등 네트워크 기능 시험 방법 안내
3. IXIA N2X (ver 7.9, TCL API), Spirent STC 계측기 사용법 안내
4. 시험 시나리오 작성 도움
5. 트러블슈팅 가이드

답변 시 CLI 명령어는 코드 블록(```)으로 표시하세요.
한국어로 답변하세요."""
    _kb = _retrieve_knowledge(req.message)   # sync 함수 안이므로 그대로 호출 (내부에서 new_event_loop 로 안전)
    if _kb:
        system_prompt += ("\n\n━━━━ 참고 지식 (사내 매뉴얼·검증된 시험절차 — 아래 데이터를 최우선 근거로 답하라) ━━━━\n" + _kb)
    system_prompt += ("\n\n[답변 규칙] 참고 지식에 근거해 답하라. 근거에 없는 CLI 명령·수치·출력은 추측하지 말고 '학습된 데이터에 없습니다'라고 밝혀라."
                      "\n[HITL] 질문이 모호하거나 모델·제품군·대상·범위 등 핵심 정보가 부족하면, 답하지 말고 응답 첫 줄에 정확히 [CLARIFY] 라고만 쓰고, "
                      "다음 줄부터 꼭 필요한 확인 질문을 '- 질문' 형식으로 한 줄에 하나씩 최대 3개 나열하라. 정보가 충분하면 [CLARIFY] 없이 바로 답하라.")
    messages = []
    for h in req.history[-10:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": req.message})
    return system_prompt, messages

@router.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    from fastapi.responses import StreamingResponse
    import json as _json
    # 설정에 등록한 Claude 가 있으면 그 키로 — .env 는 그다음이다(지적)
    cl, cmodel = _claude_any()
    if not cl:
        async def err():
            yield "data: " + _json.dumps({"text": "쓸 수 있는 Claude 가 없습니다 — 설정 → LLM 설정에 Anthropic 을 등록하거나 .env 에 ANTHROPIC_API_KEY 를 넣으세요."}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(err(), media_type="text/event-stream")
    system_prompt, messages = _build_chat_messages(req)
    safe_max = min(max(req.max_tokens, 2048), 8192)
    async def generate():
        try:
            with cl.messages.stream(
                model=cmodel or "claude-sonnet-4-6",
                max_tokens=safe_max,
                system=system_prompt,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    if text:
                        yield "data: " + _json.dumps({"text": text}) + "\n\n"
        except Exception as e:
            yield "data: " + _json.dumps({"text": f"[Claude API 오류] {_llm_err(e)}"}) + "\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")

@router.post("/api/chat")
async def chat(req: ChatRequest):
    cl, cmodel = _claude_any()
    if not cl:
        return {"reply": "쓸 수 있는 Claude 가 없습니다.\n\n설정 → LLM 설정에서 Anthropic 을 등록하고 API 키를 넣거나,\nbackend 폴더와 같은 위치의 .env 에 ANTHROPIC_API_KEY=sk-ant-... 를 넣고 서버를 재시작하세요."}

    # 장비/절차 컨텍스트 로드
    devices = core.load_json(core.DEVICES_FILE)["devices"]
    device_summary = "\n".join([f"- {d['group']} / {d['model']} ({d['ip']}, {d['protocol']})" for d in devices])

    system_prompt = f"""당신은 유비쿼스(Ubiquoss) 네트워크 장비 시험 자동화 전문가 AI입니다.

현재 등록된 장비:
{device_summary}

주요 역할:
1. 유비쿼스 스위치(E7124, E6124, U9024A), OLT(E61XX) CLI 명령어 안내
2. VLAN, QoS, LACP, EPON, IGMP, SNMP 등 네트워크 기능 시험 방법 안내
3. IXIA N2X (ver 7.9, TCL API), Spirent STC 계측기 사용법 안내
4. 시험 시나리오 작성 도움
5. 트러블슈팅 가이드

답변 시 CLI 명령어는 코드 블록(```)으로 표시하세요.
한국어로 답변하세요."""

    messages = []
    for h in req.history[-10:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": req.message})

    try:
        response = cl.messages.create(
            model=cmodel or "claude-sonnet-4-6",
            max_tokens=min(max(req.max_tokens, 2048), 8192),
            system=system_prompt,
            messages=messages
        )
        reply = response.content[0].text
    except Exception as e:
        reply = f"[Claude API 오류] {_llm_err(e)}"

    return {"reply": reply}


# ===== regrafted: Confluence + Jira (UMS) =====
def _html_to_text(html_text: str) -> str:
    """HTML을 표 구조(탭/줄바꿈)를 살린 평문으로 변환 (bs4 없이 stdlib). Confluence는 main-content 영역만 추출."""
    import re as _re
    _m = _re.search(r'id=["\']main-content["\']', html_text)
    if _m:
        _gt = html_text.find('>', _m.start())
        if _gt >= 0:
            html_text = html_text[_gt + 1:]
    from html.parser import HTMLParser
    out = []

    class _P(HTMLParser):
        def __init__(self):
            super().__init__()
            self.skip = 0

        def handle_starttag(self, tag, attrs):
            if tag in ("script", "style", "noscript", "head"):
                self.skip += 1
            elif tag in ("br", "p", "div", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "ul", "ol", "hr", "section"):
                out.append("\n")
            elif tag in ("td", "th"):
                out.append("\t")

        def handle_endtag(self, tag):
            if tag in ("script", "style", "noscript", "head") and self.skip > 0:
                self.skip -= 1

        def handle_data(self, data):
            if self.skip == 0:
                t = data.strip()
                if t:
                    out.append(t + " ")

    try:
        _P().feed(html_text)
    except Exception:
        pass
    lines = [ln.rstrip() for ln in "".join(out).splitlines()]
    cleaned, blank = [], 0
    for ln in lines:
        if ln.strip():
            cleaned.append(ln)
            blank = 0
        else:
            blank += 1
            if blank <= 1:
                cleaned.append("")
    return "\n".join(cleaned).strip()


@router.post("/api/confluence/fetch")
async def confluence_fetch(payload: dict):
    """REQ의 Confluence URL을 읽어 본문 텍스트를 반환 (TC 자동 생성용)."""
    import httpx
    url = str(payload.get("url", "")).strip()
    if not url.lower().startswith("http"):
        raise HTTPException(400, "올바른 URL이 아닙니다")
    cfg = {}
    if core.CONFLUENCE_FILE.exists():
        try:
            cfg = core.load_json(core.CONFLUENCE_FILE)
        except Exception:
            cfg = {}
    headers = {"User-Agent": "Mozilla/5.0 (U-TOP)", "Accept": "text/html,application/xhtml+xml"}
    auth = None
    if cfg.get("token"):
        headers["Authorization"] = "Bearer " + str(cfg["token"])
    elif cfg.get("username"):
        auth = (str(cfg["username"]), str(cfg.get("password", "")))
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, verify=False) as client:
            resp = await client.get(url, headers=headers, auth=auth)
        if resp.status_code in (401, 403):
            raise HTTPException(502, f"위키 인증 필요 (HTTP {resp.status_code}). data/integrations/confluence.json에 username/password 또는 token을 설정하세요.")
        resp.raise_for_status()
        text = _html_to_text(resp.text)
        return {"success": True, "text": text[:18000], "length": len(text), "truncated": len(text) > 18000}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Confluence 읽기 실패: {exc}")


# ───────────────────────────────────────────
# Knowledge AI — 저장소에서 찾아 답한다 (승인: B 인트로 + C 동작)
# ───────────────────────────────────────────
#
# 원칙: **밖에 안 나간다.** WIKI·요구사항/시험·사이클 결과는 우리 PG,
# 지라는 아침마다 받아 둔 저장소(jira_cache)다. 실시간으로 지라를 두드리지
# 않는다(지시: 부하). LLM 은 근거 묶음을 받아 [n] 표로 짚으며 답한다.
#
# 대화는 계정별로 KV 에 담는다 — kai.threads.{username}. 화면 왼쪽 1열이
# 이 목록이고, 다음 접속에 이어진다.

# 어느 시험 자료에나 들어 있는 말 — 이것으로 고르면 아무 항목이나 1등이 된다
_KAI_STOP = {
    "시험", "항목", "테스트", "test", "알려", "알려줘", "찾아", "찾아줘", "보여", "보여줘",
    "무엇", "뭐야", "어떻게", "어때", "해줘", "주세요", "있어", "있나", "있는지", "관련",
    "내용", "정리", "요약", "전부", "전체", "목록", "데이터", "결과",
}


def _kai_terms(q: str) -> list[str]:
    import re as _re
    raw = [t for t in _re.split(r"[^0-9A-Za-z가-힣_.-]+", q) if len(t) >= 2]
    # 흔한 말을 먼저 걷는다 — 남는 것이 없을 때만 되돌린다
    out = [t for t in raw if t.lower() not in _KAI_STOP] or raw
    # 조사 붙은 한글 낱말도 앞부분으로 걸리게 — 긴 것부터 다섯 개면 족하다
    out.sort(key=len, reverse=True)
    return out[:5] or ([q.strip()] if q.strip() else [])


def _kai_tc_snip(txt: str, terms: list[str]) -> str:
    """시험 항목 발췌 — **사람이 읽는 꼴**로.

    `data::text` 를 그대로 자르면 `{"name": …, "checks": [{"id": "ck178…`
    같은 JSON 이 근거로 나간다. 사람도 못 읽고 LLM 에게도 잡음이다.
    이름과 **질문에 걸린 스텝**만 골라 한 줄씩 편다."""
    try:
        d = json.loads(txt or "{}")
    except Exception:
        return _kai_snip(txt or "", terms, 200)
    head = str(d.get("name") or "")
    lines: list[str] = []
    for st in (d.get("checks") or d.get("steps") or []):
        if not isinstance(st, dict):
            continue
        cmd = str(st.get("cli") or st.get("data") or "").strip()
        desc = str(st.get("desc") or st.get("step") or "").strip()
        crit = str(st.get("criteria") or st.get("expected") or "").strip()
        blob = f"{cmd} {desc} {crit}".lower()
        if terms and not any(t.lower() in blob for t in terms):
            continue
        one = " · ".join(x for x in (desc, cmd, (f"기대 {crit}" if crit else "")) if x)
        if one:
            lines.append(one[:140])
        if len(lines) >= 5:
            break
    if not lines:
        # 걸린 스텝이 없으면 **무엇을 하는 시험인지**만이라도 보인다.
        # 앞 두 개를 그냥 집으면 model·loop 처럼 글자가 없는 스텝이라
        # 이름만 남는다 — 내용이 있는 것을 골라 세 줄까지.
        for st in (d.get("checks") or d.get("steps") or []):
            if not isinstance(st, dict):
                continue
            k = str(st.get("kind") or "")
            one = " · ".join(
                x for x in (str(st.get("desc") or st.get("step") or st.get("text") or "").strip(),
                            str(st.get("cli") or st.get("data") or "").strip(),
                            str(st.get("criteria") or st.get("expected") or "").strip()) if x
            )
            if not one:
                # 글자가 없는 스텝은 무엇을 하는지로 대신 적는다
                if k == "loop":
                    one = f"반복 {st.get('forFrom', '')}~{st.get('forTo', '')}"
                elif k == "model":
                    one = f"모델 {st.get('modelName', '')}"
                elif k:
                    one = k
            if one.strip():
                lines.append(one[:140])
            if len(lines) >= 3:
                break
    tail = "\n".join(lines)
    return (head + ("\n" + tail if tail else "")).strip() or head


def _kai_snip(text: str, terms: list[str], width: int = 260, parts: int = 2) -> str:
    """찾은 낱말이 모인 자리를 **두 군데까지** 판다.

    한 자리만 파면 낱말이 문서 안에서 흩어져 있을 때 절반이 빠진다.
    「E6100 동작 온도」 로 물었을 때가 그랬다 — 모델 이름은 사양표에,
    온도는 저 아래 다른 절에 있어서, 온도 줄만 담긴 발췌가 나갔고 LLM 은
    「이 온도가 E6100 것인지 알 수 없다」 며 근거에 없다고 답했다.

    흔한 낱말은 가볍게 센다. 모델 이름은 그 문서에 수십 번 나오고 「온도」 는
    한 곳에만 있는데, 종류 수만 세면 모델 이름이 몰린 자리가 이긴다.
    """
    if not text:
        return ""
    low = text.lower()
    spots: list[tuple[int, str]] = []
    for t in terms:
        tl = t.lower()
        at0 = low.find(tl)
        n = 0
        while at0 >= 0 and n < 60:
            spots.append((at0, tl))
            at0 = low.find(tl, at0 + 1)
            n += 1
    if not spots:
        out = text[:width].strip()
        return out + ("…" if len(text) > width else "")
    spots.sort()
    freq = {t: max(1, low.count(t)) for _p, t in spots}
    w = max(90, width // max(1, parts))
    taken: list[tuple[int, int]] = []
    for _ in range(max(1, parts)):
        best = (-1.0, -1, frozenset())
        for i, (pos, _t) in enumerate(spots):
            s0 = max(0, pos - w // 3)
            if any(not (s0 + w <= a or b <= s0) for a, b in taken):
                continue          # 이미 판 자리와 겹치면 넘어간다
            kinds = {tt for pp, tt in spots[i:] if pp < pos + w}
            sc = sum(1.0 / freq.get(tt, 1) for tt in kinds)
            if sc > best[0]:
                best = (sc, s0, frozenset(kinds))
        if best[1] < 0:
            break
        taken.append((best[1], best[1] + w))
        # 다음 자리는 **아직 안 보여 준 낱말**을 노린다
        shown = best[2]
        spots = [(p, t) for p, t in spots if t not in shown] or []
        if not spots:
            break
    taken.sort()
    outs = []
    for a, b in taken:
        seg = text[a:b].strip()
        if seg:
            outs.append(("…" if a > 0 else "") + seg + ("…" if b < len(text) else ""))
    return " ".join(outs) if outs else text[:width].strip()


async def _kai_search(q: str, scopes: set[str], projects: list[str] | None = None,
                      docs: list[str] | None = None) -> list[dict]:
    """네 저장소를 훑어 근거 후보를 모은다 — 전부 우리 것만 읽는다.

    위키는 **하이브리드 검색**(BM25+임베딩+리랭크 — 매뉴얼 RAG 와 같은 관)
    을 먼저 탄다: 「동작 온도」 로 물어도 Operating Temperature 문서가
    걸린다(지시: 제품 스펙 조회). project 를 주면 그 프로젝트 것과 공용
    (프로젝트 빈 값) 문서만 본다 — 상단 프로젝트 선택을 따라간다(질문).

    `docs` 는 **프로젝트 컨텍스트**다 — 그 문서 안에서만 찾는다. 프로젝트에
    스펙 문서 두 장을 붙여 두면 그 안에서 답하고, 밖의 문서는 안 본다."""
    terms = _kai_terms(q)
    if not terms:
        return []
    like = [f"%{t}%" for t in terms]
    out: list[dict] = []
    # **범위를 하나만 골랐으면 그만큼 깊게 본다**(지시).
    # 넷을 다 켠 채 물을 때는 저장소마다 서너 건씩 골고루 가져와야 하지만,
    # 「시험만」 으로 좁혀 놓고도 서너 건만 오면 좁힌 뜻이 없다.
    solo = len(scopes) == 1
    cap = 8 if solo else 3
    if "wiki" in scopes:
        hits = []
        try:
            hits, _mode = await _hybrid_search(q, top_k=24 if solo else 10, sources={"wiki"})
        except Exception as e:  # noqa: BLE001
            print(f"[kai] wiki 하이브리드 실패 — ILIKE 로 폴백: {e}", flush=True)
            hits = []
        seen_w: set[str] = set()
        for h, _sc in hits:
            if projects and str(h.get("project") or "") not in ("", *projects):
                continue
            wid = str(h.get("wiki_id") or "")
            if docs and wid not in docs:
                continue
            if not wid or wid in seen_w:
                continue
            seen_w.add(wid)
            # 앞 280 자를 그냥 자르지 않는다 — 조각이 길면 물어본 말이
            # 한 글자도 안 든 발췌가 근거로 나간다(지적: 「동작 온도」).
            out.append({"kind": "wiki", "id": wid, "title": str(h.get("name") or "(이름 없음)"),
                        "snippet": _kai_snip(str(h.get("text") or ""), terms, 280)})
            if len(seen_w) >= cap:
                break
    async with db.pool().acquire() as c:
        if "wiki" in scopes and not any(x["kind"] == "wiki" for x in out):
            # 폴백 — 색인이 아직 안 섰거나 하이브리드가 빈손일 때(글자 일치)
            if docs:
                rows = await c.fetch(
                    """SELECT id, project, title, plain FROM wiki_page
                       WHERE id = ANY($1::text[])""", docs)
            else:
                rows = await c.fetch(
                    """SELECT id, project, title, plain FROM wiki_page
                       WHERE title ILIKE ANY($1::text[]) OR plain ILIKE ANY($1::text[])
                       LIMIT 40""", like)
            if projects:
                rows = [r for r in rows if str(r["project"] or "") in ("", *projects)]
            def _wscore(r):
                tl, pl = (r["title"] or "").lower(), (r["plain"] or "").lower()
                return sum((3 if t.lower() in tl else 0) + pl.count(t.lower()) for t in terms)
            for r in sorted(rows, key=_wscore, reverse=True)[:cap]:
                out.append({"kind": "wiki", "id": r["id"], "title": r["title"] or "(이름 없음)",
                            "snippet": _kai_snip(r["plain"] or "", terms)})
        if "tc" in scopes:
            rows = await c.fetch(
                """SELECT tcid, name, data::text AS txt FROM tc
                   WHERE tcid ILIKE ANY($1::text[]) OR name ILIKE ANY($1::text[])
                      OR data::text ILIKE ANY($1::text[]) LIMIT 60""", like)
            def _tscore(r):
                # **이름이 먼저다.** 본문(JSON)은 아무 항목에나 같은 낱말이
                # 널려 있어, 세는 대로 두면 이름이 딱 맞는 항목이 뒤로 밀린다.
                nm = ((r["tcid"] or "") + " " + (r["name"] or "")).lower()
                return sum((10 if t.lower() in nm else 0)
                           + min(2, (r["txt"] or "").lower().count(t.lower())) for t in terms)
            for r in sorted(rows, key=_tscore, reverse=True)[:cap]:
                out.append({"kind": "tc", "id": r["tcid"], "title": r["name"] or r["tcid"],
                            "snippet": _kai_tc_snip(r["txt"] or "", terms)})
            rows = await c.fetch(
                """SELECT reqid, title FROM req
                   WHERE reqid ILIKE ANY($1::text[]) OR title ILIKE ANY($1::text[]) LIMIT 12""", like)
            for r in rows[:(4 if solo else 2)]:
                out.append({"kind": "req", "id": r["reqid"], "title": r["title"] or r["reqid"], "snippet": ""})
        if "cycle" in scopes:
            # 이름·버전만 보던 것을 **안의 내용**까지 본다(지시: 그 페이지의
            # 데이터로 답해야 한다). data 에는 항목별 스텝·보낸 명령·장비
            # 출력·판정과 그 이유가 다 들어 있다 — 「ubiPortMtu 실패했어?」
            # 처럼 항목 이름으로 물어도 걸려야 한다.
            rows = await c.fetch(
                """SELECT id, name, version, data, data::text AS txt FROM plan_run
                   WHERE id ILIKE ANY($1::text[]) OR name ILIKE ANY($1::text[])
                      OR version ILIKE ANY($1::text[]) OR data::text ILIKE ANY($1::text[])
                   LIMIT 40""", like)

            def _rscore(r):
                head = f"{r['id'] or ''} {r['name'] or ''} {r['version'] or ''}".lower()
                body = (r["txt"] or "").lower()
                return sum((5 if t.lower() in head else 0) + min(4, body.count(t.lower())) for t in terms)

            for r in sorted(rows, key=_rscore, reverse=True)[:cap]:
                try:
                    d = r["data"] if isinstance(r["data"], dict) else json.loads(r["data"] or "{}")
                except Exception:
                    d = {}
                res = d.get("results") if isinstance(d.get("results"), dict) else {}
                vals = [str(v).lower() for v in res.values()]
                np = sum(1 for v in vals if v in ("p", "pass"))
                nf = sum(1 for v in vals if v in ("f", "fail"))
                head = f"항목 {len(vals)} · 통과 {np} · 실패 {nf}"

                # **질문에 걸린 항목**을 짚어 준다 — 집계만 주면 「그래서 무엇이
                # 깨졌나」 를 다시 물어야 한다.
                logs = d.get("logs") if isinstance(d.get("logs"), dict) else {}
                lines: list[str] = []
                for tcid in list(res.keys()) + [k for k in logs if k not in res]:
                    low = str(tcid).lower()
                    lg = logs.get(tcid) if isinstance(logs.get(tcid), dict) else {}
                    steps = lg.get("steps") if isinstance(lg.get("steps"), list) else []
                    blob = low + " " + " ".join(
                        f"{st.get('cli') or st.get('data') or ''} {st.get('desc') or ''} {st.get('reason') or ''}"
                        for st in steps if isinstance(st, dict)
                    ).lower()
                    if not any(t.lower() in blob for t in terms):
                        continue
                    vv = str(res.get(tcid, "")).lower()
                    verd = ("통과" if vv in ("p", "pass") else "실패" if vv in ("f", "fail")
                            else "보류" if vv in ("b", "blocked") else "미실행" if vv in ("n", "notrun") else "")
                    why = ""
                    for st in steps:
                        if isinstance(st, dict) and str(st.get("status") or "").upper() == "FAIL":
                            why = str(st.get("reason") or st.get("cli") or "")[:90]
                            break
                    lines.append(f"{tcid}{f' {verd}' if verd else ''}{f' — {why}' if why else ''}")
                    if len(lines) >= 6:
                        break
                snip = head + ("\n" + "\n".join(lines) if lines else "")
                out.append({"kind": "run", "id": r["id"],
                            "title": f"{r['name'] or r['id']} · {r['version'] or ''}",
                            "snippet": snip})
    if "jira" in scopes and jira._JIRA_CACHE_DIR.exists():
        # 저장소 파일을 훑는다 — 아침 동기화가 채워 둔 것이라 지라는 조용하다
        best: list[tuple[int, dict]] = []
        for f in jira._JIRA_CACHE_DIR.iterdir():
            if f.suffix != ".json":
                continue
            j = jira._jira_cache_read(f)
            if not j:
                continue
            fl = j.get("fields") or {}
            key = str(j.get("key") or f.stem)
            summ = str(fl.get("summary") or "")
            desc = str(fl.get("description") or "")
            hay = (key + " " + summ).lower()
            sc = sum((4 if t.lower() in hay else 0) + min(3, desc.lower().count(t.lower())) for t in terms)
            if sc <= 0:
                continue
            st = fl.get("status") or {}
            best.append((sc, {"kind": "jira", "id": key, "title": summ or key,
                              "snippet": _kai_snip(desc, terms, 200),
                              "extra": {"status": (st or {}).get("name") if isinstance(st, dict) else "",
                                        "updated": str(fl.get("updated") or "")[:10]}}))
        best.sort(key=lambda x: -x[0])
        out.extend(b for _, b in best[:(10 if solo else 4)])
    # 좁혀 물었으면 근거도 그만큼 더 실어 보낸다
    return out[:(16 if solo else 10)]


def _kai_user(request) -> str:
    su = getattr(request.state, "user", None)
    return str((su or {}).get("username") or "") or "anon"


async def _kai_load(u: str) -> list[dict]:
    v = await db.kv_get(f"kai.threads.{u}")
    return v if isinstance(v, list) else []


@router.get("/api/kai/threads")
async def kai_threads(request: Request):
    ths = await _kai_load(_kai_user(request))
    return {"ok": True, "threads": [
        {"id": t.get("id"), "title": t.get("title"), "at": t.get("at"),
         "n": len(t.get("msgs") or []), "folder": t.get("folder") or ""}
        for t in ths]}


@router.get("/api/kai/thread/{tid}")
async def kai_thread(tid: str, request: Request):
    ths = await _kai_load(_kai_user(request))
    t = next((x for x in ths if x.get("id") == tid), None)
    if not t:
        return {"ok": False, "error": "없는 대화입니다"}
    return {"ok": True, "thread": t}


@router.delete("/api/kai/thread/{tid}")
async def kai_thread_del(tid: str, request: Request):
    u = _kai_user(request)
    ths = [x for x in await _kai_load(u) if x.get("id") != tid]
    await db.kv_set(f"kai.threads.{u}", ths)
    return {"ok": True}


@router.patch("/api/kai/thread/{tid}")
async def kai_thread_patch(tid: str, payload: dict, request: Request):
    """대화의 **이름을 바꾸거나 프로젝트로 옮긴다**.

    제목은 첫 질문에서 잘라 만든 것이라 나중에 보면 무슨 대화인지 모른다.
    프로젝트(folder)는 빈 글자로 보내면 밖으로 꺼낸다."""
    u = _kai_user(request)
    ths = await _kai_load(u)
    t = next((x for x in ths if x.get("id") == tid), None)
    if not t:
        return {"ok": False, "error": "없는 대화입니다"}
    if "title" in payload:
        nm = str(payload.get("title") or "").strip()[:80]
        if nm:
            t["title"] = nm
    if "folder" in payload:
        t["folder"] = str(payload.get("folder") or "").strip()
    await db.kv_set(f"kai.threads.{u}", ths)
    return {"ok": True, "thread": {"id": t.get("id"), "title": t.get("title"), "folder": t.get("folder") or ""}}


async def _kai_folds(u: str) -> list[dict]:
    v = await db.kv_get(f"kai.folders.{u}")
    return v if isinstance(v, list) else []


@router.get("/api/kai/folders")
async def kai_folders(request: Request):
    """프로젝트 목록. 대화 수는 여기서 세어 준다 — 화면이 두 번 읽지 않게."""
    u = _kai_user(request)
    folds = await _kai_folds(u)
    ths = await _kai_load(u)
    cnt: dict[str, int] = {}
    for t in ths:
        f = str(t.get("folder") or "")
        if f:
            cnt[f] = cnt.get(f, 0) + 1
    last: dict[str, str] = {}
    for t in ths:
        fx = str(t.get("folder") or "")
        if fx:
            at = str(t.get("at") or "")
            if at > last.get(fx, ""):
                last[fx] = at
    return {"ok": True, "folders": [
        {**f, "n": cnt.get(str(f.get("id")), 0),
         "last": last.get(str(f.get("id")), "") or str(f.get("at") or "")}
        for f in folds]}


@router.post("/api/kai/folders")
async def kai_folder_new(payload: dict, request: Request):
    from datetime import timezone as _tz
    u = _kai_user(request)
    nm = str(payload.get("name") or "").strip()[:60]
    if not nm:
        return {"ok": False, "error": "이름이 비었습니다"}
    folds = await _kai_folds(u)
    if len(folds) >= 60:
        return {"ok": False, "error": "프로젝트는 60개까지입니다"}
    fid = f"kf-{int(datetime.now(_tz.utc).timestamp()*1000)}"
    f = {"id": fid, "name": nm,
         # 설명은 **사람이 읽는 목표**, 지침은 **AI 가 따르는 규칙**이다. 카드에는
         # 둘을 이어 보여 주지만 쓰임이 달라 따로 담는다.
         "desc": str(payload.get("desc") or "").strip()[:1000],
         "instr": str(payload.get("instr") or "").strip()[:2000],
         "pin": True, "archived": False, "ctxDocs": [],
         "at": datetime.now(_tz.utc).isoformat()}
    folds.insert(0, f)
    await db.kv_set(f"kai.folders.{u}", folds)
    return {"ok": True, "folder": {**f, "n": 0}}


@router.patch("/api/kai/folder/{fid}")
async def kai_folder_patch(fid: str, payload: dict, request: Request):
    u = _kai_user(request)
    folds = await _kai_folds(u)
    f = next((x for x in folds if x.get("id") == fid), None)
    if not f:
        return {"ok": False, "error": "없는 프로젝트입니다"}
    if "name" in payload:
        nm = str(payload.get("name") or "").strip()[:60]
        if nm:
            f["name"] = nm
    if "desc" in payload:
        f["desc"] = str(payload.get("desc") or "").strip()[:1000]
    if "ctxDocs" in payload:
        # 붙일 수 있는 문서는 20 장까지 — 그보다 많으면 「그 안에서만」이 뜻을 잃는다
        f["ctxDocs"] = [str(x) for x in (payload.get("ctxDocs") or [])][:20]
    if "instr" in payload:
        f["instr"] = str(payload.get("instr") or "").strip()[:2000]
    if "pin" in payload:
        f["pin"] = bool(payload.get("pin"))
    if "archived" in payload:
        f["archived"] = bool(payload.get("archived"))
    await db.kv_set(f"kai.folders.{u}", folds)
    return {"ok": True, "folder": f}


@router.delete("/api/kai/folder/{fid}")
async def kai_folder_del(fid: str, request: Request):
    """프로젝트만 지운다 — **안의 대화는 밖으로 꺼낸다**.
    지우기 한 번에 대화까지 사라지면 되돌릴 길이 없다."""
    u = _kai_user(request)
    folds = [x for x in await _kai_folds(u) if x.get("id") != fid]
    await db.kv_set(f"kai.folders.{u}", folds)
    ths = await _kai_load(u)
    moved = 0
    for t in ths:
        if str(t.get("folder") or "") == fid:
            t["folder"] = ""
            moved += 1
    if moved:
        await db.kv_set(f"kai.threads.{u}", ths)
    return {"ok": True, "moved": moved}


@router.get("/api/kai/source")
async def kai_source(kind: str = "", id: str = ""):
    """근거 **원문** — 미리보기 판이 조각이 아니라 문서를 통째로 펴게.

    발췌 280 자만 보면 「그 앞뒤에 무엇이 있었나」 를 알 수 없다. 목업이
    문서 전체를 펴고 짚은 데만 노랗게 칠하는 까닭이다."""
    kind, id = str(kind or ""), str(id or "")
    if not kind or not id:
        return {"ok": False, "error": "무엇을 볼지 알려주세요"}
    async with db.pool().acquire() as c:
        if kind == "wiki":
            r = await c.fetchrow(
                "SELECT id, title, project, plain, updated_at, updated_by "
                "FROM wiki_page WHERE id=$1", id)
            if not r:
                return {"ok": False, "error": "없는 문서입니다"}
            return {"ok": True, "kind": "wiki", "id": r["id"], "title": r["title"] or "(이름 없음)",
                    "sub": r["project"] or "공용", "text": r["plain"] or "",
                    "at": r["updated_at"].isoformat() if r["updated_at"] else None,
                    "by": r["updated_by"] or ""}
        if kind == "tc":
            r = await c.fetchrow("SELECT tcid, name, data FROM tc WHERE tcid=$1", id)
            if not r:
                return {"ok": False, "error": "없는 시험 항목입니다"}
            d = r["data"] if isinstance(r["data"], dict) else json.loads(r["data"] or "{}")
            steps = d.get("checks") or d.get("steps") or []
            rows = []
            for i, st in enumerate(steps, 1):
                if not isinstance(st, dict):
                    continue
                cmd = str(st.get("cli") or st.get("data") or "")
                rows.append({"n": i, "kind": str(st.get("kind") or "cli"),
                             "cmd": cmd, "desc": str(st.get("desc") or ""),
                             "expected": str(st.get("expected") or "")})
            return {"ok": True, "kind": "tc", "id": r["tcid"], "title": r["name"] or r["tcid"],
                    "sub": str(d.get("folder") or ""), "rows": rows}
        if kind == "req":
            r = await c.fetchrow("SELECT reqid, title, data FROM req WHERE reqid=$1", id)
            if not r:
                return {"ok": False, "error": "없는 요구사항입니다"}
            d = r["data"] if isinstance(r["data"], dict) else json.loads(r["data"] or "{}")
            return {"ok": True, "kind": "req", "id": r["reqid"], "title": r["title"] or r["reqid"],
                    "sub": "요구사항", "text": str(d.get("intent") or d.get("desc") or "")}
        if kind == "run":
            r = await c.fetchrow(
                "SELECT run_id, plan_id, status, created_at, data FROM plan_run WHERE run_id=$1", id)
            if not r:
                return {"ok": False, "error": "없는 실행입니다"}
            d = r["data"] if isinstance(r["data"], dict) else json.loads(r["data"] or "{}")
            res = d.get("results") or {}
            rows = []
            for k, v in list(res.items())[:200]:
                vv = v if isinstance(v, dict) else {}
                rows.append({"n": len(rows) + 1, "kind": k,
                             "cmd": str(vv.get("verdict") or vv.get("v") or ""),
                             "desc": str(vv.get("at") or ""), "expected": str(vv.get("defect") or "")})
            return {"ok": True, "kind": "run", "id": r["run_id"],
                    "title": f"{r['run_id']} · {r['status'] or ''}",
                    "sub": str(r["plan_id"] or ""), "rows": rows,
                    "at": r["created_at"].isoformat() if r["created_at"] else None}
    if kind == "jira":
        v = await db.kv_get(f"jira.issue.{id}")
        if isinstance(v, dict):
            return {"ok": True, "kind": "jira", "id": id,
                    "title": str(v.get("summary") or id), "sub": str(v.get("status") or ""),
                    "text": str(v.get("description") or v.get("desc") or "")}
    return {"ok": False, "error": "원문을 찾지 못했습니다"}


async def _kai_docs(u: str) -> list[dict]:
    v = await db.kv_get(f"kai.docs.{u}")
    return v if isinstance(v, list) else []


@router.get("/api/kai/docs")
async def kai_docs(request: Request):
    """라이브러리 — 답을 **문서로 저장**한 것들. 계정별로 남는다."""
    return {"ok": True, "docs": await _kai_docs(_kai_user(request))}


@router.post("/api/kai/docs")
async def kai_doc_new(payload: dict, request: Request):
    from datetime import timezone as _tz
    u = _kai_user(request)
    title = str(payload.get("title") or "").strip()[:120]
    body = str(payload.get("body") or "")
    if not title or not body.strip():
        return {"ok": False, "error": "제목과 내용이 있어야 합니다"}
    docs = await _kai_docs(u)
    d = {
        "id": f"kd-{int(datetime.now(_tz.utc).timestamp()*1000)}",
        "title": title,
        # 종류는 화면이 정한 말 그대로 — 서버가 갈래를 알 필요는 없다
        "kind": str(payload.get("kind") or "요약").strip()[:20],
        "body": body[:120000],
        "from": str(payload.get("from") or "").strip()[:120],
        "at": datetime.now(_tz.utc).isoformat(),
    }
    docs.insert(0, d)
    # 200 장까지 — 그보다 쌓이면 라이브러리가 아니라 쓰레기통이 된다
    await db.kv_set(f"kai.docs.{u}", docs[:200])
    return {"ok": True, "doc": d}


@router.delete("/api/kai/doc/{did}")
async def kai_doc_del(did: str, request: Request):
    u = _kai_user(request)
    docs = [x for x in await _kai_docs(u) if x.get("id") != did]
    await db.kv_set(f"kai.docs.{u}", docs)
    return {"ok": True}


@router.post("/api/kai/vote")
async def kai_vote(payload: dict, request: Request):
    """답이 도움이 됐는지 — 👍 · 👎.

    나중에 어떤 물음에서 답이 헛도는지 보려면 남겨야 한다. 같은 값을 다시
    보내면 지운다(누른 것을 다시 눌러 끄는 것과 같다)."""
    u = _kai_user(request)
    tid = str(payload.get("tid") or "")
    at = int(payload.get("i") or -1)
    v = str(payload.get("v") or "")
    ths = await _kai_load(u)
    t = next((x for x in ths if x.get("id") == tid), None)
    msgs = (t or {}).get("msgs") or []
    if not t or at < 0 or at >= len(msgs):
        return {"ok": False, "error": "없는 답입니다"}
    msgs[at]["vote"] = "" if str(msgs[at].get("vote") or "") == v else v
    await db.kv_set(f"kai.threads.{u}", ths)
    return {"ok": True, "vote": msgs[at].get("vote") or ""}


@router.get("/api/kai/folder/{fid}/memory")
async def kai_folder_memory(fid: str, request: Request):
    """이 프로젝트 대화에서 **자주 참조한 근거**를 센다.

    목업의 「메모리」 — AI 가 따로 기억하는 것이 아니라, 여기서 묻고 답할 때
    무엇을 되풀이해 짚었는지다. 그것이 곧 이 프로젝트가 무엇을 다루는지다."""
    u = _kai_user(request)
    ths = [t for t in await _kai_load(u) if str(t.get("folder") or "") == fid]
    cnt: dict[str, dict] = {}
    for t in ths:
        for m in t.get("msgs") or []:
            for sx in m.get("sources") or []:
                k = f"{sx.get('kind')}:{sx.get('id')}"
                if k not in cnt:
                    cnt[k] = {"kind": sx.get("kind"), "id": sx.get("id"),
                              "title": sx.get("title") or sx.get("id"), "n": 0}
                cnt[k]["n"] += 1
    items = sorted(cnt.values(), key=lambda x: -x["n"])[:8]
    return {"ok": True, "items": items, "threads": len(ths)}


@router.post("/api/kai/ask-stream")
async def kai_ask_stream(payload: dict, request: Request):
    """**흘려보내는 답**(승인: 스트리밍). 근거를 먼저 내보내고(meta),
    LLM 글자를 오는 대로 delta 로 흘린 뒤, done 에서 대화에 싣는다.
    답을 다 만들 때까지 3~6초 침묵하던 것이 이 자리의 까닭이다."""
    import httpx as _hx
    from datetime import timezone as _tz
    from fastapi.responses import StreamingResponse

    q = str(payload.get("q") or "").strip()
    scopes = {str(x) for x in (payload.get("scopes") or [])} or {"wiki", "tc", "cycle", "jira"}
    projects = [str(x) for x in (payload.get("projects") or []) if str(x).strip()]
    tid_in = str(payload.get("tid") or "")
    fold_in = str(payload.get("folder") or "").strip()
    u = _kai_user(request)

    import time as _t
    _t0 = _t.time()

    async def gen():
        def ev(obj):  # SSE 한 줄
            return "data: " + json.dumps(obj, ensure_ascii=False) + "\n\n"
        if not q:
            yield ev({"type": "done", "error": "질문이 비었습니다"})
            return
        # 프로젝트에 문서를 붙여 두었으면 **그 안에서 먼저** 찾는다.
        # 거기서 아무것도 안 나오면 평소대로 전부에서 찾는다 — 붙였다고
        # 답이 없어지면, 왜 못 찾는지 알 수 없다.
        _ctx: list[str] = []
        if fold_in:
            _f = next((x for x in await _kai_folds(u) if x.get("id") == fold_in), None)
            _ctx = [str(x) for x in ((_f or {}).get("ctxDocs") or [])]
        srcs = await _kai_search(q, scopes, projects, _ctx or None) if _ctx else []
        if not srcs:
            srcs = await _kai_search(q, scopes, projects)
        yield ev({"type": "meta", "sources": srcs})

        blocks = []
        for i, sx in enumerate(srcs, 1):
            ex = sx.get("extra") or {}
            blocks.append(f"[{i}] ({sx['kind']}) {sx['id']} — {sx['title']}\n"
                          + (f"상태 {ex.get('status')} · {ex.get('updated')}\n" if ex else "")
                          + (sx.get("snippet") or ""))
        # **프로젝트 지침**을 맨 앞에 얹는다 — 그 프로젝트 안에서 묻는 동안은
        # 늘 같은 규칙으로 답해야 한다(예: 「표로 정리해 줘」·「E61xx 기준으로」).
        _instr = ""
        if fold_in:
            _f = next((x for x in await _kai_folds(u) if x.get("id") == fold_in), None)
            _instr = str((_f or {}).get("instr") or "").strip()
        # **고른 범위를 말해 준다**(지시) — 「시험만」 으로 좁혀 물었는데
        # 답이 위키 이야기를 하면 좁힌 뜻이 없다. 근거가 없으면 그 범위에
        # 없다고 분명히 말하게 한다.
        _SCOPE_KO = {"wiki": "WIKI 문서", "tc": "요구사항 · 시험 항목",
                     "cycle": "사이클 · 실행 결과", "jira": "Jira 이슈"}
        _scope_txt = " · ".join(_SCOPE_KO.get(x, x) for x in sorted(scopes))
        _narrow = ("" if len(scopes) >= 4 else
                   f"이 물음은 **{_scope_txt}** 안에서만 찾은 것이다. 근거에 없으면 "
                   f"「{_scope_txt} 에는 없습니다」 라고 분명히 말하고, 다른 저장소 이야기를 지어내지 마라.\n")
        # **답하는 규칙은 설정에 있다**(지시: SETUP › 용도별 프롬프트 › Knowledge AI).
        # 코드에 박아 두면 말투 한 줄 고치는 데도 배포를 해야 한다.
        _cfg = _prompt_of("kai_answer")
        _base = str(_cfg.get("system") or "").strip() or str(
            (LLM_PURPOSES.get("kai_answer") or {}).get("system") or "")
        # 프로젝트 지침과 「고른 범위」 는 그 앞에 얹는다 — 설정 글을 사람이
        # 어떻게 고치든 이 둘은 늘 따라야 한다.
        sys_p = ((f"이 대화에는 다음 지침이 있다 — 반드시 따르라: {_instr}\n" if _instr else "")
                 + _narrow + _base)
        user_p = "질문: " + q + "\n\n근거:\n" + ("\n\n".join(blocks) if blocks else "(찾은 근거 없음)")

        # 이 용도에 붙여 둔 LLM 이 있으면 그것을 쓴다
        llm = _llm_pick("kai_answer") or _ai_llm() or {}
        parts: list[str] = []
        ep = str(llm.get("endpoint") or "")
        if llm and ep:
            # OpenAI 호환 스트리밍(_ai_llm 은 이 갈래만 준다 — claude 제외)
            body = {"model": llm.get("model") or "",
                    "messages": [{"role": "system", "content": sys_p}, {"role": "user", "content": user_p}],
                    "temperature": 0.0, "max_tokens": 900, "stream": True}
            headers = {"Content-Type": "application/json"}
            ak = llm.get("apikey")
            if ak and not str(ak).lower().startswith("http"):
                headers["Authorization"] = f"Bearer {ak}"
            try:
                async with _hx.AsyncClient(timeout=180) as client:
                    async with client.stream("POST", ep.rstrip("/") + "/chat/completions",
                                             headers=headers, json=body) as rr:
                        if rr.status_code != 200:
                            raise RuntimeError(f"LLM {rr.status_code}")
                        async for line in rr.aiter_lines():
                            if not line.startswith("data:"):
                                continue
                            dat = line[5:].strip()
                            if dat == "[DONE]":
                                break
                            try:
                                dj = json.loads(dat)
                                piece = (((dj.get("choices") or [{}])[0].get("delta") or {}).get("content") or "")
                            except Exception:
                                piece = ""
                            if piece:
                                parts.append(piece)
                                yield ev({"type": "delta", "t": piece})
            except Exception as e:
                # 도중에 끊겼으면 받은 데까지 살리고, 하나도 못 받았으면 까닭을 흘린다
                if not parts:
                    yield ev({"type": "note", "t": f"(스트리밍 실패 — {str(e)[:80]})"})
        ans = "".join(parts).strip()
        if not ans:
            ans = ("LLM 이 설정되지 않았거나 답을 만들지 못했습니다. 찾은 근거는 오른쪽에서 볼 수 있습니다."
                   if srcs else "찾은 근거가 없습니다 — 범위를 넓히거나 말을 바꿔 보세요.")
            yield ev({"type": "delta", "t": ans})

        # **이어 물을 것**(목업의 fus) — 찾은 근거에서 뽑는다. 답을 읽고 나면
        # 다음에 무엇을 물어야 할지가 늘 막히는 자리다.
        fol: list[str] = []
        for sx in srcs:
            k, sid = sx.get("kind"), sx.get("id")
            cand = (f"{sid} 실행 이력" if k == "tc" else f"{sid} 실패 항목" if k == "run"
                    else f"{sid} 상태" if k == "jira"
                    else f"{sid} 시험 항목 전부" if k == "req" else "")
            if cand and cand not in fol:
                fol.append(cand)
            if len(fol) >= 3:
                break
        meta = {"scopes": sorted(scopes), "projects": projects,
                "kinds": sorted({str(x.get("kind")) for x in srcs}),
                "ms": int((_t.time() - _t0) * 1000)}

        # 대화에 싣는다 — 비스트리밍 ask 와 같은 꼴
        ths = await _kai_load(u)
        now = datetime.now(_tz.utc).isoformat()
        t = next((x for x in ths if x.get("id") == tid_in), None)
        tid = tid_in
        if t is None:
            tid = f"kai-{int(datetime.now(_tz.utc).timestamp()*1000)}"
            t = {"id": tid, "title": q[:40], "at": now, "msgs": [], "folder": fold_in}
            ths.insert(0, t)
        t["at"] = now
        t["msgs"] = (t.get("msgs") or []) + [
            {"role": "u", "text": q, "at": now},
            {"role": "a", "text": ans, "sources": srcs, "at": now, "follow": fol, "meta": meta},
        ]
        t["msgs"] = t["msgs"][-200:]
        ths.sort(key=lambda x: str(x.get("at") or ""), reverse=True)
        await db.kv_set(f"kai.threads.{u}", ths[:50])
        yield ev({"type": "done", "tid": tid, "follow": fol, "meta": meta})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/api/kai/ask")
async def kai_ask(payload: dict, request: Request):
    from datetime import timezone as _tz
    q = str(payload.get("q") or "").strip()
    if not q:
        return {"ok": False, "error": "질문이 비었습니다"}
    scopes = {str(x) for x in (payload.get("scopes") or [])} or {"wiki", "tc", "cycle", "jira"}
    srcs = await _kai_search(q, scopes, [str(x) for x in (payload.get("projects") or []) if str(x).strip()])

    # 근거 묶음 → LLM. [n] 으로 짚어 답하게 한다. 근거 밖은 모른다고 말하게.
    blocks = []
    for i, sx in enumerate(srcs, 1):
        ex = sx.get("extra") or {}
        blocks.append(f"[{i}] ({sx['kind']}) {sx['id']} — {sx['title']}\n"
                      + (f"상태 {ex.get('status')} · {ex.get('updated')}\n" if ex else "")
                      + (sx.get("snippet") or ""))
    # 스트리밍 쪽과 **같은 프롬프트**를 쓴다(SETUP › 용도별 프롬프트 › Knowledge AI).
    # 두 군데에 따로 적어 두면 한쪽만 고쳐져 답이 갈린다.
    sys_p = str(_prompt_of("kai_answer").get("system") or "").strip() or str(
        (LLM_PURPOSES.get("kai_answer") or {}).get("system") or "")
    user_p = "질문: " + q + "\n\n근거:\n" + ("\n\n".join(blocks) if blocks else "(찾은 근거 없음)")
    llm = _llm_pick("kai_answer") or _ai_llm() or {}
    ans = await jira._jira_llm_complete(llm, sys_p, user_p, max_tokens=900, purpose="kai_answer")
    if not ans:
        ans = ("LLM 이 설정되지 않았거나 답을 만들지 못했습니다. 찾은 근거는 오른쪽에서 볼 수 있습니다."
               if srcs else "찾은 근거가 없습니다 — 범위를 넓히거나 말을 바꿔 보세요.")

    # 대화에 싣는다
    u = _kai_user(request)
    ths = await _kai_load(u)
    tid = str(payload.get("tid") or "")
    now = datetime.now(_tz.utc).isoformat()
    t = next((x for x in ths if x.get("id") == tid), None)
    if t is None:
        tid = f"kai-{int(datetime.now(_tz.utc).timestamp()*1000)}"
        t = {"id": tid, "title": q[:40], "at": now, "msgs": []}
        ths.insert(0, t)
    t["at"] = now
    t["msgs"] = (t.get("msgs") or []) + [
        {"role": "u", "text": q, "at": now},
        {"role": "a", "text": ans, "sources": srcs, "at": now},
    ]
    t["msgs"] = t["msgs"][-200:]
    ths.sort(key=lambda x: str(x.get("at") or ""), reverse=True)
    await db.kv_set(f"kai.threads.{u}", ths[:50])
    return {"ok": True, "tid": tid, "title": t["title"], "answer": ans, "sources": srcs}


# ══════════════════════════════════════════════════════════════════════
# 자연어로 시험 만들기
#
# "E6100 rate limit 시험 해줘" 한 줄에서 슬롯(장비·세션)과 스텝을 만든다.
# 이 기능의 성패는 '근거' 다. 모델에게 맨손으로 물으면 유비쿼스에 없는
# 명령을 그럴듯하게 지어낸다. 그래서 반드시 다음을 찾아 함께 넘긴다:
#   1. 등록된 장비와 그 인터페이스 (실제로 존재하는 포트만 쓰게)
#   2. 같은 모델로 이미 만든 TC 의 스텝 (사내에서 쓰는 실제 명령)
#   3. 요구사항·매뉴얼에서 찾은 조각 (임베딩 서버가 있을 때)
#
# 임베딩 서버가 없어도 1·2 만으로 동작한다 — 사내망 밖에서도 쓸 수 있어야
# 하고, 무엇보다 2번(우리가 쓰던 실제 명령)이 가장 정확한 근거다.
# ══════════════════════════════════════════════════════════════════════
async def _expand_series(hint: str) -> list[str]:
    """말에 나온 모델군을 그 군의 모델 이름으로 펼친다.

    "E6000 시리즈 rate limit 시험" 이라고 하면 E6100-48X · E6100-24X 로
    만든 기존 TC 도 근거로 잡혀야 한다. 시리즈 이름만으로 찾으면 아무것도
    안 나온다 — 스텝에는 모델명이 적혀 있기 때문이다.
    """
    async with db.pool().acquire() as c:
        rows = await c.fetch(
            "SELECT name, model_group FROM device_catalog "
            "WHERE kind='model' AND model_group IS NOT NULL"
        )
    low = hint.lower()
    out: list[str] = []
    for r in rows:
        g = (r["model_group"] or "").strip()
        if g and g.lower() in low:
            out.append(r["name"])
    return out


async def _grounding_devices(hint: str) -> list[dict]:
    """말에 나온 모델·모델군·IP 와 맞는 장비를 찾는다. 없으면 전부 조금씩."""
    devs = await db.device_list()
    words = [w for w in re.split(r"[\s,·]+", hint) if len(w) >= 2]
    hit = []
    for d in devs:
        hay = " ".join(
            str(d.get(k) or "")
            for k in ("ip", "model", "model_group", "vendor", "role", "lab")
        )
        if any(w.lower() in hay.lower() for w in words):
            hit.append(d)
    return (hit or devs)[:8]


async def _grounding_steps(hint: str, limit: int = 40) -> list[dict]:
    """같은 모델·주제로 이미 만든 TC 스텝. 사내에서 실제로 쓰는 명령이다.

    모델군으로 물어보면 그 군의 모델명까지 넓혀서 찾는다.
    """
    words = [w for w in re.split(r"[\s,·]+", hint) if len(w) >= 2][:6]
    words += await _expand_series(hint)
    if not words:
        return []
    async with db.pool().acquire() as c:
        rows = await c.fetch(
            """SELECT tcid, name, data FROM tc
               WHERE data::text ILIKE ANY($1::text[])
               ORDER BY updated_at DESC LIMIT 12""",
            [f"%{w}%" for w in words],
        )
    out = []
    for r in rows:
        d = r["data"] or {}
        for s in (d.get("checks") or [])[:8]:
            if not isinstance(s, dict):
                continue
            cmd = (s.get("cli") or s.get("data") or "").strip()
            if cmd:
                out.append({"tcid": r["tcid"], "cmd": cmd,
                            "expected": (s.get("expected") or s.get("criteria") or "")[:200]})
            if len(out) >= limit:
                return out
    return out


async def _grounding_docs(query: str, k: int = 6) -> list[dict]:
    """요구사항·매뉴얼에서 찾은 조각. 임베딩 서버가 없으면 빈 목록."""
    vecs = await _embed_texts([query])
    if not vecs:
        return []
    import numpy as _np
    qv = _np.asarray(vecs[0], dtype="float32")
    qn = float(_np.linalg.norm(qv)) or 1.0
    async with db.pool().acquire() as c:
        rows = await c.fetch("SELECT key, embed, meta FROM rag_embed")
    scored = []
    for r in rows:
        try:
            v = _np.frombuffer(r["embed"], dtype="float32")
            if v.shape != qv.shape:
                continue
            s = float(qv @ v) / (qn * (float(_np.linalg.norm(v)) or 1.0))
            scored.append((s, r))
        except Exception:
            continue
    scored.sort(key=lambda x: -x[0])
    cfg = _rag_cfg()
    lo = float(cfg.get("min_score") or 0)
    return [
        {"key": r["key"], "score": round(s, 3), "text": (r["meta"] or {}).get("text", "")[:800]}
        for s, r in scored[:k] if s >= lo
    ]


_GEN_SYSTEM = """당신은 유비쿼스 네트워크 장비 시험 자동화 도구의 시험 설계자다.
사용자의 한 줄 요청에서 시험 슬롯과 스텝을 만든다.

절대 규칙:
1. 아래 '근거' 에 없는 CLI 명령을 지어내지 마라. 근거의 명령을 그대로 쓰거나
   포트·값만 바꿔 쓴다. 근거에 없으면 그 스텝의 data 를 비우고 note 에
   "근거 없음 - 확인 필요" 라고 적는다.
2. 인터페이스는 '등록된 장비' 에 실제로 있는 이름만 쓴다.
3. 슬롯 key 는 s1, s2 … 순서대로. 스텝의 session 은 반드시 만든 슬롯의 key.
4. 계측기가 필요하면 슬롯을 따로 만들고 family 를 '계측기' 로 한다.
5. 판정 기준(criteria)은 응답에서 확인할 문자열이나 수치 조건으로 적는다.

반드시 JSON 만 출력한다. 설명 문장을 붙이지 마라. 모양:
{"slots":[{"key":"s1","label":"DUT","family":"L2","device_ip":"","protocol":"telnet"}],
 "steps":[{"kind":"auto","session":"s1","step":"...","data":"...","expected":"...","criteria":"...","rca":"...","note":""}],
 "summary":"무엇을 어떻게 시험하는지 두 문장",
 "unsure":["근거가 부족해 확인이 필요한 것"]}"""


@router.post("/api/tc/{tc_id}/generate")
async def tc_generate(tc_id: str, payload: dict):
    """자연어 한 줄 → 슬롯·스텝 제안. 저장하지 않고 돌려만 준다.

    바로 저장하지 않는 이유: 모델이 만든 스텝을 사람이 보기 전에 넣으면
    잘못된 명령이 장비로 나간다. 화면에서 확인하고 적용하게 한다.
    """
    prompt = str(payload.get("prompt") or "").strip()
    # 근거 찾기용 짧은 질의. 문서로 만들 때는 프롬프트가 길어서 그대로
    # 쓰면 "시험 제목:" 같은 껍데기 낱말로 장비를 찾게 된다.
    gquery = prompt

    if not prompt:
        # 프롬프트가 없으면 **요구사항 구현의도 + 시험 목적**으로 만든다.
        # 이쪽이 본류다 — 시험은 요구사항을 검증하려고 있는 것이라, 무엇을
        # 만들지는 그 두 글이 정한다. 한 줄 요청은 빠른 손을 위한 지름길이다.
        tc = payload.get("tc") if isinstance(payload.get("tc"), dict) else None
        if tc is None:
            tc = await db.tc_get(core.tc_id_norm(tc_id))
        if not isinstance(tc, dict):
            raise HTTPException(404, "TC 를 찾을 수 없습니다")
        req = None
        rid = str(tc.get("req_id") or "").strip()
        if rid:
            try:
                # req_id 칸에는 PG 키(rq-…)와 부여 ID(U-REQ-…)가 섞여 있다
                req = await db.req_get(rid)
                if req is None:
                    async with db.pool().acquire() as c:
                        row = await c.fetchrow(
                            "SELECT data FROM req WHERE data->>'reqid'=$1 LIMIT 1", rid
                        )
                        req = dict(row["data"]) if row else None
            except Exception as e:
                print(f"[tc_generate] 요구사항 조회 실패({rid}): {e}", flush=True)
        intent = str((req or {}).get("desc") or "").strip()
        obj = str(tc.get("object_md") or "").strip()
        pre = str(tc.get("precondition_md") or "").strip()
        name = str(tc.get("name") or "").strip()
        if not intent and not obj:
            # 재료가 없으면 모델은 지어낼 수밖에 없다 — 만들지 않는 것이 맞다
            raise HTTPException(
                400,
                "요구사항 구현의도(Intent)와 시험 목적(Object)이 모두 비어 있습니다 — "
                "둘 중 하나는 있어야 스텝을 설계할 수 있습니다",
            )
        parts = [f"시험 제목: {name or tc_id}"]
        if req:
            parts.append(f"요구사항: {req.get('title') or req.get('reqid') or rid}")
        if intent:
            parts.append(f"=== 요구사항 구현의도 ===\n{intent[:4000]}")
        if obj:
            parts.append(f"=== 시험 목적 ===\n{obj[:2000]}")
        if pre:
            parts.append(f"=== 사전 준비 조건 ===\n{pre[:1000]}")
        parts.append("위 구현의도와 시험 목적을 검증하는 시험 스텝을 설계하라.")
        prompt = "\n\n".join(parts)
        gquery = " ".join(x for x in [name, str((req or {}).get("title") or ""), obj[:200]] if x)

    # 누구에게 맡길지 화면이 고른다(지시). 안 고르면 여태처럼 Claude 다.
    want_llm = str(payload.get("llm") or "").strip()
    cl, cmodel = _claude_any()
    if cl is None and not want_llm:
        raise HTTPException(
            503,
            "쓸 수 있는 Claude 가 없습니다 — 설정 → LLM 설정에 Anthropic 을 등록하거나 "
            ".env 에 ANTHROPIC_API_KEY 를 넣으세요",
        )

    devs = await _grounding_devices(gquery)
    prev = await _grounding_steps(gquery)
    docs = await _grounding_docs(gquery)

    dev_txt = "\n".join(
        f"- {d.get('ip')} · {d.get('model') or '?'}"
        f"{' (' + d['model_group'] + ')' if d.get('model_group') else ''}"
        f" · {d.get('role') or '?'} · {d.get('lab') or '?'}"
        f" · 접속 {','.join(a['protocol'] for a in (d.get('access') or []))}"
        f" · 포트 {','.join(i['name'] for i in (d.get('interfaces') or [])[:60]) or '없음'}"
        for d in devs
    ) or "(등록된 장비 없음)"
    prev_txt = "\n".join(f"- [{p['tcid']}] {p['cmd']}   → {p['expected']}" for p in prev) \
        or "(비슷한 시험 없음)"
    doc_txt = "\n\n".join(f"[{d['key']} {d['score']}]\n{d['text']}" for d in docs) \
        or "(임베딩 서버가 없어 문서 근거는 비어 있습니다)"

    user = (
        f"요청: {prompt}\n\n"
        f"=== 근거 1. 등록된 장비와 실제 포트 ===\n{dev_txt}\n\n"
        f"=== 근거 2. 우리가 이미 쓰는 명령 ===\n{prev_txt}\n\n"
        f"=== 근거 3. 요구사항·매뉴얼 ===\n{doc_txt}\n"
    )

    if want_llm:
        # 로컬이든 Claude 든 한 길로 — _llm_text 가 종류를 가려서 부른다
        _got, raw = await _ask_json("coverage_automation", _GEN_SYSTEM, user,
                                    max_tokens=4000, llm_id=want_llm)
        if isinstance(_got, dict):
            raw = json.dumps(_got, ensure_ascii=False)
    else:
        try:
            msg = cl.messages.create(
                model=cmodel or core.CLAUDE_FALLBACK_MODEL,
                max_tokens=4000,
                system=_GEN_SYSTEM,
                messages=[{"role": "user", "content": user}],
            )
            raw = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
        except Exception as e:
            raise HTTPException(502, f"모델 호출에 실패했습니다: {_llm_err(e)}") from e

    # 모델이 ```json 으로 감싸는 경우가 있다
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        raise HTTPException(502, "모델이 JSON 을 돌려주지 않았습니다")
    try:
        out = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        raise HTTPException(502, f"모델 응답을 읽지 못했습니다: {e}") from e

    return {
        "success": True,
        "proposal": out,
        "grounding": {
            "devices": len(devs),
            "prev_steps": len(prev),
            "docs": len(docs),
            "embed_ready": bool(docs) or bool(_rag_cfg().get("embed_url")),
        },
    }


def _llm_err(e: Exception) -> str:
    """모델이 준 실패를 **사람 말로** 바꾼다.

    Anthropic 은 영어 한 덩어리(JSON 통째)로 답한다. 「credit balance is
    too low」 를 그대로 화면에 던져 놓으면 무엇을 해야 하는지 알 수 없다
    (지적: 이건 뭐야). 흔한 셋은 풀어 쓰고, 나머지는 원문을 남긴다 —
    모르는 실패를 지어내 설명하는 것이 더 나쁘다.
    """
    t = str(e)
    low = t.lower()
    if "credit balance is too low" in low or ("insufficient" in low and "credit" in low):
        return ("Claude 계정에 크레딧이 없습니다 — console.anthropic.com 의 "
                "Plans & Billing 에서 충전하거나, 용도별 프롬프트에서 사용 LLM 을 "
                "랩 안의 로컬 LLM 으로 바꾸세요")
    if "authentication_error" in low or "invalid x-api-key" in low or "401" in t[:40]:
        return "API 키가 맞지 않습니다 — 설정 → LLM 설정에서 키를 다시 넣으세요"
    if "rate_limit" in low or "429" in t[:40]:
        return "잠시 뒤에 다시 하세요 — 짧은 사이에 너무 여러 번 불렀습니다(rate limit)"
    if "not_found_error" in low or ("model" in low and "not found" in low):
        return "모델 이름이 맞지 않습니다 — 설정 → LLM 설정에서 모델을 다시 고르세요"
    return t


def _json_from(raw: str):
    """모델이 준 글에서 **JSON 을 건져 낸다**.

    작은 모델은 ```json 으로 감싸거나, 앞에 「알겠습니다」 를 붙이거나,
    뒤에 설명을 단다. 한 번에 못 읽었다고 「모델이 JSON 을 돌려주지
    않았습니다」 로 끝내면 사람이 할 수 있는 일이 없다(지적).

    못 건지면 None 이다 — 지어내지 않는다.
    """
    t = str(raw or "").strip()
    if not t:
        return None
    # ```json … ``` 껍데기부터 벗긴다
    m = re.search(r"```(?:json)?\s*(.+?)```", t, re.S | re.I)
    if m:
        t = m.group(1).strip()
    for pat in (r"\{.*\}", r"\[.*\]"):
        m = re.search(pat, t, re.S)
        if not m:
            continue
        chunk = m.group(0)
        try:
            return json.loads(chunk)
        except json.JSONDecodeError:
            # 끝에 쉼표가 붙거나 홑따옴표를 쓰는 것 정도는 봐준다
            fixed = re.sub(r",\s*([}\]])", r"\1", chunk)
            try:
                return json.loads(fixed)
            except json.JSONDecodeError:
                continue
    return None


async def _ask_json(use: str, system: str, user: str, max_tokens: int = 1500,
                    llm_id: str = "", tries: int = 2):
    """JSON 을 받아 낼 때까지 (짧게) 다시 묻는다. (읽은 것, 마지막 원문)

    한 번 더 묻는 값이 사람이 다시 누르는 값보다 싸다. 두 번을 넘기지는
    않는다 — 안 되는 모델은 세 번도 안 된다.
    """
    raw = ""
    for i in range(max(1, tries)):
        u = user if i == 0 else (user + "\n\n앞의 답은 JSON 이 아니었다. **JSON 만** 출력하라. 설명·인사·코드펜스 금지.")
        raw = await _llm_text(use, system, u, max_tokens=max_tokens, llm_id=llm_id, want_json=True)
        got = _json_from(raw)
        if got is not None:
            return got, raw
    return None, raw


def _anthropic_from(llm: Optional[dict]):
    """등록해 둔 Claude 로 부르는 실물.

    설정 화면에서 키를 넣고 「연결 시험」 까지 통과했는데, 정작 일을 시킬
    때는 `.env` 의 키만 봤다 — 키가 없으면 「쓸 수 있는 LLM 이 없습니다」
    로 끝났다(지적: 등록하고 통신까지 확인했는데 왜 없다고 하나).
    """
    key = str((llm or {}).get("apikey") or "").strip()
    if not key:
        return core.claude_client
    try:
        ep = str((llm or {}).get("endpoint") or "").strip().rstrip("/")
        kw = {"api_key": key}
        # 기본 주소면 굳이 넘기지 않는다 — SDK 가 알아서 붙인다
        if ep and not ep.startswith("https://api.anthropic.com"):
            kw["base_url"] = ep
        return anthropic.Anthropic(**kw)
    except Exception as e:
        print(f"[_anthropic_from] 등록 Claude 를 세우지 못했습니다: {e}", flush=True)
        return core.claude_client


def _claude_any():
    """등록된 Claude 중 아무거나, 없으면 `.env` 의 것. (실물, 모델명)"""
    try:
        init_llms_file()
        llms = core.load_json(core.LLMS_FILE).get("llms") or []
    except Exception:
        llms = []
    for l in llms:
        if str(l.get("status", "active")) != "active":
            continue
        if str(l.get("type") or "").lower() in ("claude", "anthropic") and l.get("apikey"):
            c = _anthropic_from(l)
            if c is not None:
                return c, str(l.get("model") or "").strip() or core.CLAUDE_FALLBACK_MODEL
    return core.claude_client, core.CLAUDE_FALLBACK_MODEL


def _llm_for(use: str, llm_id: str = "") -> Optional[dict]:
    """이 일에 쓸 LLM 하나.

    `llm_id` 를 주면 그것을 쓴다 — 화면에서 사람이 고른 경우다. 랩 안에
    있는 로컬 LLM 과 Claude 는 잘하는 일이 달라서, 매번 고를 수 있어야 한다.

    안 주면 설정 → Chat LLM 에 등록한 것 중에서 고른다. `uses` 에 이 일의
    이름이 들어 있는 것이 먼저고, 없으면 활성인 아무 것. 그것도 없으면
    None 이고 부르는 쪽이 Claude 로 넘어간다.

    화면에 이미 `uses`·`field_prompts` 칸이 있는데 서버가 아무 데서도 안
    읽고 있었다. 새 설정 화면을 만드는 대신 그 칸을 쓴다.
    """
    try:
        init_llms_file()
        llms = core.load_json(core.LLMS_FILE).get("llms") or []
    except Exception as e:
        print(f"[_llm_for] LLM 목록을 읽지 못했습니다: {e}", flush=True)
        return None
    if llm_id:
        got = next((l for l in llms if str(l.get("id")) == llm_id), None)
        if got:
            return got
        # 골라 둔 것이 지워졌다 — 여기서 None 을 주면 「쓸 수 있는 LLM 이
        # 없습니다」 로 끝났다(지적). 산 것 중에서 다시 고른다.
        print(f"[_llm_for] 골라 둔 LLM({llm_id}) 이 목록에 없습니다 — 산 것으로 대신합니다", flush=True)
    # Anthropic 은 주소가 고정이라 칸이 비어 있을 수 있다 — 키가 있으면 산 것
    live = [
        l for l in llms
        if str(l.get("status", "active")) == "active"
        and (l.get("endpoint") or (str(l.get("type") or "").lower() in ("claude", "anthropic") and l.get("apikey")))
    ]
    return next((l for l in live if use in (l.get("uses") or [])), None) or (live[0] if live else None)


async def _llm_text(use: str, system: str, user: str, max_tokens: int = 1500,
                    llm_id: str = "", want_json: bool = False) -> str:
    """등록 LLM 으로 한 번 물어보고 글자만 돌려준다.

    OpenAI 호환(vLLM 등)과 Anthropic 을 둘 다 받는다. 등록된 것이 없으면
    `ANTHROPIC_API_KEY` 로 뜬 기본 Claude 를 쓴다 — 설정이 비어 있어도
    동작은 해야 한다.

    시스템 프롬프트는 설정에서 갈아끼울 수 있다. `field_prompts[use]` 가
    있으면 그것을 쓰고, 없으면 코드의 기본값을 쓴다. 장비 CLI 는 우리 것이
    특이해서 프롬프트를 배포 없이 고칠 수 있어야 한다.
    """
    # 'claude' 는 등록 목록에 없는 특별한 값 — .env 의 기본 Claude 를 뜻한다
    llm = None if llm_id == "claude" else _llm_for(use, llm_id)
    why = ""   # 등록 LLM 이 왜 안 됐는가 — 사람에게 그대로 알려 준다
    sys_p = str(((llm or {}).get("field_prompts") or {}).get(use) or "").strip() or system

    if llm and str(llm.get("type") or "").lower() not in ("claude", "anthropic", "bedrock"):
        import httpx
        base = str(llm.get("endpoint") or "").rstrip("/")
        url = base if base.endswith("/chat/completions") else base + "/chat/completions"
        headers = {"Content-Type": "application/json"}
        if llm.get("apikey"):
            headers["Authorization"] = "Bearer " + str(llm["apikey"])
        body = {
            "model": llm.get("model") or "",
            "max_tokens": int(llm.get("max_tokens") or max_tokens),
            "temperature": float(llm.get("temperature") or 0.7),
            "messages": [{"role": "system", "content": sys_p}, {"role": "user", "content": user}],
        }
        # 용도별 파라미터가 있으면 그것이 이긴다(지시) — use 가 곧 용도다
        _apply_purpose_params(body, use)
        # JSON 이 필요하면 **규격으로** 부탁한다. 말로만 「JSON 만 출력하라」 고
        # 하면 작은 모델은 곧잘 설명을 앞에 붙인다(지적: 모델이 JSON 을 안 줬다).
        if want_json:
            body["response_format"] = {"type": "json_object"}
        try:
            async with httpx.AsyncClient(timeout=120) as c:
                r = await c.post(url, json=body, headers=headers)
                if r.status_code >= 400 and want_json:
                    # 이 규격을 모르는 서버가 있다 — 빼고 한 번 더
                    body.pop("response_format", None)
                    r = await c.post(url, json=body, headers=headers)
                r.raise_for_status()
                d = r.json()
            return str(((d.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
        except Exception as e:
            # 등록 LLM 이 죽어 있을 수 있다. 조용히 실패하지 않고 Claude 로 넘어간다.
            print(f"[_llm_text] 등록 LLM({llm.get('name')}) 호출 실패 → Claude 로 시도: {e}", flush=True)
            why = f"등록 LLM({llm.get('name') or llm.get('model') or '이름 없음'}) 호출 실패: {e}"

    if str((llm or {}).get("type") or "").lower() in ("claude", "anthropic"):
        # 등록해 둔 Claude — 그 키로 부른다(여태 .env 키만 봤다)
        cl, cmodel = _anthropic_from(llm), str((llm or {}).get("model") or "").strip()
    else:
        cl, cmodel = _claude_any()

    if cl is None:
        raise HTTPException(
            503,
            (why + " — 등록한 LLM 주소·모델명을 확인하세요")
            if why else
            "쓸 수 있는 LLM 이 없습니다 — 설정 → Chat LLM 에 등록하거나 "
            ".env 에 ANTHROPIC_API_KEY 를 넣으세요",
        )
    try:
        # 용도별 파라미터(지시) — Anthropic 은 받는 것만(max_tokens·temperature) 쓴다
        _pp = _purpose_params(use)
        _kw = {}
        if "temperature" in _pp:
            _kw["temperature"] = _pp["temperature"]
        msg = cl.messages.create(
            model=cmodel or core.CLAUDE_FALLBACK_MODEL,
            max_tokens=int(_pp.get("max_tokens") or max_tokens),
            system=sys_p,
            messages=[{"role": "user", "content": user}],
            **_kw,
        )
        return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
    except Exception as e:
        raise HTTPException(502, f"모델 호출에 실패했습니다: {_llm_err(e)}") from e


_DESCRIBE_SYSTEM = """당신은 유비쿼스 네트워크 장비 시험 문서를 쓰는 사람이다.

이미 만들어진 시험 절차(스텝)를 읽고, 그 시험의 **목적**과 **사전 준비 조건**을
한국어로 쓴다. 스텝을 새로 만들거나 고치지 않는다.

규칙:
- 시험 목적은 '무엇을 확인하는 시험인가' 를 두세 문장으로. 명령을 나열하지
  말고, 그 명령들로 무엇을 확인하려는 것인지를 쓴다.
- 사전 준비 조건은 '시작 전에 되어 있어야 하는 것' 을 '- ' 로 시작하는
  목록으로. 스텝에서 읽어낼 수 있는 것만 쓴다(어떤 장비가 몇 대 필요한지,
  어떤 접속이 열려 있어야 하는지, 어떤 설정이 미리 있어야 하는지).
- 스텝에서 알 수 없는 것을 지어내지 않는다. 근거가 없으면 그 항목을 뺀다.
- 이미 적혀 있는 목적·사전조건이 함께 주어지면, 그것을 참고하되 스텝과
  어긋나는 부분은 스텝 쪽을 따른다.

JSON 만 출력한다. 형식:
{"object_md": "...", "precondition_md": "- ...\\n- ..."}
"""


@router.post("/api/tc/{tc_id}/describe")
async def tc_describe(tc_id: str, payload: dict):
    """스텝을 읽고 시험 목적·사전 준비 조건을 제안한다. 저장하지 않는다.

    `/api/tc/{id}/generate` 와 반대 방향이다. 저쪽은 '목적 → 스텝' 이고
    이쪽은 '스텝 → 목적' 이다. 명령어 캡쳐로 스텝을 먼저 만들게 되면서
    남는 일이 문서 쓰기라 이 방향이 필요해졌다.

    저장하지 않는 이유는 generate 와 같다 — 모델이 쓴 글을 사람이 보기 전에
    넣으면 틀린 설명이 그대로 문서가 된다.
    """
    tc_id = core.tc_id_norm(tc_id)

    # 화면이 편집 중인 내용을 그대로 보낼 수 있게 payload 를 먼저 본다.
    # 저장하지 않은 스텝으로도 목적을 뽑을 수 있어야 한다 — 캡쳐 직후가
    # 바로 그 순간이다.
    tc = payload.get("tc") if isinstance(payload.get("tc"), dict) else None
    if tc is None:
        tc = await db.tc_get(tc_id)
    if not isinstance(tc, dict):
        raise HTTPException(404, "TC 를 찾을 수 없습니다")

    checks = tc.get("checks") if isinstance(tc.get("checks"), list) else []

    # 스텝이 없어도 쓴다(지적: 단추가 안 켜진다 — 생성 불가).
    #
    # 원래 이 길은 「스텝 → 목적」 이었다. 그런데 시험을 요구사항에서 먼저
    # 뽑아 만들면 이름만 있고 스텝은 아직 없다 — 정작 그때 목적이 필요하다.
    # 스텝이 없으면 **요구사항의 구현의도**를 재료로 쓴다. 그것마저 없으면
    # 이름뿐인데, 그때는 지어내지 말라고 일러 둔다.
    intent = ""
    try:
        rid = str(tc.get("req_id") or "").strip()
        if rid:
            r = await db.req_get(rid)
            if not isinstance(r, dict):
                for x in await db.req_list_full():
                    if str(x.get("reqid") or "") == rid or str(x.get("id") or "") == rid:
                        r = x
                        break
            if isinstance(r, dict):
                intent = str(r.get("desc") or "").strip()
    except Exception as e:
        print(f"[tc_describe] 요구사항을 못 읽었습니다: {e}", flush=True)

    sessions = tc.get("sessions") if isinstance(tc.get("sessions"), list) else []
    sess_txt = []
    for i, dev_id in enumerate(sessions):
        try:
            d = await db.device_get(str(dev_id))
        except Exception as e:
            print(f"[tc_describe] 장비 조회 실패({dev_id}): {e}", flush=True)
            d = None
        if d:
            sess_txt.append(f"- S{i+1}: {d.get('model') or '?'} · {d.get('role') or '?'} · {d.get('ip')}")
        else:
            sess_txt.append(f"- S{i+1}: (등록에 없는 장비 {dev_id})")

    lines = []
    for n, c in enumerate(checks[:200], start=1):
        if not isinstance(c, dict):
            continue
        kind = c.get("kind") or "cli"
        body = (c.get("cli") or c.get("data") or c.get("condition")
                or c.get("text") or c.get("oid") or c.get("step") or "")
        crit = c.get("criteria") or ""
        s = c.get("session")
        who = f"S{int(s)+1}" if isinstance(s, int) else ""
        lines.append(
            f"{n}. [{kind}]{(' ' + who) if who else ''} {str(body).strip()[:200]}"
            + (f"   → 기대: {str(crit).strip()[:120]}" if crit else "")
        )

    user = (
        f"시험 제목: {tc.get('name') or '(없음)'}\n"
        f"TC ID: {tc_id}\n\n"
        f"=== 쓰는 장비 ===\n" + ("\n".join(sess_txt) or "(지정 안 됨)") + "\n\n"
        f"=== 이미 적힌 목적 ===\n{tc.get('object_md') or '(비어 있음)'}\n\n"
        f"=== 이미 적힌 사전조건 ===\n{tc.get('precondition_md') or '(비어 있음)'}\n\n"
        + (
            f"=== 시험 절차 {len(lines)}스텝 ===\n" + "\n".join(lines) + "\n"
            if lines else
            "=== 시험 절차 ===\n(아직 없음 — 아래 요구사항과 시험 제목만 보고 쓴다. "
            "명령어나 수치를 지어내지 말고, 무엇을 확인하는 시험인지와 준비 조건만 적어라.)\n"
        )
        + (f"\n=== 요구사항 구현의도 ===\n{intent[:4000]}\n" if intent else "")
    )

    out, raw = await _ask_json(
        "tc_describe", _DESCRIBE_SYSTEM, user, max_tokens=1500,
        llm_id=str(payload.get("llm") or ""),
    )
    if not isinstance(out, dict):
        raise HTTPException(502, "모델이 JSON 을 돌려주지 않았습니다 — 받은 것: "
                                 + (str(raw)[:160].replace("\n", " ") or "(빈 응답)"))

    return {
        "success": True,
        "object_md": str(out.get("object_md") or ""),
        "precondition_md": str(out.get("precondition_md") or ""),
        "steps": len(lines),
    }


@router.post("/api/req/{req_id}/ai-intent")
async def req_ai_intent(req_id: str, payload: dict):
    """짧은 요청 → **구현의도** 초안. 저장하지 않는다.

    여태 이 글은 손으로만 썼다 — 용도별 프롬프트에 REQ-Intent 자리는 있는데
    화면에 부르는 자리가 없었다(지시: Intent 에도 LLM 드롭바를).

    저장하지 않는 까닭은 목적·스텝 쪽과 같다: 모델이 쓴 글이 사람 눈을
    거치지 않고 문서가 되면 안 된다. 화면이 보여 주고 사람이 「넣기」 를
    누른다.
    """
    req = payload.get("req") if isinstance(payload.get("req"), dict) else None
    if req is None:
        req = await db.req_get(req_id)
    if not isinstance(req, dict):
        raise HTTPException(404, "요구사항을 찾을 수 없습니다")

    say = str(payload.get("text") or "").strip()
    user = (
        f"요구사항 ID: {req.get('reqid') or req_id}\n"
        f"제목: {req.get('title') or '(없음)'}\n"
        f"자리: {' › '.join(str(req.get(k) or '') for k in ('cat1', 'cat2', 'cat3', 'cat4') if req.get(k))}\n\n"
        f"=== 사람이 적은 요청 ===\n{say or '(없음 — 제목과 이미 적힌 글로 다듬어라)'}\n\n"
        f"=== 이미 적힌 구현내용 ===\n{str(req.get('desc') or '')[:4000] or '(비어 있음)'}\n\n"
        "구현의도를 마크다운으로 써라. 제목 줄은 넣지 말고 본문만 쓴다."
    )
    text = await _llm_text(
        "req_intent", _prompt_of("req_intent")["system"], user,
        max_tokens=1800, llm_id=str(payload.get("llm") or ""),
    )
    return {"ok": True, "text": text}


def _tc_title(name: str, obj: str) -> str:
    """제안의 **제목**. 번호를 적어 오면 목적의 첫 줄로 바꾼다.

    모델이 name 자리에 「TC-1」 같은 순번을 적고 정작 제목은 object 에 쓰는
    일이 잦다(지적: 제목이 없어). 그대로 만들면 목록에 TC-1…TC-6 만 서서
    무슨 시험인지 알 수 없다.
    """
    nm = str(name or "").strip()
    ob = str(obj or "").strip()
    if nm and not re.match(r"^(tc|테스트|시험)?[\s\-_#.]*\d+$", nm, re.I):
        return nm
    if not ob:
        return nm
    first = re.split(r"[\n.]", ob)[0].strip()
    return (first or ob)[:160]


@router.post("/api/req/{req_id}/ai-coverage")
async def req_ai_coverage(req_id: str, payload: dict):
    """구현의도 → **덮을 시험 항목 목록** 초안. 저장하지 않는다.

    이름과 목적까지다 — 스텝은 여기서 만들지 않는다(용도 프롬프트의 규칙).
    사람이 골라서 시험항목으로 만든다.
    """
    req = payload.get("req") if isinstance(payload.get("req"), dict) else None
    if req is None:
        req = await db.req_get(req_id)
    if not isinstance(req, dict):
        raise HTTPException(404, "요구사항을 찾을 수 없습니다")

    intent = str(req.get("desc") or "").strip()
    if not intent:
        raise HTTPException(400, "구현내용이 비어 있습니다 — Intent 를 먼저 쓰세요")

    have = []
    try:
        for t in await db.tc_list_meta():
            if str(t.get("req_id") or "") == str(req.get("reqid") or req_id):
                have.append(str(t.get("name") or ""))
    except Exception as e:
        print(f"[req_ai_coverage] 이미 있는 시험을 읽지 못했습니다: {e}", flush=True)

    user = (
        f"요구사항: {req.get('title') or ''}\n\n"
        f"=== 구현의도 ===\n{intent[:6000]}\n\n"
        f"=== 이미 있는 시험 항목 ===\n" + ("\n".join(f"- {x}" for x in have) or "(없음)") + "\n\n"
        "이미 있는 것과 겹치지 않는 시험 항목만 제안하라.\n"
        "name 은 **시험 항목의 제목**이다 — 「무엇을 어떻게 확인하는가」 로 적고, "
        "TC-1 같은 번호나 순번을 적지 마라. object 는 그 시험의 목적이다.\n"
        'JSON 만 출력한다: {"items":[{"name":"...","object":"..."}]}'
    )
    out, raw = await _ask_json(
        "req_coverage", _prompt_of("req_coverage")["system"], user,
        max_tokens=2000, llm_id=str(payload.get("llm") or ""),
    )
    if not isinstance(out, dict):
        # 무엇을 받았는지 함께 보여 준다 — 「JSON 이 아니었다」 만으로는
        # 모델을 바꿔야 하는지 프롬프트를 고쳐야 하는지 알 수 없다(지적)
        raise HTTPException(502, "모델이 JSON 을 돌려주지 않았습니다 — 받은 것: "
                                 + (str(raw)[:160].replace("\n", " ") or "(빈 응답)"))
    items = []
    for x in (out.get("items") or []):
        ob = str(x.get("object") or "").strip()
        nm = _tc_title(x.get("name") or x.get("title") or "", ob)
        if nm:
            items.append({"name": nm, "object": ob})
    return {"ok": True, "items": items, "have": len(have)}


@router.post("/api/req/{req_id}/make-tcs")
async def req_make_tcs(req_id: str, payload: dict, token: str = ""):
    """제안한 시험 항목을 **진짜 시험항목으로 만든다**. 고른 것만.

    제안을 보여만 주고 끝냈더니 옮겨 적을 길이 없었다(지적: 저장을 할 수
    없다). 그렇다고 모델이 만든 것을 곧장 밀어 넣지도 않는다 — 사람이
    고른 것만 만들고, **스텝은 비워 둔다**. 무엇을 어떤 명령으로 볼지는
    Automation 탭에서 정한다.

    자리와 모델은 **요구사항에서 물려받는다** — 요구사항이 선 폴더가
    시험도 설 자리고, 모델그룹·모델명은 그 프로젝트의 것이다. 이 둘을
    사람이 다시 고르게 하면 제안을 받는 뜻이 없다.
    """
    u = core.user_from_token(token)
    req = await db.req_get(req_id)
    if not isinstance(req, dict):
        raise HTTPException(404, "요구사항을 찾을 수 없습니다")
    items = [x for x in (payload.get("items") or []) if str((x or {}).get("name") or "").strip()]
    if not items:
        raise HTTPException(400, "만들 항목이 없습니다")

    # 프로젝트(뿌리 폴더)의 모델그룹·모델명 — 신규 시험은 이 둘이 있어야 한다
    mg = str(req.get("model_group") or "")
    md = str(req.get("model") or "")
    root = str(req.get("cat1") or "")
    if root and (not mg or not md):
        async with db.pool().acquire() as c:
            prow = await c.fetchrow(
                "SELECT model_group, model FROM project WHERE cat_id = $1", root
            )
        if prow:
            mg = mg or str(prow["model_group"] or "")
            md = md or str(prow["model"] or "")

    made = []
    async with db.pool().acquire() as c:
        for it in items:
            tcid = await core.next_tc_id(c, mg)
            d = {
                "tcid": tcid,
                "name": _tc_title(it.get("name") or "", it.get("object") or ""),
                # 제안이 말한 「무엇을 확인하는가」 는 시험 목적 자리에 그대로 앉힌다
                "object_md": str(it.get("object") or "").strip(),
                "req_id": str(req.get("id") or req.get("reqid") or req_id),
                "status": "작성중",
                "model_group": mg,
                "model": md,
                "checks": [],
                "created_by": (u or {}).get("name") or (u or {}).get("username") or "",
                "updated_by": (u or {}).get("name") or (u or {}).get("username") or "",
            }
            for i in range(4):
                k = f"cat{i + 1}"
                if req.get(k):
                    d[k] = req[k]
            await db.tc_upsert(tcid, d)
            made.append({"tcid": tcid, "name": d["name"]})

    # 요구사항 쪽 포인터에도 적어 둔다 — 연결은 두 곳에 산다
    try:
        cur = list(req.get("tc") or [])
        req["tc"] = cur + [m["tcid"] for m in made if m["tcid"] not in cur]
        await db.req_upsert(str(req.get("id") or req_id), req)
    except Exception as e:
        print(f"[req_make_tcs] 요구사항 쪽 연결을 적지 못했습니다: {e}", flush=True)

    return {"ok": True, "made": made, "model_group": mg, "model": md}


@router.post("/api/tc/{tc_id}/ai-manual")
async def tc_ai_manual(tc_id: str, payload: dict):
    """목적·자동 스텝을 읽고 **수동 시험서** 초안. 저장하지 않는다.

    수동 스텝은 사람이 읽고 따라 하는 글이라 셋으로 나뉜다 —
    무엇을 한다 / 무엇을 넣는다 / 무엇이 나와야 한다.
    """
    tc_id = core.tc_id_norm(tc_id)
    tc = payload.get("tc") if isinstance(payload.get("tc"), dict) else None
    if tc is None:
        tc = await db.tc_get(tc_id)
    if not isinstance(tc, dict):
        raise HTTPException(404, "TC 를 찾을 수 없습니다")

    checks = tc.get("checks") if isinstance(tc.get("checks"), list) else []
    auto = []
    for c in checks[:200]:
        if not isinstance(c, dict) or c.get("kind") == "manual":
            continue
        auto.append(f"- {c.get('desc') or ''} / {c.get('cli') or c.get('oid') or ''} → {c.get('criteria') or ''}")

    user = (
        f"시험 제목: {tc.get('name') or '(없음)'}\n\n"
        f"=== 시험 목적 ===\n{str(tc.get('object_md') or '')[:3000] or '(비어 있음)'}\n\n"
        f"=== 사전 준비 조건 ===\n{str(tc.get('precondition_md') or '')[:1500] or '(비어 있음)'}\n\n"
        f"=== 자동 스텝(참고) ===\n" + ("\n".join(auto) or "(없음)") + "\n\n"
        '수동 시험서를 JSON 으로만 출력한다: '
        '{"steps":[{"step":"무엇을 한다","data":"무엇을 넣는다","expected":"무엇이 나와야 한다"}]}'
    )
    out, raw = await _ask_json(
        "coverage_manual", _prompt_of("coverage_manual")["system"], user,
        max_tokens=2500, llm_id=str(payload.get("llm") or ""),
    )
    if not isinstance(out, dict):
        raise HTTPException(502, "모델이 JSON 을 돌려주지 않았습니다 — 받은 것: "
                                 + (str(raw)[:160].replace("\n", " ") or "(빈 응답)"))
    steps = [
        {
            "step": str(x.get("step") or "").strip(),
            "data": str(x.get("data") or "").strip(),
            "expected": str(x.get("expected") or "").strip(),
        }
        for x in (out.get("steps") or []) if str(x.get("step") or "").strip()
    ]
    return {"ok": True, "steps": steps}


@router.get("/api/llm-choices")
async def llm_choices():
    """글을 맡길 수 있는 것들. 화면의 고르는 칸이 이것을 읽는다.

    등록 LLM 과 기본 Claude 를 한 목록으로 준다 — 사람 눈에는 둘 다 그냥
    '누가 쓸 것인가' 이고, 어디에 등록돼 있는지는 사정이다.
    """
    try:
        init_llms_file()
        llms = core.load_json(core.LLMS_FILE).get("llms") or []
    except Exception as e:
        print(f"[llm_choices] LLM 목록을 읽지 못했습니다: {e}", flush=True)
        llms = []
    out = [
        {"id": str(l.get("id")), "name": l.get("name") or l.get("model") or "(이름 없음)",
         "model": l.get("model") or "", "local": True}
        for l in llms
        if str(l.get("status", "active")) == "active" and l.get("endpoint")
    ]
    _cl, _cm = _claude_any()
    if _cl is not None:
        out.append({"id": "claude", "name": "Claude", "model": _cm or "claude-sonnet-4-5", "local": False})
    return {"choices": out}
