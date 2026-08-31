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
import os, json, re
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

_NO_DSN = (
    "DATABASE_URL 이 설정되지 않았습니다.\n"
    "  · docker 로 실행: .env 에 POSTGRES_PASSWORD 를 넣으면 compose 가 자동으로 만들어 줍니다.\n"
    "  · 직접 실행    : .env 에 DATABASE_URL=postgresql://사용자:비번@호스트:포트/DB 를 넣으세요.\n"
    "  참고: .env.example"
)

# 여기서 raise 하지 않는다 — **import 하는 것만으로** 죽으면 DB 를 아예 안
# 쓰는 방식으로 띄울 수가 없다. N2X 중계는 계측기 서버 위에서 도는데,
# 거기에 시험 자료용 DB 를 물리게 하면 랩 네트워크에 구멍이 하나 더 나고
# DB 가 잠깐 흔들릴 때 계측기까지 같이 멈춘다.
#
# 대신 실제로 붙으려 할 때(init_pool) 같은 말로 막는다. DB 를 쓰는 길은
# 여전히 한 발짝도 못 간다.

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
    if not DSN:
        raise RuntimeError(_NO_DSN)
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
        # 실행 타입 — Info 탭은 run_type 으로 저장한다. kind 만 보면
        # 목록의 실행 타입 열이 늘 비었다(겪었다).
        "kind": data.get("kind") or data.get("run_type") or "",
        "created_by": data.get("created_by") or "",
        "updated_by": data.get("updated_by") or "",
        "step_count": cli_cnt,
    }


