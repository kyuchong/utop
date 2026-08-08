#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
N2X 중계 — 윈도우 한 대에서 이것 하나만 돌리면 된다.

왜 필요한가
-----------
N2X(RouterTester 900) Tcl API 는 C:/N2xTcl85 의 **윈도우 네이티브 DLL** 이다.
리눅스에는 이 DLL 이 없어서, 리눅스 백엔드가 아무리 파이썬으로 감싸도 N2X
명령을 못 보낸다. 명령은 반드시 N2X 가 깔린 **이 윈도우 기계에서** 나가야 한다.

그래서 이 작은 중계를 여기 띄운다. 리눅스 백엔드가 HTTP 로 명령을 보내면,
이것이 n2xtclsh85.exe 로 그 명령을 실행하고 결과를 돌려준다.

    리눅스 백엔드 ──HTTP 5099──▶ (이 중계) ──▶ n2xtclsh85 ──▶ N2X 섀시

무엇에도 안 기댄다
------------------
파이썬 표준 라이브러리만 쓴다. pip install 이 없다. 윈도우에 파이썬만
있으면 더블클릭으로 돈다. n2x_daemon.tcl 과 같은 폴더에 두면 된다.

돌리기
------
    set N2X_RELAY_KEY=아무-긴-문자열
    python n2x_relay.py

리눅스(213)의 .env 에 같은 값을 넣는다:
    N2X_RELAY_URL=http://210.1.2.248:5099
    N2X_RELAY_KEY=아무-긴-문자열
그리고 api 를 다시 띄운다.

확인
----
    curl -X POST http://localhost:5099/api/n2x/send ^
      -H "Content-Type: application/json" ^
      -d "{\"cmd\":\"ping\",\"server\":\"210.1.2.248\",\"key\":\"...\"}"
  ok:true 가 나오면 붙은 것이다.
