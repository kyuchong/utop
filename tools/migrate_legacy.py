"""옛 UTOP 데이터를 새 스키마로 옮긴다.

전제
  - 옛 DB 덤프를 같은 PostgreSQL 안의 별도 DB(기본 utop_legacy)에 복원해 둔 상태.
  - 새 DB(utop)는 이미 schema.sql 이 적용되어 req_category / req.cat1~3 가 있다.

하는 일
  1. 옛 폴더 트리(app_kv.folders)를 req_category 로 옮긴다.
     깊이는 3단이 상한이므로 4단 이상은 3단 부모로 접는다 — 실제로 4단에 있던
     것은 '1-1-1. 부팅 1000회 반복' 같은 시험 항목이라 분류가 아니었다.
  2. req / tc / cycle / manuals 를 복사하면서 req.folder(rf-id)를 cat1/2/3 로 푼다.
  3. 이미 있는 행은 건너뛴다(ON CONFLICT DO NOTHING). 지우지 않는다.

실행
  python tools/migrate_legacy.py            # 무엇이 옮겨질지만 보여준다
  python tools/migrate_legacy.py --apply    # 실제로 옮긴다
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

import asyncpg

LEGACY_DB = os.environ.get("LEGACY_DB", "utop_legacy")
MAX_DEPTH = 3


def build_category_rows(folders: list[dict]) -> tuple[list[dict], dict[str, str]]:
    """폴더 목록 → (분류 행, 폴더id→분류id 매핑).

    4단 이상은 만들지 않고, 그 폴더에 달린 요구사항은 3단 조상에 붙인다.
    """
    by_id = {f["id"]: f for f in folders if isinstance(f, dict) and f.get("id")}

    def chain(fid: str) -> list[dict]:
        """뿌리 → 자신 순서의 조상 목록"""
        out: list[dict] = []
        cur = by_id.get(fid)
        seen: set[str] = set()
        while cur and cur["id"] not in seen:
            seen.add(cur["id"])
            out.insert(0, cur)
            cur = by_id.get(cur.get("parent") or "")
        return out

    rows: list[dict] = []
    made: set[str] = set()
    for f in by_id.values():
        c = chain(f["id"])
        if len(c) > MAX_DEPTH:
            continue  # 4단 이상은 분류로 만들지 않는다
        if f["id"] in made:
            continue
        made.add(f["id"])
        parent = f.get("parent") or None
        # 부모가 상한을 넘으면 이 노드도 만들 수 없다(위에서 걸러짐)
        rows.append(
            {
                "id": f"cat-lg-{f['id']}",
                "name": (f.get("name") or "(이름 없음)").strip() or "(이름 없음)",
                "parent_id": f"cat-lg-{parent}" if parent and parent in made or parent in by_id else None,
                "sort_order": int(f.get("order") or 0),
                "depth": len(c),
            }
        )

    # 부모가 만들어지지 않은 경우(4단 부모 등) 최상위로 올린다
    ids = {r["id"] for r in rows}
    for r in rows:
        if r["parent_id"] and r["parent_id"] not in ids:
            r["parent_id"] = None

    # 폴더id → 붙일 분류id. 4단 폴더는 3단 조상으로 접는다.
    fold: dict[str, str] = {}
    for fid in by_id:
        c = chain(fid)
        if not c:
            continue
        target = c[min(len(c), MAX_DEPTH) - 1]
        fold[fid] = f"cat-lg-{target['id']}"
    return rows, fold


def cats_for(folder_id: str, fold: dict[str, str], parent_of: dict[str, str | None]):
    """분류 id → (cat1, cat2, cat3). 조상을 따라 올라가 채운다."""
    cid = fold.get(folder_id or "")
    if not cid:
        return None, None, None
    chain: list[str] = []
    cur: str | None = cid
    seen: set[str] = set()
    while cur and cur not in seen:
        seen.add(cur)
        chain.insert(0, cur)
        cur = parent_of.get(cur)
    chain = chain[:MAX_DEPTH]
    while len(chain) < MAX_DEPTH:
        chain.append(None)  # type: ignore[arg-type]
    return chain[0], chain[1], chain[2]


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제로 옮긴다 (없으면 미리보기)")
    args = ap.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL 이 필요합니다.", file=sys.stderr)
        return 1
    legacy_dsn = dsn.rsplit("/", 1)[0] + "/" + LEGACY_DB

    new = await asyncpg.connect(dsn)
    old = await asyncpg.connect(legacy_dsn)
    try:
        raw = await old.fetchval("SELECT data FROM app_kv WHERE name='folders'")
        data = json.loads(raw) if isinstance(raw, str) else (raw or {})
        folders = [f for f in (data.get("folders") or []) if isinstance(f, dict)]

        cat_rows, fold = build_category_rows(folders)
        parent_of = {r["id"]: r["parent_id"] for r in cat_rows}

        reqs = await old.fetch("SELECT id, data, folder FROM req")
        tcs = await old.fetch("SELECT tcid, data FROM tc")
        cycles = await old.fetch("SELECT id, data FROM cycle")
        manuals = await old.fetch("SELECT id, data FROM manuals")

        print(f"폴더 {len(folders)}개 → 분류 {len(cat_rows)}개 "
              f"(4단 이상 {len(folders) - len(cat_rows)}개는 3단으로 접음)")
        print(f"요구사항 {len(reqs)} · TC {len(tcs)} · 사이클 {len(cycles)} · 매뉴얼 {len(manuals)}")

        if not args.apply:
            print("\n미리보기입니다. 실제로 옮기려면 --apply 를 붙이세요.")
            return 0

        async with new.transaction():
            # 부모가 먼저 들어가야 FK 가 통과한다 → 깊이 순.
            # 같은 상위에 같은 이름이 이미 있으면 새로 만들지 않고 그것을 쓴다.
            # (사용자가 손으로 만들어 둔 분류와 이름이 겹칠 수 있다. 유니크 인덱스가
            #  막기도 하고, 무엇보다 같은 뜻의 분류를 둘로 늘리면 안 된다.)
            remap: dict[str, str] = {}
            for r in sorted(cat_rows, key=lambda x: x["depth"]):
                parent = remap.get(r["parent_id"], r["parent_id"]) if r["parent_id"] else None
                if parent is None:
                    found = await new.fetchval(
                        "SELECT id FROM req_category WHERE parent_id IS NULL AND name=$1",
                        r["name"],
                    )
                else:
                    found = await new.fetchval(
                        "SELECT id FROM req_category WHERE parent_id=$1 AND name=$2",
                        parent, r["name"],
                    )
                if found:
                    remap[r["id"]] = found
                    continue
                await new.execute(
                    """INSERT INTO req_category (id, name, parent_id, sort_order)
                       VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING""",
                    r["id"], r["name"], parent, r["sort_order"],
                )
                remap[r["id"]] = r["id"]

            # 요구사항이 가리킬 분류 id 를 실제로 들어간 id 로 바꾼다
            parent_of = {remap.get(k, k): (remap.get(v, v) if v else None)
                         for k, v in parent_of.items()}
            fold = {k: remap.get(v, v) for k, v in fold.items()}

            for r in reqs:
                d = r["data"] if isinstance(r["data"], dict) else json.loads(r["data"] or "{}")
                c1, c2, c3 = cats_for(r["folder"] or d.get("folder") or "", fold, parent_of)
                d["cat1"], d["cat2"], d["cat3"] = c1, c2, c3
                await new.execute(
                    """INSERT INTO req (id, reqid, title, folder, status, priority,
                                        created_by, updated_by, cat1, cat2, cat3, data)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
                       ON CONFLICT (id) DO NOTHING""",
                    r["id"], d.get("reqid") or r["id"], d.get("title") or "",
                    d.get("folder") or "", d.get("status") or "", d.get("priority") or "",
                    d.get("created_by") or "", d.get("updated_by") or "",
                    c1, c2, c3, json.dumps(d, ensure_ascii=False),
                )

            for t in tcs:
                d = t["data"] if isinstance(t["data"], dict) else json.loads(t["data"] or "{}")
                checks = d.get("checks") or d.get("steps") or []
                cnt = sum(1 for x in checks if isinstance(x, dict) and (x.get("kind") or "cli") == "cli")
                await new.execute(
                    """INSERT INTO tc (tcid, name, status, req_id, type, severity, kind,
                                       created_by, updated_by, step_count, data)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
                       ON CONFLICT (tcid) DO NOTHING""",
                    t["tcid"], d.get("name") or "", d.get("status") or "",
                    d.get("req_id") or "", d.get("type") or "", d.get("severity") or "",
                    d.get("kind") or "", d.get("created_by") or "", d.get("updated_by") or "",
                    cnt, json.dumps(d, ensure_ascii=False),
                )

            for c in cycles:
                d = c["data"] if isinstance(c["data"], dict) else json.loads(c["data"] or "{}")
                await new.execute(
                    """INSERT INTO cycle (id, name, data) VALUES ($1,$2,$3::jsonb)
                       ON CONFLICT (id) DO NOTHING""",
                    c["id"], d.get("name") or "", json.dumps(d, ensure_ascii=False),
                )

            for m in manuals:
                d = m["data"] if isinstance(m["data"], dict) else json.loads(m["data"] or "{}")
                await new.execute(
                    """INSERT INTO manuals (id, name, data) VALUES ($1,$2,$3::jsonb)
                       ON CONFLICT (id) DO NOTHING""",
                    m["id"], d.get("name") or "", json.dumps(d, ensure_ascii=False),
                )

        print("\n옮겼습니다. 기존 행은 건드리지 않았습니다(ON CONFLICT DO NOTHING).")
        return 0
    finally:
        await new.close()
        await old.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
