# -*- coding: utf-8 -*-
"""실행 묶음 길. 장비 없이 도는 것(사이클 CRUD·플랜 실행 기록·잠금·대기줄·절차)과 '500 이 아님'."""
import sys, httpx
B = "http://localhost:8000"; n = 0
def ok(name, cond, extra=""):
    global n
    if not cond: print(f"[실패] {name} {extra}"); sys.exit(1)
    n += 1; print(f"[통과] {name} {extra[:110]}")
c = httpx.Client(base_url=B, timeout=90)
tok = c.post("/api/login", json={"username": "admin", "password": "admin"}).json()["token"]
c.headers["Authorization"] = f"Bearer {tok}"; q = {"token": tok}
ok("무인증 401", httpx.get(B + "/api/cycle").status_code == 401)

# 사이클 CRUD
r = c.get("/api/cycle"); ok("사이클 목록", r.status_code == 200, r.text[:80])
cid = "C-SMOKE1"
r = c.post(f"/api/cycle/{cid}", json={"id": cid, "name": "스모크 사이클", "model": "E6100", "version": "1.0", "items": [{"tcid": "E6100-T0001", "name": "시험1", "steps": [{"cmd": "show ver", "type": "contains", "expected": "ver"}]}]})
ok("사이클 저장", r.status_code == 200, r.text[:120])
r = c.get(f"/api/cycle/{cid}"); ok("사이클 읽기", r.status_code == 200 and (r.json().get("name") == "스모크 사이클" or "스모크" in r.text), r.text[:120])
r = c.post(f"/api/cycle/{cid}/picked", json={"picked": ["E6100-T0001"]}); ok("고른 항목 저장(500 아님)", r.status_code != 500, r.text[:100])
r = c.post(f"/api/cycle/{cid}/test-cond", json={"cond": "실험실"}); ok("시험 조건 저장(500 아님)", r.status_code != 500, r.text[:100])
r = c.get(f"/api/cycle/{cid}/summary-body"); ok("요약 본문(500 아님)", r.status_code != 500, r.text[:100])
r = c.get(f"/api/cycle/{cid}/mail-preview"); ok("메일 미리보기(500 아님)", r.status_code != 500, r.text[:100])
r = c.get(f"/api/cycle/{cid}/mail-log"); ok("메일 기록", r.status_code == 200, r.text[:80])
r = c.post(f"/api/cycle/{cid}/summarize", json={}); ok("AI 요약(LLM 없음→500 아님)", r.status_code != 500, r.text[:100])
r = c.post(f"/api/cycle/{cid}/auto-jira", json={}); ok("자동 Jira(서버 없음→500 아님)", r.status_code != 500, r.text[:100])
r = c.get(f"/api/cycle/{cid}/ppt"); ok("PPTX 내려받기(500 아님)", r.status_code != 500, str(r.status_code))
r = c.get("/api/cycle/rollup"); ok("플랜 집계", r.status_code == 200, r.text[:100])
r = c.get("/api/cycle/rollup/items"); ok("집계 항목(500 아님)", r.status_code != 500, r.text[:100])
r = c.get("/api/cycle/rollup/csv"); ok("집계 CSV(500 아님)", r.status_code != 500, str(r.status_code))
r = c.get("/api/report/summary"); ok("리포트 집계", r.status_code == 200 and "rows" in r.json(), r.text[:100])
r = c.get("/api/cycle-version-groups"); ok("버전 그룹", r.status_code == 200, r.text[:80])
r = c.get("/api/cycle-folders"); ok("사이클 폴더", r.status_code == 200, r.text[:80])
r = c.get("/api/cycle-desc-template"); ok("설명 틀", r.status_code == 200, r.text[:80])
r = c.get("/api/tc/E6100-T0001/cycles"); ok("항목이 든 사이클", r.status_code == 200 and cid in r.text, r.text[:100])
r = c.get("/api/tc-last-result", params={"tcids": "E6100-T0001"}); ok("마지막 결과(500 아님)", r.status_code != 500, r.text[:100])
r = c.get("/api/tc-running"); ok("실행 중 목록", r.status_code == 200, r.text[:80])
r = c.get("/api/tc/E6100-T0001/run-history"); ok("실행 이력", r.status_code == 200, r.text[:80])

