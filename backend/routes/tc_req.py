# -*- coding: utf-8 -*-
"""시험 항목 · 요구사항 — main.py 에서 글자 그대로 옮겨 왔다(2026-09-28, 분리 6호·마지막).

바뀐 것은 셋뿐이다: @app→@router, main 의 이름→core.<이름>(앞 밑줄 뗀 것),
그리고 임포트 머리. 주소는 하나도 안 바뀐다.

이 파일이 대는 길:
  /api/tc · /api/tc/{id}(…path·snapshots·revisions) · /api/tc-next-id   시험 항목
  /api/req · /api/req/{id} · /api/req-next-id · /api/req-images         요구사항과 그림
  /api/req-categories · /api/folders                                    분류 폴더(4단)
  /api/codes · /api/custom-fields                                       코드표·사용자 정의 필드
  /api/trash · /api/projects · /api/id-alias · /api/id-migrate          휴지통·프로젝트·ID 옮기기
  /api/copy-tree · /api/export/xlsx · /api/upload/image                 복제·내보내기·그림 올리기
"""
import asyncio
import id_migrate
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Request, Response
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel
from typing import Optional

import core
import db
from routes import ai
from routes import cycle

router = APIRouter()


def init_req_dirs():
    core.REQ_DIR.mkdir(exist_ok=True)
    core.TC_DIR.mkdir(exist_ok=True)
    core.CYCLE_DIR.mkdir(exist_ok=True)
    core.TRASH_DIR.mkdir(exist_ok=True)
    if not core.FOLDERS_FILE.exists():
        core.save_json(core.FOLDERS_FILE, {"folders": []})

def _trash_put(kind, item_id, data, bundle=None):
    """REQ/TC 삭제 시 휴지통에 보관(복원 가능). bundle=REQ 삭제 시 딸린 TC 데이터 목록."""
    import datetime as _dt
    core.TRASH_DIR.mkdir(exist_ok=True)
    _now = _dt.datetime.now()
    tid = _now.strftime("%Y%m%d_%H%M%S_") + str(_now.microsecond) + "__" + str(kind) + "__" + str(item_id)
    try:
        nm = str((data or {}).get("name") or (data or {}).get("title") or (data or {}).get("summary") or item_id)
    except Exception:
        nm = str(item_id)
    rec = {"trash_id": tid, "kind": kind, "id": item_id, "name": nm,
           "deleted_at": _now.isoformat(timespec="seconds"), "data": data, "bundle": bundle or []}
    try:
        core.save_json(core.TRASH_DIR / (tid + ".json"), rec)
    except Exception:
        pass
    return tid
# 폴더 구조
@router.get("/api/folders")
async def get_folders():
    init_req_dirs()
    return core.load_json(core.FOLDERS_FILE)

@router.post("/api/folders")
async def save_folders(data: dict):
    init_req_dirs()
    core.save_json(core.FOLDERS_FILE, data)
    return {"success": True}


MAX_CAT_DEPTH = 4
CAT_DEPTH_MSG = "분류는 4단까지만 만들 수 있습니다"
PRJ_ROOT_MSG = "프로젝트는 트리 맨 위에만 둘 수 있습니다"


async def _is_project_cat(cid: str) -> bool:
    """이 분류가 프로젝트(최상위 전용)인가 — 이동 검증이 쓴다."""
    async with db.pool().acquire() as c:
        return await c.fetchval("SELECT 1 FROM project WHERE cat_id=$1", cid) is not None


async def _req_chain_resync() -> int:
    """요구사항의 분류 사슬(cat1~4)을 트리 기준으로 다시 쓴다.

    사슬은 트리의 사본이라 폴더가 이동하면 낡는다. 낡은 사본은 옛 폴더에
    요구사항을 계속 매달아 두어 「폴더를 옮겼는데 요구사항이 안 따라왔다」
    로 보인다(실사고: 폴더를 프로젝트 밑으로 옮겼을 때). 놓인 칸(살아
    있는 가장 깊은 칸)이 사실이고, 그 조상 사슬로 위 칸들을 다시 채운다.
    폴더 이동 때마다·기동 때 1회 부른다 — 한 바퀴 훑기라 수천 건도 싸다.
    """
    async with db.pool().acquire() as c:
        cats = {
            r["id"]: r["parent_id"]
            for r in await c.fetch("SELECT id, parent_id FROM req_category")
        }
        # 화면(req_list_full)은 data(JSONB) 를 서빙하므로 사실도 data 에서
        # 읽고, 고칠 때도 컬럼과 data 를 함께 쓴다 — 컬럼만 고치면 목록이
        # 옛값을 계속 보인다 (TC 메타에서 겪은 함정).
        rows = await c.fetch(
            """
            SELECT id, data->>'cat1' AS cat1, data->>'cat2' AS cat2,
                   data->>'cat3' AS cat3, data->>'cat4' AS cat4
            FROM req
            """
        )
        n = 0
        for r in rows:
            deep = next(
                (r[k] for k in ("cat4", "cat3", "cat2", "cat1") if r[k] and r[k] in cats),
                None,
            )
            if not deep:
                continue
            chain: list = []
            cur = deep
            while cur and cur in cats and cur not in chain:
                chain.insert(0, cur)
                cur = cats[cur]
            chain = (chain + ["", "", "", ""])[:4]
            if [r["cat1"] or "", r["cat2"] or "", r["cat3"] or "", r["cat4"] or ""] != chain:
                await c.execute(
                    """
                    UPDATE req SET
                      cat1=NULLIF($1,''), cat2=NULLIF($2,''),
                      cat3=NULLIF($3,''), cat4=NULLIF($4,''),
                      data = data || jsonb_build_object(
                        'cat1', $1::text, 'cat2', $2::text,
                        'cat3', $3::text, 'cat4', $4::text)
                    WHERE id=$5
                    """,
                    *chain, r["id"],
                )
                n += 1
        return n


class ReqCategoryIn(BaseModel):
    name: str
    parent_id: Optional[str] = None
    sort_order: int = 0


async def _cat_children_map() -> dict:
    m: dict = {}
    for c in await db.cat_list():
        m.setdefault(c.get("parent_id"), []).append(c["id"])
    return m


async def _cat_descendants(cid: str, include_self: bool = True) -> set:
    kids = await _cat_children_map()
    out, stack = (set([cid]) if include_self else set()), list(kids.get(cid, []))
    while stack:
        x = stack.pop()
        if x in out:
            continue
        out.add(x)
        stack.extend(kids.get(x, []))
    return out


async def _is_descendant(node: str, ancestor: str) -> bool:
    return node in await _cat_descendants(ancestor, include_self=False)


async def _subtree_height(cid: str) -> int:
    """자기만 있으면 1, 자식이 있으면 2, 손자까지면 3."""
    kids = await _cat_children_map()

    def h(x: str) -> int:
        ch = kids.get(x, [])
        return 1 if not ch else 1 + max(h(k) for k in ch)

    return h(cid)


@router.get("/api/req-categories")
async def list_req_categories():
    return {"categories": await db.cat_list()}


@router.post("/api/req-categories")
async def create_req_category(body: ReqCategoryIn):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "분류 이름을 입력하세요")

    parent_id = (body.parent_id or "").strip() or None
    if parent_id:
        parent = await db.cat_get(parent_id)
        if parent is None:
            raise HTTPException(404, "상위 분류를 찾을 수 없습니다")
        if await db.cat_depth(parent_id) >= MAX_CAT_DEPTH:
            raise HTTPException(400, CAT_DEPTH_MSG)

    cid = f"cat-{int(datetime.now().timestamp() * 1000)}"
    try:
        await db.cat_upsert(cid, name, parent_id, body.sort_order)
    except Exception as e:
        # 유니크 인덱스 위반 = 같은 상위 아래 같은 이름
        if "uq_req_category" in str(e):
            raise HTTPException(409, f"'{name}' 은 이미 있습니다") from e
        raise
    return {"success": True, "id": cid}


# ★ 이 라우트는 반드시 /{cat_id} 라우트보다 위에 있어야 한다.
#   아래에 두면 'reorder' 가 cat_id 로 잡혀 405 가 난다.
class ReqCategoryOrderIn(BaseModel):
    """한 상위 아래 형제들의 새 순서. ids 에 적힌 차례대로 sort_order 를 매긴다."""
    parent_id: Optional[str] = None
    ids: list[str]


