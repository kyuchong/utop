"""옛 ID → **모델그룹 기준 ID** 로 옮기기.

    LGU+_E61xx_R0001        요구사항   (req.reqid)
    LGU+_E61xx_T0001        시험항목   (tc.tcid — 이건 PK 다)
    LGU+_E61xx_P0001        플랜     (cycle.data.cid)
    LGU+_E61xx_P0001-E001   실행       (cycle.data.items[].ceid)

앞머리는 **모델그룹 그대로**다. 사업자명(LGUPLUS·KT)은 딴 칸에 따로 있고,
모델그룹은 그 사업자를 알아볼 만큼 줄여 담아 사람이 붙인 통칭이다(지시).
그러니 여기서 사업자를 덧붙이면 같은 말이 두 번 들어간다.

그래서 이 코드는 모델그룹을 **손대지 않는다** — 자르지도 붙이지도 않는다.
앞머리를 무엇으로 할지는 카탈로그에서 이름을 고치는 것으로 정해진다.

실행만 `-` 로 잇는다(C0001-E001). 실행은 홀로 서는 것이 아니라 **그 플랜
안의 몇 번째**라, 이음쇠가 달라야 눈이 「플랜 밑」 으로 읽는다.

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

# 새 모양인가 — 앞머리(모델그룹) + **-** + R/T/V/P + 네 자리.
# 앞머리에 밑줄이나 한글이 들어갈 수 있어(KT-E61xx·공공_UbiEnt) 글자 종류를
# 묶지 않는다. 뒤에서부터 읽으므로 앞머리에 「-」 가 있어도 갈린다.
#
# **이음쇠를 「_」 에서 「-」 로 바꾼다**(지시). 옛 모양(E61xx_T0001)도 계속
# 알아봐야 한다 — 이미 매겨 둔 것이 있고, 옮기기는 그것을 새 모양으로
# 데려오는 일이다.
NEW_RE = re.compile(r"^.+-[RTVP]\d{4}$")
OLD_RE = re.compile(r"^(.+)[_-]([RTVP])(\d{4})$")
NEW_EXEC_RE = re.compile(r"^.+-P\d{4}-E\d{3}$")

#: 계열 — 요구사항 R · 요구사항을 덮는 시험 T · **Jira 이슈를 덮는 시험 V** ·
#: 플랜 P. 셋을 따로 센다(지시: 「R/T/V 별도 관리」) — 한 통에 세면 릴리스
#: 시험이 요구사항 시험 번호를 받아 가서 두 화면의 분리가 통째로 깨진다.
def tc_letter(tcid: str, jira_key: str = "") -> str:
    """이 시험이 **어느 계열**인가.

    번호가 이미 말해 주면 그것을 따른다(옛 `_V`·새 `-V`). 번호가 아직
    아무 계열도 아니면 Jira 이슈에 매여 있는지로 가른다 — Releases 가 만든
    시험은 이슈 열쇠를 갖고 있다.
    """
    m = OLD_RE.match(tcid or "")
    if m and m.group(2) in ("T", "V"):
        return m.group(2)
    return "V" if (jira_key or "").strip() else "T"


def is_current(old: str, mg: str, letter: str) -> bool:
    """이 ID 가 **지금 모델그룹의 것**인가.

    「새 모양이면 건너뛴다」 로 두었더니, 프로젝트의 모델그룹을 고쳐도
    이미 매긴 ID 가 옛 앞머리를 그대로 달고 있었다(지적: 모델그룹 기준으로
    자동으로 바뀌어야 한다). 모양이 아니라 **앞머리가 지금 것인지**를 본다.
    """
    if not mg:
        return False
    return bool(re.match(rf"^{re.escape(mg)}-{letter}\d{{4}}$", old or ""))


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
        return f"{mg}-{letter}{used[k]:04d}"

    async def seed(sql: str, letter: str):
        """이미 쓰인 순번을 센다 — **옛 모양(`_`)과 새 모양(`-`) 둘 다.**
        새 것만 세면 옮긴 뒤 번호가 1부터 다시 시작해 옛 것과 부딪친다."""
        for r in await c.fetch(sql):
            v = r[0] or ""
            m = re.match(rf"^(.+)[_-]{letter}(\d{{4}})$", v)
            if m:
                k = (m.group(1), letter)
                used[k] = max(used.get(k, 0), int(m.group(2)))

    await seed("SELECT reqid FROM req WHERE reqid ~ '[_-]R[0-9]{4}$'", "R")
    await seed("SELECT tcid FROM tc WHERE tcid ~ '[_-]T[0-9]{4}$'", "T")
    await seed("SELECT tcid FROM tc WHERE tcid ~ '[_-]V[0-9]{4}$'", "V")
    await seed("SELECT data->>'cid' FROM cycle WHERE data->>'cid' ~ '[_-]P[0-9]{4}$'", "P")

    # ── 요구사항 ──────────────────────────────────────────────
    rg = await _req_group(c, m2g, known)
    for r in await c.fetch("SELECT id, reqid, title FROM req ORDER BY created_at, id"):
        old = r["reqid"] or ""
        mg = rg.get(r["id"], "")
        if is_current(old, mg, "R"):
            continue
        if not mg:
            skipped.append({"kind": "req", "pk": r["id"], "old": old,
                            "why": "프로젝트에 안 속한 폴더에 있어 모델그룹을 모릅니다"})
            continue
        moves.append({"kind": "req", "pk": r["id"], "old": old,
                      "new": take(mg, "R"), "name": r["title"] or ""})

    # ── 시험항목 ──────────────────────────────────────────────
    for r in await c.fetch(
        """SELECT tcid, name, data->>'model_group' mg, data->>'model' md,
                  data->>'jira_issue_key' jk
             FROM tc ORDER BY created_at, tcid"""
    ):
        old = r["tcid"]
        mg = pick_group(r["mg"] or "", r["md"] or "", m2g, known)
        # **계열을 지킨다**(지시: R/T/V 별도). 이것을 안 보고 전부 T 로
        # 매기면 릴리스 시험이 요구사항 시험 번호를 받아 가서, 두 화면의
        # 분리가 통째로 깨진다(실제로 그렇게 되어 있었다).
        letter = tc_letter(old, r["jk"] or "")
        if is_current(old, mg, letter):
            continue
        if not mg:
            skipped.append({"kind": "tc", "pk": old, "old": old,
                            "why": "모델그룹·모델명이 비어 있어 앞머리를 못 정합니다"})
            continue
        moves.append({"kind": "tc", "pk": old, "old": old,
                      "new": take(mg, letter), "name": r["name"] or "",
                      "letter": letter})

    # ── 플랜 · 실행 ─────────────────────────────────────────
    for r in await c.fetch(
        "SELECT id, name, model, data FROM cycle ORDER BY created_at, id"
    ):
        data = r["data"] if isinstance(r["data"], dict) else json.loads(r["data"] or "{}")
        old = data.get("cid") or ""
        mg = pick_group("", r["model"] or "", m2g, known)
        if is_current(old, mg, "P"):
            continue
        if not mg:
            skipped.append({"kind": "cycle", "pk": r["id"], "old": old,
                            "why": f"모델 '{r['model'] or ''}' 의 모델그룹을 못 찾습니다"})
            continue
        new = take(mg, "P")
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
    n = {"req": 0, "tc": 0, "cycle": 0, "exec": 0, "defect": 0, "history": 0,
         "release": 0}

    async with c.transaction():
        for m in moves:
            await c.execute(
                """INSERT INTO id_alias (old_id, new_id, kind) VALUES ($1, $2, $3)
                   ON CONFLICT (old_id) DO UPDATE SET new_id = EXCLUDED.new_id""",
                m["old"] or f"({m['kind']}:{m['pk']})", m["new"], m["kind"],
            )

        # ── 요구사항 — 사람이 보는 칸만 바꾼다. 링크는 속열쇠라 안 건드린다
        for m in (x for x in moves if x["kind"] == "req"):
            # **칸과 data 를 함께 고친다.** req 는 data 가 정본이고 칸은
            # 거기서 뽑아 둔 것이다(db.req_upsert). 칸만 고치면 화면에는
            # 옛 ID 가 그대로 보이고, 다음 저장 때 칸이 옛 값으로 되돌아간다.
            await c.execute(
                """UPDATE req
                      SET reqid = $1,
                          data = jsonb_set(data, '{reqid}', to_jsonb($1::text))
                    WHERE id = $2""",
                m["new"], m["pk"],
            )
            n["req"] += 1

        # ── 시험항목 — PK 를 옮기고, 가리키던 곳을 따라 옮긴다
        tcmap = {m["old"]: m["new"] for m in moves if m["kind"] == "tc"}
        for old, new in tcmap.items():
            await c.execute(
                """UPDATE tc
                      SET tcid = $1,
                          data = jsonb_set(data, '{tcid}', to_jsonb($1::text))
                    WHERE tcid = $2""",
                new, old,
            )
            n["tc"] += 1
            r = await c.execute("UPDATE defect SET tcid = $1 WHERE tcid = $2", new, old)
            n["defect"] += int(r.split()[-1]) if r.split()[-1].isdigit() else 0
            r = await c.execute("UPDATE tc_history SET tcid = $1 WHERE tcid = $2", new, old)
            n["history"] += int(r.split()[-1]) if r.split()[-1].isdigit() else 0

        # ── 플랜 · 실행 — data 안에 있다. 담긴 시험항목 ID 도 함께 옮긴다
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
            # 담긴 시험항목 — 그 플랜이 안 옮겨져도 TC 는 옮겨졌을 수 있다
            for it in data.get("items") or []:
                if it.get("tcid") in tcmap:
                    it["tcid"] = tcmap[it["tcid"]]
                    touched = True
            if touched:
                # **json.dumps 를 하지 않는다.** 풀에 jsonb 코덱이 걸려 있어
                # dict 를 그대로 넘기면 알아서 JSON 이 된다. 글자로 넘기면
                # 「JSON 문자열 하나」 로 겹싸여 저장되고, 그러면 data->>'cid'
                # 가 안 잡히고 jsonb_set 이 'cannot set path in scalar' 로
                # 죽는다(겪었다: 플랜 3건). db._repair_double_json 이 있는
                # 까닭도 같은 사고다.
                await c.execute("UPDATE cycle SET data = $1 WHERE id = $2",
                                data, row["id"])

        # ── 릴리스 — **이슈에 붙여 둔 시험**도 따라 옮긴다(지시: Release 추가)
        #
        #    이것을 빠뜨리면 옮긴 뒤 Releases 화면에서 이슈에 붙여 둔 시험이
        #    통째로 사라져 보인다 — 시험은 살아 있는데 이슈가 옛 번호를
        #    가리키고 있어서다. 외래키가 없어 DB 가 안 막아 준다.
        #
        #    자료 모양: app_kv['release_summary'].releases["PROJ@@VER"][이슈키].tcs
        if tcmap:
            row = await c.fetchrow(
                "SELECT data FROM app_kv WHERE name = 'release_summary'")
            if row is not None:
                kv = row["data"] if isinstance(row["data"], dict) else json.loads(row["data"] or "{}")
                rel = kv.get("releases") if isinstance(kv, dict) else None
                touched = False
                if isinstance(rel, dict):
                    for bag in rel.values():
                        if not isinstance(bag, dict):
                            continue
                        for issue in bag.values():
                            if not isinstance(issue, dict):
                                continue
                            tcs = issue.get("tcs")
                            if not isinstance(tcs, list):
                                continue
                            for i, t in enumerate(tcs):
                                # 글자로 든 것과 {tcid:…} 로 든 것이 섞여 있다
                                if isinstance(t, str) and t in tcmap:
                                    tcs[i] = tcmap[t]
                                    n["release"] += 1
                                    touched = True
                                elif isinstance(t, dict) and t.get("tcid") in tcmap:
                                    t["tcid"] = tcmap[t["tcid"]]
                                    n["release"] += 1
                                    touched = True
                if touched:
                    await c.execute(
                        "UPDATE app_kv SET data = $1 WHERE name = 'release_summary'", kv)
    return n


async def repair(c) -> dict:
    """**칸만 바뀌고 data 는 안 바뀐 것**을 맞춘다.

    처음 판이 칸만 고쳤다. req 는 data 가 정본이라 화면에 옛 ID 가 그대로
    보였고, tc 도 data 안의 tcid 가 옛 값으로 남았다. 이미 눌러 버린 설치처가
    있으므로, 기동할 때마다 한 번씩 훑어 맞춘다 — 어긋난 것이 없으면 아무
    일도 안 한다.

    맞추는 방향은 **칸 → data** 다. 칸이 새 ID 를 들고 있는 쪽이 옮기기가
    실제로 정한 값이다.
    """
    fixed = {"req": 0, "tc": 0, "cycle": 0}
    async with c.transaction():
        r = await c.execute(
            """UPDATE req
                  SET data = jsonb_set(data, '{reqid}', to_jsonb(reqid))
                WHERE reqid ~ '[_-]R[0-9]{4}$'
                  AND coalesce(data->>'reqid', '') <> reqid"""
        )
        fixed["req"] = int(r.split()[-1]) if r.split()[-1].isdigit() else 0
        r = await c.execute(
            """UPDATE tc
                  SET data = jsonb_set(data, '{tcid}', to_jsonb(tcid))
                WHERE tcid ~ '[_-][TV][0-9]{4}$'
                  AND coalesce(data->>'tcid', '') <> tcid"""
        )
        fixed["tc"] = int(r.split()[-1]) if r.split()[-1].isdigit() else 0
        # 겹싸여 글자로 저장된 플랜 data 벗기기 — 처음 판이 json.dumps 를
        # 한 번 더 해서 「JSON 문자열」 이 되었다. 내용은 그 안에 온전하다.
        r = await c.execute(
            """UPDATE cycle SET data = (data #>> '{}')::jsonb
                WHERE jsonb_typeof(data) = 'string'"""
        )
        fixed["cycle"] = int(r.split()[-1]) if r.split()[-1].isdigit() else 0
    return fixed