# 플랜 실행 기록
r = c.post("/api/plan-runs", json={"cycle_id": cid, "name": "1회차", "picked": ["E6100-T0001"]}); ok("플랜 실행 만들기(500 아님)", r.status_code != 500, r.text[:140])
rid = (r.json().get("run") or r.json()).get("id") if r.status_code == 200 and isinstance(r.json(), dict) else None
r = c.get("/api/plan-runs", params={"cycle_id": cid}); ok("플랜 실행 목록", r.status_code == 200, r.text[:100])
if rid:
    r = c.get(f"/api/plan-runs/{rid}"); ok("플랜 실행 하나", r.status_code == 200, r.text[:100])
    r = c.get(f"/api/plan-runs/{rid}/items"); ok("플랜 실행 항목", r.status_code == 200, r.text[:100])
    r = c.get(f"/api/plan-runs/{rid}/stat"); ok("플랜 실행 통계(500 아님)", r.status_code != 500, r.text[:100])
    r = c.get(f"/api/plan-runs/{rid}/rounds"); ok("회차(500 아님)", r.status_code != 500, r.text[:100])
    r = c.post(f"/api/plan-runs/{rid}/item", json={"tcid": "E6100-T0001", "verdict": "Pass", "data": {}}); ok("항목 결과 기록(500 아님)", r.status_code != 500, r.text[:120])
    r = c.post(f"/api/plan-runs/{rid}/item", json={"tcid": "E6100-T0002", "verdict": "WIP", "data": {}}); ok("WIP 결과 기록(500 아님)", r.status_code != 500, r.text[:120])
    r = c.post(f"/api/plan-runs/{rid}", json={"results": {"E6100-T0001": "Pass", "E6100-T0002": "WIP", "E6100-T0003": "Blocked", "E6100-T0004": ""}}); ok("실행 결과표 저장(목록 집계의 정본)", r.status_code == 200, r.text[:100])
    runs = c.get("/api/plan-runs", params={"cycle_id": cid}).json().get("runs") or []
    mine = next((x for x in runs if x.get("id") == rid), None)
    ok("실행 목록에 값별 건수(hist)가 실린다 — 팝업이 WIP·Blocked 를 따로 센다", bool(mine) and isinstance(mine.get("hist"), dict) and mine["hist"].get("WIP") == 1 and mine["hist"].get("Pass") == 1 and mine["hist"].get("Blocked") == 1 and mine["n_etc"] == 2 and mine["n_none"] == 1, str(mine and mine.get("hist")))
    r = c.delete(f"/api/plan-runs/{rid}"); ok("플랜 실행 지우기(500 아님)", r.status_code != 500, r.text[:100])
r = c.get("/api/plan-runs-regression"); ok("회귀 비교(500 아님)", r.status_code != 500, r.text[:100])

# 대기줄·runner (RUNNER_KEY 없음 → 거절이 정상)
r = c.get("/api/runs"); ok("실행 대기줄 목록", r.status_code == 200, r.text[:80])
r = c.post("/api/runs", json={"cycle_id": cid, "picked": ["E6100-T0001"]}); ok("대기줄 걸기(열쇠 없음→500 아님)", r.status_code != 500, r.text[:120])
r = httpx.post(B + "/api/runner/claim", json={"key": "wrong", "name": "r"}); ok("runner claim 열쇠 없음 → 거절(500 아님)", r.status_code != 500 and r.status_code != 200 or (r.status_code == 200 and not (r.json() or {}).get("run")), r.text[:100])
r = httpx.post(B + "/api/runner/login", json={"key": "wrong"}); ok("runner login 열쇠 없음/다름 → 거절(500 아님·토큰 없음)", r.status_code != 500 and "token" not in (r.json() if r.headers.get("content-type","").startswith("application/json") else {}), r.text[:100])
r = c.post("/api/cycle-run-progress", json={"cycle_id": cid, "done": 0, "total": 1}); ok("진행 보고(500 아님)", r.status_code != 500, r.text[:100])
r = c.get("/api/cycle-run-progress"); ok("진행 읽기", r.status_code == 200, r.text[:80])
r = c.post("/api/cycle-run-stop", json={"cycle_id": cid}); ok("실행 멈추기(500 아님)", r.status_code != 500, r.text[:100])

