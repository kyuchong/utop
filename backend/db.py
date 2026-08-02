"""
PostgreSQL 커넥션 풀 + 공통 CRUD 헬퍼.

전략:
- asyncpg 커넥션 풀 하나. FastAPI startup 시 초기화, shutdown 시 close.
- A 그룹(다건 리소스): tc/cycle/req/manuals — get/list/upsert/delete
- B 그룹(컨테이너): app_kv 로 통합 → kv_get/kv_set
- sessions: 별도 헬퍼
- 모든 함수는 async. 동기 컨텍스트에서 부를 때는 asyncio.run 또는 이벤트루프에 태워야 함.
"""
from __future__ import annotations
import os, json
from typing import Any, Optional
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

# .env 는 backend/ 또는 상위 디렉토리 어느쪽에 있어도 로드
_here = Path(__file__).resolve().parent
for _p in [_here / ".env", _here.parent / ".env"]:
    if _p.exists():
        load_dotenv(_p, override=False)
        break

# 접속 정보는 소스에 두지 않는다. DATABASE_URL 환경변수(.env 또는 compose)로 전달할 것.
# 폴백에도 비밀번호를 넣지 않는다 — 저장소에 평문 자격증명이 남는 경로를 아예 없앤다.
DSN = os.environ.get("DATABASE_URL")
if not DSN:
    raise RuntimeError(
        "DATABASE_URL 이 설정되지 않았습니다.\n"
        "  · docker 로 실행: .env 에 POSTGRES_PASSWORD 를 넣으면 compose 가 자동으로 만들어 줍니다.\n"
        "  · 직접 실행    : .env 에 DATABASE_URL=postgresql://사용자:비번@호스트:포트/DB 를 넣으세요.\n"
        "  참고: .env.example"
    )

_pool: Optional[asyncpg.Pool] = None


async def init_pool(min_size: int = 2, max_size: int = 20) -> asyncpg.Pool:
    """
    앱 시작 시 한 번 호출. asyncpg 풀 생성.

    옵션 설명:
      - max_inactive_connection_lifetime=300 : 5분 이상 idle 커넥션 자동 폐기 (Postgres 서버쪽 idle timeout 과 충돌 회피)
      - statement_cache_size=0 : PgBouncer/pgpool 을 나중에 앞단에 두더라도 문제 없도록
      - init=_init_conn : 매 커넥션 오픈 시 JSONB 자동 변환 코덱 등록
    """
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=DSN,
            min_size=min_size,
            max_size=max_size,
            command_timeout=30,
            max_inactive_connection_lifetime=300,
            init=_init_conn,
        )
        # 부팅 직후 발생하는 "ConnectionDoesNotExistError" 로그 스팸을 줄이려고,
        # asyncpg 가 처리하지 않은 Future 예외를 이벤트 루프의 exception handler 에서 걸러낸다.
        try:
            _install_asyncpg_noise_filter()
        except Exception:
            pass
    return _pool


def _install_asyncpg_noise_filter() -> None:
    """asyncpg 백그라운드 heartbeat 이 남기는 무해한 ConnectionDoesNotExistError 를 조용히 삼킨다."""
    import asyncio as _a
    loop = _a.get_event_loop()
    _prev = loop.get_exception_handler()

    def _handler(l, context):
        exc = context.get("exception")
        if isinstance(exc, asyncpg.exceptions.ConnectionDoesNotExistError):
            return   # heartbeat 중 idle 커넥션이 정리된 것 — 다음 요청은 새 커넥션으로 감
        if _prev:
            _prev(l, context)
        else:
            l.default_exception_handler(context)

    loop.set_exception_handler(_handler)


async def _init_conn(conn: asyncpg.Connection) -> None:
    # JSONB ↔ dict/list 자동 변환 (기본은 str 반환)
    await conn.set_type_codec(
        "jsonb",
        encoder=lambda v: json.dumps(v, ensure_ascii=False, default=str),
        decoder=json.loads,
        schema="pg_catalog",
    )
    await conn.set_type_codec(
        "json",
        encoder=lambda v: json.dumps(v, ensure_ascii=False, default=str),
        decoder=json.loads,
        schema="pg_catalog",
    )


