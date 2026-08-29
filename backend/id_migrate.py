"""옛 ID → **모델그룹 기준 ID** 로 옮기기.

    LGU+_E61xx_R0001        요구사항   (req.reqid)
    LGU+_E61xx_T0001        시험항목   (tc.tcid — 이건 PK 다)
    LGU+_E61xx_C0001        사이클     (cycle.data.cid)
    LGU+_E61xx_C0001-E001   실행       (cycle.data.items[].ceid)

앞머리는 **모델그룹 그대로**다. 사업자명(LGUPLUS·KT)은 딴 칸에 따로 있고,
모델그룹은 그 사업자를 알아볼 만큼 줄여 담아 사람이 붙인 통칭이다(지시).
그러니 여기서 사업자를 덧붙이면 같은 말이 두 번 들어간다.

그래서 이 코드는 모델그룹을 **손대지 않는다** — 자르지도 붙이지도 않는다.
앞머리를 무엇으로 할지는 카탈로그에서 이름을 고치는 것으로 정해진다.

실행만 `-` 로 잇는다(C0001-E001). 실행은 홀로 서는 것이 아니라 **그 사이클
안의 몇 번째**라, 이음쇠가 달라야 눈이 「사이클 밑」 으로 읽는다.

왜 주차(2633)를 뺐나 — 순번이 모델그룹 안에서 통짜로 유일하면 주차는
장식이다. 「언제 만들었나」 는 만든 날 칸이 이미 말한다. 주차를 남기면
R0001 이 여러 개가 되어, 부를 때마다 주차를 함께 말해야 한다.

왜 기동할 때 도나 — 253 은 `./update.sh` 만 돈다. 옮기기를 psql 명령으로
두면 사람이 거기 가서 쳐야 하는데, 기동 코드로 두면 받기만 하면 끝난다.
schema.sql 이 이미 같은 방식이다. 몇 번을 돌려도 안전해야 하므로,
**이미 새 모양인 것은 건드리지 않는다.**

되돌리기 — 옮긴 것은 전부 id_alias 에 옛→새로 남는다. 위키·Jira 에 손으로
적힌 옛 ID 도 이 표를 거쳐 새 것을 찾아갈 수 있다.
"""
from __future__ import annotations

import json
import re

# 새 모양인가 — 앞머리(사업자_모델그룹) + _ + R/T/C + 네 자리.
# 앞머리에 밑줄이 들어가므로 `.+` 로 욕심껏 잡는다: LGUPLUS_E61xx_R0001 에서
# 앞머리는 LGUPLUS_E61xx 다. 사업자가 「공공」·「사내」 처럼 한글일 수 있어
# 글자 종류를 묶지 않는다.
NEW_RE = re.compile(r"^.+_[RTC]\d{4}$")
NEW_EXEC_RE = re.compile(r"^.+_C\d{4}-E\d{3}$")


def pick_group(stored: str, model: str, m2g: dict[str, str], known: set[str]) -> str:
    """이 항목의 **모델그룹**을 고른다.

    카탈로그를 먼저 본다 — 사람이 이름을 고치는 곳이 거기라, 거기가 정본이다.
    적어 둔 값(LGU+_E61xx)이 카탈로그에 없으면 이름이 바뀐 것이니, 모델명으로
    지금 이름을 다시 찾는다. 둘 다 없으면 적어 둔 값을 그대로 쓴다 — 모르는
    이름을 지어내지 않는다.
    """
    g = (stored or "").strip()
    if g and g in known:
        return g
    byv = m2g.get((model or "").strip(), "")
    if byv:
        return byv
    return g


async def _known_groups(c) -> set[str]:
    rows = await c.fetch(
        "SELECT DISTINCT model_group FROM device_catalog WHERE coalesce(model_group,'') <> ''"
    )
    return {r["model_group"] for r in rows}


async def _model_to_group(c) -> dict[str, str]:
    rows = await c.fetch(
        """SELECT name, model_group FROM device_catalog
           WHERE kind = 'model' AND coalesce(model_group,'') <> ''"""
    )
    return {r["name"]: r["model_group"] for r in rows}


