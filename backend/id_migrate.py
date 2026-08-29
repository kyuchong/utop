"""옛 ID → **모델그룹 기준 ID** 로 옮기기.

    E61xx-R0001        요구사항   (req.reqid)
    E61xx-T0001        시험항목   (tc.tcid — 이건 PK 다)
    E61xx-C0001        사이클     (cycle.data.cid)
    E61xx-C0001-E001   실행       (cycle.data.items[].ceid)

왜 모델그룹인가 — 요구사항과 시험항목은 **사업자를 가리지 않는다**(지시).
E61xx 의 시험항목은 KT 든 LGU+ 든 같이 쓰고, 어느 사업자용인지는 사이클을
만들 때 정한다. 그래서 ID 의 앞머리는 사업자가 아니라 제품군이다.

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

# 새 모양인가 — 앞머리(모델그룹) + R/T/C + 네 자리
NEW_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_+-]*-[RTC]\d{4}$")
NEW_EXEC_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_+-]*-C\d{4}-E\d{3}$")


def norm_group(raw: str, known: set[str]) -> str:
    """모델그룹에서 **사업자를 뗀다**.

    쓰던 값에 사업자가 붙어 있다(LGU+_E61xx, KT_U97xxS). 사용자가 카탈로그는
    정리했지만 프로젝트·시험항목에 박힌 옛 값은 그대로다. 밑줄 앞을 떼어
    보고, 그 결과가 **실제로 있는 모델그룹일 때만** 받아들인다 — 아니면
    함부로 자르다 엉뚱한 앞머리를 만든다.
    """
    g = (raw or "").strip()
    if not g:
        return ""
    if g in known:
        return g
    if "_" in g:
        tail = g.split("_", 1)[1]
        if tail in known:
            return tail
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


async def _req_group(c, known: set[str]) -> dict[str, str]:
    """요구사항 → 모델그룹. 폴더를 뿌리까지 타고 올라가 그 뿌리의 프로젝트를 본다."""
    rows = await c.fetch(
        """
        WITH RECURSIVE up AS (
          SELECT id, id AS root, parent_id FROM req_category
          UNION ALL
          SELECT u.id, c.id, c.parent_id FROM up u JOIN req_category c ON c.id = u.parent_id
        ),
        root AS (SELECT id, root FROM up WHERE parent_id IS NULL)
        SELECT r.id, p.model_group
        FROM req r
        LEFT JOIN root ON root.id = r.cat1
        LEFT JOIN project p ON p.cat_id = root.root
        """
    )
    return {r["id"]: norm_group(r["model_group"] or "", known) for r in rows}


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
        return f"{mg}-{letter}{used[k]:04d}"

    async def seed(sql: str, letter: str):
        for r in await c.fetch(sql):
            v = r[0] or ""
            m = re.match(rf"^(.+)-{letter}(\d{{4}})$", v)
            if m:
                k = (m.group(1), letter)
                used[k] = max(used.get(k, 0), int(m.group(2)))

    await seed("SELECT reqid FROM req WHERE reqid ~ '-R[0-9]{4}$'", "R")
    await seed("SELECT tcid FROM tc WHERE tcid ~ '-T[0-9]{4}$'", "T")
    await seed("SELECT data->>'cid' FROM cycle WHERE data->>'cid' ~ '-C[0-9]{4}$'", "C")

    # ── 요구사항 ──────────────────────────────────────────────
    rg = await _req_group(c, known)
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
        mg = norm_group(r["mg"] or "", known) or norm_group(m2g.get(r["md"] or "", ""), known)
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
        mg = norm_group(m2g.get(r["model"] or "", ""), known)
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