async def close_pool() -> None:
    """앱 종료 시. 필수는 아니지만 정중하게."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    """이미 초기화된 풀 접근. 초기화 전이면 예외."""
    if _pool is None:
        raise RuntimeError("db.init_pool() 이 먼저 호출되어야 합니다.")
    return _pool


# ══════════════════════════════════════════════════════════════════════
# app_kv (컨테이너 파일 저장)
# ══════════════════════════════════════════════════════════════════════
async def kv_get(name: str, default: Any = None) -> Any:
    """단일 컨테이너 JSON 조회. 없으면 default."""
    async with pool().acquire() as c:
        row = await c.fetchrow("SELECT data FROM app_kv WHERE name=$1", name)
        return row["data"] if row else default


async def kv_set(name: str, data: Any) -> None:
    """컨테이너 JSON 저장 (upsert)."""
    async with pool().acquire() as c:
        await c.execute(
            """
            INSERT INTO app_kv (name, data) VALUES ($1, $2::jsonb)
            ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
            """,
            name, data,
        )


async def kv_delete(name: str) -> bool:
    async with pool().acquire() as c:
        r = await c.execute("DELETE FROM app_kv WHERE name=$1", name)
        return r.endswith(" 1")


async def kv_list_names() -> list[str]:
    async with pool().acquire() as c:
        rows = await c.fetch("SELECT name FROM app_kv ORDER BY name")
        return [r["name"] for r in rows]


# ══════════════════════════════════════════════════════════════════════
# TC (테스트 케이스)
# ══════════════════════════════════════════════════════════════════════
def _tc_meta(data: dict) -> dict:
    """TC dict 에서 검색·필터 컬럼 값 추출."""
    # step_count 는 CLI 스텝(kind==='cli' 또는 kind 없음)만 카운트.
    # (comment, group, model, wait, if, loop 등은 실행 단위가 아니므로 제외 — 프론트 _stepN 과 동일 기준)
    _all = data.get("checks") or data.get("steps") or []
    if isinstance(_all, list):
        cli_cnt = sum(1 for x in _all if isinstance(x, dict) and (x.get("kind") or "cli") == "cli")
    else:
        cli_cnt = 0
    return {
        "name": data.get("name") or "",
        "status": data.get("status") or "",
        "req_id": data.get("req_id") or "",
        "type": data.get("type") or "",
        "severity": data.get("severity") or "",
        "kind": data.get("kind") or "",
        "created_by": data.get("created_by") or "",
        "updated_by": data.get("updated_by") or "",
        "step_count": cli_cnt,
    }


async def tc_upsert(tcid: str, data: dict) -> None:
    m = _tc_meta(data)
    async with pool().acquire() as c:
        await c.execute(
            """
            INSERT INTO tc (tcid, name, status, req_id, type, severity, kind,
                            created_by, updated_by, step_count, data)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
            ON CONFLICT (tcid) DO UPDATE SET
              name=EXCLUDED.name, status=EXCLUDED.status, req_id=EXCLUDED.req_id,
              type=EXCLUDED.type, severity=EXCLUDED.severity, kind=EXCLUDED.kind,
              created_by=EXCLUDED.created_by, updated_by=EXCLUDED.updated_by,
              step_count=EXCLUDED.step_count, data=EXCLUDED.data, updated_at=now()
            """,
            tcid, m["name"], m["status"], m["req_id"], m["type"], m["severity"], m["kind"],
            m["created_by"], m["updated_by"], m["step_count"], data,
        )


async def tc_get(tcid: str) -> Optional[dict]:
    async with pool().acquire() as c:
        row = await c.fetchrow("SELECT data FROM tc WHERE tcid=$1", tcid)
        return row["data"] if row else None


async def tc_delete(tcid: str) -> bool:
    async with pool().acquire() as c:
        r = await c.execute("DELETE FROM tc WHERE tcid=$1", tcid)
        return r.endswith(" 1")


async def tc_list_full() -> list[dict]:
    """모든 TC 전체 데이터. 큰 데이터셋에는 tc_list_meta 권장."""
    async with pool().acquire() as c:
        rows = await c.fetch("SELECT data FROM tc ORDER BY updated_at DESC")
        return [r["data"] for r in rows]


async def tc_list_meta() -> list[dict]:
    """
    목록·트리 렌더링용 슬림 리스트. steps/checks/sessions/output 등 대용량 필드 제외.
    (?meta=1 요청에 사용)
    """
    async with pool().acquire() as c:
        rows = await c.fetch(
            """
            SELECT tcid, name, status, req_id, type, severity, kind,
                   created_by, updated_by, step_count,
                   created_at, updated_at,
                   data - 'checks' - 'steps' - 'sessions' - 'result_history' - 'issue_list' AS data
            FROM tc
            ORDER BY updated_at DESC
            """
        )
        out = []
        for r in rows:
            d = dict(r["data"] or {})
            d["tcid"] = r["tcid"]
            d.setdefault("name", r["name"])
            d.setdefault("status", r["status"])
            d["_cli_count"] = r["step_count"]
            d["_updated_at_pg"] = r["updated_at"].isoformat() if r["updated_at"] else None
            out.append(d)
        return out


# ══════════════════════════════════════════════════════════════════════
# Cycle
# ══════════════════════════════════════════════════════════════════════
def _parse_date(v):
    """'YYYY-MM-DD' 문자열 → date. 잘못된 값이면 None."""
    if not v:
        return None
    if hasattr(v, "toordinal"):  # 이미 date/datetime
        return v
    s = str(v).strip()[:10]
    if not s:
        return None
    try:
        from datetime import date
        parts = s.split("-")
        if len(parts) != 3:
            return None
        return date(int(parts[0]), int(parts[1]), int(parts[2]))
    except (ValueError, TypeError):
        return None


def _cycle_meta(data: dict) -> dict:
    items = data.get("items") or []
    return {
        "name": data.get("name") or "",
        "model": data.get("model") or "",
        "version": data.get("version") or "",
        "version_group": data.get("version_group") or "",
        "folder_id": data.get("folder_id") or "",
        "status": data.get("status") or "",
        "assignee": data.get("assignee") or "",
        "start_date": _parse_date(data.get("start_date")),
        "end_date": _parse_date(data.get("end_date")),
        "item_count": len(items) if isinstance(items, list) else 0,
    }


def _cycle_data_summary(data: dict) -> dict:
    """cycle_list_meta 응답용 lite 요약 — data 에서 items[].steps[] 를 result/action/manual 만 남기고 카운트 집계.
    저장 시점에 미리 계산해 두면 조회는 SELECT 만으로 끝나 렌더링 시간 극단적으로 짧아짐."""
    items = data.get("items") or []
    lite_items = [_cycle_item_meta_lite(it) for it in items if isinstance(it, dict)]
    # items 를 제외한 최상위 필드 (version, model 등) + lite items
    top = {k: v for k, v in data.items() if k != "items"}
    top["items"] = lite_items
    return top


async def cycle_upsert(cid: str, data: dict) -> None:
    m = _cycle_meta(data)
    summary = _cycle_data_summary(data)
    async with pool().acquire() as c:
        await c.execute(
            """
            INSERT INTO cycle (id, name, model, version, version_group, folder_id,
                               status, assignee, start_date, end_date, item_count, data, data_summary)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)
            ON CONFLICT (id) DO UPDATE SET
              name=EXCLUDED.name, model=EXCLUDED.model, version=EXCLUDED.version,
              version_group=EXCLUDED.version_group, folder_id=EXCLUDED.folder_id,
              status=EXCLUDED.status, assignee=EXCLUDED.assignee,
              start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date,
              item_count=EXCLUDED.item_count, data=EXCLUDED.data,
              data_summary=EXCLUDED.data_summary, updated_at=now()
            """,
            cid, m["name"], m["model"], m["version"], m["version_group"], m["folder_id"],
            m["status"], m["assignee"], m["start_date"], m["end_date"], m["item_count"],
            data, summary,
        )


async def cycle_get(cid: str) -> Optional[dict]:
    async with pool().acquire() as c:
        row = await c.fetchrow("SELECT data FROM cycle WHERE id=$1", cid)
        return row["data"] if row else None


async def cycle_delete(cid: str) -> bool:
    async with pool().acquire() as c:
        r = await c.execute("DELETE FROM cycle WHERE id=$1", cid)
        return r.endswith(" 1")


async def cycle_list_full() -> list[dict]:
    async with pool().acquire() as c:
        rows = await c.fetch("SELECT data FROM cycle ORDER BY updated_at DESC")
        return [r["data"] for r in rows]


def _cycle_item_meta_lite(it: dict) -> dict:
    """UI 목록·판정 집계용 최소 필드 (기존 서버 _cycle_item_meta_lite 재현)."""
    m = {k: it.get(k) for k in ("tcid","name","req_id","severity","priority","assignee",
                                 "devId","devName","executed_by","executed_at","executed_auto","issues")}
    _stp = it.get("steps") or []
    _p = _f = _o = 0
    for s in _stp:
        r = (s or {}).get("result") or ""
        if r == "Pass": _p += 1
        elif r == "Fail": _f += 1
        elif r: _o += 1
    m["_steps_count"] = len(_stp)
    m["_steps_pass"] = _p
    m["_steps_fail"] = _f
    m["_steps_other"] = _o
    m["steps"] = [{"result": s.get("result",""), "action": s.get("action",""),
                   "manual": bool(s.get("manual"))} for s in _stp if isinstance(s, dict)]
    return m


async def cycle_list_meta() -> list[dict]:
    """
    목록·트리·집계 렌더용 슬림 응답.
    data_summary 컬럼에 저장 시점에 이미 lite items 가 계산되어 있어 SELECT 만으로 끝.
    Python 순회·JSON 재조립 없음 → 병목 완전 제거.

    ★ data (20 MB) 는 절대 SELECT 하지 않음 — data_summary (수십 KB) 만.
    legacy fallback (data_summary IS NULL) 은 별도 쿼리에서 처리 (거의 안 걸림).
    """
    async with pool().acquire() as c:
        rows = await c.fetch(
            """
            SELECT id, name, model, version, version_group, folder_id, item_count,
                   updated_at, data_summary
            FROM cycle
            ORDER BY updated_at DESC
            """
        )
        # legacy fallback 대상 (거의 없어야 정상 — startup backfill 이 처리함)
        _need_fallback = [r["id"] for r in rows if r["data_summary"] is None]
        _fb = {}
        if _need_fallback:
            fbrows = await c.fetch(
                "SELECT id, data FROM cycle WHERE id = ANY($1::text[])",
                _need_fallback,
            )
            for fb in fbrows:
                _fb[fb["id"]] = _cycle_data_summary(dict(fb["data"] or {}))

        out = []
        for r in rows:
            if r["data_summary"] is not None:
                d = dict(r["data_summary"])
            else:
                d = _fb.get(r["id"]) or {}
            d["id"] = r["id"]
            d.setdefault("model", r["model"])
            d.setdefault("version", r["version"])
            d.setdefault("version_group", r["version_group"])
            d.setdefault("folder_id", r["folder_id"])
            d["_item_count"] = r["item_count"]
            d["_updated_at_pg"] = r["updated_at"].isoformat() if r["updated_at"] else None
            out.append(d)
        return out


async def cycle_backfill_summary() -> int:
    """data_summary 가 NULL 인 기존 cycle row 들의 요약을 재계산해 채움. 서버 startup 시 1회 호출."""
    async with pool().acquire() as c:
        rows = await c.fetch("SELECT id, data FROM cycle WHERE data_summary IS NULL")
        for r in rows:
            summary = _cycle_data_summary(dict(r["data"] or {}))
            await c.execute("UPDATE cycle SET data_summary=$1::jsonb WHERE id=$2", summary, r["id"])
        return len(rows)


# ══════════════════════════════════════════════════════════════════════
# REQ
# ══════════════════════════════════════════════════════════════════════
def _req_meta(data: dict) -> dict:
    return {
        "reqid": data.get("reqid") or data.get("id") or "",
        "title": data.get("title") or "",
        "folder": data.get("folder") or "",
        "status": data.get("status") or "",
        "priority": data.get("priority") or "",
        "created_by": data.get("created_by") or "",
        "updated_by": data.get("updated_by") or "",
        # 분류 2단. 값은 req_category.id. 빈 문자열이면 NULL 로 넣어
        # "미분류" 를 한 가지 표현으로 통일한다.
        "cat1": (data.get("cat1") or "").strip() or None,
        "cat2": (data.get("cat2") or "").strip() or None,
        "cat3": (data.get("cat3") or "").strip() or None,
        "cat4": (data.get("cat4") or "").strip() or None,
    }


async def req_upsert(rid: str, data: dict) -> None:
    m = _req_meta(data)
    async with pool().acquire() as c:
        await c.execute(
            """
            INSERT INTO req (id, reqid, title, folder, status, priority,
                             created_by, updated_by, cat1, cat2, cat3, cat4, data)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
            ON CONFLICT (id) DO UPDATE SET
              reqid=EXCLUDED.reqid, title=EXCLUDED.title, folder=EXCLUDED.folder,
              status=EXCLUDED.status, priority=EXCLUDED.priority,
              created_by=EXCLUDED.created_by, updated_by=EXCLUDED.updated_by,
              cat1=EXCLUDED.cat1, cat2=EXCLUDED.cat2, cat3=EXCLUDED.cat3, cat4=EXCLUDED.cat4,
              data=EXCLUDED.data, updated_at=now()
            """,
            rid, m["reqid"], m["title"], m["folder"], m["status"], m["priority"],
            m["created_by"], m["updated_by"], m["cat1"], m["cat2"], m["cat3"], m["cat4"], data,
        )


# ══════════════════════════════════════════════════════════════════════
# 요구사항 분류 (2단 고정: 대분류 > 중분류)
# ══════════════════════════════════════════════════════════════════════
async def cat_list() -> list[dict]:
    """전체 분류를 평면 리스트로. 트리 조립은 화면에서 한다."""
    async with pool().acquire() as c:
        rows = await c.fetch(
            """
            SELECT c.id, c.name, c.parent_id, c.sort_order,
                   (SELECT count(*) FROM req r
                     WHERE r.cat1 = c.id OR r.cat2 = c.id OR r.cat3 = c.id OR r.cat4 = c.id) AS req_count
            FROM req_category c
            ORDER BY c.parent_id NULLS FIRST, c.sort_order, c.name
            """
        )
        return [dict(r) for r in rows]


async def cat_upsert(cid: str, name: str, parent_id: Optional[str],
                     sort_order: int = 0) -> None:
    async with pool().acquire() as c:
        await c.execute(
            """
            INSERT INTO req_category (id, name, parent_id, sort_order)
            VALUES ($1,$2,$3,$4)
            ON CONFLICT (id) DO UPDATE SET
              name=EXCLUDED.name, parent_id=EXCLUDED.parent_id,
              sort_order=EXCLUDED.sort_order, updated_at=now()
            """,
            cid, name, parent_id, sort_order,
        )


async def cat_get(cid: str) -> Optional[dict]:
    async with pool().acquire() as c:
        row = await c.fetchrow(
            "SELECT id, name, parent_id, sort_order FROM req_category WHERE id=$1", cid
        )
        return dict(row) if row else None


async def cat_depth(cid: str) -> int:
    """1=대분류, 2=중분류, 3=소분류. 없으면 0."""
    async with pool().acquire() as c:
        row = await c.fetchrow(
            """
            WITH RECURSIVE up AS (
              SELECT id, parent_id, 1 AS d FROM req_category WHERE id=$1
              UNION ALL
              SELECT p.id, p.parent_id, up.d + 1
                FROM req_category p JOIN up ON up.parent_id = p.id
            )
            SELECT max(d) AS depth FROM up
            """,
            cid,
        )
        return int(row["depth"]) if row and row["depth"] else 0


async def cat_delete(cid: str) -> bool:
    """분류 삭제. 하위 분류는 ON DELETE CASCADE 로 함께 지워진다.
    요구사항은 지우지 않고, 가리키던 분류만 비운다(미분류가 된다)."""
    async with pool().acquire() as c:
        async with c.transaction():
            # 3단이므로 자손은 두 세대까지. 재귀로 한 번에 모은다.
            rows = await c.fetch(
                """
                WITH RECURSIVE down AS (
                  SELECT id FROM req_category WHERE id=$1
                  UNION ALL
                  SELECT k.id FROM req_category k JOIN down ON k.parent_id = down.id
                )
                SELECT id FROM down
                """,
                cid,
            )
            ids = [r["id"] for r in rows] or [cid]
            for col in ("cat1", "cat2", "cat3", "cat4"):
                await c.execute(
                    f"UPDATE req SET {col}=NULL WHERE {col} = ANY($1::text[])", ids
                )
            r = await c.execute("DELETE FROM req_category WHERE id=$1", cid)
        return r.endswith(" 1")


async def req_get(rid: str) -> Optional[dict]:
    async with pool().acquire() as c:
        row = await c.fetchrow("SELECT data FROM req WHERE id=$1", rid)
        return row["data"] if row else None


async def req_delete(rid: str) -> bool:
    async with pool().acquire() as c:
        r = await c.execute("DELETE FROM req WHERE id=$1", rid)
        return r.endswith(" 1")


async def req_list_full() -> list[dict]:
    """요구사항 전체. PG 의 생성·수정 시각을 함께 실어 보낸다 —
    data(JSONB) 안에는 없어서 화면에서 '마지막 수정' 을 못 보여준다."""
    async with pool().acquire() as c:
        rows = await c.fetch(
            "SELECT data, created_at, updated_at FROM req ORDER BY updated_at DESC"
        )
        out = []
        for r in rows:
            d = dict(r["data"] or {})
            d["_created_at"] = r["created_at"].isoformat() if r["created_at"] else None
            d["_updated_at"] = r["updated_at"].isoformat() if r["updated_at"] else None
            out.append(d)
        return out


# ══════════════════════════════════════════════════════════════════════
# Manuals
# ══════════════════════════════════════════════════════════════════════
def _manuals_meta(data: dict) -> dict:
    return {
        "name": data.get("name") or "",
        "source": data.get("source") or "",
        "folder": data.get("folder") or "",
        "chars": int(data.get("chars") or 0),
        "active": bool(data.get("active", True)),
    }


async def manuals_upsert(mid: str, data: dict) -> None:
    m = _manuals_meta(data)
    async with pool().acquire() as c:
        await c.execute(
            """
            INSERT INTO manuals (id, name, source, folder, chars, active, data)
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
            ON CONFLICT (id) DO UPDATE SET
              name=EXCLUDED.name, source=EXCLUDED.source, folder=EXCLUDED.folder,
              chars=EXCLUDED.chars, active=EXCLUDED.active,
              data=EXCLUDED.data, updated_at=now()
            """,
            mid, m["name"], m["source"], m["folder"], m["chars"], m["active"], data,
        )


async def manuals_get(mid: str) -> Optional[dict]:
    async with pool().acquire() as c:
        row = await c.fetchrow("SELECT data FROM manuals WHERE id=$1", mid)
        return row["data"] if row else None


async def manuals_delete(mid: str) -> bool:
    async with pool().acquire() as c:
        r = await c.execute("DELETE FROM manuals WHERE id=$1", mid)
        return r.endswith(" 1")


async def manuals_list_full() -> list[dict]:
    async with pool().acquire() as c:
        rows = await c.fetch("SELECT data FROM manuals ORDER BY updated_at DESC")
        return [r["data"] for r in rows]


# ══════════════════════════════════════════════════════════════════════
# Sessions (로그인)
# ══════════════════════════════════════════════════════════════════════
async def session_get(sid: str) -> Optional[dict]:
    async with pool().acquire() as c:
        row = await c.fetchrow("SELECT data FROM sessions WHERE session_id=$1", sid)
        return row["data"] if row else None


async def session_upsert(sid: str, data: dict, expires_at=None, username: str = "") -> None:
    async with pool().acquire() as c:
        await c.execute(
            """
            INSERT INTO sessions (session_id, username, data, expires_at)
            VALUES ($1,$2,$3::jsonb,$4)
            ON CONFLICT (session_id) DO UPDATE SET
              username=EXCLUDED.username, data=EXCLUDED.data,
              expires_at=EXCLUDED.expires_at, updated_at=now()
            """,
            sid, username or data.get("username") or "", data, expires_at,
        )


async def session_delete(sid: str) -> bool:
    async with pool().acquire() as c:
        r = await c.execute("DELETE FROM sessions WHERE session_id=$1", sid)
        return r.endswith(" 1")


async def sessions_all() -> dict[str, dict]:
    """{session_id: data} 형태. 앱 초기화 시 in-memory 로드용."""
    async with pool().acquire() as c:
        rows = await c.fetch("SELECT session_id, data FROM sessions")
        return {r["session_id"]: r["data"] for r in rows}


# ══════════════════════════════════════════════════════════════════════
# 스키마 적용
# ══════════════════════════════════════════════════════════════════════
async def apply_schema() -> None:
    """db/schema.sql 을 기동할 때마다 적용한다.

    도커의 /docker-entrypoint-initdb.d 는 **볼륨이 비어 있을 때 한 번만** 돈다.
    그래서 이미 데이터가 있는 설치처에는 나중에 추가한
    `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 가 영영 실행되지 않는다.
    실제로 cat3 컬럼을 추가했을 때 기존 설치가 `column r.cat3 does not exist`
    로 죽었다.

    schema.sql 은 전부 IF NOT EXISTS / CREATE OR REPLACE 로 되어 있어
    몇 번을 돌려도 안전하다. 그래서 기동 때마다 통째로 실행한다.
    """
    here = Path(__file__).resolve().parent
    for cand in (here.parent / "db" / "schema.sql", here / "db" / "schema.sql"):
        if cand.exists():
            sql = cand.read_text(encoding="utf-8")
            break
    else:
        print("[schema] db/schema.sql 을 찾지 못했습니다 — 스키마 적용을 건너뜁니다.", flush=True)
        return

    async with pool().acquire() as c:
        await c.execute(sql)
    print("[schema] db/schema.sql 적용 완료", flush=True)
