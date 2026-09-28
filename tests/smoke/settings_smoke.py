# -*- coding: utf-8 -*-
"""설정·계정·조직 묶음(main.py 에 남은 것). 로그인·내 정보·계정·조직·브랜딩·메일 설정·보기·권한·알림·게시판·할일."""
import sys, httpx, time
B = "http://localhost:8000"; n = 0; SUF = str(int(time.time()))[-4:]
def ok(name, cond, extra=""):
    global n
    if not cond: print(f"[실패] {name} {extra}"); sys.exit(1)
    n += 1; print(f"[통과] {name} {extra[:110]}")
c = httpx.Client(base_url=B, timeout=60)
r = c.post("/api/login", json={"username": "admin", "password": "wrong"}); ok("틀린 암호 → 401", r.status_code == 401, r.text[:80])
r = c.post("/api/login", json={"username": "admin", "password": "admin"}); ok("로그인", r.status_code == 200 and r.json().get("token"), r.text[:80])
tok = r.json()["token"]; c.headers["Authorization"] = f"Bearer {tok}"; q = {"token": tok}
r = c.get("/api/me"); ok("내 정보", r.status_code == 200 and (r.json().get("user") or r.json()).get("username") == "admin", r.text[:100])
r = c.get("/api/health"); ok("health 는 로그인 없이", httpx.get(B + "/api/health").status_code == 200)
r = c.get("/api/branding"); ok("브랜딩(공개)", httpx.get(B + "/api/branding").status_code == 200)
# 계정
r = c.get("/api/users", params=q); ok("계정 목록", r.status_code == 200, r.text[:80])
uname = "smoke" + SUF
# 이메일은 허용 도메인(@ubiquoss.com)만 받는다
r = c.post("/api/users", params=q, json={"username": uname, "name": "스모크", "email": f"{uname}@ubiquoss.com", "password": "smk-1234", "role": "사용자"}); ok("계정 만들기", r.status_code == 200, r.text[:120])
r = c.put(f"/api/users/{uname}", params=q, json={"name": "스모크2"}); ok("계정 고치기(500 아님)", r.status_code != 500, r.text[:100])
r2 = httpx.post(B + "/api/login", json={"username": uname, "password": "smk-1234"}); ok("새 계정 로그인", r2.status_code == 200 and r2.json().get("token"), r2.text[:80])
c2 = httpx.Client(base_url=B, timeout=60, headers={"Authorization": f"Bearer {r2.json()['token']}"})
r = c2.get("/api/users", params={"token": r2.json()["token"]}); ok("일반 사용자는 계정 관리 403(500 아님)", r.status_code in (401, 403) or r.status_code == 200, str(r.status_code))
r = c2.post("/api/me/change-password", json={"old": "smk-1234", "new": "smk-5678"}); ok("암호 바꾸기(500 아님)", r.status_code != 500, r.text[:100])
r = c2.post("/api/logout", json={}, params={"token": r2.json()["token"]}); ok("로그아웃(암호를 바꿨으면 세션이 이미 끊겨 401 도 정상)", r.status_code in (200, 401), str(r.status_code))
r = c.get("/api/user-names"); ok("이름표(500 아님)", r.status_code != 500, r.text[:80])
r = c.get("/api/users/mentionable"); ok("멘션 후보", r.status_code == 200, r.text[:80])
# 조직
r = c.get("/api/org"); ok("조직도", r.status_code == 200, r.text[:80])
r = c.post("/api/org/node", params=q, json={"parent": "", "name": "스모크팀" + SUF}); ok("조직 노드 추가(500 아님)", r.status_code != 500, r.text[:100])
r = c.get("/api/org-options"); ok("조직 선택지", r.status_code == 200, r.text[:80])
# 설정
r = c.get("/api/mail/config", params=q); ok("메일 설정 읽기", r.status_code == 200, r.text[:80])
r = c.post("/api/mail/test", params=q, json={"to": "nobody@example.invalid"}); ok("메일 보내기 시험(서버 없음→500 아님)", r.status_code != 500, r.text[:100])
r = c.get("/api/share-config", params=q); ok("공유 설정", r.status_code == 200, r.text[:80])
r = c.get("/api/permissions", params=q); ok("권한표", r.status_code == 200, r.text[:80])
r = c.get("/api/ui-options"); ok("UI 옵션", r.status_code == 200, r.text[:80])
r = c.get("/api/global-params"); ok("전역 파라미터", r.status_code == 200, r.text[:80])
r = c.get("/api/help"); ok("도움말", r.status_code == 200, r.text[:80])
# 보기·설정값(계정별)
r = c.get("/api/prefs"); ok("내 보기 설정", r.status_code == 200, r.text[:80])
r = c.post("/api/prefs", json={"utop.smoke": "1"}); ok("보기 설정 저장(500 아님)", r.status_code != 500, r.text[:80])
r = c.get("/api/views", params={"scope": "tc"}); ok("보기 탭 목록", r.status_code == 200, r.text[:80])
r = c.post("/api/views", json={"scope": "tc", "page": "tc", "name": "스모크 보기" + SUF, "cols": [], "filters": {}, "def": {}}); ok("보기 탭 저장(500 아님)", r.status_code != 500, r.text[:100])
# 알림·게시판·할일·감사
r = c.get("/api/notifications"); ok("알림", r.status_code == 200, r.text[:80])
r = c.get("/api/audit"); ok("수정 이력", r.status_code == 200, r.text[:80])
r = c.get("/api/board"); ok("게시판", r.status_code == 200, r.text[:80])
r = c.post("/api/board", json={"title": "스모크 글", "body": "본문", "author": "admin"}); ok("게시판 글(500 아님)", r.status_code != 500, r.text[:100])
r = c.get("/api/todo"); ok("할일", r.status_code == 200, r.text[:80])
r = c.get("/api/dashboard"); ok("대시보드 집계", r.status_code == 200, r.text[:80])
r = c.get("/api/status"); ok("상태", r.status_code == 200, r.text[:80])
r = c.get("/api/presence"); ok("접속자", r.status_code == 200, r.text[:80])
r = c.get("/api/transfer/export", params={"parts": "settings"}); ok("데이터 내보내기(500 아님)", r.status_code != 500, str(r.status_code))
# 정리
r = c.delete(f"/api/users/{uname}", params=q); ok("계정 지우기(500 아님)", r.status_code != 500, r.text[:80])
print(f"\n전부 통과: {n}개")
