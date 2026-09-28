# -*- coding: utf-8 -*-
"""장비·카탈로그·랙·STC/N2X 길. 실장비 없이 볼 수 있는 것과 '500 이 아님' 을 본다."""
import sys, httpx
B = "http://localhost:8000"; n = 0
def ok(name, cond, extra=""):
    global n
    if not cond: print(f"[실패] {name} {extra}"); sys.exit(1)
    n += 1; print(f"[통과] {name} {extra[:110]}")
c = httpx.Client(base_url=B, timeout=60)
tok = c.post("/api/login", json={"username": "admin", "password": "admin"}).json()["token"]
c.headers["Authorization"] = f"Bearer {tok}"
ok("무인증 401", httpx.get(B + "/api/devices2").status_code == 401)

# 카탈로그(PG)
r = c.get("/api/device-roles"); ok("역할 목록", r.status_code == 200 and "L2" in r.text, r.text)
r = c.post("/api/device-catalog2", json={"kind": "model", "name": "E6100-SMK", "vendor": "유비쿼스", "role": "L2", "model_group": "E6100"}); ok("모델 카탈로그 저장", r.status_code == 200, r.text)
r = c.get("/api/device-catalog2", params={"kind": "model"}); ok("모델 카탈로그 목록", "E6100-SMK" in r.text, r.text)
r = c.post("/api/device-catalog2/rename", json={"kind": "model", "old": "E6100-SMK", "new": "E6100-SMK"}); ok("모델 이름 바꾸기는 막힘(설계대로 400)", r.status_code == 400, r.text)

# 장비(PG)
r = c.post("/api/devices2", json={"ip": "127.0.0.1", "model": "E6100-SMK", "name": "스모크장비", "role": "L2",
                                   "access": [{"protocol": "telnet", "port": 1, "username": "u", "password": "p"}]})
ok("장비 저장", r.status_code == 200, r.text); dev_id = r.json().get("id") or r.json().get("device", {}).get("id") or "127.0.0.1"
r = c.get("/api/devices2"); ok("장비 목록", r.status_code == 200 and "127.0.0.1" in r.text, r.text[:200])
dev = next((d for d in (r.json().get("devices") or r.json().get("items") or []) if d.get("ip") == "127.0.0.1"), None)
ok("목록에 새 장비", dev is not None, str(r.json())[:200]); dev_id = dev.get("id") or dev_id
r = c.get(f"/api/devices2/{dev_id}"); ok("장비 하나", r.status_code == 200 and "127.0.0.1" in r.text, r.text[:160])
r = c.post(f"/api/devices2/{dev_id}/check", params={"protocol": "telnet"}); ok("접속 확인(닫힌 포트→200, 실패 표시)", r.status_code == 200, r.text[:160])
r = c.get(f"/api/devices2/{dev_id}/snmp-ports"); ok("SNMP 포트(장비 없음→500 아님)", r.status_code != 500, r.text[:160])
r = c.post(f"/api/devices2/{dev_id}/default-protocol", json={"protocol": "telnet"}); ok("기본 프로토콜", r.status_code == 200, r.text[:120])
r = c.get("/api/devices2/export.csv"); ok("CSV 내보내기", r.status_code == 200 and "127.0.0.1" in r.text, r.text[:120])
r = c.post("/api/devices2/import-csv", json={"csv": "ip,model,name\n127.0.0.2,E6100-SMK2,둘\n", "dry_run": True}); ok("CSV 들이기 미리보기(500 아님)", r.status_code != 500, r.text[:160])

# 랙
r = c.get("/api/racks"); ok("랙 읽기", r.status_code == 200, r.text[:100])
r = c.post("/api/racks", json={"racks": [{"id": "rk1", "name": "랙1", "units": 42}], "blanks": [{"pos": 1}]}); ok("랙 저장", r.json().get("success"), r.text)
r = c.get("/api/racks"); ok("랙 빈칸 id 채움", r.json()["blanks"][0].get("id"), r.text[:160])
r = c.post(f"/api/devices2/{dev_id}/rack", json={"rack_id": "rk1", "rack_pos": 3, "rack_size": 1}); ok("랙 배치(500 아님)", r.status_code != 500, r.text[:160])
r = c.get("/api/rackview"); ok("랙뷰", r.status_code == 200 and "racks" in r.json(), r.text[:120])
r = c.post("/api/racks", json={"racks": [], "blanks": []}); ok("빈 랙으로 덮기 거절", r.json().get("success") is False, r.text)

# 옛 카탈로그(KV)
r = c.get("/api/device-catalog"); ok("옛 카탈로그 읽기", r.status_code == 200 and "devices" in r.json(), r.text[:100])
r = c.post("/api/device-catalog", json={"devices": [{"model": "X"}]}); ok("옛 카탈로그 저장", r.status_code == 200, r.text[:100])
r = c.get("/api/device-catalog/backups"); ok("옛 카탈로그 백업 목록", r.status_code == 200, r.text[:100])

# 옛 장비(devices.json)
r = c.get("/api/devices"); ok("옛 장비 목록(500 아님)", r.status_code != 500, r.text[:100])

# 계측기 — 실장비 없음: 500 이 아니면 됨
for path, body in [("/api/stc/server/status", None), ("/api/n2x/ping", None), ("/api/n2x/diag", None), ("/api/n2x/ver", None), ("/api/n2x/daemon.tcl", None), ("/api/n2x/relay.py", None)]:
    r = c.get(path, params={"server": "127.0.0.1"}); ok(f"GET {path}", r.status_code != 500, r.text[:100])
for path, body in [("/api/stc/stop", {}), ("/api/stc/traffic/stop", {}), ("/api/n2x/reset", {"server": "127.0.0.1"}), ("/api/n2x/traffic/stat", {"server": "127.0.0.1"}), ("/api/stc/conncheck", {"chassis": "127.0.0.1"}), ("/api/stc/reserve/status", {"chassis": "127.0.0.1"})]:
    r = c.post(path, json=body); ok(f"POST {path}", r.status_code != 500, r.text[:100])
r = httpx.post(B + "/api/n2x/send", json={"cmd": "x"}); ok("n2x/send 열쇠 없이 거절(원래 200+ok:false)", r.status_code == 200 and r.json().get("ok") is False and "N2X_RELAY_KEY" in r.text, r.text)
r = c.get("/api/n2x/daemon.tcl"); ok("n2x 데몬 스크립트 파일이 잡힌다", r.status_code == 200 and len(r.content) > 500, r.text[:100])
r = c.get("/api/n2x/relay.py"); ok("n2x 중계 스크립트 파일이 잡힌다", r.status_code == 200 and len(r.content) > 500, r.text[:100])

# 정리
r = c.delete(f"/api/devices2/{dev_id}"); ok("장비 지우기", r.status_code == 200, r.text[:100])
r = c.delete("/api/device-catalog2/model/E6100-SMK"); ok("모델 지우기", r.status_code == 200, r.text[:100])
print(f"\n전부 통과: {n}개")