"""
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ── 설정 (환경변수로 덮어쓸 수 있다) ──────────────────────────────
HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("N2X_RELAY_PORT") or "5099")
KEY = os.environ.get("N2X_RELAY_KEY") or ""
# 백엔드와 같은 기본 경로. 다르면 N2X_TCLSH 로 잡는다.
TCLSH = os.environ.get("N2X_TCLSH") or r"C:\N2xTcl85\bin\n2xtclsh85.exe"
DAEMON = os.environ.get("N2X_DAEMON") or os.path.join(HERE, "n2x_daemon.tcl")


# ══════════════════════════════════════════════════════════════════
# 데몬 관리 — server|label 마다 n2xtclsh 프로세스 하나를 살려 둔다.
#
# 명령마다 새로 접속하면 세션이 매번 새로 열려서 예약한 포트가 풀리고
# 느리다. 백엔드(_n2x_send_local)와 **같은 방식**이다 — 한 줄 보내고
# 한 줄 받는다.
# ══════════════════════════════════════════════════════════════════
_daemons = {}          # "server|label" -> {"proc", "lock"}
_reg_lock = threading.Lock()


def _readline(proc, timeout):
    """한 줄을 기다린다 — 데몬이 걸리면 통째로 멈추지 않게 시간 제한."""
    out = [None]

    def rd():
        try:
            out[0] = proc.stdout.readline()
        except Exception:
            out[0] = ""

    t = threading.Thread(target=rd, daemon=True)
    t.start()
    t.join(timeout)
    if t.is_alive():
        return None
    return out[0]


def _start(server, label):
    if not os.path.exists(TCLSH):
        return {"error": "N2X Tcl 이 이 기계에 없습니다 — 찾은 곳: %s "
                         "(N2X_TCLSH 로 경로를 잡으세요)" % TCLSH}
    if not os.path.exists(DAEMON):
        return {"error": "n2x_daemon.tcl 이 없습니다 — 찾은 곳: %s" % DAEMON}
    try:
        proc = subprocess.Popen(
            [TCLSH, DAEMON, server, label],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1, encoding="utf-8", errors="replace",
        )
    except Exception as e:
        return {"error": "n2xtclsh 를 못 띄웠습니다 — %s" % e}

    ready = _readline(proc, 45)
    if not ready:
        err = ""
        try:
            err = (proc.stderr.read() or "")[:400]
        except Exception:
            pass
        try:
            proc.kill()
        except Exception:
            pass
        return {"error": "N2X 연결 시간 초과 — 섀시·서버 상태 확인 (%s)" % (err or "무응답")}
    try:
        rj = json.loads(ready)
        if isinstance(rj, dict) and rj.get("ready") is False:
            try:
                proc.kill()
            except Exception:
                pass
            return {"error": "N2X 세션 연결 실패: %s" % rj.get("error", "알 수 없음")}
    except Exception:
        pass
    return {"proc": proc, "lock": threading.Lock()}


def _get(server, label):
    key = server + "|" + label
    with _reg_lock:
        d = _daemons.get(key)
        if d and d["proc"].poll() is None:
            return d
        if d:
            _daemons.pop(key, None)
        nd = _start(server, label)
        if "error" in nd:
            return nd
        _daemons[key] = nd
        return nd


def send(server, label, cmd):
    """명령 한 줄. 데몬이 죽어 있으면 한 번 다시 띄워 본다."""
    d = _get(server, label)
    if "error" in d:
        return {"ok": False, "error": d["error"]}
    proc, lock = d["proc"], d["lock"]
    with lock:
        try:
            proc.stdin.write(cmd.rstrip("\n") + "\n")
            proc.stdin.flush()
        except Exception:
            _daemons.pop(server + "|" + label, None)
            d = _get(server, label)
            if "error" in d:
                return {"ok": False, "error": d["error"]}
            proc, lock = d["proc"], d["lock"]
            proc.stdin.write(cmd.rstrip("\n") + "\n")
            proc.stdin.flush()
        # ports 45초, traffic 60초까지 간다
        line = _readline(proc, 150)
    if line is None:
        return {"ok": False, "error": "N2X 응답 시간 초과 — 명령: %s" % cmd.split()[0]}
    line = line.strip()
    try:
        return json.loads(line)
    except Exception:
        return {"ok": False, "error": "N2X 응답을 못 읽었습니다: %s" % line[:200]}


# ══════════════════════════════════════════════════════════════════
# HTTP — 백엔드가 부르는 자리 하나
# ══════════════════════════════════════════════════════════════════
class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/health"):
            self._json(200, {"ok": True, "tclsh": os.path.exists(TCLSH),
                             "daemon": os.path.exists(DAEMON)})
        else:
            self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/api/n2x/send"):
            self._json(404, {"ok": False, "error": "not found"})
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        except Exception as e:
            self._json(400, {"ok": False, "error": "본문을 못 읽었습니다: %s" % e})
            return
        # 열쇠 — 안 정해 뒀으면 아예 거절한다. 랩망이라도 아무나 섀시를
        # 만지면 남의 시험이 통째로 망가진다.
        if not KEY:
            self._json(503, {"ok": False, "error": "N2X_RELAY_KEY 가 이 중계에 안 정해져 있습니다"})
            return
        if str(payload.get("key") or "") != KEY:
            self._json(403, {"ok": False, "error": "열쇠가 맞지 않습니다"})
            return
        server = str(payload.get("server") or "").strip()
        label = str(payload.get("label") or "utop").strip()
        cmd = str(payload.get("cmd") or "").strip()
        if not server or not cmd:
            self._json(400, {"ok": False, "error": "server 와 cmd 가 필요합니다"})
            return
        self._json(200, send(server, label, cmd))

    def log_message(self, fmt, *args):
        # 콘솔을 명령 한 줄씩 남긴다 — 무엇이 오갔는지 눈으로 본다
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))


def main():
    print("=" * 56)
    print(" N2X 중계  ·  포트 %d" % PORT)
    print("  n2xtclsh : %s  (%s)" % (TCLSH, "있음" if os.path.exists(TCLSH) else "없음!"))
    print("  daemon   : %s  (%s)" % (DAEMON, "있음" if os.path.exists(DAEMON) else "없음!"))
    print("  열쇠     : %s" % ("정해짐" if KEY else "없음 — N2X_RELAY_KEY 를 넣으세요!"))
    print("=" * 56)
    if not os.path.exists(TCLSH):
        print("주의: n2xtclsh85.exe 를 못 찾았습니다. N2X 소프트웨어가 이 기계에")
        print("      깔려 있는지, 경로가 맞는지 확인하세요 (N2X_TCLSH).")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
