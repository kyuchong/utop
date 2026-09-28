# -*- coding: utf-8 -*-
"""AI 묶음 길. LLM·임베딩 서버 없이 도는 것(설정·목록·KV CRUD)과 '500 이 아님' 을 본다."""
import sys, httpx
B = "http://localhost:8000"; n = 0
def ok(name, cond, extra=""):
    global n
    if not cond: print(f"[실패] {name} {extra}"); sys.exit(1)
    n += 1; print(f"[통과] {name} {extra[:110]}")
c = httpx.Client(base_url=B, timeout=90)
tok = c.post("/api/login", json={"username": "admin", "password": "admin"}).json()["token"]
c.headers["Authorization"] = f"Bearer {tok}"; q = {"token": tok}
ok("무인증 401", httpx.get(B + "/api/llms").status_code == 401)

# LLM 등록
r = c.get("/api/llms"); ok("LLM 목록", r.status_code == 200, r.text[:100])
r = c.post("/api/llms", json={"name": "스모크LLM", "type": "anthropic", "endpoint": "http://127.0.0.1:9", "model": "claude-x", "apikey": "sk-test-0000"}); ok("LLM 추가", r.status_code == 200 and r.json().get("success"), r.text[:120])
llms = c.get("/api/llms").json(); items = (llms.get("llms") or llms.get("items") or []) if isinstance(llms, dict) else llms
lid = next((x.get("id") for x in items if isinstance(x, dict) and x.get("name") == "스모크LLM"), None); ok("추가된 LLM 보임", lid is not None, str(llms)[:160])
r = c.put(f"/api/llms/{lid}", json={"name": "스모크LLM2", "type": "anthropic", "endpoint": "http://127.0.0.1:9", "model": "claude-x"}); ok("LLM 고치기(500 아님)", r.status_code != 500, r.text[:100])
r = c.post(f"/api/llms/{lid}/test", json={}); ok("LLM 연결 시험(키 가짜→500 아님)", r.status_code != 500, r.text[:120])
r = c.post("/api/llms/reorder", json={"order": [lid]}); ok("LLM 차례(500 아님)", r.status_code != 500, r.text[:100])
r = c.get("/api/llm-choices"); ok("LLM 고르기 목록", r.status_code == 200, r.text[:100])
r = c.get("/api/llm/purposes"); ok("용도 목록", r.status_code == 200, r.text[:100])
r = c.post("/api/llm/purposes", json={"purposes": {}}); ok("용도 저장(500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/anthropic/models", json={"api_key": "sk-test"}); ok("anthropic 모델(가짜 키→500 아님)", r.status_code != 500, r.text[:100])
# 프롬프트·설정
r = c.get("/api/prompts"); ok("프롬프트 읽기", r.status_code == 200, r.text[:80])
r = c.post("/api/prompts", json=c.get("/api/prompts").json()); ok("프롬프트 저장", r.status_code == 200, r.text[:80])
r = c.get("/api/ai/settings"); ok("AI 설정 읽기", r.status_code == 200, r.text[:80])
r = c.post("/api/ai/settings", json=c.get("/api/ai/settings").json()); ok("AI 설정 저장(500 아님)", r.status_code != 500, r.text[:80])
r = c.get("/api/page-ai"); ok("page-ai 읽기", r.status_code == 200, r.text[:80])
r = c.get("/api/ai/stats"); ok("AI 사용 통계", r.status_code == 200, r.text[:80])
r = c.post("/api/ai/usage", json={"purpose": "x", "tokens": 1}); ok("사용량 기록(500 아님)", r.status_code != 500, r.text[:80])
r = c.post("/api/ai/feedback", json={"q": "질문", "a": "답", "good": True}); ok("피드백 저장(500 아님)", r.status_code != 500, r.text[:100])
r = c.get("/api/ai/feedback"); ok("피드백 목록", r.status_code == 200, r.text[:80])
# 매뉴얼·학습 절차
r = c.get("/api/manuals"); ok("매뉴얼 목록", r.status_code == 200, r.text[:80])
r = c.get("/api/manual-folders"); ok("매뉴얼 폴더", r.status_code == 200, r.text[:80])
r = c.post("/api/learn/procedure", json={"name": "스모크 절차", "steps": [{"cmd": "show ver"}]}); ok("학습 절차 저장(500 아님)", r.status_code != 500, r.text[:120])
r = c.get("/api/learn/procedures"); ok("학습 절차 목록", r.status_code == 200, r.text[:100])
# 챗 세션·Dify·knowledge
r = c.get("/api/chat-sessions", params=q); ok("챗 세션 목록", r.status_code == 200, r.text[:80])
r = c.get("/api/dify/assistants"); ok("Dify 목록", r.status_code == 200, r.text[:80])
r = c.get("/api/knowledge-sources"); ok("지식 출처", r.status_code == 200, r.text[:100])
r = c.get("/api/confluence/config"); ok("Confluence 설정", r.status_code == 200, r.text[:80])
r = c.post("/api/confluence/test", json={}, params=q); ok("Confluence 시험(설정 없음→500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/confluence/fetch", json={"url": "http://127.0.0.1:9/x"}); ok("Confluence 읽기(서버 없음→500 아님)", r.status_code != 500, r.text[:100])
# RAG
r = c.get("/api/rag/config"); ok("RAG 설정", r.status_code == 200, r.text[:80])
r = c.get("/api/rag/info"); ok("RAG 정보", r.status_code == 200, r.text[:100])
r = c.get("/api/kb/wiki-status"); ok("위키 색인 상태", r.status_code == 200, r.text[:100])
r = c.post("/api/rag/search", json={"q": "vlan", "top_k": 3}); ok("RAG 검색(빈 코퍼스→500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/rag/index", json={}); ok("RAG 색인(500 아님)", r.status_code != 500, r.text[:100])
# Knowledge AI (KV)
r = c.get("/api/kai/threads"); ok("KAI 대화 목록", r.status_code == 200, r.text[:80])
r = c.post("/api/kai/folders", json={"name": "스모크 폴더"}); ok("KAI 폴더 만들기", r.status_code == 200, r.text[:100])
fid = (r.json().get("folder") or r.json()).get("id") if isinstance(r.json(), dict) else None
r = c.get("/api/kai/folders"); ok("KAI 폴더 목록", "스모크 폴더" in r.text, r.text[:100])
if fid:
    r = c.patch(f"/api/kai/folder/{fid}", json={"name": "스모크 폴더2"}); ok("KAI 폴더 이름", r.status_code == 200, r.text[:80])
    r = c.delete(f"/api/kai/folder/{fid}"); ok("KAI 폴더 지우기", r.status_code == 200, r.text[:80])
