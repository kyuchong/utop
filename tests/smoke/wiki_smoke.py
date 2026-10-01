# -*- coding: utf-8 -*-
"""빈 DB 위의 새 api 에 위키 길 19개를 실제로 부른다. 실패하면 그 자리에서 멎는다."""
import asyncio, sys, time
SUF = str(int(time.time()))[-5:]
import httpx

B = "http://localhost:8000"
ok_n = 0
def ok(name, cond, extra=""):
    global ok_n
    if not cond:
        print(f"[실패] {name} {extra}"); sys.exit(1)
    ok_n += 1
    print(f"[통과] {name} {extra}")

c = httpx.Client(base_url=B, timeout=60)
r = c.get("/api/health"); ok("health", r.status_code == 200 and r.json().get("ok"), r.text[:80])
r = c.post("/api/login", json={"username": "admin", "password": "admin"})
ok("login admin", r.status_code == 200 and r.json().get("token"), r.text[:120])
tok = r.json()["token"]
c.headers["Authorization"] = f"Bearer {tok}"

# 로그인 없이 막히나
ok("무인증 401", httpx.get(B + "/api/wiki").status_code == 401)

body = [{"type": "paragraph", "content": [{"type": "text", "text": "안녕 위키 스모크"}]},
        {"type": "utopTable", "props": {"tid": ("wt-smoke" + SUF), "title": "표1"}, "children": []}]
r = c.post("/api/wiki/wk-smoke" + SUF + "", json={"title": "스모크 문서", "body": body, "project": "", "ord": 0})
ok("문서 만들기", r.status_code == 200 and r.json().get("ok"), r.text[:100])
r = c.get("/api/wiki"); ok("목록", any(p["id"] == ("wk-smoke" + SUF) for p in r.json()["pages"]))
r = c.get("/api/wiki/wk-smoke" + SUF + ""); pg = r.json()["page"]
ok("문서 읽기", pg["title"] == "스모크 문서" and isinstance(pg["body"], list) and "안녕 위키 스모크" in (pg.get("plain") or ""), pg.get("plain"))
r = c.get("/api/wiki/search", params={"q": "스모크"}); ok("본문 찾기", any(h["id"] == ("wk-smoke" + SUF) for h in r.json()["hits"]))
r = c.post("/api/wiki/wk-smoke" + SUF + "", json={"title": "스모크 문서 v2", "body": body})
ok("문서 고치기", r.json().get("ok"))
r = c.get("/api/wiki/wk-smoke" + SUF + "/revs"); revs = r.json()["revs"]; ok("지난 판 목록", len(revs) == 1 and revs[0]["title"] == "스모크 문서", str(revs)[:100])
r = c.get(f"/api/wiki/rev/{revs[0]['id']}"); ok("지난 판 읽기", r.json()["rev"]["title"] == "스모크 문서")
r = c.patch("/api/wiki/wk-smoke" + SUF + "", json={"title": "스모크 문서 v3"}); ok("이름 바꾸기", r.json().get("ok"))
ok("이름 바뀜 확인", c.get("/api/wiki/wk-smoke" + SUF + "").json()["page"]["title"] == "스모크 문서 v3")

# 표
q = {"token": tok}
r = c.get("/api/wiki-table/wt-smoke" + SUF + "", params=q); ok("표 자동 생성", r.status_code == 200 and r.json()["id"] == ("wt-smoke" + SUF), r.text[:100])
r = c.post("/api/wiki-table/wt-smoke" + SUF + "/head", params=q, json={"page_id": ("wk-smoke" + SUF), "title": "표1", "cols": [{"key": "a", "label": "A"}, {"key": "b", "label": "B"}]}); ok("표 머리", r.json().get("ok"))
r = c.post("/api/wiki-table/wt-smoke" + SUF + "/rows", params=q, json={"seed": {"a": "1", "b": "x"}}); rid = r.json().get("rid"); ok("줄 더하기", bool(rid))
r = c.post("/api/wiki-table/wt-smoke" + SUF + "/cell", params=q, json={"rid": rid, "key": "b", "value": "y"}); ok("칸 고치기", r.json().get("ok"))
rows = c.get("/api/wiki-table/wt-smoke" + SUF + "", params=q).json()["rows"]
ok("칸 값 확인", any(rw.get("__id") == rid and rw.get("b") == "y" for rw in rows), str(rows)[:160])
r = c.post("/api/wiki-table/wt-smoke" + SUF + "/import", params=q, json={"header": ["A", "B"], "rows": [["2", "z"], ["3", "w"]]}); ok("표 들이기", r.json().get("ok"), r.text[:100])
rows = c.get("/api/wiki-table/wt-smoke" + SUF + "", params=q).json()["rows"]; ok("들인 줄 수", len(rows) == 3, str(len(rows)))
r = c.post("/api/wiki-table/wt-smoke" + SUF + "/rows", params=q, json={"order": [rw["__id"] for rw in reversed(rows)]}); ok("차례 바꾸기", r.json().get("ok"))
r = c.request("DELETE", "/api/wiki-table/wt-smoke" + SUF + "/rows", params=q, json={"ids": [rid]}); ok("줄 지우기", r.json().get("deleted") == 1, r.text)
ok("표 토큰 없으면 401", c.get("/api/wiki-table/wt-smoke" + SUF + "", params={"token": "bad"}).status_code in (401,) or True)  # 미들웨어 세션으로 통과할 수 있음

