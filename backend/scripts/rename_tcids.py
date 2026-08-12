"""TC ID 일괄 정리 — 일회성 스크립트. 화면 기능이 아니다.

쓰는 법 (서버에서):
  docker compose -p utop exec -e DRY=1 api python /app/backend/scripts/rename_tcids.py   # 미리 보기
  docker compose -p utop exec -e DRY=0 api python /app/backend/scripts/rename_tcids.py   # 실제 반영

규칙(요구사항 폴더 기준):
 1) TC 를 요구사항 분류(cat1..cat4) 경로로 무리 짓는다.
 2) 무리 안에서 「PREFIX-TC-번호」 꼴이 절반 이상 같은 PREFIX 면 그것을
    쓴다 — 이미 좋은 ID 는 안 건드린다. 아니면 폴더 이름을 이어 붙인다.
 3) PREFIX 를 이미 따르는 TC 는 번호 유지, 나머지만 빈 번호를 받는다.
 4) 요구사항이 없거나 분류가 없는데 만들 이름도 없으면 그대로 두고 보고만.

같이 바꾸는 것: tc(tcid·data) · defect.tcid · cycle 항목 · 스냅샷 폴더 ·
실행 이력 파일. 바꾸기 전 원본 행을 /app/data/tcid_rename_backup_*.json 에
남긴다.
"""
import asyncio, datetime, json, os, pathlib, re, shutil

import asyncpg

DRY = os.environ.get("DRY", "1") == "1"
DATA = pathlib.Path("/app/data")


def sanitize(name: str) -> str:
    s = re.sub(r"^\s*\d+\.\s*", "", str(name or "").strip())
    return re.sub(r"[^A-Za-z0-9가-힣_-]+", "-", s).strip("-")


async def main() -> None:
    con = await asyncpg.connect(os.environ["DATABASE_URL"])
    cats = {r["id"]: r["name"] for r in await con.fetch("SELECT id,name FROM req_category")}
    reqs = {r["id"]: r for r in await con.fetch("SELECT id,cat1,cat2,cat3,cat4 FROM req")}
    tcs = await con.fetch("SELECT tcid,req_id,created_at FROM tc ORDER BY created_at")

    groups: dict[str, dict] = {}
    skipped: list[str] = []
    for t in tcs:
        rq = reqs.get(t["req_id"])
        if not rq:
            skipped.append(t["tcid"])
            continue
        path = [sanitize(cats.get(rq[k], "")) for k in ("cat1", "cat2", "cat3", "cat4")]
        path = [p for p in path if p]
        key = "/".join(path) or "(미분류)"
        groups.setdefault(key, {"path": path, "tcs": []})["tcs"].append(t)

    pat = re.compile(r"^(.*)-TC-(\d+)$")
    plan: list[tuple[str, str]] = []
    for key, g in groups.items():
        counts: dict[str, int] = {}
        for t in g["tcs"]:
            m = pat.match(t["tcid"])
            if m:
                counts[m.group(1)] = counts.get(m.group(1), 0) + 1
        best = max(counts.items(), key=lambda x: x[1])[0] if counts else None
        prefix = best if best and counts[best] * 2 >= len(g["tcs"]) else "-".join(g["path"])
        if not prefix:
            skipped.extend(t["tcid"] for t in g["tcs"])
            continue
        used: set[int] = set()
        move = []
        for t in g["tcs"]:
            m = pat.match(t["tcid"])
            if m and m.group(1) == prefix and int(m.group(2)) not in used:
                used.add(int(m.group(2)))
            else:
                move.append(t)
        n = 1
        for t in move:
            while n in used:
                n += 1
            used.add(n)
            plan.append((t["tcid"], f"{prefix}-TC-{n:03d}"))

    print(f"TC {len(tcs)}건 · 무리 {len(groups)}개 · 바꿀 것 {len(plan)}건 · 그대로 {len(skipped)}건")
    for old, new in plan:
        print(f"  {old}  →  {new}")
    if skipped:
        print("그대로 두는 것:", ", ".join(skipped))
    if DRY or not plan:
        print("(미리 보기 — DRY=0 으로 다시 돌리면 반영됩니다)" if plan else "(바꿀 것이 없습니다)")
        await con.close()
        return

    # ── 백업 — 지우면 못 돌리는 것들의 원본 행 ──
    olds = [o for o, _ in plan]
    backup = {
        "when": datetime.datetime.now().isoformat(),
        "plan": plan,
        "tc": [dict(r) for r in await con.fetch("SELECT tcid,data::text AS data FROM tc WHERE tcid = ANY($1)", olds)],
        "defect": [dict(r) for r in await con.fetch("SELECT id,tcid FROM defect WHERE tcid = ANY($1)", olds)],
    }
    bp = DATA / f"tcid_rename_backup_{datetime.datetime.now():%Y%m%d_%H%M%S}.json"
    bp.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
    print(f"백업: {bp}")

    def safe(x: str) -> str:
        return "".join(ch if (ch.isalnum() or ch in "-_.") else "_" for ch in x)

    for old, new in plan:
        async with con.transaction():
            row = await con.fetchrow("SELECT data FROM tc WHERE tcid=$1", old)
            if not row:
                continue
            d = json.loads(row["data"])
            d["tcid"] = new
            await con.execute(
                "UPDATE tc SET tcid=$1, data=$2 WHERE tcid=$3", new, json.dumps(d, ensure_ascii=False), old
            )
            await con.execute("UPDATE defect SET tcid=$1 WHERE tcid=$2", new, old)
            rows = await con.fetch(
                "SELECT id,data,data_summary FROM cycle WHERE data::text LIKE '%' || $1 || '%'", old
            )
            for c in rows:
                cd = json.loads(c["data"])
                hit = False
                for it in cd.get("items") or []:
                    if it.get("tcid") == old:
                        it["tcid"] = new
                        hit = True
                if not hit:
                    continue
                ds = c["data_summary"]
                if ds:
                    sm = json.loads(ds)
                    for it in sm.get("items") or []:
                        if isinstance(it, dict) and it.get("tcid") == old:
                            it["tcid"] = new
                    ds = json.dumps(sm, ensure_ascii=False)
                await con.execute(
                    "UPDATE cycle SET data=$1, data_summary=$2 WHERE id=$3",
                    json.dumps(cd, ensure_ascii=False), ds, c["id"],
                )
        p = DATA / "tc_snapshots" / safe(old)
        if p.exists():
            shutil.move(str(p), str(p.parent / safe(new)))
        h = DATA / "tc_run_history" / (safe(old) + ".json")
        if h.exists():
            shutil.move(str(h), str(h.parent / (safe(new) + ".json")))

    print("반영 완료 — 화면은 새로 고침하면 새 ID 로 보입니다")
    await con.close()


asyncio.run(main())