async def _req_group(c, m2g: dict[str, str], known: set[str]) -> dict[str, str]:
    """요구사항 → 모델그룹. 폴더를 뿌리까지 타고 올라가 그 뿌리의 프로젝트를 본다."""
    rows = await c.fetch(
        """
        WITH RECURSIVE up AS (
          SELECT id, id AS root, parent_id FROM req_category
          UNION ALL
          SELECT u.id, c.id, c.parent_id FROM up u JOIN req_category c ON c.id = u.parent_id
        ),
        root AS (SELECT id, root FROM up WHERE parent_id IS NULL)
        SELECT r.id, p.model_group, p.model
        FROM req r
        LEFT JOIN root ON root.id = r.cat1
        LEFT JOIN project p ON p.cat_id = root.root
        """
    )
    return {
        r["id"]: pick_group(r["model_group"] or "", r["model"] or "", m2g, known)
        for r in rows
    }


async def plan(c) -> dict:
    """무엇이 무엇으로 바뀌는지만 계산한다. **아무것도 쓰지 않는다.**"""
    known = await _known_groups(c)
    m2g = await _model_to_group(c)
    moves: list[dict] = []
    skipped: list[dict] = []
    # 모델그룹마다 어디까지 썼나 — 이미 새 모양인 것들의 최대 순번에서 이어 간다
    used: dict[tuple[str, str], int] = {}

    def take(mg: str, letter: str) -> str:
        k = (mg, letter)
        used[k] = used.get(k, 0) + 1
        return f"{mg}_{letter}{used[k]:04d}"

    async def seed(sql: str, letter: str):
        for r in await c.fetch(sql):
            v = r[0] or ""
            m = re.match(rf"^(.+)_{letter}(\d{{4}})$", v)
            if m:
                k = (m.group(1), letter)
                used[k] = max(used.get(k, 0), int(m.group(2)))

    await seed("SELECT reqid FROM req WHERE reqid ~ '_R[0-9]{4}$'", "R")
    await seed("SELECT tcid FROM tc WHERE tcid ~ '_T[0-9]{4}$'", "T")
    await seed("SELECT data->>'cid' FROM cycle WHERE data->>'cid' ~ '_C[0-9]{4}$'", "C")

    # ── 요구사항 ──────────────────────────────────────────────
    rg = await _req_group(c, m2g, known)
    for r in await c.fetch("SELECT id, reqid, title FROM req ORDER BY created_at, id"):
        old = r["reqid"] or ""
        mg = rg.get(r["id"], "")
        if NEW_RE.match(old):
            continue
        if not mg:
            skipped.append({"kind": "req", "pk": r["id"], "old": old,
                            "why": "프로젝트에 안 속한 폴더에 있어 모델그룹을 모릅니다"})
            continue
        moves.append({"kind": "req", "pk": r["id"], "old": old,
                      "new": take(mg, "R"), "name": r["title"] or ""})

    # ── 시험항목 ──────────────────────────────────────────────
    for r in await c.fetch(
        "SELECT tcid, name, data->>'model_group' mg, data->>'model' md FROM tc ORDER BY created_at, tcid"
    ):
        old = r["tcid"]
        if NEW_RE.match(old):
            continue
        mg = pick_group(r["mg"] or "", r["md"] or "", m2g, known)
        if not mg:
            skipped.append({"kind": "tc", "pk": old, "old": old,
                            "why": "모델그룹·모델명이 비어 있어 앞머리를 못 정합니다"})
            continue
        moves.append({"kind": "tc", "pk": old, "old": old,
                      "new": take(mg, "T"), "name": r["name"] or ""})

    # ── 사이클 · 실행 ─────────────────────────────────────────
    for r in await c.fetch(
        "SELECT id, name, model, data FROM cycle ORDER BY created_at, id"
    ):
        data = r["data"] if isinstance(r["data"], dict) else json.loads(r["data"] or "{}")
        old = data.get("cid") or ""
        if NEW_RE.match(old):
            continue
        mg = pick_group("", r["model"] or "", m2g, known)
        if not mg:
            skipped.append({"kind": "cycle", "pk": r["id"], "old": old,
                            "why": f"모델 '{r['model'] or ''}' 의 모델그룹을 못 찾습니다"})
            continue
        new = take(mg, "C")
        execs = []
        for i, it in enumerate(data.get("items") or [], start=1):
            execs.append({"old": it.get("ceid") or "", "new": f"{new}-E{i:03d}"})
        moves.append({"kind": "cycle", "pk": r["id"], "old": old, "new": new,
                      "name": r["name"] or "", "execs": execs})

    return {"moves": moves, "skipped": skipped}