r = c.post("/api/kai/ask", json={"q": "vlan 설정"}); ok("KAI 질문(LLM 없음→500 아님)", r.status_code != 500, r.text[:120])
r = c.get("/api/kai/source", params={"kind": "wiki", "id": "x"}); ok("KAI 출처(500 아님)", r.status_code != 500, r.text[:80])
# Coverage AI · 생성(LLM 없음)
r = c.post("/api/ai/cov-chat", json={"q": "E6100 추천해 줘", "messages": []}); ok("Coverage AI(LLM 없음→500 아님)", r.status_code != 500, r.text[:120])
r = c.post("/api/ai/search-all", json={"q": "vlan"}); ok("전체 검색(500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/llm/similar", json={"text": "vlan"}); ok("비슷한 항목(500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/llm/ask", json={"q": "안녕"}); ok("llm/ask(LLM 없음→500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/tc/E6100-T0001/generate", json={}); ok("TC 생성(없는 TC→500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/nl/plan", json={"text": "show version 확인"}); ok("자연어 절차(500 아님)", r.status_code != 500, r.text[:100])
# nl_test (routes/nl_test.py)
r = c.get("/api/ai/examples"); ok("nl_test: 예시", r.status_code == 200, r.text[:80])
r = c.get("/api/ai/nl-chats"); ok("nl_test: 기록 목록", r.status_code == 200, r.text[:80])
r = c.post("/api/ai/nl-chats", json={"title": "스모크", "msgs": []}); ok("nl_test: 기록 저장(500 아님)", r.status_code != 500, r.text[:100])
r = c.get("/api/ai/nl-tc-like", params={"q": "vlan"}); ok("nl_test: 비슷한 TC(500 아님)", r.status_code != 500, r.text[:100])
r = c.post("/api/ai/nl-plan", json={"text": "show version"}); ok("nl_test: 자연어→절차(LLM 없음→500 아님)", r.status_code != 500, r.text[:120])
r = c.post("/api/ai/nl-criteria", json={"device": "127.0.0.1", "cmd": "show ver"}); ok("nl_test: 판정 뽑기(장비 없음→500 아님)", r.status_code != 500, r.text[:120])
r = c.post("/api/ai/nl-exec", json={"cmds": ["show ver"], "device": {"ip": "127.0.0.1"}}); ok("nl-exec(장비 없음→500 아님)", r.status_code != 500, r.text[:120])
# 정리
r = c.delete(f"/api/llms/{lid}"); ok("LLM 지우기", r.status_code == 200, r.text[:80])
print(f"\n전부 통과: {n}개")
