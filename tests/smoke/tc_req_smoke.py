# -*- coding: utf-8 -*-
"""시험 항목·요구사항 묶음 길. 빈 DB 에서 폴더→요구사항→시험 항목 만들고 고치고 지우기까지."""
import sys, httpx, time
B = "http://localhost:8000"; n = 0; SUF = str(int(time.time()))[-4:]
def ok(name, cond, extra=""):
    global n
    if not cond: print(f"[실패] {name} {extra}"); sys.exit(1)
    n += 1; print(f"[통과] {name} {extra[:110]}")
c = httpx.Client(base_url=B, timeout=90)
tok = c.post("/api/login", json={"username": "admin", "password": "admin"}).json()["token"]
c.headers["Authorization"] = f"Bearer {tok}"; q = {"token": tok}
ok("무인증 401", httpx.get(B + "/api/tc").status_code == 401)

# 분류 폴더
r = c.get("/api/req-categories"); ok("분류 목록", r.status_code == 200, r.text[:80])
r = c.post("/api/req-categories", json={"name": "스모크 사업자", "parent_id": None, "kind": "project"}); ok("분류 만들기(500 아님)", r.status_code != 500, r.text[:140])
cat = (r.json().get("category") or r.json().get("item") or r.json()) if r.status_code == 200 else {}
cat_id = cat.get("id") if isinstance(cat, dict) else None
r = c.get("/api/req-categories"); ok("분류 목록에 새 것", r.status_code == 200, r.text[:100])
r = c.get("/api/folders"); ok("폴더 읽기", r.status_code == 200, r.text[:80])
r = c.post("/api/folders", json=c.get("/api/folders").json()); ok("폴더 저장(500 아님)", r.status_code != 500, r.text[:80])
r = c.get("/api/projects"); ok("프로젝트 목록", r.status_code == 200, r.text[:80])

# 코드표·사용자 정의 필드
r = c.get("/api/codes"); ok("코드표", r.status_code == 200, r.text[:80])
r = c.post("/api/codes", params=q, json={"kind": "severity", "value": "스모크등급", "label": "스모크"}); ok("코드 추가(500 아님)", r.status_code != 500, r.text[:100])
r = c.get("/api/codes/orphans"); ok("고아 코드", r.status_code == 200, r.text[:80])
r = c.get("/api/codes/kind-style"); ok("코드 종류 색", r.status_code == 200, r.text[:80])
r = c.get("/api/custom-fields"); ok("사용자 정의 필드", r.status_code == 200, r.text[:80])
r = c.post("/api/custom-fields", json={"target": "tc", "key": "smk_" + SUF, "label": "스모크 필드", "type": "text"}); ok("필드 추가(500 아님)", r.status_code != 500, r.text[:100])
cf_id = r.json().get("id") if r.status_code == 200 else None

# 요구사항
r = c.get("/api/req-next-id", params={"model_group": "E6100"}); ok("다음 REQ ID(500 아님)", r.status_code != 500, r.text[:100])
rid = "E6100-R9" + SUF
r = c.post(f"/api/req/{rid}", json={"id": rid, "title": "스모크 요구", "model_group": "E6100", "cat1": cat_id, "text": "요구 내용"}); ok("요구사항 저장", r.status_code == 200, r.text[:120])
r = c.get("/api/req"); ok("요구사항 목록", r.status_code == 200 and rid in r.text, r.text[:100])
r = c.get(f"/api/req/{rid}"); ok("요구사항 읽기", r.status_code == 200 and "스모크 요구" in r.text, r.text[:100])

# 시험 항목
r = c.get("/api/tc-next-id", params={"model_group": "E6100"}); ok("다음 TC ID(500 아님)", r.status_code != 500, r.text[:100])
tid = "E6100-T9" + SUF
r = c.post(f"/api/tc/{tid}", json={"tcid": tid, "name": "스모크 시험", "req_id": rid, "model_group": "E6100", "steps": [{"cmd": "show ver", "type": "contains", "expected": "ver"}]}); ok("시험 항목 저장", r.status_code == 200, r.text[:120])
r = c.get("/api/tc"); ok("시험 목록", r.status_code == 200 and tid in r.text, r.text[:100])
r = c.get(f"/api/tc/{tid}"); ok("시험 읽기", r.status_code == 200 and "스모크 시험" in r.text, r.text[:100])
r = c.get(f"/api/tc/{tid}/path"); ok("시험 경로", r.status_code == 200, r.text[:100])
r = c.post(f"/api/tc/{tid}", json={"tcid": tid, "name": "스모크 시험2", "req_id": rid, "model_group": "E6100", "steps": []}); ok("시험 고치기", r.status_code == 200, r.text[:80])
r = c.get(f"/api/tc/{tid}/revisions"); ok("시험 판 이력(500 아님)", r.status_code != 500, r.text[:100])
r = c.get(f"/api/tc/{tid}/snapshots"); ok("시험 스냅샷 목록(500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/copy-tree", json={"src": rid, "kind": "req"}); ok("복제(500 아님)", r.status_code != 500, r.text[:120])
r = c.post("/api/export/xlsx", json={"kind": "tc", "ids": [tid]}); ok("엑셀 내보내기(500 아님)", r.status_code != 500, str(r.status_code))
r = c.get("/api/id-alias", params={"old": "REQ-0000-0001"}); ok("옛 ID 찾기", r.status_code == 200, r.text[:80])
r = c.get("/api/id-migrate/plan"); ok("ID 옮기기 계획(500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/upload/image", files={"file": ("x.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 40, "image/png")}); ok("그림 올리기(500 아님)", r.status_code != 500, r.text[:100])
if r.status_code == 200 and (r.json().get("url") or r.json().get("src")):
    u = r.json().get("url") or r.json().get("src"); r2 = c.get(u); ok("그림 내려받기", r2.status_code == 200, str(r2.status_code))

# 지우기·휴지통
r = c.delete(f"/api/tc/{tid}"); ok("시험 지우기", r.status_code == 200, r.text[:80])
r = c.get("/api/trash"); ok("휴지통", r.status_code == 200, r.text[:100])
items = r.json().get("items") or r.json().get("trash") or []
tr = next((t for t in items if isinstance(t, dict) and tid in str(t)), None)
if tr and tr.get("id"):
    r = c.post(f"/api/trash/restore/{tr['id']}"); ok("휴지통에서 되살리기(500 아님)", r.status_code != 500, r.text[:80])
    r = c.delete(f"/api/tc/{tid}"); ok("다시 지우기(500 아님)", r.status_code != 500, r.text[:80])
    r = c.get("/api/trash"); items = r.json().get("items") or r.json().get("trash") or []
    tr = next((t for t in items if isinstance(t, dict) and tid in str(t)), None)
    if tr and tr.get("id"):
        r = c.delete(f"/api/trash/{tr['id']}"); ok("휴지통 비우기(500 아님)", r.status_code != 500, r.text[:80])
r = c.delete(f"/api/req/{rid}"); ok("요구사항 지우기(500 아님)", r.status_code != 500, r.text[:80])
if cf_id: ok("필드 지우기", c.delete(f"/api/custom-fields/{cf_id}").status_code == 200)
r = c.delete("/api/codes/severity/스모크등급", params=q); ok("코드 지우기(500 아님)", r.status_code != 500, r.text[:80])
if cat_id:
    r = c.delete(f"/api/req-categories/{cat_id}"); ok("분류 지우기(500 아님)", r.status_code != 500, r.text[:80])
print(f"\n전부 통과: {n}개")