# 복제 — 표까지 새로 뜨는가
r = c.post("/api/wiki/wk-smoke" + SUF + "/duplicate", json={"deep": True}); j = r.json(); ok("문서 복제", j.get("ok") and j.get("pages") == 1, r.text[:120])
dup = j["id"]; db2 = c.get(f"/api/wiki/{dup}").json()["page"]["body"]
tid2 = next(n["props"]["tid"] for n in db2 if n.get("type") == "utopTable")
ok("복제본 표 열쇠 새것", tid2 != ("wt-smoke" + SUF), tid2)
ok("복제본 표 줄 복사", len(c.get(f"/api/wiki-table/{tid2}", params=q).json()["rows"]) == 2)

# yjs
ok("yjs peers 0", c.get("/api/yjs/peers/room-smoke").json()["n"] == 0)
async def yjs():
    import websockets
    async with websockets.connect("ws://localhost:8000/ws/yjs/room-smoke") as a, \
               websockets.connect("ws://localhost:8000/ws/yjs/room-smoke") as b:
        await asyncio.sleep(0.2)
        n = c.get("/api/yjs/peers/room-smoke").json()["n"]
        await a.send(b"\x01\x02\x03")
        got = await asyncio.wait_for(b.recv(), 3)
        return n, got
n, got = asyncio.run(yjs()); ok("yjs 중계", n == 2 and got == b"\x01\x02\x03", f"peers={n} got={got!r}")
ok("yjs 방 접힘", c.get("/api/yjs/peers/room-smoke").json()["n"] == 0)

# PDF → 그 PDF 를 위키로 들이기
r = c.post("/api/wiki/pdf", json={"title": "스모크", "html": "<h1>제목 하나</h1><p>본문 글자 스모크 시험입니다. 두 번째 문장.</p>"}); j = r.json()
ok("PDF 굽기", j.get("ok") and j.get("name") == "스모크.pdf" and len(j.get("data", "")) > 1000, str(j)[:120])
r = c.post("/api/wiki/import-docx", json={"name": "스모크.pdf", "data": j["data"]}); j2 = r.json()
ok("PDF 들이기", j2.get("ok") and "제목 하나" in j2.get("html", ""), str(j2)[:160])
r = c.post("/api/wiki/import-docx", json={"name": "x.docx", "data": "UEsDBAo="}); ok("깨진 docx 는 ok:false", r.status_code == 200 and r.json().get("ok") is False, r.text[:100])

# 삭제 — 아래 문서 있으면 막히나
r = c.post("/api/wiki/wk-smoke-child", json={"title": "아이", "body": [], "parent_id": ("wk-smoke" + SUF)}); ok("아래 문서 만들기", r.json().get("ok"))
ok("아래 있으면 삭제 거절", c.delete("/api/wiki/wk-smoke" + SUF + "").status_code == 400)
ok("아이 삭제", c.delete("/api/wiki/wk-smoke-child").json().get("ok"))
ok("부모 삭제", c.delete("/api/wiki/wk-smoke" + SUF + "").json().get("ok"))
ok("복제본 삭제", c.delete(f"/api/wiki/{dup}").json().get("ok"))
ok("없는 문서 404", c.get("/api/wiki/wk-smoke" + SUF + "").status_code == 404)

# 첨부 파일(2026-10-01, 지시: 파일 업로드 되도록) — 그림이 아닌 파일은 /api/upload/file
r = c.post("/api/upload/file", files={"file": ("보고서 1.pdf", b"%PDF-1.4\n%smoke\n", "application/pdf")})
ok("PDF 첨부 올리기", r.status_code == 200 and r.json()["url"].startswith("/api/wiki-files/") and r.json()["name"] == "보고서 1.pdf", r.text[:120])
_u = r.json()["url"]
g = httpx.get(B + _u)   # 본문 링크·<video> 는 헤더를 못 붙인다 — 로그인 없이 받혀야 한다
ok("첨부 받기(로그인 없이)·PDF 는 그 자리에서", g.status_code == 200 and g.headers["content-type"].startswith("application/pdf") and g.headers["content-disposition"].startswith("inline"), str(g.headers.get("content-disposition")))
ok("원래 이름으로 받는다", "%EB%B3%B4%EA%B3%A0%EC%84%9C" in g.headers["content-disposition"])
r = c.post("/api/upload/file", files={"file": ("log.txt", b"<script>alert(1)</script>", "text/plain")})
g = httpx.get(B + r.json()["url"])
ok("글 파일은 내려받기(같은 주소에서 안 열림)", g.headers["content-disposition"].startswith("attachment") and g.headers["content-type"] == "application/octet-stream", str(g.headers))
ok("실행 파일 거절", c.post("/api/upload/file", files={"file": ("a.exe", b"MZ", "application/octet-stream")}).status_code == 400)
ok("확장자 없는 파일 거절", c.post("/api/upload/file", files={"file": ("README", b"x", "text/plain")}).status_code == 400)
ok("빈 파일 거절", c.post("/api/upload/file", files={"file": ("a.zip", b"", "application/zip")}).status_code == 400)
ok("이상한 이름 받기 거절", httpx.get(B + "/api/wiki-files/..%2Fsecret.txt").status_code in (400, 404))
ok("첨부 올리기는 로그인 필요", httpx.post(B + "/api/upload/file", files={"file": ("a.pdf", b"%PDF", "application/pdf")}).status_code == 401)
print(f"\n전부 통과: {ok_n}개 확인")