@router.post("/api/req-categories/reorder")
async def reorder_req_categories(body: ReqCategoryOrderIn):
    """형제 순서 재배치 + 필요하면 상위 이동까지 한 번에.

    화면에서 '폴더와 폴더 사이' 에 놓으면 여기로 온다. 한 건씩 PUT 하면
    중간 상태가 보이고, 실패했을 때 절반만 적용된 채로 남는다.
    그래서 한 트랜잭션에서 형제 전체를 다시 매긴다.
    """
    parent = (body.parent_id or "").strip() or None
    if parent and await db.cat_get(parent) is None:
        raise HTTPException(404, "상위 분류를 찾을 수 없습니다")

    base = await db.cat_depth(parent) if parent else 0
    for cid in body.ids:
        if parent and (cid == parent or await _is_descendant(parent, cid)):
            raise HTTPException(400, "자기 하위 분류 밑으로는 옮길 수 없습니다")
        if parent and await _is_project_cat(cid):
            raise HTTPException(400, PRJ_ROOT_MSG)
        if base + await _subtree_height(cid) > MAX_CAT_DEPTH:
            raise HTTPException(400, CAT_DEPTH_MSG)

    async with db.pool().acquire() as c:
        async with c.transaction():
            for i, cid in enumerate(body.ids):
                await c.execute(
                    "UPDATE req_category SET parent_id=$1, sort_order=$2, updated_at=now() WHERE id=$3",
                    parent, i * 10, cid,
                )
    # 사이에 끼우기로도 상위가 바뀐다 — 여기서도 사슬을 맞춘다.
    try:
        await _req_chain_resync()
    except Exception as e:
        print(f"[reorder] 사슬 재작성 실패: {e}", flush=True)
    return {"success": True, "count": len(body.ids)}


@router.put("/api/req-categories/{cat_id}")
async def update_req_category(cat_id: str, body: ReqCategoryIn):
    cur = await db.cat_get(cat_id)
    if cur is None:
        raise HTTPException(404, "분류를 찾을 수 없습니다")

    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "분류 이름을 입력하세요")

    parent_id = (body.parent_id or "").strip() or None
    if parent_id == cat_id:
        raise HTTPException(400, "자기 자신을 상위로 지정할 수 없습니다")
    if parent_id:
        # 프로젝트는 트리 맨 위가 자리다 — 폴더 밑으로 들어가면
        # 최상위=프로젝트 층 자체가 무너진다.
        if await _is_project_cat(cat_id):
            raise HTTPException(400, PRJ_ROOT_MSG)
        parent = await db.cat_get(parent_id)
        if parent is None:
            raise HTTPException(404, "상위 분류를 찾을 수 없습니다")
        # 자기 자손 밑으로 옮기면 순환이 된다.
        if cat_id in await _cat_descendants(cat_id, include_self=False) or await _is_descendant(
            parent_id, cat_id
        ):
            raise HTTPException(400, "자기 하위 분류 밑으로는 옮길 수 없습니다")
        # 옮긴 뒤 (상위 깊이 + 이 가지의 높이) 가 상한을 넘으면 안 된다.
        if await db.cat_depth(parent_id) + await _subtree_height(cat_id) > MAX_CAT_DEPTH:
            raise HTTPException(400, CAT_DEPTH_MSG)
    try:
        await db.cat_upsert(cat_id, name, parent_id, body.sort_order)
    except Exception as e:
        if "uq_req_category" in str(e):
            raise HTTPException(409, f"'{name}' 은 이미 있습니다") from e
        raise
    # 상위가 바뀌었으면(이동) 요구사항 사슬을 트리에 맞춘다 — 안 하면
    # 옛 폴더가 그 요구사항들을 계속 잡고 있다.
    if (cur.get("parent_id") or None) != parent_id:
        try:
            await _req_chain_resync()
        except Exception as e:
            print(f"[cat] 사슬 재작성 실패: {e}", flush=True)
    return {"success": True}


@router.delete("/api/req-categories/{cat_id}")
async def delete_req_category(cat_id: str):
    """하위 분류까지 함께 지운다. 요구사항은 지우지 않고 '미분류'가 된다."""
    if not await db.cat_delete(cat_id):
        raise HTTPException(404, "분류를 찾을 수 없습니다")
    return {"success": True}


# ───────────────────────────────────────────
# 프로젝트 — 요구사항 트리의 최상위 폴더가 곧 프로젝트다(itest 방식).
# 이름의 정본은 폴더(req_category.name)라서 폴더 이름 변경이 곧 프로젝트명
# 변경이고, 폴더 삭제가 곧 프로젝트 삭제다(FK CASCADE). 여기는 고객사·
# 모델 같은 메타만 맡는다.
# ───────────────────────────────────────────
class ProjectIn(BaseModel):
    name: str
    customer: str = ""
    model_group: str = ""
    model: str = ""
    description: str = ""
    # 이 프로젝트가 물린 Jira 프로젝트 키(예: P274). 비면 안 물린 것이다.
    jira_project: str = ""


# ───────────────────────────────────────────
# ID 옮기기 — 모델그룹 기준(E61xx-R0001)으로
#
# **화면에서 눌러서 한다.** 서버에 들어가 명령을 치는 방식이면 253 처럼
# 제가 손 못 대는 곳은 사람이 거기까지 가서 쳐야 한다. 미리 보기로
# 무엇이 무엇으로 바뀌는지 먼저 보이고, 그다음에 누르게 한다 —
# 되돌릴 수는 있지만(id_alias), 안 보고 누르게 두면 안 된다.
# ───────────────────────────────────────────
@router.get("/api/id-alias")
async def id_alias_lookup(old: str = ""):
    """옛 ID 로 물으면 새 ID 를 준다.

    주소·위키·메일에 붙여 둔 옛 ID 는 우리가 못 고친다. 화면이 못 찾았을 때
    여기 한 번 물어보고 넘어가면, 옛 링크가 계속 살아 있다. 로그인만 되면
    쓸 수 있게 두었다 — 이 표는 「무엇이 무엇이 되었나」 뿐이라 숨길 것이 없고,
    막아 두면 링크가 끊기는 쪽 손해가 크다.
    """
    v = (old or "").strip()
    if not v:
        return {"new_id": ""}
    async with db.pool().acquire() as c:
        row = await c.fetchrow("SELECT new_id, kind FROM id_alias WHERE old_id = $1", v)
    return {"new_id": row["new_id"] if row else "", "kind": row["kind"] if row else ""}


@router.get("/api/id-migrate/plan")
async def id_migrate_plan(token: str = ""):
    core.require_admin(token)
    async with db.pool().acquire() as c:
        return await id_migrate.plan(c)


@router.post("/api/id-migrate/apply")
async def id_migrate_apply(token: str = "", letters: str = ""):
    """`letters` 로 **계열을 고른다**(R·T·V·P, 쉼표로 여럿). 비우면 전부."""
    core.require_admin(token)
    async with db.pool().acquire() as c:
        # 반쪽만 옮겨진 것이 있으면 먼저 맞춘다 — 안 그러면 plan 이 칸만
        # 보고 「이미 됐다」 로 넘겨서 data 가 영영 옛 값으로 남는다.
        await id_migrate.repair(c)
        p = id_migrate.only(await id_migrate.plan(c), letters)
        if not p["moves"]:
            return {"ok": True, "counts": {}, "note": "옮길 것이 없습니다"}
        counts = await id_migrate.apply(c, p)
    print(f"[id] 옮김 {counts}", flush=True)
    return {"ok": True, "counts": counts, "skipped": len(p["skipped"])}


@router.get("/api/projects")
async def list_projects():
    async with db.pool().acquire() as c:
        rows = await c.fetch(
            """
            SELECT p.id, p.cat_id, c.name, p.customer, p.model_group, p.model,
                   p.description, p.jira_project, p.created_at
            FROM project p JOIN req_category c ON c.id = p.cat_id
            ORDER BY c.name
            """
        )
    return {"projects": [dict(r) for r in rows]}