async def tc_upsert(tcid: str, data: dict) -> None:
    # 덮이기 직전의 판을 이력으로 보관 — 같은 내용이면 안 남긴다.
    # 저장·데이터 이사·되돌리기 모두 이 문을 지나므로 이력이 새지 않는다.
    try:
        async with pool().acquire() as _c:
            _old = await _c.fetchrow("SELECT data, updated_by FROM tc WHERE tcid=$1", tcid)
            if _old is not None and _old["data"] != data:
                await _c.execute(
                    "INSERT INTO tc_history (tcid, username, data) VALUES ($1,$2,$3::jsonb)",
                    tcid, _old["updated_by"] or "", _old["data"],
                )
    except Exception:
        pass  # 이력이 저장을 막으면 안 된다
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
              -- 생성자는 처음 것을 지킨다. EXCLUDED 로 덮으면 저장할 때마다
              -- (대개 빈 값으로) 지워져 기록이 늘 비었다.
              created_by=COALESCE(NULLIF(tc.created_by, ''), EXCLUDED.created_by),
              updated_by=EXCLUDED.updated_by,
              step_count=EXCLUDED.step_count, data=EXCLUDED.data, updated_at=now()
            """,
            tcid, m["name"], m["status"], m["req_id"], m["type"], m["severity"], m["kind"],
            # 새로 만드는 건이면 만든 사람 = 저장한 사람
            m["created_by"] or m["updated_by"], m["updated_by"], m["step_count"], data,
        )


async def tc_get(tcid: str) -> Optional[dict]:
    async with pool().acquire() as c:
        row = await c.fetchrow(
            "SELECT data, created_by, updated_by, created_at, updated_at FROM tc WHERE tcid=$1",
            tcid,
        )
        if not row:
            return None
        d = dict(row["data"] or {})
        # 기록(누가·언제)은 **표가 사실**이다. data 안에는 없거나 낡은 값이
        # 들어 있어 화면의 「기록」 칸이 늘 – 였다.
        d["created_by"] = row["created_by"] or d.get("created_by") or ""
        d["updated_by"] = row["updated_by"] or d.get("updated_by") or ""
        d["created_at"] = row["created_at"].isoformat() if row["created_at"] else ""
        d["updated_at"] = row["updated_at"].isoformat() if row["updated_at"] else ""
        # 저장할 때 「내가 읽은 뒤에 남이 고쳤나」 를 가리는 데 쓴다.
        # 자료 안의 updated_at 은 화면이 덮어쓰기도 해서 믿을 수 없다 —
        # 표의 값이 사실이다.
        d["_rev"] = row["updated_at"].isoformat() if row["updated_at"] else ""
        return d


async def tc_rev(tcid: str) -> Optional[str]:
    """지금 표에 적힌 마지막 저장 시각. 저장 직전에 견준다."""
    async with pool().acquire() as c:
        v = await c.fetchval("SELECT updated_at FROM tc WHERE tcid=$1", tcid)
        return v.isoformat() if v else None


async def tc_delete(tcid: str) -> bool:
    async with pool().acquire() as c:
        r = await c.execute("DELETE FROM tc WHERE tcid=$1", tcid)
        return r.endswith(" 1")


async def tc_revisions(tcid: str, limit: int = 100) -> list[dict]:
    """판 목록 — 무거운 data 는 안 싣고 요약(이름·스텝 수)만 뽑는다."""
    async with pool().acquire() as c:
        rows = await c.fetch(
            """SELECT id, at, username,
                      data->>'name' AS name,
                      COALESCE(jsonb_array_length(data->'checks'), 0) AS steps
                 FROM tc_history WHERE tcid=$1 ORDER BY id DESC LIMIT $2""",
            tcid, limit)
        out = []
        for r in rows:
            d = dict(r)
            d["at"] = d["at"].isoformat() if d.get("at") else None
            out.append(d)
        return out


async def tc_revision_get(tcid: str, rev_id: int) -> Optional[dict]:
    async with pool().acquire() as c:
        r = await c.fetchrow(
            "SELECT data FROM tc_history WHERE tcid=$1 AND id=$2", tcid, rev_id)
        return r["data"] if r else None


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
                   COALESCE(jsonb_array_length(data->'sessions'), 0) AS sess_n,
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
            # 세션 자리 수 — 0 이면 자동 스텝이 못 돈다(목록 ⚠ 근거).
            # 1=단독 장비 시험 · 2+=여러 장비 시험 구분도 이 수가 말해 준다
            d["_sess_n"] = r["sess_n"]
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


async def cycle_of_tc(tcid: str) -> list[dict]:
    """이 TC 가 들어간 사이클과, 그 안에서 이 TC 가 낸 결과.

    사이클 전체를 읽어와 파이썬에서 훑지 않는다. 사이클 하나에 items 가
    수십 개고 그 안에 스텝 출력까지 들어 있어서, 23개만 되어도 수 MB 를
    끌어오게 된다. 필요한 것은 그중 이 TC 한 줄뿐이다.

    items[].tcid 로 찾는다. 사이클 item 에는 status 가 없는 경우가 많아
    (옛 자료) 판정은 `_steps_fail`/`_steps_pass` 로 만든다 — 하나라도
    실패면 FAIL 이다.
    """
    async with pool().acquire() as c:
        rows = await c.fetch(
            """
            SELECT
              cy.data->>'id'            AS cycle_id,
              cy.data->>'model'         AS model,
              cy.data->>'version'       AS version,
              cy.data->>'start_date'    AS start_date,
              cy.data->>'created_at'    AS created_at,
              cy.updated_at             AS updated_at,
              it->>'executed_at'        AS executed_at,
              it->>'executed_by'        AS executed_by,
              it->>'executed_auto'      AS executed_auto,
              it->>'devName'            AS device,
              it->>'status'             AS status,
              COALESCE((it->>'_steps_pass')::int, 0)  AS steps_pass,
              COALESCE((it->>'_steps_fail')::int, 0)  AS steps_fail,
              COALESCE((it->>'_steps_count')::int, 0) AS steps_count,
              COALESCE(jsonb_array_length(it->'issues'), 0) AS issues
            FROM cycle cy,
                 LATERAL jsonb_array_elements(COALESCE(cy.data->'items', '[]'::jsonb)) it
            WHERE it->>'tcid' = $1
            ORDER BY cy.updated_at DESC
            """,
            tcid,
        )
        return [dict(r) for r in rows]


async def cycle_list_full() -> list[dict]:
    async with pool().acquire() as c:
        rows = await c.fetch("SELECT data FROM cycle ORDER BY updated_at DESC")
        return [r["data"] for r in rows]


def step_verdict(s: dict) -> str:
    """스텝 하나의 판정 — 옛 칸과 지금 칸을 함께 본다.

    화면 쪽(types.ts stepVerdict)과 같은 규칙이다. 여기만 `result` 를 보고
    있어서, 실행기가 status/repeatResult 에 적은 결과가 집계에서 통째로
    빠졌다. 사람이 손으로 적은 result 가 먼저다.
    """
    if not isinstance(s, dict):
        return ""
    r = str(s.get("result") or "").strip()
    if r:
        return r
    v = str(s.get("status") or s.get("repeatResult") or "").strip().upper()
    return {"PASS": "Pass", "FAIL": "Fail", "WIP": "WIP", "BLOCKED": "Blocked"}.get(v, "")


def item_verdict(it: dict, steps: list) -> str:
    """항목 하나의 결과 — 화면(Cycles.itemVerdict)과 같은 규칙."""
    if str(it.get("result") or "").strip():
        return str(it["result"]).strip()
    auto = [s for s in steps if not (s.get("manual") or s.get("action") == "수동")]
    if not auto:
        return "진행불가" if steps else ""
    if any(str(s.get("result") or "").lower() == "fail" for s in auto):
        return "Fail"
    if any(str(s.get("result") or "").lower() == "pass" for s in auto):
        return "Pass"
    mixed = next((s for s in auto if s.get("result")), None)
    return str(mixed.get("result")) if mixed else ""


def _cycle_item_meta_lite(it: dict) -> dict:
    """UI 목록·판정 집계용 최소 필드 (기존 서버 _cycle_item_meta_lite 재현)."""
    # "result"(사람이 손으로 찍은 항목 결과)가 빠져 있었다 — 화면 itemVerdict 는
    # 이것을 최우선으로 읽는데 요약에 없으니 표가 전부 미실행·0% 로 보였다
    m = {k: it.get(k) for k in ("tcid","name","req_id","result","ceid","severity","priority","assignee",
                                 "devId","devName","executed_by","executed_at","executed_auto","issues")}
    _stp = it.get("steps") or []
    _p = _f = _o = 0
    for s in _stp:
        r = step_verdict(s)
        if r == "Pass": _p += 1
        elif r == "Fail": _f += 1
        elif r: _o += 1
    m["_steps_count"] = len(_stp)
    m["_steps_pass"] = _p
    m["_steps_fail"] = _f
    m["_steps_other"] = _o
    m["steps"] = [{"result": step_verdict(s), "action": s.get("action",""),
                   "kind": s.get("kind",""),
                   "manual": bool(s.get("manual"))} for s in _stp if isinstance(s, dict)]
    m["_verdict"] = item_verdict(it, m["steps"])
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
                   created_at, updated_at, data_summary
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
            d["_created_at_pg"] = r["created_at"].isoformat() if r["created_at"] else None
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
              -- 생성자는 처음 것을 지킨다. EXCLUDED 로 덮으면 저장할 때마다
              -- (대개 빈 값으로) 지워져 기록이 늘 비었다.
              -- (표는 req 다 — tc.created_by 는 tc_upsert 복붙 흔적. 이
              --  탓에 req 저장이 실행마다 missing FROM-clause 로 터졌다)
              created_by=COALESCE(NULLIF(req.created_by, ''), EXCLUDED.created_by),
              updated_by=EXCLUDED.updated_by,
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
    """전체 분류를 평면 리스트로. 트리 조립은 화면에서 한다.

    req_count 는 자손까지 합산한다. 직접 달린 것만 세면 'E57 을 누르면
    요구사항이 나오는데 배지에는 아무것도 없는' 어긋남이 생긴다 —
    필터는 하위까지 포함해서 걸러주기 때문이다.
    """
    async with pool().acquire() as c:
        rows = await c.fetch(
            """
            WITH RECURSIVE sub AS (
              -- 각 분류와 그 자손을 짝지어 둔다
              SELECT id AS root, id AS node FROM req_category
              UNION ALL
              SELECT s.root, k.id
                FROM req_category k JOIN sub s ON k.parent_id = s.node
            )
            -- updated_at 도 함께 — 화면의 「최근」 정렬이 이 값을 본다.
            -- 안 주면 그 정렬이 아무 일도 안 한다(지적: 정렬이 안 먹는다).
            SELECT c.id, c.name, c.parent_id, c.sort_order, c.updated_at,
                   (SELECT count(*) FROM req r
                     WHERE r.cat1 IN (SELECT node FROM sub WHERE root = c.id)
                        OR r.cat2 IN (SELECT node FROM sub WHERE root = c.id)
                        OR r.cat3 IN (SELECT node FROM sub WHERE root = c.id)
                        OR r.cat4 IN (SELECT node FROM sub WHERE root = c.id)
                   ) AS req_count
            FROM req_category c
            ORDER BY c.parent_id NULLS FIRST, c.sort_order, c.name
            """
        )
        # 시각은 글자로 내보낸다 — JSON 이 날짜 객체를 그대로 못 담는다
        return [
            {**dict(r), "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None}
            for r in rows
        ]


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
async def views_list(scope: str, username: str) -> list[dict]:
    """이 표의 보기 목록 — 공용 전부 + 내 개인 것."""
    async with pool().acquire() as c:
        rows = await c.fetch(
            """SELECT id, scope, name, owner, shared, body, sort_order
                 FROM view_def
                WHERE scope = $1 AND (shared OR owner = $2)
                ORDER BY shared DESC, sort_order, updated_at""",
            scope, username,
        )
    return [dict(r) for r in rows]


async def views_count(scope: str, owner: str, shared: bool) -> int:
    """탭 수 세기 — 난립을 막는 상한에 쓴다."""
    async with pool().acquire() as c:
        if shared:
            n = await c.fetchval(
                "SELECT count(*) FROM view_def WHERE scope=$1 AND shared", scope
            )
        else:
            n = await c.fetchval(
                "SELECT count(*) FROM view_def WHERE scope=$1 AND owner=$2 AND NOT shared",
                scope, owner,
            )
    return int(n or 0)


async def view_save(v: dict) -> None:
    async with pool().acquire() as c:
        await c.execute(
            """INSERT INTO view_def (id, scope, name, owner, shared, body, sort_order, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, now())
               ON CONFLICT (id) DO UPDATE SET
                 name = EXCLUDED.name, shared = EXCLUDED.shared, body = EXCLUDED.body,
                 sort_order = EXCLUDED.sort_order, updated_at = now()""",
            str(v["id"]), str(v["scope"]), str(v["name"]), str(v["owner"]),
            bool(v.get("shared", True)), v.get("body") or {}, int(v.get("sort_order") or 0),
        )


async def view_get(vid: str) -> dict | None:
    async with pool().acquire() as c:
        r = await c.fetchrow("SELECT * FROM view_def WHERE id=$1", vid)
    return dict(r) if r else None


async def view_delete(vid: str) -> bool:
    async with pool().acquire() as c:
        return (await c.execute("DELETE FROM view_def WHERE id=$1", vid)).endswith("1")


async def prefs_count(username: str) -> int:
    async with pool().acquire() as c:
        return int(await c.fetchval("SELECT count(*) FROM user_pref WHERE username=$1", username) or 0)


async def prefs_get(username: str) -> dict:
    """한 사람의 화면 설정 전부 — {key: 값}. 값은 화면이 넣은 그대로."""
    async with pool().acquire() as c:
        rows = await c.fetch("SELECT key, value FROM user_pref WHERE username=$1", username)
    # 커넥션 jsonb 코덱이 이미 파이썬 값으로 돌려준다 — 더 벗기면 안 된다
    return {r["key"]: r["value"] for r in rows}


async def prefs_set(username: str, values: dict) -> None:
    """여러 키를 한 번에 — 값이 None 이면 지운다(기본으로 되돌리기)."""
    async with pool().acquire() as c:
        async with c.transaction():
            for k, v in values.items():
                if v is None:
                    await c.execute(
                        "DELETE FROM user_pref WHERE username=$1 AND key=$2", username, str(k)
                    )
                else:
                    await c.execute(
                        """INSERT INTO user_pref (username, key, value, updated_at)
                           VALUES ($1, $2, $3::jsonb, now())
                           ON CONFLICT (username, key)
                           DO UPDATE SET value = EXCLUDED.value, updated_at = now()""",
                        # 코덱이 인코딩한다 — 여기서 dumps 하면 겹싸인다(검증: _repair_double_json 사고 재현)
                        username, str(k), v,
                    )


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


# ══════════════════════════════════════════════════════════════════════
# 장비 · 인터페이스
#
# 키는 IP. 같은 모델이 여러 대여도 접속 대상은 IP 로 갈린다.
# 비밀번호는 평문이다(2026-08-02 결정). 나중에 암호화로 바꾸려면
# _dev_in / _dev_out 두 함수만 고치면 되도록 읽고 쓰는 지점을 모아뒀다.
# ══════════════════════════════════════════════════════════════════════
_DEV_COLS = (
    "id", "ip", "name", "model", "vendor", "device_group", "lab", "role",
    "protocol", "port", "username", "password", "enable_password",
    "description", "status",
)


def _as_obj(v, default=None):
    """jsonb 칸에서 온 값을 **진짜 dict/list** 로 되돌린다.

    풀에 jsonb 코덱이 걸려 있는데(=dict 를 그대로 넘기면 알아서 JSON 이
    된다) 어떤 자리는 `json.dumps()` 를 한 번 더 하고 있었다. 그러면
    `{}` 가 `"{}"` 라는 **글자**로 저장되고, 다음 저장 때 또 감싸져
    `"\"{}\""` 가 된다. 화면에서는 SNMP RW 를 적어도 저장이 되었다는
    말만 나오고 값은 안 보였다(지적).

    쓸 때는 아래 자리들에서 json.dumps 를 뺐고, 이미 겹싸인 옛 값은 이
    함수와 기동 때 도는 손질(_repair_double_json)이 벗긴다.
    """
    seen = 0
    while isinstance(v, str) and seen < 5:
        t = v.strip()
        if not t:
            return default if default is not None else {}
        try:
            v = json.loads(t)
        except Exception:
            return default if default is not None else {}
        seen += 1
    if v is None:
        return default if default is not None else {}
    return v


async def _repair_double_json() -> None:
    """겹싸여 저장된 jsonb 를 벗겨 준다(기동 때 한 번).

    `jsonb_typeof(x)='string'` 이면 객체가 아니라 **글자**로 들어갔다는
    뜻이다. 이 두 칸은 늘 객체라야 하므로 그런 줄은 죄다 겹싸인 것이다.
    SQL 로 캐스팅하면 벗긴 속이 JSON 이 아닐 때 통째로 터지므로, 파이썬에서
    벗겨(_as_obj) 되돌려 넣는다.
    """
    async with pool().acquire() as c:
        for table, col in (("device", "data"), ("device_access", "params")):
            rows = await c.fetch(
                f"SELECT id, {col} AS v FROM {table} WHERE jsonb_typeof({col}) = 'string'"
            )
            n = 0
            for r in rows:
                fixed = _as_obj(r["v"], {})
                if not isinstance(fixed, (dict, list)):
                    fixed = {}
                await c.execute(f"UPDATE {table} SET {col}=$1 WHERE id=$2", fixed, r["id"])
                n += 1
            if n:
                print(f"[startup] {table}.{col} 겹싸임 {n}줄 폄", flush=True)
        # SNMP RO — `community` 에만 적혀 있던 옛 값을 `username` 으로 옮긴다
        r = await c.execute(
            "UPDATE device_access SET username=community "
            "WHERE protocol='snmp' AND coalesce(username,'')='' AND coalesce(community,'')<>''"
        )
        moved = r.rsplit(" ", 1)[-1]
        if moved != "0":
            print(f"[startup] SNMP RO {moved}줄을 계정 칸으로 옮김", flush=True)


def _dev_in(d: dict) -> dict:
    """저장 직전 변환. 암호화를 넣게 되면 여기서 password 를 감싼다."""
    out = {k: d.get(k) for k in _DEV_COLS}
    out["ip"] = (out.get("ip") or "").strip()
    out["id"] = (out.get("id") or out["ip"]).strip()
    out["protocol"] = (out.get("protocol") or "ssh").strip().lower()
    try:
        out["port"] = int(out.get("port") or (22 if out["protocol"] == "ssh" else 23))
    except (TypeError, ValueError):
        out["port"] = 22
    return out


def _dev_out(row) -> dict:
    """조회 직후 변환. 복호화 지점."""
    d = dict(row)
    if "data" in d:
        d["data"] = _as_obj(d.get("data"), {})
        # 사업자는 **장비**의 값이다(한 모델이 여러 사업자에 걸린다).
        # 표 칸이 하나 늘 때마다 컬럼을 늘리지 않고 data 에 담되, 화면이
        # 다루기 쉽게 겉으로 올려 준다.
        d["operator"] = str(d["data"].get("operator") or "")
    return d


def _acc_out(row) -> dict:
    """접속 한 줄 — params 는 늘 dict 로 내보낸다(옛 값은 글자였다)"""
    a = dict(row)
    a["params"] = _as_obj(a.get("params"), {})
    return a


# 계측기(n2x·stc)도 여기 있어야 한다. 없으면 저장할 때 그 줄만 조용히
# 버려져서, 화면에서 켜고 저장해도 다시 열면 꺼져 있다 — 왜 안 되는지
# 알 방법이 없다.
PROTOCOLS = ("telnet", "ssh", "console", "snmp", "n2x", "stc")
# console 은 기본 포트가 없다. 터미널 서버가 장비마다 7001, 7002 … 로
# 배정하므로 사람이 적어야 한다. 0 을 넣어두면 접속 시도에서 바로 드러난다.
# n2x 도 0 이다 — 붙을 TCP 포트가 아예 없고 Tcl 이 알아서 붙는다.
# stc 의 8888 은 Spirent REST 서버 포트지 섀시 포트가 아니다.
_DEFAULT_PORT = {"telnet": 23, "ssh": 22, "console": 0, "snmp": 161, "n2x": 0, "stc": 8888}
# CLI 세션을 열 수 있는 방식. 스텝의 cli 명령은 이 셋으로만 보낼 수 있다.
# snmp 는 조회용이라 명령을 실행하지 못한다.
CLI_PROTOCOLS = ("telnet", "ssh", "console")


async def device_list(with_ifs: bool = True) -> list[dict]:
    async with pool().acquire() as c:
        rows = await c.fetch("SELECT * FROM device ORDER BY name NULLS LAST, ip")
        devs = [_dev_out(r) for r in rows]
        if not devs:
            return devs

        # 모델군은 장비에 저장하지 않고 카탈로그에서 끌어온다. 장비에도 넣으면
        # 카탈로그를 고쳤을 때 둘이 어긋나고 어느 쪽이 맞는지 알 수 없다.
        grp = {
            r["name"]: r["model_group"]
            for r in await c.fetch(
                "SELECT name, model_group FROM device_catalog "
                "WHERE kind='model' AND model_group IS NOT NULL"
            )
        }
        for d in devs:
            d["model_group"] = grp.get(d.get("model") or "")

        # 접속 방식은 목록에서 바로 보여준다(Telnet/SSH 연결상태 열).
        # 장비를 눌러 들어가야 알 수 있으면 어느 장비가 안 붙는지 못 찾는다.
        acc = await c.fetch("SELECT * FROM device_access ORDER BY device_id, protocol")
        by_acc: dict = {}
        for a in acc:
            by_acc.setdefault(a["device_id"], []).append(_acc_out(a))
        for d in devs:
            d["access"] = by_acc.get(d["id"], [])

        if with_ifs:
            ifs = await c.fetch(
                "SELECT * FROM device_interface ORDER BY device_id, sort_order, name"
            )
            by: dict = {}
            for i in ifs:
                by.setdefault(i["device_id"], []).append(dict(i))
            for d in devs:
                d["interfaces"] = by.get(d["id"], [])
        return devs


async def device_get(dev_id: str) -> Optional[dict]:
    async with pool().acquire() as c:
        row = await c.fetchrow("SELECT * FROM device WHERE id=$1 OR ip=$1", dev_id)
        if not row:
            return None
        d = _dev_out(row)
        ifs = await c.fetch(
            "SELECT * FROM device_interface WHERE device_id=$1 ORDER BY sort_order, name",
            d["id"],
        )
        d["interfaces"] = [dict(i) for i in ifs]
        acc = await c.fetch(
            "SELECT * FROM device_access WHERE device_id=$1 ORDER BY protocol", d["id"]
        )
        d["access"] = [_acc_out(a) for a in acc]
        return d


async def device_upsert(payload: dict) -> str:
    m = _dev_in(payload)
    if not m["ip"]:
        raise ValueError("IP 가 필요합니다")
    # 화면이 그대로 되돌려 보내는 **읽기 전용** 값들은 data 에 담지 않는다.
    # 담으면 접속 목록·모델그룹이 통째로 한 번 더 저장되어 자료가 불어난다.
    _NOT_DATA = (
        "interfaces", "rack_id", "rack_pos", "rack_units", "power_w",
        "access", "model_group", "if_count", "if_brief", "created_at", "updated_at", "_rev",
    )
    extra = {k: v for k, v in payload.items() if k not in _DEV_COLS and k not in _NOT_DATA}
    async with pool().acquire() as c:
        await c.execute(
            """
            INSERT INTO device (id, ip, name, model, vendor, device_group, lab, role,
                                protocol, port, username, password, enable_password,
                                description, status, data)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
            ON CONFLICT (id) DO UPDATE SET
              ip=EXCLUDED.ip, name=EXCLUDED.name, model=EXCLUDED.model,
              vendor=EXCLUDED.vendor, device_group=EXCLUDED.device_group,
              lab=EXCLUDED.lab,
              role=EXCLUDED.role, protocol=EXCLUDED.protocol, port=EXCLUDED.port,
              username=EXCLUDED.username, password=EXCLUDED.password,
              enable_password=EXCLUDED.enable_password,
              description=EXCLUDED.description, status=EXCLUDED.status,
              data=EXCLUDED.data, updated_at=now()
            """,
            m["id"], m["ip"], m["name"], m["model"], m["vendor"], m["device_group"],
            m["lab"], m["role"], m["protocol"], m["port"], m["username"], m["password"],
            m["enable_password"], m["description"], m["status"], extra,
        )
        # 랙 자리·U 크기·전력은 보낸 요청에 그 키가 있을 때만, 그 칸만 만진다.
        # 장비 편집 창은 U 크기만 보내는데, 그때 rack_id 까지 갈아 치우면
        # 편집 저장이 랙뷰 배치를 부순다.
        for col in ("rack_id", "rack_pos", "rack_units", "power_w"):
            if col not in payload:
                continue
            v = payload.get(col)
            if col == "rack_id":
                v = (str(v).strip() if v else "") or None
            else:
                try:
                    v = int(v) if v not in (None, "") else None
                except (TypeError, ValueError):
                    v = None
            await c.execute(f"UPDATE device SET {col}=$1 WHERE id=$2", v, m["id"])
        if "interfaces" in payload:
            await _device_set_ifs(c, m["id"], payload.get("interfaces") or [])
        if "access" in payload:
            await _device_set_access(c, m["id"], payload.get("access") or [])
    return m["id"]


async def device_set_rack(dev_id: str, rack_id, rack_pos, rack_units) -> bool:
    """랙 자리 지정/해제 — rack_id 가 비면 자리를 지운다."""
    rid = (str(rack_id).strip() if rack_id else "") or None
    pos = int(rack_pos) if rid and rack_pos else None
    un = int(rack_units) if rid and rack_units else None
    async with pool().acquire() as c:
        r = await c.execute(
            "UPDATE device SET rack_id=$1, rack_pos=$2, rack_units=$3, updated_at=now() "
            "WHERE id=$4 OR ip=$4",
            rid, pos, un, dev_id,
        )
        return not r.endswith(" 0")


async def _device_set_access(c, dev_id: str, rows: list) -> None:
    """접속 방식을 통째로 갈아끼운다.

    단, 마지막 연결 확인 결과(last_status/last_error/last_checked_at)는
    같은 프로토콜이 그대로 남아 있으면 유지한다 — 포트 하나 고쳤다고
    방금 확인한 연결상태가 '확인 안 함' 으로 돌아가면 화면이 거짓말을 한다.
    """
    async with c.transaction():
        old = await c.fetch(
            "SELECT protocol, last_status, last_error, last_checked_at "
            "FROM device_access WHERE device_id=$1",
            dev_id,
        )
        keep = {o["protocol"]: o for o in old}
        await c.execute("DELETE FROM device_access WHERE device_id=$1", dev_id)

        seen: set = set()
        for r in rows:
            if not isinstance(r, dict):
                continue
            proto = (r.get("protocol") or "").strip().lower()
            if proto not in PROTOCOLS or proto in seen:
                continue
            seen.add(proto)
            try:
                port = int(r.get("port") or _DEFAULT_PORT[proto])
            except (TypeError, ValueError):
                port = _DEFAULT_PORT[proto]
            prev = keep.get(proto)
            if proto == "snmp":
                # 읽는 쪽(랙뷰 포트·접속 확인·시험 스텝)은 죄다 `username` 을
                # community 로 본다. 화면이 `community` 에 적어 온 값이 조용히
                # 버려지고 있었다(지적) — 둘을 같은 값으로 맞춰 둔다.
                _ro = (r.get("username") or r.get("community") or "").strip()
                r = {**r, "username": _ro or None, "community": _ro or None}
            await c.execute(
                """INSERT INTO device_access
                     (device_id, protocol, host, port, username, password, enable_password,
                      community, params, enabled, is_default,
                      last_status, last_error, last_checked_at, note)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15)""",
                dev_id, proto, (r.get("host") or "").strip() or None, port,
                r.get("username") or None,
                r.get("password") or None,
                r.get("enable_password") or None,
                r.get("community") or None,
                _as_obj(r.get("params"), {}),
                bool(r.get("enabled", True)),
                bool(r.get("is_default", False)),
                prev["last_status"] if prev else None,
                prev["last_error"] if prev else None,
                prev["last_checked_at"] if prev else None,
                r.get("note") or None,
            )

        # 기본 접속이 하나도 없으면 하나를 골라 둔다. 스텝이 방식을 안 적었을 때
        # 무엇으로 붙을지 정해져 있어야 한다.
        # snmp 는 명령을 실행할 수 없으므로 기본이 되면 안 된다.
        # 유비쿼스 장비는 telnet 이 주력이라 telnet > ssh > console 순으로 고른다.
        if seen & set(CLI_PROTOCOLS):
            n = await c.fetchval(
                "SELECT count(*) FROM device_access WHERE device_id=$1 AND is_default", dev_id
            )
            if not n:
                await c.execute(
                    "UPDATE device_access SET is_default=TRUE WHERE id = ("
                    "  SELECT id FROM device_access WHERE device_id=$1 AND protocol = ANY($2)"
                    "  ORDER BY array_position($2, protocol) LIMIT 1)",
                    dev_id, list(CLI_PROTOCOLS),
                )


async def device_access_set_default(dev_id: str, protocol: str) -> bool:
    """
    이 장비가 무엇으로 붙는지를 정한다.

    `device.protocol` 칸이 아니라 `device_access.is_default` 가 진짜다.
    저 칸은 스키마 기본값이 'ssh' 라 아무도 안 고치고 남아 있어서,
    telnet 장비에도 ssh 가 적혀 있다. 여기서 고치는 것은 표 쪽이다.
    """
    proto = (protocol or "").strip().lower()
    if proto not in CLI_PROTOCOLS:
        raise ValueError(f"CLI 로 붙을 수 없는 방식입니다: {protocol}")
    async with pool().acquire() as c:
        async with c.transaction():
            n = await c.fetchval(
                "SELECT count(*) FROM device_access WHERE device_id=$1 AND protocol=$2",
                dev_id, proto,
            )
            if not n:
                return False
            await c.execute(
                "UPDATE device_access SET is_default = (protocol=$2) WHERE device_id=$1",
                dev_id, proto,
            )
            # 옛 칸도 같이 맞춰 둔다. 아직 저것을 읽는 자리(engine.py)가 있다.
            await c.execute("UPDATE device SET protocol=$2 WHERE id=$1", dev_id, proto)
    return True


async def device_access_mark(dev_id: str, protocol: str, ok: bool, error: str = "") -> None:
    """연결 확인 결과를 남긴다. 목록의 Telnet/SSH 연결상태가 이걸 읽는다."""
    async with pool().acquire() as c:
        await c.execute(
            """UPDATE device_access
                 SET last_status=$3, last_error=$4, last_checked_at=now()
               WHERE device_id=$1 AND protocol=$2""",
            dev_id, protocol.lower(), "ok" if ok else "fail", (error or "")[:500] or None,
        )


async def _device_set_ifs(c, dev_id: str, ifs: list) -> None:
    """인터페이스는 통째로 갈아끼운다. 부분 갱신으로 두면 화면에서 지운
    포트가 DB 에 남아 토폴로지에서 계속 튀어나온다."""
    async with c.transaction():
        await c.execute("DELETE FROM device_interface WHERE device_id=$1", dev_id)
        for i, it in enumerate(ifs):
            name = (it.get("name") if isinstance(it, dict) else str(it) or "").strip()
            if not name:
                continue
            await c.execute(
                """INSERT INTO device_interface (device_id, name, kind, speed, note, sort_order)
                   VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (device_id, name) DO NOTHING""",
                dev_id, name,
                (it.get("kind") if isinstance(it, dict) else None),
                (it.get("speed") if isinstance(it, dict) else None),
                (it.get("note") if isinstance(it, dict) else None),
                i,
            )


async def device_delete(dev_id: str) -> bool:
    async with pool().acquire() as c:
        r = await c.execute("DELETE FROM device WHERE id=$1 OR ip=$1", dev_id)
        return r.endswith(" 1")


# ══════════════════════════════════════════════════════════════════════
# 장비 카탈로그 (제조사 · 제품군 · 모델 · 랩)
#
# 장비 등록 화면이 고를 수 있는 값의 원천. 넷 다 '이름 목록' 이라 한
# 테이블에 kind 로 구분해 담는다.
# ══════════════════════════════════════════════════════════════════════
# group = 모델군(시리즈). 시험은 보통 모델 하나가 아니라 시리즈 단위로 돈다.
CATALOG_KINDS = ("vendor", "operator", "group", "family", "model", "lab")


async def catalog_list(kind: str = "") -> list[dict]:
    async with pool().acquire() as c:
        if kind:
            rows = await c.fetch(
                "SELECT * FROM device_catalog WHERE kind=$1 ORDER BY sort_order, name", kind
            )
        else:
            rows = await c.fetch(
                "SELECT * FROM device_catalog ORDER BY kind, sort_order, name"
            )
        return [dict(r) for r in rows]


async def catalog_upsert(item: dict) -> None:
    kind = (item.get("kind") or "").strip().lower()
    name = (item.get("name") or "").strip()
    if kind not in CATALOG_KINDS:
        raise ValueError(f"알 수 없는 종류입니다: {kind}")
    if not name:
        raise ValueError("이름이 필요합니다")
    async with pool().acquire() as c:
        await c.execute(
            """INSERT INTO device_catalog
                 (kind, name, vendor, operator, model_group, family, interfaces, note, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT (kind, name) DO UPDATE SET
                 vendor=EXCLUDED.vendor, operator=EXCLUDED.operator,
                 model_group=EXCLUDED.model_group,
                 family=EXCLUDED.family,
                 interfaces=EXCLUDED.interfaces, note=EXCLUDED.note,
                 sort_order=EXCLUDED.sort_order""",
            kind, name,
            (item.get("vendor") or "").strip() or None,
            (item.get("operator") or "").strip() or None,
            (item.get("model_group") or "").strip() or None,
            (item.get("family") or "").strip() or None,
            (item.get("interfaces") or "").strip() or None,
            (item.get("note") or "").strip() or None,
            int(item.get("sort_order") or 0),
        )


async def catalog_classify(name: str, fields: dict) -> None:
    """모델의 분류(벤더·제품군·모델그룹)만 고친다.

    `catalog_upsert` 는 줄을 통째로 바꿔서, 넘기지 않은 칸(인터페이스·사업자)
    이 지워진다. 장비 편집 창은 그 칸들을 모르므로 여기서는 준 칸만 건드린다.
    """
    name = (name or "").strip()
    if not name:
        raise ValueError("모델명이 필요합니다")
    cols = {
        k: ((fields.get(k) or "").strip() or None)
        for k in ("vendor", "family", "model_group", "operator", "interfaces")
        if k in fields
    }
    if not cols:
        return
    keys = list(cols)
    async with pool().acquire() as c:
        sets = ", ".join(f"{k}=${i + 2}" for i, k in enumerate(keys))
        r = await c.execute(
            f"UPDATE device_catalog SET {sets} WHERE kind='model' AND name=$1",
            name, *[cols[k] for k in keys],
        )
        if r.rsplit(" ", 1)[-1] != "0":
            return
        # 카탈로그에 아직 없던 모델이면 이 자리에서 만든다
        await c.execute(
            "INSERT INTO device_catalog (kind, name, " + ", ".join(keys) + ") "
            "VALUES ('model', $1, " + ", ".join(f"${i + 2}" for i in range(len(keys))) + ") "
            "ON CONFLICT (kind, name) DO NOTHING",
            name, *[cols[k] for k in keys],
        )


async def catalog_rename(kind: str, old: str, new: str) -> None:
    """항목 이름 변경 — 그 이름을 쓰는 모델·장비까지 한 번에.

    「고치기」 로 이름을 바꾸면 새 항목이 생기고 옛 것과 참조가 남아
    Spirent/SPIRENT 처럼 갈라졌다. 이름은 열쇠라서, 바꾸려면 참조까지
    같이 움직여야 한다. 모델명은 사이클·시험까지 물려 있어 여기서 안
    다룬다."""
    ref_cat = {"vendor": "vendor", "operator": "operator",
               "group": "model_group", "family": "family"}.get(kind)
    ref_dev = {"vendor": "vendor", "family": "role", "lab": "lab"}.get(kind)
    async with pool().acquire() as c:
        async with c.transaction():
            exists = await c.fetchval(
                "SELECT 1 FROM device_catalog WHERE kind=$1 AND name=$2", kind, new
            )
            if exists:
                # 새 이름이 이미 있으면 **병합**이다 — Spirent 를 SPIRENT 로
                # 바꾸는 일이 바로 이 경우다. 옛 항목을 지우고 참조만 옮긴다.
                r = await c.execute(
                    "DELETE FROM device_catalog WHERE kind=$1 AND name=$2", kind, old
                )
            else:
                r = await c.execute(
                    "UPDATE device_catalog SET name=$1 WHERE kind=$2 AND name=$3", new, kind, old
                )
            if not r.endswith(" 1"):
                raise ValueError("없는 항목입니다")
            if ref_cat:
                await c.execute(
                    f"UPDATE device_catalog SET {ref_cat}=$1 WHERE {ref_cat}=$2", new, old
                )
            if ref_dev:
                await c.execute(f"UPDATE device SET {ref_dev}=$1 WHERE {ref_dev}=$2", new, old)


async def catalog_delete(kind: str, name: str) -> bool:
    async with pool().acquire() as c:
        r = await c.execute(
            "DELETE FROM device_catalog WHERE kind=$1 AND name=$2", kind, name
        )
        return r.endswith(" 1")


async def catalog_usage(kind: str, name: str) -> int:
    """지우기 전에 쓰고 있는 장비가 몇 대인지 센다.

    쓰는 장비가 있는데 조용히 지우면 그 장비의 제조사가 목록에서 사라져
    다음 편집 때 빈 칸이 된다."""
    if kind == "group":
        # 모델군은 장비에 직접 없다. 그 군에 속한 모델을 쓰는 장비를 센다.
        async with pool().acquire() as c:
            return await c.fetchval(
                """SELECT count(*) FROM device d
                   WHERE d.model IN (SELECT name FROM device_catalog
                                     WHERE kind='model' AND model_group=$1)""",
                name,
            ) or 0
    col = {"vendor": "vendor", "family": "role", "model": "model", "lab": "lab"}.get(kind)
    if not col:
        return 0
    async with pool().acquire() as c:
        return await c.fetchval(f"SELECT count(*) FROM device WHERE {col}=$1", name) or 0


async def catalog_users(kind: str, name: str, limit: int = 5) -> list[str]:
    """이 항목을 쓰는 장비들 — 「1대가 쓰고 있다」 만으로는 어느 장비를
    치워야 하는지 알 수 없어서, 이름·IP 를 찍어 준다."""
    if kind == "group":
        q = ("SELECT name, ip FROM device WHERE model IN "
             "(SELECT name FROM device_catalog WHERE kind='model' AND model_group=$1) LIMIT $2")
    else:
        col = {"vendor": "vendor", "family": "role", "model": "model", "lab": "lab"}.get(kind)
        if not col:
            return []
        q = f"SELECT name, ip FROM device WHERE {col}=$1 LIMIT $2"
    async with pool().acquire() as c:
        rows = await c.fetch(q, name, limit)
    return [f"{r['name'] or '(이름 없음)'} ({r['ip']})" for r in rows]


# ══════════════════════════════════════════════════════════════════════
# 코드 목록 (드롭다운에 들어가는 값)
#
# 코드에 박아두면 항목 하나 늘릴 때마다 배포를 해야 하고, 같은 목록이
# 여러 파일에 흩어져 서로 어긋난다. 화면은 여기서만 읽는다.
# ══════════════════════════════════════════════════════════════════════
# 앞의 tc_ / req_ 가 어느 화면 것인지를 가른다. 설정 화면이 이 접두사로
# 탭을 나누므로, 새 종류를 넣을 때 접두사를 빼면 어느 쪽에도 안 뜬다.
#
# 이름에 'TC' / '요구사항' 을 다시 붙이지 않는다 — 화면 제목이 이미
# 「TC INFO 필드」/「요구사항 INFO 필드」다. 탭에까지 적으면 같은 말이
# 두 번 나와 정작 다른 부분(유형·상태·중요도)이 눈에 안 들어온다.
CODE_KINDS = {
    "tc_type": "유형",
    "tc_status": "상태",
    "tc_severity": "중요도",
    "tc_run_type": "타입",
    "tc_origin": "구분",
    "req_status": "상태",
    "req_priority": "우선순위",
    # 사이클 INFO 필드 — 사이클 만들기·편집 드롭다운이 읽는다
    "cycle_status": "상태",
    "cycle_customer": "고객",
    # 목업(Plans/Runs)이 쓰는 세 축. 화이트리스트에 없으면 서버가 값을
    # 아예 안 받아 표에서 골라도 저장이 안 된다(씨앗이 여기서 걸렸다).
    "cycle_stage": "단계",
    "cycle_type": "유형",
    "cycle_mode": "시험 방식",
    # 실행 결과 상태 — Pass·Fail·미실행(고정) 에 더해 사용자가 늘린다.
    # note 에 {"color":"#...","group":"pass|fail|neutral"} JSON 을 담는다
    "cycle_result": "실행 결과",
}


async def code_list(kind: str = "") -> list[dict]:
    async with pool().acquire() as c:
        if kind:
            rows = await c.fetch(
                "SELECT * FROM code_item WHERE kind=$1 ORDER BY sort_order, value", kind
            )
        else:
            rows = await c.fetch("SELECT * FROM code_item ORDER BY kind, sort_order, value")
        return [dict(r) for r in rows]


async def code_orphans(kind: str) -> list[dict]:
    """**쓰이고 있는데 목록에 없는 값**.

    화면은 이런 값을 붉은 글자(`목록에 없음`)로 보여 준다 — 설정에 없으니
    색도 못 정하고, 드롭다운에서 한 번 다른 값을 고르면 되돌릴 수도 없다.
    옛 자료에 남은 값이 대부분이라, 설정 화면에서 한 번에 목록에 넣게 한다.
    """
    col = {
        "tc_type": ("tc", "type"),
        "tc_status": ("tc", "status"),
        "tc_severity": ("tc", "severity"),
        "req_status": ("req", "status"),
        "req_priority": ("req", "priority"),
    }.get(kind)
    key = {"tc_run_type": "run_type", "tc_origin": "origin"}.get(kind)
    async with pool().acquire() as c:
        known = {
            r["value"]
            for r in await c.fetch("SELECT value FROM code_item WHERE kind=$1", kind)
        }
        if col:
            table, name = col
            rows = await c.fetch(
                f"SELECT {name} AS v, count(*) AS n FROM {table} "
                f"WHERE {name} IS NOT NULL AND {name} <> '' GROUP BY 1 ORDER BY 2 DESC"
            )
        elif key:
            rows = await c.fetch(
                "SELECT data->>$1 AS v, count(*) AS n FROM tc "
                "WHERE coalesce(data->>$1,'') <> '' GROUP BY 1 ORDER BY 2 DESC",
                key,
            )
        else:
            return []
        return [
            {"value": r["v"], "used": r["n"]} for r in rows if r["v"] not in known
        ]


async def code_upsert(item: dict) -> None:
    kind = (item.get("kind") or "").strip()
    value = (item.get("value") or "").strip()
    if kind not in CODE_KINDS:
        raise ValueError(f"알 수 없는 종류입니다: {kind}")
    if not value:
        raise ValueError("값이 필요합니다")
    async with pool().acquire() as c:
        await c.execute(
            """INSERT INTO code_item (kind, value, sort_order, note)
               VALUES ($1,$2,$3,$4)
               ON CONFLICT (kind, value) DO UPDATE SET
                 sort_order=EXCLUDED.sort_order, note=EXCLUDED.note""",
            kind, value, int(item.get("sort_order") or 0),
            (item.get("note") or "").strip() or None,
        )


async def code_delete(kind: str, value: str) -> bool:
    async with pool().acquire() as c:
        r = await c.execute("DELETE FROM code_item WHERE kind=$1 AND value=$2", kind, value)
        return r.endswith(" 1")


async def code_usage(kind: str, value: str) -> int:
    """지우기 전에 몇 건이 쓰고 있는지. 쓰는 것이 있는데 지우면 그 행의
    값이 목록에 없어져 편집할 때 빈 칸이 된다."""
    # 메타 컬럼이 있는 것 — (테이블, 컬럼)
    col = {
        "tc_type": ("tc", "type"),
        "tc_status": ("tc", "status"),
        "tc_severity": ("tc", "severity"),
        "req_status": ("req", "status"),
        "req_priority": ("req", "priority"),
    }.get(kind)
    if col:
        table, name = col
        async with pool().acquire() as c:
            return await c.fetchval(f"SELECT count(*) FROM {table} WHERE {name}=$1", value) or 0

    # run_type·origin 은 메타 컬럼이 없어 data 안에 있다
    key = {"tc_run_type": "run_type", "tc_origin": "origin"}.get(kind)
    if not key:
        return 0
    async with pool().acquire() as c:
        return await c.fetchval(
            "SELECT count(*) FROM tc WHERE data->>$1 = $2", key, value
        ) or 0


# ══════════════════════════════════════════════════════════════════════
# 커스텀 필드
#
# 값은 tc.data->'custom' / req.data->'custom' 에 들어간다. 여기서는 정의만
# 다룬다 — schema.sql 의 custom_field 주석에 왜 나눴는지 적어 두었다.
# ══════════════════════════════════════════════════════════════════════
CF_TARGETS = {"tc": "테스트케이스", "req": "요구사항", "cycle": "플랜"}
CF_TYPES = {
    "text": "한 줄 글",
    "textarea": "여러 줄 글",
    "number": "숫자",
    "select": "고르기",
    # 여러 개를 함께 고르는 칸 — 값은 쉼표로 이어 담는다("기능, 성능")
    "multiselect": "여러 개 고르기",
    "date": "날짜",
    "checkbox": "예/아니오",
}

# data->'custom' 의 키로 그대로 쓰이므로 JSON 키에 안전한 것만 받는다.
# 한글 키도 JSON 은 받지만, 나중에 CSV 머리글이나 URL 파라미터로 나갈 때
# 인코딩이 갈려 같은 칸이 둘로 보인다.
_CF_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,39}$")


async def cf_list(target: str = "") -> list[dict]:
    async with pool().acquire() as c:
        if target:
            rows = await c.fetch(
                "SELECT * FROM custom_field WHERE target=$1 ORDER BY sort_order, label",
                target,
            )
        else:
            rows = await c.fetch(
                "SELECT * FROM custom_field ORDER BY target, sort_order, label"
            )
        return [dict(r) for r in rows]


async def cf_upsert(item: dict) -> int:
    target = (item.get("target") or "").strip()
    key = (item.get("key") or "").strip()
    label = (item.get("label") or "").strip()
    ftype = (item.get("type") or "text").strip()

    if target not in CF_TARGETS:
        raise ValueError(f"알 수 없는 대상입니다: {target}")
    if not _CF_KEY_RE.match(key):
        raise ValueError("키는 영문으로 시작하고 영문·숫자·_ 만 쓸 수 있습니다 (40자 이내)")
    if not label:
        raise ValueError("이름을 입력하세요")
    if ftype not in CF_TYPES:
        raise ValueError(f"알 수 없는 종류입니다: {ftype}")

    options = (item.get("options") or "").strip()
    if ftype in ("select", "multiselect") and not options:
        raise ValueError("고르기 항목은 고를 값을 한 줄에 하나씩 적어야 합니다")

    # id 가 오면 그 행을 고친다. key 를 바꾸는 경우가 있어서 (target, key)
    # 충돌 규칙만으로는 '이름만 고치기' 와 '키까지 고치기' 를 구분할 수 없다.
    cf_id = item.get("id")
    async with pool().acquire() as c:
        if cf_id:
            try:
                row = await c.fetchrow(
                    """UPDATE custom_field SET
                         key=$2, label=$3, type=$4, options=$5, required=$6,
                         show_form=$7, show_list=$8, sort_order=$9, note=$10
                       WHERE id=$1 RETURNING id""",
                    int(cf_id), key, label, ftype, options or None,
                    bool(item.get("required")), bool(item.get("show_form", True)),
                    bool(item.get("show_list")), int(item.get("sort_order") or 0),
                    (item.get("note") or "").strip() or None,
                )
            except asyncpg.UniqueViolationError as e:
                # 키를 이미 있는 것으로 바꾸려 한 경우. 드라이버 메시지를 그대로
                # 올리면 무엇을 고쳐야 할지 알 수 없다.
                raise ValueError(f"'{key}' 키는 이미 있습니다") from e
            if row is None:
                raise ValueError("없는 필드입니다")
            return row["id"]
        row = await c.fetchrow(
            """INSERT INTO custom_field
                 (target, key, label, type, options, required,
                  show_form, show_list, sort_order, note)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               ON CONFLICT (target, key) DO UPDATE SET
                 label=EXCLUDED.label, type=EXCLUDED.type, options=EXCLUDED.options,
                 required=EXCLUDED.required, show_form=EXCLUDED.show_form,
                 show_list=EXCLUDED.show_list, sort_order=EXCLUDED.sort_order,
                 note=EXCLUDED.note
               RETURNING id""",
            target, key, label, ftype, options or None,
            bool(item.get("required")), bool(item.get("show_form", True)),
            bool(item.get("show_list")), int(item.get("sort_order") or 0),
            (item.get("note") or "").strip() or None,
        )
        return row["id"]


async def cf_get(cf_id: int) -> Optional[dict]:
    async with pool().acquire() as c:
        row = await c.fetchrow("SELECT * FROM custom_field WHERE id=$1", cf_id)
        return dict(row) if row else None


async def cf_delete(cf_id: int) -> bool:
    async with pool().acquire() as c:
        r = await c.execute("DELETE FROM custom_field WHERE id=$1", cf_id)
        return r.endswith(" 1")


async def cf_usage(target: str, key: str) -> int:
    """이 칸에 값이 들어 있는 건수.

    정의를 지워도 값은 data->'custom' 에 그대로 남는다 — 화면에서만 사라진다.
    지우기 전에 몇 건이 값을 갖고 있는지는 알려줘야 판단할 수 있다.
    """
    table = {"tc": "tc", "req": "req"}.get(target)
    if not table:
        return 0
    async with pool().acquire() as c:
        # 값이 비어 있으면 안 쓰는 것으로 본다. jsonb 의 `?` (키 존재) 는
        # 굳이 쓰지 않는다 — 빈 문자열로 저장된 것까지 '쓰는 중' 이 된다.
        return await c.fetchval(
            f"SELECT count(*) FROM {table} WHERE coalesce(data->'custom'->>$1, '') <> ''",
            key,
        ) or 0


# ══════════════════════════════════════════════════════════════════════
# 사이클 서버 실행 — 일감 줄
#
# 실행을 브라우저가 붙들고 있었다. 64건을 걸어 놓고 탭을 닫으면 거기서
# 멈췄고, 자리를 뜰 수가 없었다.
#
# 화면은 줄에 걸어 놓고 손을 떼고, 실행기가 집어서 돌린다. 진행과 로그는
# 여기 쌓이므로 브라우저를 닫았다 다시 열어도 처음부터 다 볼 수 있다.
# ══════════════════════════════════════════════════════════════════════

_RUN_COLS = (
    "id, cycle_id, cycle_name, picked, status, stop_asked, started_by, worker, "
    "total, done, item_at, item_name, step_at, step_count, step_name, live_steps, "
    "error, queued_at, started_at, ended_at, heartbeat_at"
)


def _run_row(r) -> dict:
    d = dict(r)
    for k in ("picked", "live_steps"):
        v = d.get(k)
        if isinstance(v, str):
            try:
                d[k] = json.loads(v)
            except Exception:
                d[k] = None
    for k in ("queued_at", "started_at", "ended_at", "heartbeat_at"):
        if d.get(k) is not None:
            d[k] = d[k].isoformat()
    return d


async def run_create(run_id: str, cycle_id: str, cycle_name: str, picked: list, who: str, total: int) -> dict:
    async with pool().acquire() as c:
        r = await c.fetchrow(
            "INSERT INTO cycle_run (id, cycle_id, cycle_name, picked, started_by, total) "
            "VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING " + _RUN_COLS,
            run_id, cycle_id, cycle_name, json.dumps(picked or []), who, int(total or 0),
        )
        return _run_row(r)


async def run_get(run_id: str) -> Optional[dict]:
    async with pool().acquire() as c:
        r = await c.fetchrow("SELECT " + _RUN_COLS + " FROM cycle_run WHERE id=$1", run_id)
        return _run_row(r) if r else None


async def run_active(cycle_id: str = "") -> list:
    """아직 안 끝난 실행. 화면이 붙을 자리를 찾을 때 쓴다."""
    q = "SELECT " + _RUN_COLS + " FROM cycle_run WHERE status IN ('queued','running')"
    args = []
    if cycle_id:
        q += " AND cycle_id=$1"
        args.append(cycle_id)
    q += " ORDER BY queued_at"
    async with pool().acquire() as c:
        return [_run_row(r) for r in await c.fetch(q, *args)]


async def run_recent(cycle_id: str, limit: int = 20) -> list:
    async with pool().acquire() as c:
        return [
            _run_row(r)
            for r in await c.fetch(
                "SELECT " + _RUN_COLS + " FROM cycle_run WHERE cycle_id=$1 "
                "ORDER BY queued_at DESC LIMIT $2",
                cycle_id, int(limit),
            )
        ]


async def run_all(limit: int = 200, status: str = "", who: str = "", q: str = "") -> list:
    """사이클을 가리지 않고 최근 실행 — Executions 화면이 쓴다.

    「어제 밤에 뭐가 돌았나」 는 사이클을 하나씩 열어서는 못 답한다.
    """
    where, args = [], []
    if status:
        args.append(status)
        where.append(f"status = ${len(args)}")
    if who:
        args.append(who)
        where.append(f"started_by = ${len(args)}")
    if q:
        args.append(f"%{q}%")
        where.append(f"(cycle_name ILIKE ${len(args)} OR cycle_id ILIKE ${len(args)})")
    args.append(int(limit))
    sql = (
        "SELECT " + _RUN_COLS + " FROM cycle_run"
        + (" WHERE " + " AND ".join(where) if where else "")
        + f" ORDER BY queued_at DESC LIMIT ${len(args)}"
    )
    async with pool().acquire() as c:
        return [_run_row(r) for r in await c.fetch(sql, *args)]


async def run_people() -> list:
    """실행을 건 사람들 — 거르개 목록에 쓴다"""
    async with pool().acquire() as c:
        return [
            r["started_by"]
            for r in await c.fetch(
                "SELECT DISTINCT started_by FROM cycle_run "
                "WHERE coalesce(started_by,'') <> '' ORDER BY started_by"
            )
        ]


async def run_claim(worker: str) -> Optional[dict]:
    """대기 중인 것 하나를 집는다.

    `FOR UPDATE SKIP LOCKED` 로 집어야 실행기를 여러 대 두어도 같은 일감을
    둘이 집지 않는다. 지금은 한 대지만 253 을 실행 서버로 두면 늘어난다.
    """
    async with pool().acquire() as c:
        async with c.transaction():
            r = await c.fetchrow(
                "SELECT id FROM cycle_run WHERE status='queued' "
                "ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT 1"
            )
            if not r:
                return None
            got = await c.fetchrow(
                "UPDATE cycle_run SET status='running', worker=$2, started_at=now(), "
                "heartbeat_at=now() WHERE id=$1 RETURNING " + _RUN_COLS,
                r["id"], worker,
            )
            return _run_row(got)


_RUN_PATCHABLE = (
    "done", "item_at", "item_name", "step_at", "step_count", "step_name", "live_steps",
)


async def run_progress(run_id: str, patch: dict) -> Optional[dict]:
    """진행을 고친다. 실행기가 자주 부르므로 필요한 칸만 건드린다."""
    sets, args = [], []
    for k in _RUN_PATCHABLE:
        if k not in patch:
            continue
        args.append(json.dumps(patch[k]) if k == "live_steps" else patch[k])
        sets.append(f"{k}=${len(args)}" + ("::jsonb" if k == "live_steps" else ""))
    sets.append("heartbeat_at=now()")
    args.append(run_id)
    async with pool().acquire() as c:
        r = await c.fetchrow(
            f"UPDATE cycle_run SET {', '.join(sets)} WHERE id=${len(args)} RETURNING " + _RUN_COLS,
            *args,
        )
        return _run_row(r) if r else None


async def run_finish(run_id: str, status: str, error: str = "") -> Optional[dict]:
    async with pool().acquire() as c:
        r = await c.fetchrow(
            "UPDATE cycle_run SET status=$2, error=$3, ended_at=now(), heartbeat_at=now(), "
            "item_at=-1, step_at=-1 WHERE id=$1 RETURNING " + _RUN_COLS,
            run_id, status, error or None,
        )
        return _run_row(r) if r else None


async def run_stop_ask(run_id: str) -> bool:
    """멈춤을 부탁한다.

    바로 죽이지 않는다 — 실행기가 스텝 사이에서 보고 스스로 내려와야
    장비 세션이 열린 채로 남지 않는다. 아직 안 집힌 것은 그 자리에서 끝낸다.
    """
    async with pool().acquire() as c:
        r = await c.execute(
            "UPDATE cycle_run SET stop_asked=true, "
            "status=CASE WHEN status='queued' THEN 'stopped' ELSE status END, "
            "ended_at=CASE WHEN status='queued' THEN now() ELSE ended_at END "
            "WHERE id=$1 AND status IN ('queued','running')",
            run_id,
        )
        return r.endswith(" 1")


async def run_log_add(run_id: str, lines: list) -> int:
    """로그를 붙이고 마지막 seq 를 돌려준다."""
    if not lines:
        return 0

    def _idx(v) -> int:
        """번호 하나. **0 을 -1 로 만들지 않는다.**

        `int(v or -1)` 로 적었다가 첫 스텝(0번)의 로그가 전부 -1 로
        저장됐다. 파이썬에서 0 은 거짓이다. 로그를 스텝 밑에 붙일 때
        첫 스텝만 아무것도 안 붙는 꼴이 된다.
        """
        try:
            return -1 if v is None else int(v)
        except Exception:
            return -1
    async with pool().acquire() as c:
        base = await c.fetchval(
            "SELECT coalesce(max(seq), 0) FROM cycle_run_log WHERE run_id=$1", run_id
        ) or 0
        rows = [
            (
                run_id, base + n + 1,
                _idx(x.get("at")), _idx(x.get("i")),
                str(x.get("kind") or ""), str(x.get("text") or ""),
            )
            for n, x in enumerate(lines)
        ]
        await c.executemany(
            "INSERT INTO cycle_run_log (run_id, seq, item_at, i, kind, text) "
            "VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
            rows,
        )
        return base + len(rows)


async def run_log_get(run_id: str, after: int = 0, limit: int = 5000) -> list:
    async with pool().acquire() as c:
        return [
            {"seq": r["seq"], "at": r["item_at"], "i": r["i"], "kind": r["kind"], "text": r["text"]}
            for r in await c.fetch(
                "SELECT seq, item_at, i, kind, text FROM cycle_run_log WHERE run_id=$1 AND seq>$2 "
                "ORDER BY seq LIMIT $3",
                run_id, int(after), int(limit),
            )
        ]


async def run_sweep_dead(stale_sec: int = 180) -> int:
    """신호가 끊긴 지 오래인 실행을 실패로 내린다.

    실행기가 죽거나 서버가 내려가면 'running' 인 채로 영원히 남는다. 그러면
    화면은 계속 도는 줄 알고 기다리고, 다시 돌릴 수도 없다.
    """
    async with pool().acquire() as c:
        r = await c.execute(
            "UPDATE cycle_run SET status='failed', ended_at=now(), "
            "error=coalesce(error, '실행기 응답이 끊겼습니다') "
            f"WHERE status='running' AND heartbeat_at < now() - interval '{int(stale_sec)} seconds'"
        )
        try:
            return int(r.rsplit(" ", 1)[-1])
        except Exception:
            return 0


# ══════════════════════════════════════════════════════════════════════
# 결함 (defect) — UTOP 안에 먼저 쌓고, 나중에 Jira 로 민다
# ══════════════════════════════════════════════════════════════════════
_DEFECT_COLS = (
    "id, title, status, severity, cycle_id, cycle_name, tcid, tc_name, model, "
    "version, steps, note, jira_project, project_name, issue_type, priority, "
    "fix_version, component, reporter, panels, jira_key, created_by, created_at, updated_at"
)


def _defect_row(r) -> dict:
    d = dict(r)
    v = d.get("steps")
    if isinstance(v, str):
        try:
            d["steps"] = json.loads(v)
        except Exception:
            d["steps"] = None
    p = d.get("panels")
    if isinstance(p, str):
        try:
            d["panels"] = json.loads(p)
        except Exception:
            d["panels"] = {}
    if d.get("panels") is None:
        d["panels"] = {}
    for k in ("created_at", "updated_at"):
        if d.get(k) is not None:
            d[k] = d[k].isoformat()
    return d


# ══════════════════════════════════════════════════════════════════════
# 수정 이력 — 누가 무엇을 언제. 알림 종과 감사(audit)가 같이 읽는다.
# ══════════════════════════════════════════════════════════════════════

async def audit_add(kind: str, ref_id: str, action: str, username: str = "") -> None:
    async with pool().acquire() as c:
        await c.execute(
            "INSERT INTO audit_log (kind, ref_id, action, username) VALUES ($1,$2,$3,$4)",
            kind[:40], str(ref_id or "")[:200], action[:40], (username or "")[:80],
        )


async def audit_list(limit: int = 300) -> list[dict]:
    async with pool().acquire() as c:
        rows = await c.fetch(
            "SELECT id, at, kind, ref_id, action, username FROM audit_log "
            "ORDER BY id DESC LIMIT $1", limit)
        out = []
        for r in rows:
            d = dict(r)
            d["at"] = d["at"].isoformat() if d.get("at") else None
            out.append(d)
        return out


def _cid_prefix_of(dt) -> str:
    """사이클 부여 ID 프리픽스 — TC·REQ 와 같은 <연2><주차2> 규칙 (C-2623-)."""
    iso = dt.isocalendar()
    return "C-%02d%02d-" % (iso[0] % 100, iso[1])


async def cycle_next_cid(prefix: str, width: int = 3) -> str:
    """부여 ID — 그 앞머리 안에서 1부터. 한 번 박히면 안 바뀐다.

    옛 주차 규칙(C-2635-)은 3자리, 모델그룹 규칙(E61xx_C)은 4자리 —
    요구사항·시험항목(_R0001·_T0001)과 나란히 읽히게."""
    async with pool().acquire() as c:
        rows = await c.fetch(
            "SELECT data->>'cid' AS cid FROM cycle WHERE data->>'cid' LIKE $1", prefix + "%"
        )
    mx = 0
    for r in rows:
        tail = (r["cid"] or "")[len(prefix):]
        if tail.isdigit():
            mx = max(mx, int(tail))
    return f"{prefix}{mx + 1:0{width}d}"


async def cycle_backfill_cids() -> int:
    """cid 없는 사이클에 만든 주 기준으로 부여 ID 를 채운다. 멱등 — 있으면 안 건드린다."""
    from datetime import datetime, timezone

    async with pool().acquire() as c:
        rows = await c.fetch(
            "SELECT id, created_at FROM cycle WHERE data->>'cid' IS NULL ORDER BY created_at"
        )
        if not rows:
            return 0
        have = await c.fetch("SELECT data->>'cid' AS cid FROM cycle WHERE data->>'cid' IS NOT NULL")
        mx: dict[str, int] = {}
        for r in have:
            m = re.match(r"^(C-\d{4}-)(\d+)$", r["cid"] or "")
            if m:
                mx[m.group(1)] = max(mx.get(m.group(1), 0), int(m.group(2)))
        n = 0
        for r in rows:
            dt = r["created_at"] or datetime.now(timezone.utc)
            pf = _cid_prefix_of(dt)
            seq = mx.get(pf, 0) + 1
            mx[pf] = seq
            new_cid = f"{pf}{seq:03d}"
            await c.execute(
                "UPDATE cycle SET data = jsonb_set(data, '{cid}', to_jsonb($2::text)), "
                "data_summary = CASE WHEN data_summary IS NULL THEN NULL "
                "ELSE jsonb_set(data_summary, '{cid}', to_jsonb($2::text)) END "
                "WHERE id=$1",
                r["id"], new_cid,
            )
            n += 1
        return n


async def defect_next_id(project_key: str) -> str:
    """DEF-<프로젝트키>-<순번3> — 그 프로젝트 안에서 1부터 붙는다.

    프로젝트 키를 아직 안 골랐으면 UTOP 으로 붙는다. ID 는 한 번 박히면
    영원하다 — 나중에 키를 바꿔 달아도 ID 는 안 바뀐다(부여 ID 원칙).
    """
    key = (project_key or "").strip() or "UTOP"
    prefix = f"DEF-{key}-"
    async with pool().acquire() as c:
        rows = await c.fetch("SELECT id FROM defect WHERE id LIKE $1", prefix + "%")
    mx = 0
    for r in rows:
        tail = r["id"][len(prefix):]
        if tail.isdigit():
            mx = max(mx, int(tail))
    return f"{prefix}{mx + 1:03d}"


async def defect_renumber_legacy() -> int:
    """옛 무작위 ID(DEF-a1b2c3d4e5)를 DEF-<프로젝트키>-<순번> 으로 갈아 끼운다.

    새 형식(끝이 숫자 3자리 이상)은 건드리지 않으므로 기동 때마다 불러도
    안전하다. 결함 ID 는 다른 표가 참조하지 않는다 — 사이클 항목은
    cycle_id+tcid 로 결함을 찾는다.
    """
    pat = re.compile(r"^DEF-.+-\d{3,}$")
    async with pool().acquire() as c:
        rows = await c.fetch("SELECT id, jira_project FROM defect ORDER BY created_at")
    n = 0
    for r in rows:
        if pat.match(r["id"]):
            continue
        new_id = await defect_next_id(r["jira_project"])
        async with pool().acquire() as c:
            await c.execute("UPDATE defect SET id=$1 WHERE id=$2", new_id, r["id"])
        n += 1
    return n


async def defect_create(d: dict) -> dict:
    async with pool().acquire() as c:
        r = await c.fetchrow(
            "INSERT INTO defect (id, title, status, severity, cycle_id, cycle_name, "
            "tcid, tc_name, model, version, steps, note, jira_project, project_name, "
            "issue_type, priority, fix_version, component, reporter, panels, jira_key, created_by) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22) "
            "RETURNING " + _DEFECT_COLS,
            d["id"], d.get("title"), d.get("status", "open"), d.get("severity"),
            d.get("cycle_id"), d.get("cycle_name"), d.get("tcid"), d.get("tc_name"),
            d.get("model"), d.get("version"), json.dumps(d.get("steps") or []),
            d.get("note"), d.get("jira_project"), d.get("project_name"),
            d.get("issue_type"), d.get("priority"), d.get("fix_version"),
            d.get("component"), d.get("reporter"), json.dumps(d.get("panels") or {}),
            d.get("jira_key"), d.get("created_by"),
        )
        return _defect_row(r)


async def defect_list(status: str = "", cycle_id: str = "", limit: int = 300) -> list:
    where, args = [], []
    if status:
        args.append(status); where.append(f"status = ${len(args)}")
    if cycle_id:
        args.append(cycle_id); where.append(f"cycle_id = ${len(args)}")
    args.append(int(limit))
    sql = ("SELECT " + _DEFECT_COLS + " FROM defect"
           + (" WHERE " + " AND ".join(where) if where else "")
           + f" ORDER BY created_at DESC LIMIT ${len(args)}")
    async with pool().acquire() as c:
        return [_defect_row(r) for r in await c.fetch(sql, *args)]


async def defect_get(did: str):
    async with pool().acquire() as c:
        r = await c.fetchrow("SELECT " + _DEFECT_COLS + " FROM defect WHERE id=$1", did)
        return _defect_row(r) if r else None


async def defect_by_item(cycle_id: str, tcid: str):
    """한 사이클의 한 항목에 이미 건 결함 — 항목 하나에 하나만 걸게."""
    async with pool().acquire() as c:
        r = await c.fetchrow(
            "SELECT " + _DEFECT_COLS + " FROM defect WHERE cycle_id=$1 AND tcid=$2 "
            "ORDER BY created_at DESC LIMIT 1",
            cycle_id, tcid,
        )
        return _defect_row(r) if r else None


_DEFECT_PATCH = ("title", "status", "severity", "note", "jira_key", "jira_project",
                 "project_name", "issue_type", "priority", "fix_version", "component",
                 "reporter", "panels")


async def defect_update(did: str, patch: dict):
    sets, args = [], []
    for k in _DEFECT_PATCH:
        if k in patch:
            if k == "panels":
                args.append(json.dumps(patch[k] or {}))
                sets.append(f"{k}=${len(args)}::jsonb")
            else:
                args.append(patch[k]); sets.append(f"{k}=${len(args)}")
    if not sets:
        return await defect_get(did)
    sets.append("updated_at=now()")
    args.append(did)
    async with pool().acquire() as c:
        r = await c.fetchrow(
            f"UPDATE defect SET {', '.join(sets)} WHERE id=${len(args)} RETURNING " + _DEFECT_COLS, *args)
        return _defect_row(r) if r else None


async def defect_delete(did: str) -> bool:
    async with pool().acquire() as c:
        return (await c.execute("DELETE FROM defect WHERE id=$1", did)).endswith(" 1")
