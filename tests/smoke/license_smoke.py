# -*- coding: utf-8 -*-
"""라이선스 보기 전용(Jira 식, 2026-10-01) — 빈 DB 위의 새 api 에 실제로 부른다.

보통으로 돌리면(강제 기본값) 미등록 서버라 아무것도 막히지 않는 것만 본다.
막힘까지 보려면 강제를 켜고 돌린다:

    UTOP_LICENSE_ENFORCE=1 ./tools/smoke.sh license
"""
import sys
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
r = c.post("/api/login", json={"username": "admin", "password": "admin"})
ok("로그인은 늘 된다", r.status_code == 200, r.text[:80])
c.headers["Authorization"] = f"Bearer {r.json()['token']}"
g = c.get("/api/about").json()["license"].get("gate") or {}
ok("about 에 보기 전용 판단이 실린다", "blocked" in g and "mode" in g, str(g))

if g.get("mode") != "always":
    ok("미등록·기본 강제면 막지 않는다", g["blocked"] is False, str(g))
    r = c.post("/api/prefs", json={"key": "utop.smoke.lic", "value": "1"})
    ok("쓰기가 막히지 않는다(설정 저장)", r.status_code != 403, str(r.status_code))
    print(f"\n전부 통과: {ok_n}개 (막힘까지 보려면 UTOP_LICENSE_ENFORCE=1)")
    sys.exit(0)

ok("강제 1 + 미등록 → 보기 전용", g["blocked"] is True and "등록" in g["why"], str(g))
ok("보기(GET)는 된다", c.get("/api/tc?meta=1").status_code == 200)
ok("WIKI 목록 보기도 된다", c.get("/api/wiki").status_code == 200)
r = c.post("/api/wiki/wk-lic-smoke", json={"title": "막혀야 함", "body": [], "project": ""})
ok("WIKI 쓰기 → 403 보기 전용", r.status_code == 403 and r.json().get("license_blocked") is True, r.text[:120])
ok("거절 글에 등록 안내", "버전·라이선스" in r.json().get("detail", ""), r.json().get("detail", ""))
r = c.post("/api/upload/file", files={"file": ("a.pdf", b"%PDF", "application/pdf")})
ok("파일 올리기 → 403", r.status_code == 403, str(r.status_code))
r = c.post("/api/runs", json={"cycle_id": "x"})
ok("실행 걸기 → 403", r.status_code == 403, str(r.status_code))
r = c.post("/api/run-cli-stream", json={})
ok("장비 명령 → 403", r.status_code == 403, str(r.status_code))
r = c.post("/api/prefs", json={"key": "utop.smoke.lic", "value": "1"})
ok("보기 설정 저장은 된다", r.status_code != 403, str(r.status_code))
r = c.post("/api/license/file", json={"text": "이건 라이선스가 아니다"})
ok("라이선스 등록 자리는 열려 있다(꼴 검사까지 간다)", r.status_code == 400 and "꼴" in r.text, r.text[:120])
r = httpx.post(B + "/api/branding/login-logo", json={})
ok("열린 자리라도 쓰기는 막는다(브랜딩)", r.status_code == 403, str(r.status_code))
r = c.post("/api/logout", json={"token": c.headers["Authorization"][7:]})
ok("로그아웃은 된다", r.status_code == 200, str(r.status_code))
print(f"\n전부 통과: {ok_n}개")