# 잠금
r = c.post("/api/locks", json={"resource_id": "dev-127.0.0.1", "cycle_id": cid, "kind": "device"}); ok("잠금 잡기", r.status_code == 200, r.text[:100])
r = c.get("/api/locks"); ok("잠금 목록", r.status_code == 200 and "dev-127.0.0.1" in r.text, r.text[:120])
r = c.post("/api/locks/dev-127.0.0.1/heartbeat", json={}); ok("잠금 심장박동(500 아님)", r.status_code != 500, r.text[:80])
r = c.post("/api/locks/bulk", json={"resource_ids": ["dev-a", "dev-b"], "cycle_id": cid}); ok("잠금 한꺼번에(500 아님)", r.status_code != 500, r.text[:100])
r = c.delete(f"/api/locks/by-cycle/{cid}"); ok("사이클 잠금 풀기", r.status_code == 200, r.text[:80])
r = c.delete("/api/locks/dev-127.0.0.1"); ok("잠금 풀기(500 아님)", r.status_code != 500, r.text[:80])

# CLI·ping·SNMP — 장비 없음: 500 이 아니면 됨
r = c.post("/api/run-cli", json={"device": {"ip": "127.0.0.1", "protocol": "telnet", "port": 1, "username": "u", "password": "p"}, "commands": ["show ver"]}); ok("run-cli(닫힌 포트→500 아님)", r.status_code != 500, r.text[:120])
r = c.post("/api/cli-complete", json={"partial": "sh"}); ok("cli-complete(500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/session-open", json={"device": {"ip": "127.0.0.1", "protocol": "telnet", "port": 1}}); ok("셀 세션 열기(닫힌 포트→500 아님)", r.status_code != 500, r.text[:120])
r = c.post("/api/session-write", json={"sid": "없음", "text": "x"}); ok("셀 세션 쓰기(없는 세션→500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/session-close", json={"sid": "없음"}); ok("셀 세션 닫기(500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/ping", json={"host": "127.0.0.1", "count": 1}); ok("ping 127.0.0.1", r.status_code == 200, r.text[:100])
r = c.get("/api/snmp-oids", params={"q": "sysDescr"}); ok("SNMP OID 찾기", r.status_code == 200, r.text[:100])
r = c.post("/api/snmp-get", json={"host": "127.0.0.1", "oid": "1.3.6.1.2.1.1.1.0", "community": "public", "timeout": 1}); ok("snmp-get(장비 없음→500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/snmp-trap/wait", json={"timeout": 1}); ok("trap 기다리기(500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/lab-test", json={"ip": "127.0.0.1", "protocol": "telnet", "port": 1}); ok("lab-test(500 아님)", r.status_code != 500, r.text[:100])

# 옛 절차
r = c.get("/api/procedures"); ok("절차 목록", r.status_code == 200, r.text[:80])
r = c.get("/api/results"); ok("결과 목록", r.status_code == 200, r.text[:80])
r = c.get("/api/pptx-templates"); ok("PPTX 양식 목록", r.status_code == 200, r.text[:80])

# 정리
r = c.delete(f"/api/cycle/{cid}"); ok("사이클 지우기", r.status_code == 200, r.text[:80])
ok("지운 뒤 404/빈값", c.get(f"/api/cycle/{cid}").status_code in (404, 200))
print(f"\n전부 통과: {n}개")
