import tkinter as tk
from tkinter import font as tkfont
import subprocess
import threading
import webbrowser
import sys
import time
import socket
import json
import atexit
import signal
from pathlib import Path

# ── 경로 설정 ──
# scripts/ 안에 있으므로 저장소 루트는 부모의 부모다.
# 아래 BACKEND_DIR·REQUIREMENTS·.venv·data 경로가 전부 이 값 기준이다.
BASE_DIR     = Path(__file__).resolve().parent.parent
BACKEND_DIR  = BASE_DIR / "backend"
REQUIREMENTS = BASE_DIR / "requirements.txt"
SERVER_URL   = "http://localhost:8000"
# 런처 창 크기·테마 같은 런타임 상태. 설정이 아니라 산출물이라 data/state/ 에 둔다
# (예전엔 저장소 루트의 .launcher_prefs.json 이었다).
PREFS_FILE   = BASE_DIR / "data" / "state" / "launcher_prefs.json"

# ── Python 실행 명령 결정 ──
# 가상환경(.venv)이 있으면 그 python을 우선 사용하고, 없으면 시스템 py -3.11 로 폴백한다.
_VENV_PY = BASE_DIR / ".venv" / "Scripts" / "python.exe"
PYTHON_CMD = [str(_VENV_PY)] if _VENV_PY.exists() else ["py", "-3.11"]

# ── 테마 정의 ──
THEMES = {
    "dark": {
        "BG":"#0f1117","BG2":"#181b24","BG3":"#1e2130","BG4":"#252840",
        "BORDER":"#2e3248","TEXT":"#e8eaf0","TEXT2":"#8b90a8","TEXT3":"#555a72",
        "GREEN":"#00c98d","RED":"#ff4d6a","BLUE":"#4d8fff",
        "YELLOW":"#f5b731","PURPLE":"#9d7bff",
        "LOG_BG":"#0a0c10","LOG_FG":"#a8ff78",
        "ICON":"☀️","LABEL":"라이트 모드",
    },
    "light": {
        "BG":"#f4f5f7","BG2":"#ffffff","BG3":"#eef0f4","BG4":"#e2e5ec",
        "BORDER":"#d0d5e0","TEXT":"#1a1d2e","TEXT2":"#5a6080","TEXT3":"#9aa0b8",
        "GREEN":"#00a872","RED":"#e53e5a","BLUE":"#2d6fd4",
        "YELLOW":"#c48a00","PURPLE":"#7c5cbf",
        "LOG_BG":"#1e2130","LOG_FG":"#a8ff78",
        "ICON":"🌙","LABEL":"다크 모드",
    }
}

server_proc = None
is_running  = False