@router.post("/api/projects")
async def create_project(body: ProjectIn):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "프로젝트 이름을 입력하세요")
    now_ms = int(datetime.now().timestamp() * 1000)
    cid, pid = f"cat-{now_ms}", f"prj-{now_ms}"
    try:
        await db.cat_upsert(cid, name, None, 0)
    except Exception as e:
        if "uq_req_category" in str(e):
            raise HTTPException(409, f"'{name}' 은 이미 있습니다") from e
        raise
    async with db.pool().acquire() as c:
        await c.execute(
            """
            INSERT INTO project (id, cat_id, customer, model_group, model, description, jira_project)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            pid, cid, (body.customer or "").strip(), (body.model_group or "").strip(),
            (body.model or "").strip(), (body.description or "").strip(),
            (body.jira_project or "").strip(),
        )
    return {"success": True, "id": pid, "cat_id": cid}


@router.put("/api/projects/{pid}")
async def update_project(pid: str, body: ProjectIn):
    """프로젝트의 **메타**를 고친다 — 고객사·모델그룹·설명.

    모델명은 여기서 안 건드린다(지시로 화면에서 뺐다). 한 모델그룹에
    모델이 여럿이라(E61xx 에 E6100·E6124) 프로젝트가 하나를 못 고른다.
    이미 들어 있던 값은 **지우지 않는다** — 통복제가 아직 그것을 본다.

    이름은 여기서 안 고친다. 프로젝트 이름은 곧 트리 맨 위 폴더 이름이라
    폴더 쪽(req-categories)이 정본이고, 두 문으로 고치게 두면 한쪽만 바뀌는
    날이 온다. 화면도 이름은 Rename 으로 보낸다.

    모델그룹은 ID 앞머리다(E61xx_R0001). 이미 매긴 ID 는 따라 바뀌지
    않는다 — 바꾼 뒤 새로 만드는 것부터 새 앞머리를 받는다.
    """
    async with db.pool().acquire() as c:
        cur = await c.fetchrow("SELECT id FROM project WHERE id = $1", pid)
        if cur is None:
            raise HTTPException(404, "프로젝트를 찾을 수 없습니다")
        await c.execute(
            """UPDATE project
                  SET customer = $2, model_group = $3, description = $4,
                      jira_project = $5
                WHERE id = $1""",
            pid, (body.customer or "").strip(), (body.model_group or "").strip(),
            (body.description or "").strip(), (body.jira_project or "").strip(),
        )
    return {"success": True}


# ───────────────────────────────────────────
# 문서 → 마크다운 변환
#
# 워드(.docx)·PDF 는 브라우저가 제대로 읽지 못한다. 서버에서 바꿔서 돌려준다.
# 결과를 마크다운으로 두는 이유는 그게 이 시스템의 정본이기 때문이다 —
# 구현내용으로 들어가고, 벡터 DB 에 실리고, 시험항목 생성의 입력이 된다.
# ───────────────────────────────────────────
# ───────────────────────────────────────────
# 구현내용에 붙이는 이미지
#
# 파일은 data/req_images/ 에 둔다. 이 폴더는 도커 볼륨(app-data)이라
# 소스 트리에 쌓이지 않고, 볼륨 하나만 챙기면 함께 백업된다.
# 마크다운에는 ![](/api/req-images/<파일명>) 으로 들어간다 — 원문이
# 정본이므로 경로도 원문 안에 남아야 한다.
# ───────────────────────────────────────────
REQ_IMG_DIR = core.DATA_DIR / "req_images"


@router.post("/api/upload/image")
async def upload_image(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in core.IMG_EXT:
        raise HTTPException(400, f"이미지 파일만 올릴 수 있습니다 ({', '.join(sorted(core.IMG_EXT))})")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "빈 파일입니다")
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(413, "10MB 이하만 올릴 수 있습니다")

    REQ_IMG_DIR.mkdir(parents=True, exist_ok=True)
    # 이름은 서버가 정한다. 사용자가 준 이름을 그대로 쓰면 경로 조작과
    # 덮어쓰기가 열린다.
    import secrets
    name = f"{int(datetime.now().timestamp() * 1000)}-{secrets.token_hex(4)}{ext}"
    (REQ_IMG_DIR / name).write_bytes(raw)
    return {"url": f"/api/req-images/{name}", "name": name, "size": len(raw)}


@router.get("/api/req-images/{name}")
async def get_req_image(name: str):
    # 이름만 받는다. 경로가 섞여 들어오면 거부 — 상위 폴더 탈출 방지.
    if "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(400, "잘못된 파일명입니다")
    f = REQ_IMG_DIR / name
    if not f.is_file():
        raise HTTPException(404, "이미지를 찾을 수 없습니다")
    return FileResponse(str(f), headers={"Cache-Control": "public, max-age=31536000, immutable"})


# 기존 앱의 /api/device-catalog(app_kv 기반) 과 경로가 겹친다.
# 먼저 선언된 쪽이 이기므로 그대로 두면 옛 화면이 조용히 망가진다.
# devices2 와 같은 규칙으로 2 를 붙인다.
@router.get("/api/codes")
async def codes_list(kind: str = ""):
    """드롭다운에 들어가는 값 목록. 화면은 여기서만 읽는다."""
    items = await db.code_list(kind)
    for it in items:
        it["used"] = await db.code_usage(it["kind"], it["value"])
    # 탭 이름 덮어쓰기 — 기본 이름(상태 등)을 사람이 바꿀 수 있다
    kinds = dict(db.CODE_KINDS)
    try:
        ov = core.kv_load_sync("code_kind_labels", {}) or {}
        for k, v in ov.items():
            if k in kinds and str(v).strip():
                kinds[k] = str(v).strip()
        # 기본 칸은 **감추지 않는다**(결정: A안).
        #
        # 예전엔 code_kind_hidden 에 든 종류를 여기서 빼 버렸다. 그런데 그걸
        # 켜고 끄던 SETUP 화면이 사라진 뒤로 **되살릴 길이 없어졌다** — 실제로
        # cycle_status(플랜 상태)가 그렇게 갇혀 「기타#1」 이라는 이름으로
        # 어디에도 안 뜨고 있었다.
        #
        # 이제 열을 보이고 감추는 것은 **표가 계정별로** 한다(utop.ntb.hide.*).
        # 그래서 서버가 통째로 감출 까닭이 없다 — 감추면 그 사람만이 아니라
        # 모두가 못 보고, 되살릴 자리도 없다.
    except Exception:
        pass
    return {"items": items, "kinds": kinds}


@router.get("/api/codes/orphans")
async def codes_orphans(kind: str = ""):
    """쓰이고 있는데 목록에 없는 값 — 설정 화면이 「목록에 넣기」를 띄운다."""
    if not kind:
        return {"items": []}
    return {"items": await db.code_orphans(kind)}


@router.post("/api/codes/kind-label")
async def codes_kind_label(payload: dict, token: str = ""):
    """기본 칸(탭)의 표시 이름 바꾸기 — 빈 이름이면 원래대로. **관리자만**(지시)."""
    core.require_admin(token)
    kind = str(payload.get("kind") or "").strip()
    label = str(payload.get("label") or "").strip()
    if kind not in db.CODE_KINDS:
        raise HTTPException(400, f"알 수 없는 종류입니다: {kind}")
    ov = core.kv_load_sync("code_kind_labels", {}) or {}
    if label:
        ov[kind] = label
    else:
        ov.pop(kind, None)
    core.kv_save_sync("code_kind_labels", ov)
    return {"success": True}


@router.get("/api/codes/kind-style")
async def codes_kind_style_get():
    """필드(탭) 단위 모양 — 폭·모양·정렬.

    값마다의 색은 code.note 에 산다. 이건 **그 필드 전체**의 생김새다:
    목록에서 몇 px 를 차지하고, 값을 셀 채움으로 그릴지 알약으로 그릴지.
    여태 코드에 박혀 있어 폭 하나 고치는 데도 배포를 해야 했다(지시).
    """
    return {"styles": core.kv_load_sync("code_kind_style", {}) or {}}


@router.post("/api/codes/kind-style")
async def codes_kind_style_set(payload: dict, token: str = ""):
    """{kind, w, shape, align, weight, size, font, caps} — 빈 값은 지운다.

    **관리자만**(지시). 열 폭 하나가 모두의 목록을 바꾼다."""
    core.require_admin(token)
    kind = str(payload.get("kind") or "").strip()
    if not kind:
        raise HTTPException(400, "어느 필드인지 알려 주세요")
    cur = core.kv_load_sync("code_kind_style", {}) or {}
    one = dict(cur.get(kind) or {})
    for k in ("w", "shape", "align", "weight", "size", "font", "caps"):
        v = payload.get(k)
        if v is None or str(v).strip() == "":
            one.pop(k, None)
        else:
            one[k] = str(v).strip()
    if one:
        cur[kind] = one
    else:
        cur.pop(kind, None)
    core.kv_save_sync("code_kind_style", cur)
    return {"success": True, "styles": cur}


@router.post("/api/codes")
async def codes_save(payload: dict, token: str = ""):
    """드롭다운에 들어가는 값 추가·수정 — **관리자만**(지시)."""
    core.require_admin(token)
    try:
        await db.code_upsert(payload)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"success": True}


@router.delete("/api/codes/{kind}/{value}")
async def codes_delete(kind: str, value: str, token: str = ""):
    core.require_admin(token)
    # 쓰는 건수가 있어도 막지 않는다(피드백) — 지우는 것은 고르기 목록의
    # 항목뿐이고, 기록(data)에 저장된 값 문자열은 그대로 남는다.
    # 몇 건이 쓰는지는 화면이 확인창에서 미리 알린다.
    if not await db.code_delete(kind, value):
        raise HTTPException(404, "없는 항목입니다")
    return {"success": True}


# ───────────────────────────────────────────
# 커스텀 필드
#
# 팀마다 TC·요구사항에 적어두고 싶은 항목이 다르다. 컬럼을 늘리는 대신
# 여기서 정의만 관리하고, 값은 data->'custom' 에 담는다.
# ───────────────────────────────────────────
@router.get("/api/custom-fields")
async def custom_fields_list(target: str = ""):
    items = await db.cf_list(target)
    for it in items:
        it["used"] = await db.cf_usage(it["target"], it["key"])
    return {"items": items, "targets": db.CF_TARGETS, "types": db.CF_TYPES}


@router.post("/api/custom-fields")
async def custom_fields_save(payload: dict):
    try:
        cf_id = await db.cf_upsert(payload)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"success": True, "id": cf_id}


@router.delete("/api/custom-fields/{cf_id}")
async def custom_fields_delete(cf_id: int):
    cur = await db.cf_get(cf_id)
    if cur is None:
        raise HTTPException(404, "없는 필드입니다")
    # 값은 data->'custom' 에 그대로 남는다. 지우는 것은 정의뿐이라
    # 되돌리려면 같은 키로 다시 만들면 값이 도로 보인다. 그래서 쓰는 건수가
    # 있어도 막지 않고, 몇 건인지만 화면이 미리 물어보게 한다.
    if not await db.cf_delete(cf_id):
        raise HTTPException(404, "없는 필드입니다")
    return {"success": True}








# REQ 목록 (전체)
@router.get("/api/req")
async def get_all_req():
    # 분류는 req_category 테이블로 넘어갔다. 옛 화면은 /api/folders 를
    # 따로 부르므로 여기서 folders 를 함께 실어 보낼 이유가 없다.
    return {"reqs": await db.req_list_full()}

# REQ 단건 조회
@router.get("/api/req/{req_id}")
async def get_req(req_id: str):
    r = await db.req_get(req_id)
    if r is None:
        raise HTTPException(404, "REQ를 찾을 수 없습니다")
    # TC 는 참조(tcid/name/status) 만 반환 — 예전엔 각 TC 를 풀 데이터로 확장해 붙였으나
    # REQ 하나에 큰 TC 여러 개면 응답 수 MB 로 팽창, 프론트가 그대로 saveOneREQ 로 다시 POST 시
    # 서버가 각 tc 를 풀 데이터로 오판정해 tc_upsert 를 반복 실행 → 10초+ 지연 발생.
    # 개별 TC 상세는 /api/tc/{tcid} 로 lazy 로드 (loadTCFull) 로 이미 처리됨.
    refs = []
    for tc in r.get("tc", []) or []:
        if isinstance(tc, dict) and tc.get("tcid"):
            refs.append({"tcid": tc.get("tcid",""), "name": tc.get("name",""), "status": tc.get("status","대기")})
    r["tc"] = refs
    return r

# REQ 저장 (생성/수정)
# ══════════════ 폴더·요구사항·시험 통째로 복사 ══════════════
#
# 「+ Copy」 창 하나가 이 일을 다 한다(승인 2026-08-22). 파일로 내보냈다
# 가져오는 길은 「이 줄이 어느 요구사항에 붙나」 를 사람이 다시 정해 줘야
# 했다 — 붙일 자리를 먼저 고르고 옮기면 그 물음이 아예 사라진다.
#
# 규칙(승인): 새 ID 로 발번 · 요구사항↔시험 연결은 새 ID 끼리 유지 ·
# 대상 프로젝트의 모델그룹·모델명으로 갈아 끼움(끌 수 있음) · 같은 이름이면
# 「(복제)」 를 붙여 새로 만든다(덮어쓰기 없음) · 실행 이력은 안 가져온다.


def _cat_path(cats: dict, cid: str) -> list:
    """뿌리부터 이 폴더까지 — req 의 cat1..cat4 가 이 길을 담는다."""
    out, cur, guard = [], cid, 0
    while cur and guard < 12:
        out.append(cur)
        cur = (cats.get(cur) or {}).get("parent_id")
        guard += 1
    return list(reversed(out))


def _leaf_cat(r: dict) -> str:
    for k in ("cat4", "cat3", "cat2", "cat1"):
        v = str((r.get(k) or "")).strip()
        if v:
            return v
    return ""


async def _group_of_cat(c, cat_id: str) -> str:
    """이 폴더가 속한 **프로젝트의 모델그룹**. 뿌리까지 타고 올라가 찾는다."""
    if not cat_id:
        return ""
    row = await c.fetchrow(
        """
        WITH RECURSIVE up AS (
          SELECT id, parent_id FROM req_category WHERE id = $1
          UNION ALL
          SELECT c.id, c.parent_id FROM up u JOIN req_category c ON c.id = u.parent_id
        )
        SELECT p.model_group FROM up
        JOIN project p ON p.cat_id = up.id
        LIMIT 1
        """,
        cat_id,
    )
    return str((row or {}).get("model_group") or "") if row else ""


async def _next_id(c, mg: str, letter: str) -> str:
    """다음 ID — **모델그룹 기준**(E61xx-R0001).

    이음쇠는 **「-」** 다(지시). 옛 것은 「_」 였고(E61xx_R0001) 그대로 살아
    있다 — ID 옮기기가 새 모양으로 데려온다. 여기서는 **새로 만드는 것만**
    새 모양으로 낸다.

    앞머리는 모델그룹이고 순번은 그 그룹 안에서만 센다. 주차를 쓰던 옛
    규칙(REQ-2633-0016)은 모델그룹을 모를 때만 남긴다 — 프로젝트에 안 속한
    폴더가 아직 있어서, 거기서 만들면 앞머리를 정할 수가 없다. 지어내느니
    옛 모양으로 두고, 폴더를 프로젝트 밑으로 옮긴 뒤 ID 옮기기로 따라오게
    하는 편이 낫다.

    순번은 **그 그룹의 현재 최댓값 +1** 이다. 두 사람이 같은 순간에 만들면
    같은 번호가 나올 수 있는데, 그건 옛 규칙도 같았고 저장할 때 한 번 더
    올려 준다(save_req).
    """
    import re as _r
    if not mg:
        from datetime import datetime as _dt
        iso = _dt.now().isocalendar()
        head = "REQ" if letter == "R" else "TC"
        prefix = "%s-%02d%02d-" % (head, iso[0] % 100, iso[1])
    else:
        prefix = f"{mg}-{letter}"
    col = "data->>'reqid'" if letter == "R" else "tcid"
    tbl = "req" if letter == "R" else "tc"
    # **옛 모양(`_`)도 함께 센다.** 새 것만 보면 순번이 1부터 다시 시작해
    # 옛 번호와 부딪친다 — 같은 그룹 안에서 번호는 하나여야 한다.
    old_prefix = f"{mg}_{letter}" if mg else prefix
    rows = await c.fetch(
        f"SELECT {col} AS v FROM {tbl} WHERE {col} LIKE $1 OR {col} LIKE $2",
        prefix + "%", old_prefix + "%",
    )
    mx = 0
    for r in rows:
        for p in {prefix, old_prefix}:
            m = _r.match("^" + _r.escape(p) + r"(\d+)$", r["v"] or "")
            if m:
                mx = max(mx, int(m.group(1)))
    return prefix + str(mx + 1).zfill(4)


async def _next_req_id(c, cat_id: str = "") -> str:
    return await _next_id(c, await _group_of_cat(c, cat_id), "R")


async def _next_tc_id(c, mg: str = "") -> str:
    return await _next_id(c, mg, "T")


@router.post("/api/export/xlsx")
async def export_xlsx(payload: dict):
    """화면의 표를 **보이는 그대로** 엑셀로 내보낸다(승인).

    보이는 열·차례·값·색을 화면이 보내 준다 — 숨긴 열이 무엇인지, 어떤
    차례로 옮겼는지는 **표만 안다**. 서버가 자료를 다시 뽑으면 화면과
    다른 것이 나간다.

    양식(승인): 1행 제목 · 2행 꼬리말 · 3행 빈 줄 · 4행 열 머리(틀 고정 ·
    자동 필터) · 5행부터 값. 값의 색은 SETUP 코드의 색을 **글자색**으로
    옮긴다 — 배경까지 칠하면 인쇄가 지저분하다.
    """
    import io as _io
    try:
        import xlsxwriter as _xw
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"엑셀 만들기를 못 씁니다 — {e}") from e

    title = str(payload.get("title") or "").strip()
    subtitle = str(payload.get("subtitle") or "").strip()
    cols = [c for c in (payload.get("columns") or []) if isinstance(c, dict) and c.get("key")]
    rows = [r for r in (payload.get("rows") or []) if isinstance(r, dict)]
    colors = payload.get("colors") if isinstance(payload.get("colors"), dict) else {}
    if not cols:
        raise HTTPException(400, "내보낼 열이 없습니다")

    buf = _io.BytesIO()
    wb = _xw.Workbook(buf, {"in_memory": True, "default_date_format": "yyyy-mm-dd"})
    ws = wb.add_worksheet("표")

    f_title = wb.add_format({"bold": True, "font_size": 14, "font_color": "#12505E"})
    f_sub = wb.add_format({"font_size": 10, "font_color": "#6B8189"})
    f_head = wb.add_format({
        "bold": True, "bg_color": "#C6DEE4", "font_color": "#12505E",
        "border": 1, "border_color": "#9FC3CE", "align": "center", "valign": "vcenter",
    })
    f_cell = wb.add_format({"border": 1, "border_color": "#D6DBE0", "valign": "top"})
    _cache: dict = {}

    def cell_fmt(hexc: str):
        """값 색은 **글자색**으로 — 서식 객체는 색마다 하나만 만든다"""
        if not hexc:
            return f_cell
        if hexc not in _cache:
            _cache[hexc] = wb.add_format({
                "border": 1, "border_color": "#D6DBE0", "valign": "top",
                "font_color": hexc, "bold": True,
            })
        return _cache[hexc]

    head_at = 3 if (title or subtitle) else 0
    if title:
        ws.write(0, 0, title, f_title)
    if subtitle:
        ws.write(1, 0, subtitle, f_sub)

    for j, c in enumerate(cols):
        ws.write(head_at, j, str(c.get("label") or c.get("key")), f_head)

    # 열 너비 — 머리와 값 가운데 긴 쪽에 맞추되 **28자에서 멈춘다**(지시).
    # 60자로 두었더니 TC Map 한 칸이 화면 절반을 먹어 옆 칸이 밀려났다.
    # 값은 그대로다 — 보이는 폭만 좁힌다(셀을 누르면 수식줄에 다 보인다).
    wide = [len(str(c.get("label") or c.get("key"))) + 3 for c in cols]
    for i, r in enumerate(rows):
        for j, c in enumerate(cols):
            k = str(c.get("key"))
            v = r.get(k, "")
            v = "" if v is None else (v if isinstance(v, (int, float)) else str(v))
            hexc = str(((colors.get(k) or {}) if isinstance(colors.get(k), dict) else {}).get(str(v), ""))
            ws.write(head_at + 1 + i, j, v, cell_fmt(hexc))
            wide[j] = max(wide[j], min(28, len(str(v)) + 2))
    for j, w in enumerate(wide):
        ws.set_column(j, j, max(8, min(28, w)))

    ws.freeze_panes(head_at + 1, 0)
    if rows:
        ws.autofilter(head_at, 0, head_at + len(rows), len(cols) - 1)

    wb.close()
    from fastapi.responses import Response as _Resp
    return _Resp(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.post("/api/copy-tree")
async def copy_tree(body: dict, token: str = ""):
    """Source 에서 고른 것들을 Destination 아래로 **복사**한다.

    items: [{kind: 'cat'|'req'|'tc', id}]   — 여럿 가능
    dst  : {kind: 'cat'|'req', id}          — 폴더나 요구사항
    swap_model: 대상 프로젝트의 모델그룹·모델명으로 갈아 끼울까(기본 켜짐)
    """
    core.user_from_token(token)
    items = [x for x in (body.get("items") or []) if isinstance(x, dict)]
    dst = body.get("dst") or {}
    dst_kind = str(dst.get("kind") or "")
    dst_id = str(dst.get("id") or "")
    swap = body.get("swap_model") is not False
    # 무엇을 복사하나(승인): all=요구사항+시험 · req=요구사항만 · tc=시험만
    mode = str(body.get("mode") or "all")
    # 폴더·요구사항을 통째로 고르되 **뺄 시험**은 따로 온다(체크 해제한 것)
    skip_tc = {str(x) for x in (body.get("skip_tcs") or [])}
    # 복제본 이름 뒤에 붙일 말 — **제자리 복제**가 쓴다(지시).
    # 같은 자리에 같은 이름이 둘이면 어느 것이 복제본인지 알 수 없다.
    # 통복제(다른 프로젝트로 옮기기)는 안 보내므로 예전 그대로다.
    tc_suffix = str(body.get("tc_suffix") or "")
    # 요구사항 제목 뒤에 붙일 말 — 시험과 같은 까닭이다(제자리 복제).
    req_suffix = str(body.get("req_suffix") or "")
    if not items or not dst_id:
        raise HTTPException(400, "무엇을 어디로 복사할지 골라 주세요")

    cats = {c["id"]: dict(c) for c in await db.cat_list()}
    reqs = {r["id"]: dict(r) for r in await db.req_list_full()}
    tcs_meta = await db.tc_list_meta()
    tc_by_req: dict = {}
    for t in tcs_meta:
        tc_by_req.setdefault(str(t.get("req_id") or ""), []).append(str(t.get("tcid")))

    # 대상 프로젝트(뿌리 폴더)의 모델 정보 — 갈아 끼울 값
    base_cat = dst_id if dst_kind == "cat" else _leaf_cat(reqs.get(dst_id) or {})
    root = (_cat_path(cats, base_cat) or [base_cat])[0]
    async with db.pool().acquire() as c:
        prow = await c.fetchrow(
            "SELECT customer, model_group, model FROM project WHERE cat_id = $1", root
        )
    dst_mg = str((prow or {}).get("model_group") or "") if prow else ""
    dst_md = str((prow or {}).get("model") or "") if prow else ""
    # 프로젝트에서 모델명을 뺐다(지시). 그러면 갈아 끼울 값이 없는데,
    # 그 모델그룹에 모델이 **하나뿐이면** 고를 것도 하나라 그것을 쓴다.
    # 여럿이면 비워 둔다 — 아무거나 넣으면 틀린 모델로 시험이 돈다.
    if not dst_md and dst_mg:
        async with db.pool().acquire() as c:
            only = await c.fetch(
                """SELECT name FROM device_catalog
                    WHERE kind = 'model' AND model_group = $1""",
                dst_mg,
            )
        if len(only) == 1:
            dst_md = str(only[0]["name"])

    made = {"cats": 0, "reqs": 0, "tcs": 0}
    now_ms = int(datetime.now().timestamp() * 1000)
    seq = {"n": 0}

    def _uid(p: str) -> str:
        seq["n"] += 1
        return f"{p}-{now_ms}-{seq['n']}"

    async def copy_tc(c, tcid: str, req_id: str) -> None:
        if mode == "req":
            return          # 「요구사항만」 — 시험은 따라가지 않는다
        if tcid in skip_tc:
            return          # 시험 칸에서 체크를 뺀 것
        src = await db.tc_get(tcid)
        if not src:
            return
        nid = await _next_tc_id(c, dst_mg)
        d = dict(src)
        d["tcid"] = nid
        d["req_id"] = req_id
        if tc_suffix:
            d["name"] = f"{str(d.get('name') or '')}{tc_suffix}"
        if swap:
            if dst_mg:
                d["model_group"] = dst_mg
            if dst_md:
                d["model"] = dst_md
        # 실행 흔적은 안 가져온다 — 복사본은 「아직 안 돌린 것」 이다(승인)
        for k in ("result_history", "issue_list", "last_run", "cycles"):
            d.pop(k, None)
        for st in d.get("checks") or []:
            for k in ("output", "status", "reason", "repeatResult", "executed_at", "took_ms", "rounds", "response"):
                st.pop(k, None)
        # 세션(장비 자리)은 **그대로 둔다**(지시). 장비가 여러 대면 어느 것을
        # 어느 자리에 앉힐지 기계가 정할 수 없다 — 사람이 고를 일이다.
        await db.tc_upsert(nid, d)
        made["tcs"] += 1

    async def copy_req(c, rid: str, cat_id: str) -> None:
        src = reqs.get(rid)
        if not src:
            return
        path = _cat_path(cats, cat_id)
        nid = _uid("rq")
        d = dict(src.get("data") or src)
        d["id"] = nid
        d["reqid"] = await _next_req_id(c, cat_id)
        if req_suffix:
            d["title"] = f"{str(d.get('title') or '')}{req_suffix}"
        d["tc"] = []
        for i in range(4):
            d[f"cat{i + 1}"] = path[i] if i < len(path) else None
        if swap:
            if dst_mg:
                d["model_group"] = dst_mg
            if dst_md:
                d["model"] = dst_md
        await db.req_upsert(nid, d)
        made["reqs"] += 1
        for t in tc_by_req.get(rid, []):
            await copy_tc(c, t, nid)

    async def copy_cat(c, cid: str, parent: str) -> None:
        src = cats.get(cid)
        if not src:
            return
        name = str(src.get("name") or "")
        # 같은 이름이 이미 있으면 「(복제)」 — 덮어쓰지 않는다(승인)
        sibs = {str(v.get("name") or "") for v in cats.values() if str(v.get("parent_id") or "") == str(parent or "")}
        if name in sibs:
            name = f"{name} (복제)"
        nid = _uid("cat")
        await db.cat_upsert(nid, name, parent or None, int(src.get("sort_order") or 0))
        cats[nid] = {"id": nid, "name": name, "parent_id": parent}
        made["cats"] += 1
        for r in list(reqs.values()):
            if _leaf_cat(r) == cid:
                await copy_req(c, str(r["id"]), nid)
        for k, v in list(cats.items()):
            if str(v.get("parent_id") or "") == cid and not k.startswith("cat-" + str(now_ms)):
                await copy_cat(c, k, nid)

    async with db.pool().acquire() as c:
        for it in items:
            kind = str(it.get("kind") or "")
            sid = str(it.get("id") or "")
            if kind == "cat":
                if dst_kind != "cat":
                    raise HTTPException(400, "폴더는 폴더 아래로만 복사합니다")
                await copy_cat(c, sid, dst_id)
            elif kind == "req":
                if dst_kind != "cat":
                    raise HTTPException(400, "요구사항은 폴더 아래로만 복사합니다")
                await copy_req(c, sid, dst_id)
            elif kind == "tc":
                if dst_kind != "req":
                    raise HTTPException(400, "시험 항목은 요구사항 아래로만 복사합니다")
                await copy_tc(c, sid, dst_id)
    return {"ok": True, **made}


@router.get("/api/req-next-id")
async def req_next_id(cat: str = ""):
    """다음 요구사항 ID — **모델그룹 기준**(E61xx_R0001).

    `cat` 은 만들 자리의 폴더다. 그 폴더의 뿌리 프로젝트가 모델그룹을 쥐고
    있어서, 어디에 만드느냐에 따라 앞머리가 갈린다. 안 주면(또는 프로젝트에
    안 속한 폴더면) 옛 주차 규칙으로 떨어진다 — 앞머리를 지어내지 않는다.
    """
    async with db.pool().acquire() as c:
        mg = await _group_of_cat(c, (cat or "").strip())
        rid = await _next_id(c, mg, "R")
    return {"reqid": rid, "prefix": rid[: -4], "group": mg}


@router.get("/api/tc-next-id")
async def tc_next_id(mg: str = "", cat: str = "", kind: str = "T"):
    """다음 시험 ID — **모델그룹 기준**(E61xx_T0001).

    tcid 는 곧 PK 라 겹치면 남의 시험을 덮어쓴다. 그래서 그 앞머리의 현재
    최대 순번 +1 을 서버가 매긴다. 모델그룹은 시험 만들 때 고르는 값이라
    화면이 직접 준다(mg). 없으면 폴더(cat)로 찾아보고, 그것도 없으면 옛
    주차 규칙이다.

    `kind` 는 **번호 계열**이다(합의).
      T = 요구사항을 덮는 시험 — REQ-Coverage 가 관리한다
      V = Jira 이슈를 덮는 시험 — Releases 가 관리한다
    한 계열로 두면 번호만 봐서는 어느 목록에 있는 것인지 알 수 없어,
    한쪽 화면에서 안 보일 때 「어디 갔지」 가 된다. 계열을 가르면 그 일이
    없다 — 담는 곳(tc 표)은 하나 그대로다.
    """
    k = (kind or "T").strip().upper()[:1]
    if k not in ("T", "V"):
        k = "T"
    async with db.pool().acquire() as c:
        g = (mg or "").strip() or await _group_of_cat(c, (cat or "").strip())
        tid = await _next_id(c, g, k)
    return {"tcid": tid, "prefix": tid[: -4], "group": g, "kind": k}


@router.post("/api/req/{req_id}")
async def save_req(req_id: str, data: dict, response: Response):
    import time as _tm
    _t0 = _tm.perf_counter()
    # ★ URL id 와 data.id 를 통일 — 다르면 두 row 로 갈라져 REQ 중복 표시 버그 발생.
    #    URL 이 항상 진짜 PK. body 안 id 는 강제로 URL 값으로 덮어씀.
    data = {**data, "id": req_id}
    # ★ reqid 중복 방지 — 같은 폴더 내에 같은 reqid 를 가진 REQ 가 이미 있으면 자동으로 다음 번호 부여.
    _reqid = str(data.get("reqid") or "").strip()
    if _reqid:
        async with db.pool().acquire() as c:
            _dup = await c.fetch(
                "SELECT id FROM req WHERE data->>'reqid'=$1 AND id<>$2",
                _reqid, req_id,
            )
        if _dup:
            import re as _re_r
            _m = _re_r.match(r'^(.+-)(\d+)$', _reqid)
            if _m:
                _prefix = _m.group(1)
                # 이 prefix 로 존재하는 최대 번호 조회 후 +1
                async with db.pool().acquire() as c:
                    _rows = await c.fetch(
                        "SELECT data->>'reqid' AS reqid FROM req WHERE data->>'reqid' LIKE $1",
                        _prefix + '%',
                    )
                _max = 0
                for _r in _rows:
                    _mm = _re_r.match('^' + _re_r.escape(_prefix) + r'(\d+)$', _r['reqid'] or '')
                    if _mm:
                        _v = int(_mm.group(1))
                        if _v > _max:
                            _max = _v
                _new = _prefix + str(_max + 1).zfill(len(_m.group(2)))
                print(f"[save_req] reqid 중복 회피: {_reqid!r} -> {_new!r} (PK={req_id})")
                data["reqid"] = _new
    # TC 분리 저장 — 성능 최적화: 참조(ref only)만 온 것들은 존재 여부만 EXISTS 로 배치 확인
    tcs = data.get("tc", [])
    tc_refs = []
    REF_KEYS = {"tcid", "name", "status", "req_id"}
    # 1) full 데이터/ref only 분리
    full_items = []   # (tcid, tc)
    ref_items = []    # (tcid, tc)
    for tc in tcs:
        tcid = tc.get("tcid", "")
        if not tcid:
            tc_refs.append(tc)
            continue
        is_full = any(k not in REF_KEYS for k in tc.keys())
        if is_full:
            full_items.append((tcid, tc))
        else:
            ref_items.append((tcid, tc))
    # 2) full 데이터는 그대로 upsert
    for tcid, tc in full_items:
        await db.tc_upsert(tcid, {**tc, "req_id": data.get("id", "")})
        tc_refs.append({"tcid": tcid, "name": tc.get("name", ""), "status": tc.get("status", "대기")})
    # 3) ref only 는 EXISTS 로 한 번에 확인 (개당 tc_get 하면 REQ 아래 TC 수만큼 왕복)
    if ref_items:
        ref_ids = [tcid for tcid, _ in ref_items]
        async with db.pool().acquire() as c:
            rows = await c.fetch("SELECT tcid FROM tc WHERE tcid = ANY($1::text[])", ref_ids)
            existing_set = {r["tcid"] for r in rows}
        # 이름/상태만 바뀌는 경우 잘 안 일어남 → 존재하는 것만 참조 유지 (name/status 변경은 별도 저장 경로에서)
        for tcid, tc in ref_items:
            if tcid in existing_set:
                tc_refs.append({"tcid": tcid, "name": tc.get("name", ""), "status": tc.get("status", "대기")})
            # else: 잔여 참조 (DB 에 없는 TC) → 무시 (자동 재생성 방지)
    # REQ에는 TC 참조만 저장
    _t1 = _tm.perf_counter()
    req_data = {**data, "tc": tc_refs}
    await db.req_upsert(req_id, req_data)
    _t2 = _tm.perf_counter()
    # RAG 자동 색인(source=req) — 백그라운드, 실패해도 저장에 영향 없음
    try:
        if ai._ai_settings().get("auto_index_req"):
            asyncio.create_task(ai._rag_index_req(req_id, req_data))
    except Exception:
        pass
    try: asyncio.create_task(core.broadcast({"type": "req_updated", "req_id": req_id}))
    except Exception: pass
    _t3 = _tm.perf_counter()
    _msg = f"total={_t3-_t0:.3f}s tc_check={_t1-_t0:.3f}s req_upsert={_t2-_t1:.3f}s tail={_t3-_t2:.3f}s"
    try:
        response.headers["X-Save-Time"] = _msg
    except Exception: pass
    try:
        import sys as _sys
        print(f"[save_req] {req_id} {_msg}", flush=True)
        _sys.stdout.flush()
    except Exception: pass
    return {"success": True}

# REQ 삭제
@router.delete("/api/req/{req_id}")
async def delete_req(req_id: str):
    r = await db.req_get(req_id)
    _deleted_tcids = []
    if r:
        bundle = []
        for tc in r.get("tc", []):
            _tid = tc.get('tcid','')
            if not _tid: continue
            tcfull = await db.tc_get(_tid)
            if tcfull:
                bundle.append(tcfull)
                await db.tc_delete(_tid)
                _deleted_tcids.append(_tid)
        try: _trash_put("req", req_id, r, bundle)
        except Exception: pass
        await db.req_delete(req_id)
    try: asyncio.create_task(core.broadcast({"type": "req_deleted", "req_id": req_id, "tcids": _deleted_tcids}))
    except Exception: pass
    return {"success": True}

# TC 전체 목록 (REQ별)
TC_META_KEYS = ("tcid","id","name","req_id","folder","severity","priority","status","assignee","reporter","created_at","updated_at","created_by","updated_by","tags","custom","issue_list","result_history")


def _tc_meta_extra(meta: dict, d: dict):
    _checks = d.get("checks") or []
    meta["_checks_count"] = len(_checks)
    # CLI 스텝(실제 시험 절차) 개수 — ⚠(세션 없음) 게이트가 쓴다
    meta["_cli_count"] = sum(1 for c in _checks if (c.get("kind") or "cli") == "cli")
    # 판정(PASS/FAIL)이 나오는 스텝 수(합의) — 목록 배지·Automation 탭이 같이 쓴다.
    # 주석·메시지·대기·치환·If/Loop/Switch 는 판정 단위가 아니라 안 센다.
    _judge = {"cli", "ping", "snmp_get", "snmp_set", "snmp_trap", "diff",
              "instrument", "connect", "disconnect", "auto"}
    meta["_step_count"] = sum(
        1 for c in _checks if (c.get("kind") or "cli") in _judge
    )



@router.get("/api/tc")
async def get_all_tc(meta: int = 0):
    """
    meta=1 : 목록 렌더에 필요한 메타만 반환 (checks/steps 등 큰 필드 제외 → 초기 로딩 대폭 단축)
    meta=0 (기본): 기존 동작 유지 — 전체 반환
    """
    if meta:
        return {"tcs": await db.tc_list_meta()}
    return {"tcs": await db.tc_list_full()}

# tcid 안에 슬래시(/)·백슬래시(\) 가 있으면 프론트가 __U2F__/__U5C__ sentinel 로 치환해 보냄.
# 서버 라우팅은 {tc_id:path} 로 받아 여기서 원본 tcid 로 복원. FastAPI 가 이미 URL 디코딩한 상태.
def _tc_id_norm(tc_id: str) -> str:
    return (tc_id or "").replace("__U5C__", "\\").replace("__U2F__", "/")

# TC 단건 조회
@router.get("/api/tc/{tc_id}")
async def get_tc(tc_id: str):
    tc_id = _tc_id_norm(tc_id)
    d = await db.tc_get(tc_id)
    if d is None:
        raise HTTPException(404, "TC를 찾을 수 없습니다")
    # 프론트가 checks 를 Array 로 기대(없으면 "시험 절차 로딩 중" 무한대기) — 빈 배열 보장.
    if not isinstance(d.get("checks"), list):
        d["checks"] = []
    return d

@router.get("/api/tc/{tc_id}/path")
async def get_tc_path(tc_id: str):
    """이 시험이 Coverage 트리의 **어디에 있나** — 사업자·폴더·요구사항 차례.

    AI 화면 머리줄이 이 길을 그대로 보여 준다(지시). 트리를 통째로 내려받아
    거슬러 올라가면 화면이 무거워지므로, 여기서 한 번에 짚어 준다.
    """
    tc_id = _tc_id_norm(tc_id)
    async with db.pool().acquire() as c:
        row = await c.fetchrow("SELECT tcid, name, req_id FROM tc WHERE tcid=$1", tc_id)
        if row is None:
            raise HTTPException(404, "TC를 찾을 수 없습니다")
        cats: list[dict] = []
        req = None
        if row["req_id"]:
            r = await c.fetchrow(
                "SELECT id, reqid, title, cat1, cat2, cat3, cat4 FROM req WHERE id=$1",
                row["req_id"],
            )
            if r is not None:
                req = {"id": r["id"], "reqid": r["reqid"] or "", "title": r["title"] or ""}
                at = r["cat4"] or r["cat3"] or r["cat2"] or r["cat1"]
                seen: set[str] = set()
                chain: list[dict] = []
                while at and at not in seen:
                    seen.add(at)
                    cr = await c.fetchrow(
                        "SELECT id, name, parent_id FROM req_category WHERE id=$1", at
                    )
                    if cr is None:
                        break
                    chain.append({"id": cr["id"], "name": cr["name"]})
                    at = cr["parent_id"]
                cats = list(reversed(chain))
    return {"tcid": row["tcid"], "name": row["name"] or "", "cats": cats, "req": req}


# TC 저장
# TC 스텝 스냅샷(자동 백업) — 스텝 수가 급감/이전 값 유실 방지, 최근 20개 유지
TC_SNAP_DIR = core.DATA_DIR / "tc_snapshots"


def _tc_snap_dir(tc_id: str) -> Path:
    safe = "".join(ch if (ch.isalnum() or ch in "-_.") else "_" for ch in tc_id)
    p = TC_SNAP_DIR / safe
    p.mkdir(parents=True, exist_ok=True)
    return p

def _tc_snap_save(tc_id: str, prev: dict) -> None:
    try:
        d = _tc_snap_dir(tc_id)
        ts = datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
        (d / f"{ts}.json").write_text(json.dumps(prev, ensure_ascii=False), encoding="utf-8")
        # 오래된 스냅샷 정리 (최근 20개만 유지)
        files = sorted(d.glob("*.json"))
        for old in files[:-20]:
            try: old.unlink()
            except Exception: pass
    except Exception:
        pass


@router.post("/api/tc/{tc_id}")
async def save_tc(tc_id: str, data: dict):
    tc_id = _tc_id_norm(tc_id)
    """
    저장.

    여러 사람이 같은 시험을 열어 두는 일이 잦다. 잠그지는 않는다 — 대개는
    한 사람이 보기만 하고, 잠가 버리면 보려던 사람이 못 들어오고 잠근
    사람이 자리를 뜨면 아무도 못 고친다.

    대신 **내가 읽은 뒤에 남이 저장했으면 그때 알린다.** 조용히 덮는 것보다
    낫다. 화면이 `_rev`(읽을 때 받은 값)를 같이 보내면 여기서 견준다.
    """
    _base = str(data.pop("_rev", "") or "")
    if _base:
        _now = await db.tc_rev(tc_id)
        if _now and _now != _base:
            who = str((data.get("updated_by") or "")).strip()
            raise HTTPException(
                409,
                f"이 시험을 다른 사람이 먼저 저장했습니다 ({_now[:16].replace('T', ' ')}). "
                "새로 읽어 확인한 뒤 다시 저장하세요."
                + (f" (내 이름: {who})" if who else ""),
            )
    # ★ **안 보낸 칸은 기존 값을 지킨다**(지적: 요구사항만 옮겼는데 값이 사라졌다).
    #
    #   예전엔 checks·sessions 두 칸만 지켰다. 그런데 「연결만 바꾸는」 창 셋
    #   (TcLinkForm · ReqMapDialog · TcMapReqDialog)이 여섯 칸만 보내는 바람에
    #   **model · model_group · run_type · origin · meterCfg 가 통째로 날아갔다**.
    #   요구사항을 옮기는 일이 모델을 지울 까닭이 없다.
    #
    #   키가 **아예 없는** 것은 「지운 것」 이 아니라 「안 보낸 것」 이다.
    #   빈 값(''·[]·null)을 보낸 것은 지우겠다는 뜻이라 그대로 둔다 — 그래서
    #   `k not in data` 로만 되살린다(값이 있는 칸은 payload 가 이긴다).
    try:
        _prev_full = await db.tc_get(tc_id)
        if isinstance(_prev_full, dict) and _prev_full:
            _keep = {
                k: v
                for k, v in _prev_full.items()
                # 밑줄로 시작하는 것은 서버가 붙이는 메타(_rev·_created_at)라 되살리지 않는다
                if k not in data and not str(k).startswith("_")
            }
            if _keep:
                data = {**_keep, **data}
                print(
                    f"[save_tc] 안 보낸 칸 {len(_keep)}개를 기존 값으로 지킴 (tcid={tc_id}) — {sorted(_keep)[:8]}",
                    flush=True,
                )
    except Exception:
        pass
    # 저장 직전 이전 값 스냅샷 — 스텝(checks) 이 있고 새 값과 스텝 수가 다르면 백업.
    # 전체 데이터를 SELECT/비교하면 크기가 커지면 매우 느려짐 → step_count 만 조회해서
    # 스텝 수가 줄어드는 경우(사라짐 위험)에만 전체 데이터 조회+백업 (신규 생성/증가 시엔 스킵).
    try:
        async with db.pool().acquire() as _c:
            prev_step_count = await _c.fetchval("SELECT step_count FROM tc WHERE tcid=$1", tc_id)
        new_checks = data.get("checks") if isinstance(data.get("checks"), list) else []
        new_cli_count = sum(1 for x in new_checks if isinstance(x, dict) and (x.get("kind") or "cli") == "cli")
        if prev_step_count is not None and prev_step_count > 0 and new_cli_count < prev_step_count:
            # 스텝 수가 실제로 줄어들 때만 전체 데이터 조회해서 스냅샷 (비용 큰 경로 최소화)
            prev = await db.tc_get(tc_id)
            if isinstance(prev, dict):
                asyncio.get_event_loop().run_in_executor(None, _tc_snap_save, tc_id, prev)
    except Exception:
        pass
    await db.tc_upsert(tc_id, data)
    # broadcast 는 fire-and-forget (다수 접속 시 순차 send 대기로 응답 느려짐)
    #
    # 누가 저장했는지 함께 싣는다 — 받는 쪽이 「내가 방금 저장한 것」 을
    # 걸러내야 하고, 남이 저장한 것이면 이름을 말해 줘야 한다.
    _by = str(data.get("updated_by") or "").strip()
    try: asyncio.create_task(core.broadcast({"type": "tc_updated", "tcid": tc_id, "user": _by}))
    except Exception: pass
    return {"success": True}


@router.get("/api/tc/{tc_id}/snapshots")
async def list_tc_snapshots(tc_id: str):
    tc_id = _tc_id_norm(tc_id)
    """TC 자동 백업(스텝 스냅샷) 목록 — 파일명(=시각)만 반환."""
    d = _tc_snap_dir(tc_id)
    items = []
    for f in sorted(d.glob("*.json"), reverse=True):
        try:
            st = f.stat()
            items.append({"name": f.stem, "size": st.st_size, "mtime": st.st_mtime})
        except Exception: pass
    return {"ok": True, "items": items}


@router.get("/api/tc/{tc_id}/snapshots/{name}")
async def get_tc_snapshot(tc_id: str, name: str):
    tc_id = _tc_id_norm(tc_id)
    """스냅샷 상세(원본 TC 데이터) 반환."""
    d = _tc_snap_dir(tc_id)
    safe_name = "".join(ch if (ch.isalnum() or ch in "-_.") else "_" for ch in name)
    p = d / f"{safe_name}.json"
    if not p.exists():
        raise HTTPException(404, "스냅샷 없음")
    try:
        return {"ok": True, "data": json.loads(p.read_text(encoding="utf-8"))}
    except Exception:
        raise HTTPException(500, "스냅샷 읽기 실패")


@router.post("/api/tc/{tc_id}/snapshots/{name}/restore")
async def restore_tc_snapshot(tc_id: str, name: str):
    tc_id = _tc_id_norm(tc_id)
    """스냅샷으로 현재 TC 를 복원 (복원 전 현재 값도 스냅샷)."""
    d = _tc_snap_dir(tc_id)
    safe_name = "".join(ch if (ch.isalnum() or ch in "-_.") else "_" for ch in name)
    p = d / f"{safe_name}.json"
    if not p.exists():
        raise HTTPException(404, "스냅샷 없음")
    try:
        snap = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(500, "스냅샷 읽기 실패")
    # 복원 전 현재 값도 자동 백업
    try:
        prev = await db.tc_get(tc_id)
        if isinstance(prev, dict):
            _tc_snap_save(tc_id, prev)
    except Exception: pass
    # tc_id 는 유지 (구조상 다를 수 있으니 강제)
    if isinstance(snap, dict):
        snap["tcid"] = tc_id
    await db.tc_upsert(tc_id, snap)
    try: asyncio.create_task(core.broadcast({"type": "tc_updated", "tcid": tc_id}))
    except Exception: pass
    return {"ok": True, "data": snap}

# TC 실행 History 저장 폴더 (tcid 별 하나의 파일)
TC_RUNHIST_DIR = core.DATA_DIR / "tc_run_history"


# TC 삭제 (실제 라우팅 대상)
@router.delete("/api/tc/{tc_id}")
async def delete_tc(tc_id: str):
    tc_id = _tc_id_norm(tc_id)
    # 존재 여부만 EXISTS 로 가볍게 확인 (전체 데이터 SELECT 안 함 — 큰 checks 로드 회피).
    # 휴지통 백업이 필요하면 별도 백그라운드 task 에서 SELECT+파일저장.
    async with db.pool().acquire() as _c:
        exists = await _c.fetchval("SELECT 1 FROM tc WHERE tcid=$1", tc_id)
    if exists:
        async def _trash_bg():
            try:
                existing = await db.tc_get(tc_id)
                if existing:
                    await asyncio.get_event_loop().run_in_executor(None, _trash_put, "tc", tc_id, existing)
            except Exception: pass
        try: asyncio.create_task(_trash_bg())
        except Exception: pass
        await db.tc_delete(tc_id)
        # 이 TC 를 참조하는 플랜 items 도 정리 (백그라운드) — 안 하면 프론트가 404 반복 조회
        try: asyncio.create_task(cycle._clean_cycle_refs(tc_id))
        except Exception: pass
    # WS 브로드캐스트도 백그라운드 (다수 접속 시 순차 send 로 응답 지연)
    try: asyncio.create_task(core.broadcast({"type": "tc_deleted", "tcid": tc_id}))
    except Exception: pass
    return {"success": True}

# ── 휴지통(삭제 복원) ──
@router.get("/api/trash")
async def list_trash():
    core.TRASH_DIR.mkdir(exist_ok=True)
    items = []
    for f in sorted(core.TRASH_DIR.glob("*.json"), reverse=True):
        try:
            rec = core.load_json(f)
            items.append({"trash_id": rec.get("trash_id"), "kind": rec.get("kind"),
                          "id": rec.get("id"), "name": rec.get("name"),
                          "deleted_at": rec.get("deleted_at"),
                          "tc_count": len(rec.get("bundle") or [])})
        except Exception:
            pass
    return {"items": items}

@router.post("/api/trash/restore/{trash_id}")
async def restore_trash(trash_id: str):
    tf = core.TRASH_DIR / f"{trash_id}.json"
    if not tf.exists():
        raise HTTPException(404, "휴지통 항목을 찾을 수 없습니다")
    rec = core.load_json(tf)
    kind = rec.get("kind"); data = rec.get("data") or {}
    restored = {"kind": kind, "id": rec.get("id"), "tc": []}
    if kind == "req":
        rid = rec.get("id")
        if rid:
            await db.req_upsert(rid, data)
        for tcd in (rec.get("bundle") or []):
            tcid = tcd.get("tcid") or tcd.get("id")
            if tcid:
                await db.tc_upsert(tcid, tcd)
                restored["tc"].append(tcid)
    elif kind == "tc":
        tcid = rec.get("id")
        if tcid:
            await db.tc_upsert(tcid, data)
    tf.unlink()
    return {"success": True, "restored": restored}

@router.delete("/api/trash/{trash_id}")
async def purge_trash(trash_id: str):
    tf = core.TRASH_DIR / f"{trash_id}.json"
    if tf.exists():
        tf.unlink()
    return {"success": True}




@router.get("/api/custom-fields")
async def get_custom_fields():
    if core.CUSTOM_FIELDS_FILE.exists():
        return core.load_json(core.CUSTOM_FIELDS_FILE)
    return {"req": [], "tc": [], "cycle": []}

@router.post("/api/custom-fields")
async def save_custom_fields(data: dict):
    core.CUSTOM_FIELDS_FILE.parent.mkdir(parents=True, exist_ok=True)
    core.save_json(core.CUSTOM_FIELDS_FILE, data)
    return {"ok": True}


_TC_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "object": {"type": "string"},
        "device_ip": {"type": "string"},
        "device_ips": {"type": "array", "items": {"type": "string"}},
        "steps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "desc": {"type": "string"},
                    "kind": {"type": "string"},
                    "cli": {"type": "string"},
                    "type": {"type": "string"},
                    "criteria": {"type": "string"},
                    "session": {"type": "integer"},
                    "loopCount": {"type": "integer"},
                    "waitSec": {"type": "number"},
                },
                "required": ["desc"],
            },
        },
    },
    "required": ["name", "steps"],
}


@router.get("/api/tc/{tc_id}/revisions")
async def tc_revisions_api(tc_id: str):
    """이 시험의 지난 판들 — 최신이 앞."""
    return {"items": await db.tc_revisions(tc_id)}


@router.post("/api/tc/{tc_id}/revisions/{rev_id}/restore")
async def tc_revision_restore(tc_id: str, rev_id: int, request: Request):
    """그 판으로 되돌린다. 지금 판은 되돌리기 직전에 자동으로 이력에 남는다."""
    data = await db.tc_revision_get(tc_id, rev_id)
    if data is None:
        raise HTTPException(404, "그 판이 없습니다")
    _by = ""
    try:
        _by = core.user_of(core.token_from(request)) or ""
    except Exception:
        pass
    if isinstance(data, dict):
        data = dict(data)
        data["updated_by"] = _by
    await db.tc_upsert(tc_id, data)
    try: asyncio.create_task(core.broadcast({"type": "tc_updated", "tcid": tc_id, "user": _by}))
    except Exception: pass
    return {"ok": True}


async def _cleanup_stale_req_tc_refs() -> int:
    """모든 REQ 를 순회하며 tc 배열에서 DB 에 없는 tcid 참조를 제거."""
    async with db.pool().acquire() as c:
        alive_rows = await c.fetch("SELECT tcid FROM tc")
        alive = {r["tcid"] for r in alive_rows}
    reqs = await db.req_list_full()
    fixed = 0
    for r in reqs:
        if not isinstance(r, dict):   # data 가 dict 아니면 (예: 문자열) 스킵
            continue
        refs = r.get("tc") or []
        if not isinstance(refs, list):
            continue
        cleaned = [ref for ref in refs if isinstance(ref, dict) and (ref.get("tcid") in alive)]
        if len(cleaned) != len(refs):
            r["tc"] = cleaned
            await db.req_upsert(r.get("id") or r.get("reqid"), r)
            fixed += (len(refs) - len(cleaned))
    return fixed


async def _cleanup_duplicate_reqs() -> int:
    """
    예전 saveOneREQ 버그로 PK 와 data.id 가 다른 두 REQ row 가 생긴 경우 병합.
    같은 data.id 를 가진 여러 PK 발견 시:
      - 하나만 남기고 나머지 삭제
      - 남길 것 = data.id 와 PK 가 일치하는 row (가장 정통)
      - 없으면 updated_at 최신 것
    """
    async with db.pool().acquire() as c:
        rows = await c.fetch("SELECT id AS pk, data, updated_at FROM req")
    # group by data.id
    groups = {}
    for r in rows:
        d = r["data"] or {}
        if not isinstance(d, dict):   # 손상된 row (data 가 dict 아님) 스킵
            continue
        did = d.get("id") or r["pk"]
        groups.setdefault(did, []).append({"pk": r["pk"], "data": d, "updated_at": r["updated_at"]})
    total_removed = 0
    for did, arr in groups.items():
        if len(arr) < 2:
            continue
        # 남길 것 선택
        canonical = next((x for x in arr if x["pk"] == did), None)
        if canonical is None:
            arr.sort(key=lambda x: x["updated_at"] or "", reverse=True)
            canonical = arr[0]
            # PK 를 data.id 로 통일 위해 canonical 을 did (data.id) 로 upsert 하고 옛 PK row 삭제
            await db.req_upsert(did, {**canonical["data"], "id": did})
        # 나머지 삭제
        for x in arr:
            if x["pk"] == canonical["pk"] or (x["pk"] == did and canonical["pk"] != did):
                continue
            async with db.pool().acquire() as c:
                await c.execute("DELETE FROM req WHERE id=$1", x["pk"])
            total_removed += 1
    return total_removed
