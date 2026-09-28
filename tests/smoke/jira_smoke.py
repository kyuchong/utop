# -*- coding: utf-8 -*-
"""Jira 서버 없이 확인할 수 있는 Jira·결함 길. 500 이 나오면 실패."""
import sys, httpx
B = "http://localhost:8000"; n = 0
def ok(name, cond, extra=""):
    global n
    if not cond: print(f"[실패] {name} {extra}"); sys.exit(1)
    n += 1; print(f"[통과] {name} {extra[:110]}")
c = httpx.Client(base_url=B, timeout=60)
tok = c.post("/api/login", json={"username": "admin", "password": "admin"}).json()["token"]
c.headers["Authorization"] = f"Bearer {tok}"; q = {"token": tok}
ok("무인증 401", httpx.get(B + "/api/jira/config").status_code == 401)

r = c.get("/api/jira/config"); ok("jira 설정 읽기", r.status_code == 200 and isinstance(r.json(), dict), r.text)
r = c.post("/api/jira/config", json={"url": "http://127.0.0.1:9", "user": "u", "token": "t", "default_project": "UMS"}); ok("jira 설정 저장", r.json().get("ok"))
ok("저장 반영", c.get("/api/jira/config").json().get("url") == "http://127.0.0.1:9")
r = c.get("/api/jira/base"); ok("jira base", r.status_code == 200, r.text)
r = c.post("/api/jira/test", json={}); ok("연결 시험(서버 없음→ok:false)", r.status_code == 200 and r.json().get("ok") is False, r.text)
r = c.get("/api/jira/login-check"); ok("로그인 점검", r.status_code == 200, r.text)
r = c.post("/api/jira/login-test", params=q, json={"username": "x", "password": "y"}); ok("로그인 시험(500 아님)", r.status_code != 500, r.text)
r = c.get("/api/jira/cache-status"); ok("캐시 상태", r.status_code == 200, r.text)
r = c.get("/api/jira/columns"); ok("칸 목록", r.status_code == 200, r.text)
r = c.post("/api/jira/columns", params=q, json={"columns": [{"id": "customfield_99", "label": "스모크"}]}); ok("칸 저장", r.json().get("ok"), r.text)
ok("칸 저장 반영", any(col.get("id") == "customfield_99" for col in c.get("/api/jira/columns").json().get("columns", [])))
r = c.get("/api/jira/defect/schema"); ok("결함 분류 틀", r.status_code == 200, r.text)
r = c.post("/api/jira/defect/class", json={"key": "UMS-1", "class": {"situation": "현장장애", "device": "L2", "category": "기능"}}); ok("결함 분류 저장", r.json().get("ok"), r.text)
ok("결함 분류 읽기", "UMS-1" in str(c.get("/api/jira/defect/class").json()))
r = c.get("/api/release-summary"); ok("릴리즈 요약 읽기", r.status_code == 200, r.text)
r = c.post("/api/release-summary", json={"releases": [{"name": "v1"}]}); ok("릴리즈 요약 저장", r.json().get("ok"))
ok("릴리즈 요약 반영", "v1" in str(c.get("/api/release-summary").json()))
r = c.get("/api/issues/UMS"); ok("이슈 저장본", r.json().get("ok") and r.json().get("count") == 0, r.text)
r = c.get("/api/jira/issues"); ok("이슈 목록(DB)", r.status_code == 200, r.text)
r = c.get("/api/jira/versions", params={"project": "UMS"}); ok("버전(서버 없음→500 아님)", r.status_code != 500, r.text)
r = c.get("/api/jira/fields"); ok("fields(서버 없음→500 아님)", r.status_code != 500, r.text)
r = c.get("/api/jira/projects"); ok("projects(서버 없음→500 아님)", r.status_code != 500, r.text)
r = c.get("/api/jira/search-all", params={"q": "x"}); ok("search-all(500 아님)", r.status_code != 500, r.text)
r = c.get("/api/jira/issue/UMS-1"); ok("이슈 상세(저장본 없음→500 아님)", r.status_code != 500, r.text)
r = c.post("/api/jira/issue", json={"summary": "x"}); ok("이슈 생성(서버 없음→500 아님)", r.status_code != 500, r.text)
r = c.post("/api/jira/ask", json={"q": "최근 이슈"}); ok("ask(LLM 없음→500 아님)", r.status_code != 500, r.text)

# 결함 — DB 만으로 도는 것
r = c.post("/api/defects", json={"tcid": "E6100-T0001", "cycle_id": "", "title": "결함 스모크", "model_group": "E6100", "steps": [{"cmd": "show ver", "result": "Fail"}]})
ok("결함 만들기", r.status_code == 200 and r.json().get("defect", {}).get("id"), r.text)
did = r.json()["defect"]["id"]
ok("결함 목록", any(d["id"] == did for d in c.get("/api/defects").json()["defects"]))
r = c.get("/api/defects/for-item", params={"cycle_id": "", "tcid": "E6100-T0001"}); ok("항목의 결함", r.status_code == 200 and did in r.text, r.text)
r = c.post("/api/defects", json={"tcid": "E6100-T0001", "cycle_id": ""}); ok("같은 항목은 기존 것", r.json().get("existed") is True)
r = c.patch(f"/api/defects/{did}", json={"note": "고침"}); ok("결함 고치기", r.json().get("defect", {}).get("note") == "고침", r.text)
r = c.get("/api/defects/jira-status", params={"keys": "UMS-1"}); ok("지라 상태(서버 없음→500 아님)", r.status_code != 500, r.text)
r = c.post(f"/api/defects/{did}/push", json={}); ok("지라로 밀기(서버 없음→500 아님)", r.status_code != 500, r.text)
r = c.get("/api/tc/E6100-T0001/crumb"); ok("빵부스러기", r.json().get("ok"), r.text)
ok("결함 지우기", c.delete(f"/api/defects/{did}").json().get("ok"))
ok("지운 뒤 404", c.patch(f"/api/defects/{did}", json={"note": "x"}).status_code == 404)
print(f"\n전부 통과: {n}개")