def cleanup_server_process():
    global server_proc
    proc = server_proc
    if not proc:
        return
    try:
        if proc.poll() is None:
            if sys.platform == "win32":
                subprocess.run(
                    ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
            else:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
    except Exception:
        pass
    finally:
        server_proc = None

def install_exit_handlers():
    def _exit_handler(signum=None, frame=None):
        cleanup_server_process()
        if signum is not None:
            raise SystemExit(0)

    atexit.register(cleanup_server_process)
    for sig_name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        sig = getattr(signal, sig_name, None)
        if sig is not None:
            try:
                signal.signal(sig, _exit_handler)
            except Exception:
                pass

def load_prefs():
    try:
        return json.loads(PREFS_FILE.read_text())
    except:
        return {"theme": "dark"}

def save_prefs(data):
    try:
        PREFS_FILE.write_text(json.dumps(data))
    except:
        pass

class Launcher(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Ubiquoss Test Automation Launcher")
        self.geometry("1100x700")
        self.minsize(720, 500)
        self.resizable(True, True)
        self.protocol("WM_DELETE_WINDOW", self.on_close)

        prefs = load_prefs()
        self.theme_name = prefs.get("theme", "light")
        self.T = THEMES[self.theme_name]

        # 폰트
        self.f_title  = tkfont.Font(family="Malgun Gothic", size=15, weight="bold")
        self.f_sub    = tkfont.Font(family="Malgun Gothic", size=9)
        self.f_label  = tkfont.Font(family="Malgun Gothic", size=10)
        self.f_btn    = tkfont.Font(family="Malgun Gothic", size=10, weight="bold")
        self.f_log    = tkfont.Font(family="Consolas", size=10)
        self.f_status = tkfont.Font(family="Malgun Gothic", size=11, weight="bold")
        self.f_url    = tkfont.Font(family="Consolas", size=10)

        self._build_ui()
        self._apply_theme()
        self.after(300, self.check_python)

    def _c(self, key):
        return self.T[key]

    # ─────────────────────────────────────
    def _build_ui(self):
        T = self.T

        # ── 헤더 ──
        self.hdr = tk.Frame(self, height=70)
        self.hdr.pack(fill="x")
        self.hdr.pack_propagate(False)

        self.lbl_icon  = tk.Label(self.hdr, text="⬡", font=tkfont.Font(size=22))
        self.lbl_icon.place(x=18, y=14)
        self.lbl_title = tk.Label(self.hdr, text="Ubiquoss Test Orchestration Platform", font=self.f_title)
        self.lbl_title.place(x=52, y=12)
        self.lbl_sub   = tk.Label(self.hdr, text="Network Equipment Test Automation", font=self.f_sub)
        self.lbl_sub.place(x=54, y=40)

        # 테마 전환 버튼 (우상단)
        self.btn_theme = tk.Button(
            self.hdr, text=f"{T['ICON']}  {T['LABEL']}",
            font=self.f_sub, relief="flat", bd=0, cursor="hand2",
            padx=10, pady=4, command=self.toggle_theme
        )
        self.btn_theme.place(relx=1.0, x=-16, y=20, anchor="ne")

        tk.Frame(self, height=1).pack(fill="x")  # 구분선 (색상은 테마 적용)
        self.divider = self.winfo_children()[-1]

        # ── 상태 카드 ──
        outer = tk.Frame(self, pady=14)
        outer.pack(fill="x", padx=20)
        self.card = tk.Frame(outer, highlightthickness=1)
        self.card.pack(fill="x")

        # 상태
        row1 = tk.Frame(self.card)
        row1.pack(fill="x", padx=16, pady=(14,6))
        self.lbl_r1 = tk.Label(row1, text="서버 상태", font=self.f_label, width=8, anchor="w")
        self.lbl_r1.pack(side="left")
        self.dot_cv = tk.Canvas(row1, width=10, height=10, highlightthickness=0)
        self.dot_cv.pack(side="left", padx=(4,6))
        self.dot = self.dot_cv.create_oval(1,1,9,9, fill="#555a72", outline="")
        self.lbl_status = tk.Label(row1, text="중지됨", font=self.f_status)
        self.lbl_status.pack(side="left")

        # URL
        row2 = tk.Frame(self.card)
        row2.pack(fill="x", padx=16, pady=(0,6))
        self.lbl_r2 = tk.Label(row2, text="접속 주소", font=self.f_label, width=8, anchor="w")
        self.lbl_r2.pack(side="left")
        self.lbl_url = tk.Label(row2, text=SERVER_URL, font=self.f_url, cursor="hand2")
        self.lbl_url.pack(side="left", padx=4)
        self.lbl_url.bind("<Button-1>", lambda e: self.open_browser())

        # Python
        row3 = tk.Frame(self.card)
        row3.pack(fill="x", padx=16, pady=(0,14))
        self.lbl_r3 = tk.Label(row3, text="Python", font=self.f_label, width=8, anchor="w")
        self.lbl_r3.pack(side="left")
        self.lbl_py = tk.Label(row3, text="확인 중...", font=self.f_label)
        self.lbl_py.pack(side="left", padx=4)

        # ── 버튼 영역 ──
        self.btn_frame = tk.Frame(self)
        self.btn_frame.pack(fill="x", padx=20, pady=(0,14))

        self.btn_start   = self._btn(self.btn_frame, "▶  서버 시작",    "BLUE",   self.start_server,    15)
        self.btn_start.pack(side="left", padx=(0,8))
        self.btn_stop    = self._btn(self.btn_frame, "■  서버 중지",    "RED",    self.stop_server,     15)
        self.btn_stop.pack(side="left", padx=(0,8))
        self.btn_stop.configure(state="disabled")
        self.btn_browser = self._btn(self.btn_frame, "🌐  브라우저",    "PURPLE", self.open_browser,    15)
        self.btn_browser.pack(side="left", padx=(0,8))
        self.btn_browser.configure(state="disabled")
        self.btn_install = self._btn(self.btn_frame, "⬇  패키지 설치", "YELLOW", self.install_packages,15)
        self.btn_install.pack(side="right")

        # ── 로그 ──
        log_hdr = tk.Frame(self)
        log_hdr.pack(fill="x", padx=30, pady=(0,6))
        self.lbl_log_hdr = tk.Label(log_hdr, text="실행 로그", font=self.f_label)
        self.lbl_log_hdr.pack(side="left")
        self.btn_clear = tk.Button(
            log_hdr, text="지우기", font=self.f_sub,
            relief="flat", bd=0, cursor="hand2",
            padx=8, pady=2, command=self.clear_log
        )
        self.btn_clear.pack(side="right")

        log_outer = tk.Frame(self, padx=20)
        log_outer.pack(fill="both", expand=True, pady=(0,16))
        self.log_container = tk.Frame(log_outer, highlightthickness=1)
        self.log_container.pack(fill="both", expand=True)

        self.log_text = tk.Text(
            self.log_container, font=self.f_log, bd=0, relief="flat",
            wrap="word", padx=10, pady=8, state="disabled"
        )
        self.log_sb = tk.Scrollbar(self.log_container, command=self.log_text.yview, width=8)
        self.log_text.configure(yscrollcommand=self.log_sb.set)
        self.log_sb.pack(side="right", fill="y")
        self.log_text.pack(fill="both", expand=True)

        self.log_text.tag_config("info")
        self.log_text.tag_config("warn",    foreground=self.T["YELLOW"])
        self.log_text.tag_config("error",   foreground=self.T["RED"])
        self.log_text.tag_config("success", foreground=self.T["GREEN"])
        self.log_text.tag_config("dim")
        self.log_text.tag_config("blue",    foreground=self.T["BLUE"])

        # ── 상태바 ──
        self.statusbar = tk.Frame(self, height=28)
        self.statusbar.pack(fill="x", side="bottom")
        self.statusbar.pack_propagate(False)
        self.lbl_bottom = tk.Label(self.statusbar, text="준비", font=self.f_sub)
        self.lbl_bottom.pack(side="left", padx=12)

    def _btn(self, parent, text, color_key, cmd, width=12):
        btn = tk.Button(
            parent, text=text, font=self.f_btn,
            relief="flat", bd=0, cursor="hand2",
            command=cmd, width=width, pady=7,
            highlightthickness=1,
        )
        btn._color_key = color_key
        return btn

    # ─────────────────────────────────────
    def _apply_theme(self):
        T = self.T
        self.configure(bg=T["BG"])
        self.hdr.configure(bg=T["BG2"])
        self.lbl_icon.configure(bg=T["BG2"], fg=T["BLUE"])
        self.lbl_title.configure(bg=T["BG2"], fg=T["TEXT"])
        self.lbl_sub.configure(bg=T["BG2"], fg=T["TEXT3"])
        self.btn_theme.configure(
            bg=T["BG3"], fg=T["TEXT2"],
            activebackground=T["BG4"], activeforeground=T["TEXT"],
            text=f"{T['ICON']}  {T['LABEL']}"
        )
        self.divider.configure(bg=T["BORDER"])

        # 카드
        for w in [self.card, self.card.winfo_children()[0],
                  self.card.winfo_children()[1], self.card.winfo_children()[2]]:
            w.configure(bg=T["BG2"])
        self.card.configure(highlightbackground=T["BORDER"])

        for lbl in [self.lbl_r1, self.lbl_r2, self.lbl_r3]:
            lbl.configure(bg=T["BG2"], fg=T["TEXT3"])
        self.lbl_py.configure(bg=T["BG2"])
        self.lbl_url.configure(bg=T["BG2"], fg=T["TEXT2"])
        self.dot_cv.configure(bg=T["BG2"])

        # 상태 라벨
        if is_running:
            self.lbl_status.configure(bg=T["BG2"], fg=T["GREEN"])
        else:
            self.lbl_status.configure(bg=T["BG2"], fg=T["TEXT3"])

        # 버튼 영역
        self.btn_frame.configure(bg=T["BG"])

        def style_btn(btn, enabled_color_key, enabled=True):
            fg = T[enabled_color_key] if enabled else T["TEXT3"]
            btn.configure(
                bg=T["BG3"], fg=fg,
                activebackground=T["BG2"], activeforeground=fg,
                highlightbackground=T["BORDER"]
            )
        style_btn(self.btn_start,   "BLUE",   self.btn_start["state"]!="disabled")
        style_btn(self.btn_stop,    "RED",    self.btn_stop["state"]!="disabled")
        style_btn(self.btn_browser, "PURPLE", self.btn_browser["state"]!="disabled")
        style_btn(self.btn_install, "YELLOW", True)

        # 로그 헤더
        log_hdr = self.lbl_log_hdr.master
        log_hdr.configure(bg=T["BG"])
        self.lbl_log_hdr.configure(bg=T["BG"], fg=T["TEXT2"])
        self.btn_clear.configure(bg=T["BG"], fg=T["TEXT3"], activebackground=T["BG2"])

        # 로그 박스
        self.log_container.master.configure(bg=T["BG"])
        self.log_container.configure(bg=T["LOG_BG"], highlightbackground=T["BORDER"])
        self.log_text.configure(bg=T["LOG_BG"], fg=T["LOG_FG"],
                                insertbackground=T["TEXT"], selectbackground=T["BG3"])
        self.log_sb.configure(bg=T["BG3"], troughcolor=T["BG2"])

        # 태그 색상 업데이트
        self.log_text.tag_config("info",    foreground=T["LOG_FG"])
        self.log_text.tag_config("warn",    foreground=T["YELLOW"])
        self.log_text.tag_config("error",   foreground=T["RED"])
        self.log_text.tag_config("success", foreground=T["GREEN"])
        self.log_text.tag_config("dim",     foreground=T["TEXT3"])
        self.log_text.tag_config("blue",    foreground=T["BLUE"])

        # 상태바
        self.statusbar.configure(bg=T["BG2"])
        self.lbl_bottom.configure(bg=T["BG2"], fg=T["TEXT3"])

    def toggle_theme(self):
        self.theme_name = "light" if self.theme_name == "dark" else "dark"
        self.T = THEMES[self.theme_name]
        self._apply_theme()
        save_prefs({"theme": self.theme_name})
        self.log(f"{'라이트' if self.theme_name=='light' else '다크'} 모드로 전환", "blue")

    # ─────────────────────────────────────
    def log(self, msg, tag="info"):
        ts = time.strftime("%H:%M:%S")
        # 삽입 전에 현재 스크롤 위치가 맨 아래(near bottom)인지 확인.
        # 맨 아래일 때만 자동 스크롤(see("end")) → 사용자가 위로 올려 읽는 중이면 흐름 유지.
        try:
            top_frac, bot_frac = self.log_text.yview()
            at_bottom = (bot_frac >= 0.999)
        except Exception:
            at_bottom = True
        self.log_text.configure(state="normal")
        self.log_text.insert("end", f"[{ts}] ", "dim")
        self.log_text.insert("end", msg + "\n", tag)
        if at_bottom:
            self.log_text.see("end")
        self.log_text.configure(state="disabled")
        self.lbl_bottom.configure(text=msg[:70])

    def clear_log(self):
        self.log_text.configure(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.configure(state="disabled")

    def set_status(self, running):
        global is_running
        is_running = running
        T = self.T
        if running:
            self.dot_cv.itemconfig(self.dot, fill=T["GREEN"])
            self.lbl_status.configure(text="실행 중", fg=T["GREEN"])
            self.btn_start.configure(state="disabled", fg=T["TEXT3"])
            self.btn_stop.configure(state="normal", fg=T["RED"])
            self.btn_browser.configure(state="normal", fg=T["PURPLE"])
            self.lbl_url.configure(fg=T["BLUE"])
        else:
            self.dot_cv.itemconfig(self.dot, fill=T["TEXT3"])
            self.lbl_status.configure(text="중지됨", fg=T["TEXT3"])
            self.btn_start.configure(state="normal", fg=T["BLUE"], text="▶  서버 시작")
            self.btn_stop.configure(state="disabled", fg=T["TEXT3"])
            self.btn_browser.configure(state="disabled", fg=T["TEXT3"])
            self.lbl_url.configure(fg=T["TEXT2"])

    def check_python(self):
        def _check():
            try:
                r = subprocess.run(PYTHON_CMD + ["--version"], capture_output=True, text=True, timeout=5)
                ver = r.stdout.strip() or r.stderr.strip()
                self.after(0, lambda: self.lbl_py.configure(text=ver, fg=self.T["GREEN"]))
                self.after(0, lambda: self.log(f"Python 확인: {ver}", "success"))
            except:
                self.after(0, lambda: self.lbl_py.configure(text="Python 미설치", fg=self.T["RED"]))
                self.after(0, lambda: self.log("Python 을 설치하거나 .venv 가상환경을 생성하세요 (INSTALL.md 참고)", "error"))
        threading.Thread(target=_check, daemon=True).start()

    def install_packages(self):
        self.log("패키지 설치 시작...", "blue")
        def _install():
            try:
                proc = subprocess.Popen(
                    PYTHON_CMD + ["-m","pip","install","-r",str(REQUIREMENTS),"-q"],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, cwd=str(BASE_DIR)
                )
                for line in proc.stdout:
                    line = line.strip()
                    if line:
                        tag = "error" if "error" in line.lower() else "warn" if "warning" in line.lower() else "dim"
                        self.after(0, lambda l=line,t=tag: self.log(l,t))
                proc.wait()
                msg = "패키지 설치 완료 ✓" if proc.returncode==0 else "패키지 설치 중 오류 발생"
                tag = "success" if proc.returncode==0 else "error"
                self.after(0, lambda: self.log(msg, tag))
            except Exception as e:
                err = str(e)
                self.after(0, lambda err=err: self.log(f"설치 오류: {err}", "error"))
        threading.Thread(target=_install, daemon=True).start()

    def start_server(self):
        global server_proc
        self.log("서버 시작 중...", "blue")
        self.btn_start.configure(state="disabled", text="▶  시작 중...")
        def _start():
            global server_proc
            try:
                flags = 0
                if sys.platform == "win32":
                    flags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
                server_proc = subprocess.Popen(
                    PYTHON_CMD + ["-m","uvicorn","main:app",
                     "--host","0.0.0.0","--port","8000","--reload"],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, cwd=str(BACKEND_DIR),
                    creationflags=flags
                )
                for _ in range(30):
                    try:
                        s=socket.create_connection(("localhost",8000),timeout=1); s.close()
                        self.after(0, lambda: self.set_status(True))
                        self.after(0, lambda: self.log(f"서버 시작 완료 ✓  {SERVER_URL}", "success"))
                        break
                    except: time.sleep(0.5)

                for line in server_proc.stdout:
                    line = line.strip()
                    if not line: continue
                    tag = ("success" if ("200" in line or "started" in line.lower()) else "info") if "INFO" in line \
                        else "warn" if "WARNING" in line or "Deprecation" in line \
                        else "error" if "ERROR" in line or "Traceback" in line or "Error" in line \
                        else "dim"
                    self.after(0, lambda l=line,t=tag: self.log(l,t))

                self.after(0, lambda: self.set_status(False))
                self.after(0, lambda: self.log("서버가 중지되었습니다", "warn"))
            except FileNotFoundError:
                self.after(0, lambda: self.log("Python 실행 파일을 찾을 수 없습니다. .venv 생성 여부를 확인하세요 (INSTALL.md 참고).", "error"))
                self.after(0, lambda: self.btn_start.configure(state="normal", text="▶  서버 시작"))
            except Exception as e:
                err = str(e)
                self.after(0, lambda err=err: self.log(f"서버 오류: {err}", "error"))
                self.after(0, lambda: self.btn_start.configure(state="normal", text="▶  서버 시작"))
        threading.Thread(target=_start, daemon=True).start()

    def stop_server(self):
        global server_proc
        if server_proc:
            self.log("서버 중지 중...", "warn")
            try: cleanup_server_process()
            except Exception as e: self.log(f"중지 오류: {e}", "error")
            self.set_status(False)
            self.log("서버가 중지되었습니다", "warn")

    def open_browser(self):
        if is_running:
            webbrowser.open(SERVER_URL)
            self.log(f"브라우저 열기: {SERVER_URL}", "blue")
        else:
            self.log("서버가 실행 중이 아닙니다", "warn")

    def on_close(self):
        cleanup_server_process()
        if is_running:
            self.set_status(False)
            time.sleep(0.5)
        self.destroy()

if __name__ == "__main__":
    install_exit_handlers()
    app = Launcher()
    try:
        app.mainloop()
    finally:
        cleanup_server_process()