async def apply(c, p: dict) -> dict:
    """계산한 것을 **실제로 쓴다**. 한 트랜잭션 안에서 전부 되거나 전부 안 된다.

    시험항목만 유독 손이 많이 간다 — tcid 가 곧 PK 라, 이걸 가리키는 곳을
    전부 같이 옮겨야 한다. 외래키가 안 걸려 있어 DB 가 안 막아 주므로,
    빠뜨리면 조용히 끊긴다. 그래서 여기 한 곳에 모아 둔다.

    손대지 않는 것: AI 총평 같은 **글** 안에 적힌 옛 ID. 남의 문장을
    기계가 고치면 뜻이 상한다. 대신 id_alias 가 옛 ID 를 받아 준다.
    """
    moves = p["moves"]
    n = {"req": 0, "tc": 0, "cycle": 0, "exec": 0, "defect": 0, "history": 0}

    async with c.transaction():
        for m in moves:
            await c.execute(
                """INSERT INTO id_alias (old_id, new_id, kind) VALUES ($1, $2, $3)
                   ON CONFLICT (old_id) DO UPDATE SET new_id = EXCLUDED.new_id""",
                m["old"] or f"({m['kind']}:{m['pk']})", m["new"], m["kind"],
            )

        # ── 요구사항 — 사람이 보는 칸만 바꾼다. 링크는 속열쇠라 안 건드린다
        for m in (x for x in moves if x["kind"] == "req"):
            await c.execute("UPDATE req SET reqid = $1 WHERE id = $2", m["new"], m["pk"])
            n["req"] += 1

        # ── 시험항목 — PK 를 옮기고, 가리키던 곳을 따라 옮긴다
        tcmap = {m["old"]: m["new"] for m in moves if m["kind"] == "tc"}
        for old, new in tcmap.items():
            await c.execute("UPDATE tc SET tcid = $1 WHERE tcid = $2", new, old)
            n["tc"] += 1
            r = await c.execute("UPDATE defect SET tcid = $1 WHERE tcid = $2", new, old)
            n["defect"] += int(r.split()[-1]) if r.split()[-1].isdigit() else 0
            r = await c.execute("UPDATE tc_history SET tcid = $1 WHERE tcid = $2", new, old)
            n["history"] += int(r.split()[-1]) if r.split()[-1].isdigit() else 0

        # ── 사이클 · 실행 — data 안에 있다. 담긴 시험항목 ID 도 함께 옮긴다
        cyc = {m["pk"]: m for m in moves if m["kind"] == "cycle"}
        for row in await c.fetch("SELECT id, data FROM cycle"):
            data = row["data"] if isinstance(row["data"], dict) else json.loads(row["data"] or "{}")
            m = cyc.get(row["id"])
            touched = False
            if m:
                data["cid"] = m["new"]
                if data.get("ce"):
                    data["ce"] = m["new"]
                for i, it in enumerate(data.get("items") or []):
                    it["ceid"] = f"{m['new']}-E{i + 1:03d}"
                    n["exec"] += 1
                n["cycle"] += 1
                touched = True
            # 담긴 시험항목 — 그 사이클이 안 옮겨져도 TC 는 옮겨졌을 수 있다
            for it in data.get("items") or []:
                if it.get("tcid") in tcmap:
                    it["tcid"] = tcmap[it["tcid"]]
                    touched = True
            if touched:
                await c.execute("UPDATE cycle SET data = $1 WHERE id = $2",
                                json.dumps(data, ensure_ascii=False), row["id"])
    return n
