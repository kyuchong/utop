import os
import json
import re
import asyncio
import socket
import subprocess
import contextvars
from uuid import uuid4 as _uuid4
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

import paramiko
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
import anthropic
import engine
import db  # PostgreSQL 접속 레이어 (커넥션 풀 + CRUD 헬퍼)
import core  # 나뉜 라우트 파일(routes/*)이 쓰는 공용 고리 — 아래 접합부들이 bind 로 채운다
import licensing as _licensing  # 라이선스 파일 서명 검증(SETUP › 버전·라이선스)
import id_migrate  # 옛 ID → 모델그룹 기준 ID 옮기기

# ───────────────────────────────────────────
# 경로 설정
# ───────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent  # backend/ 의 상위 = nettest/
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIR = BASE_DIR / "frontend"
DEVICES_FILE = DATA_DIR / "devices" / "devices.json"
PROCEDURES_FILE = DATA_DIR / "procedures" / "procedures.json"
RESULTS_DIR = DATA_DIR / "results"
LLMS_FILE = DATA_DIR / "integrations" / "llms.json"
CUSTOM_FIELDS_FILE = DATA_DIR / "config" / "custom_fields.json"
DEVICE_CATALOG_FILE = DATA_DIR / "state" / "device_catalog.json"
PERMISSIONS_FILE = DATA_DIR / "config" / "permissions.json"
PROMPTS_FILE = DATA_DIR / "config" / "prompts.json"
CONFLUENCE_FILE = DATA_DIR / "integrations" / "confluence.json"
JIRA_FILE = DATA_DIR / "integrations" / "jira.json"
DEFECT_CLASS_FILE = DATA_DIR / "config" / "issue_defect_class.json"   # 이슈키 → defect 분류(현장장애/상용망검증)
HELP_FILE = DATA_DIR / "config" / "help.json"
CHAT_SESS_FILE = DATA_DIR / "state" / "chat_sessions.json"
GLOBAL_PARAMS_FILE = DATA_DIR / "config" / "global_params.json"
RSC_MANPOWER_FILE = DATA_DIR / "state" / "manpower.json"
RSC_PROJECTS_FILE = DATA_DIR / "state" / "projects.json"

app = FastAPI(title="NetTest Automation")
# 응답 gzip 압축 (>= 500 bytes 자동) — JSON 은 압축률 매우 높음. 브라우저는 자동으로 Accept-Encoding: gzip 보냄.
# 단, SSE 스트리밍 경로는 gzip 대상에서 제외 — gzip 은 청크를 버퍼링해서 한꺼번에 flush 하므로 스트리밍이 죽음.
# 스트리밍 경로는 요청 시 Accept-Encoding 헤더를 서버 진입 직전에 제거해 GZipMiddleware 가 skip 하도록 유도한다.
_SSE_PATH_PREFIXES = ("/api/chat/local/stream", "/api/dify/chat", "/api/chat/stream", "/api/jira/ask-stream", "/api/run-cli-stream", "/api/ping-stream", "/api/kai/ask-stream")

app.add_middleware(GZipMiddleware, minimum_size=500, compresslevel=5)

# ★ 등록 순서가 곧 겹 순서다 — **나중에 단 것이 바깥**이 된다.
#   이 지우개는 GZip 보다 나중에 달아야 바깥에서 먼저 돌아 헤더를 지운다.
#   전에는 GZip 앞(안쪽)에 있어서, GZip 이 원래 Accept-Encoding 을 먼저 보고
#   SSE 를 통째로 모아 압축했다 — curl 로는 흘렀는데(압축 요구 없음)
#   브라우저에선 답이 한 덩어리로 왔다(지적). 여섯 SSE 경로가 다 그랬다.
@app.middleware("http")
async def _disable_gzip_for_sse(request, call_next):
    try:
        if any(request.url.path.startswith(p) for p in _SSE_PATH_PREFIXES):
            request.scope["headers"] = [
                (k, v) for (k, v) in (request.scope.get("headers") or []) if k != b"accept-encoding"
            ]
    except Exception:
        pass
    return await call_next(request)

# 정적 파일 커스텀 마운트 — 캐시 버스터(?v=xxx)를 이미 쓰므로 강력한 브라우저 캐시 허용.
# 매 새로고침마다 조건부 GET (200-500ms 왕복 대기) 을 안 함 → 페이지 재접속이 빨라짐.
class _CachedStatic(StaticFiles):
    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        try:
            qs = (scope.get("query_string") or b"").decode("ascii", errors="ignore")
            # ?v=... 캐시버스터 있으면 1년 immutable (내용 바뀌면 v 값이 바뀌므로 안전)
            if "v=" in qs:
                resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            else:
                # 버스터 없으면 짧게 (10분) 만 — 조건부 GET 은 절약하되 갱신 확인 여지 남김
                resp.headers["Cache-Control"] = "public, max-age=600"
        except Exception:
            pass
        return resp

app.mount("/static", _CachedStatic(directory=str(FRONTEND_DIR / "static")), name="static")


# ══════════════════════════════════════════════════════════════════════
# API 응답 캐시 헤더
#
# 전에는 이 목록 전부에 max-age=10 + stale-while-revalidate=60 을 걸고
# 「실시간 정확도는 WebSocket 이 보장한다」 고 적어 두었다. 그게 틀렸다 —
# **WebSocket 이 시켜서 다시 읽는 것도 같은 캐시를 지나간다.** 남이 저장해서
# 다시 읽어도 브라우저가 묵은 응답을 그대로 내주니, 화면이 늘 한 판씩
# 늦었다. 남이 고친 것을 보려면 새로고침을 눌러야 했다.
#
# 그래서 둘로 가른다.
#
#  · 같이 고치는 자료 — 캐시하지 않는다. 여럿이 한 시험을 놓고 일하는
#    도구에서 10초 묵은 값은 10초짜리 오답이다
#  · 잘 안 바뀌는 설정 — 짧게 캐시한다. 로고·도움말 같은 것
#
# `public` 도 `private` 로 바꾼다. 로그인한 사람에 따라 달라지는 응답을
# 공용 캐시에 담게 두면 안 된다.
# ══════════════════════════════════════════════════════════════════════
_LIVE_PATHS = (
    "/api/tc",              # ?meta=1 목록 및 단건
    "/api/cycle",           # ?meta=1 목록 및 단건
    "/api/req",             # 목록 및 단건
    "/api/manuals",
    "/api/board",
    "/api/racks",
    "/api/devices",
    "/api/procedures",
    "/api/folders",
    "/api/cycle-folders",
    "/api/manual-folders",
    "/api/custom-fields",
    "/api/permissions",
    "/api/global-params",
    # 사람이 그 자리에서 고치는 설정 — 30초 캐시가 「저장했는데 옛 이름이
    # 다시 보인다」 를 만들었다(지적). 고치자마자 다시 읽는 자료다.
    "/api/llms",
    "/api/prompts",
    # 브랜딩 — 고치고 새로고침하면 옛 값이 돌아왔다(지적: 크기 변경이 안 된다,
    # 사진 제거가 안 된다). 30초 캐시가 방금 저장한 것을 덮고 있었다.
    # 로고·이름은 자주 읽히지만 그 몇 KB 를 아끼자고 「저장이 안 되는 화면」
    # 을 만들 수는 없다.
    "/api/branding",
    # 조직도 — 고치자마자 다시 읽는 자료다. Cache-Control 을 아예 안 붙여
    # 두었더니 브라우저가 제 나름대로 캐시해, 지운 마디가 도로 보이고 방금
    # 넣은 사람이 안 보였다(지적: 대표이사 자리가 안 채워진다). 위 형제들이
    # 겪은 그 덫이다.
    "/api/org",
)

_CACHEABLE_PATHS = (
    "/api/device-catalog",
    "/api/help",
    "/api/page-ai",
    "/api/dify/assistants",
    "/api/ui-options",
    "/api/org-options",
    "/api/jira/config",
)

_CACHE_EXCLUDE_SUFFIX = ("/run-history", "/snapshots", "/ui-options")
@app.middleware("http")
async def _api_cache_headers(request, call_next):
    resp = await call_next(request)
    try:
        method = request.method
        path = request.url.path
        # GET 만, 그리고 캐시 대상 경로 (하위 경로 포함 매치)
        if method == "GET":
            # 실시간 반영이 필요한 하위 리소스는 캐시 대상에서 제외 (run-history/snapshots 등)
            if any(seg in path for seg in _CACHE_EXCLUDE_SUFFIX):
                if "cache-control" not in {k.lower() for k in resp.headers.keys()}:
                    resp.headers["Cache-Control"] = "no-store"
                return resp
            _has = "cache-control" in {k.lower() for k in resp.headers.keys()}
            # 같이 고치는 자료 — 늘 서버에 물어본다
            for p in _LIVE_PATHS:
                if path == p or path.startswith(p + "/") or path.startswith(p + "?"):
                    if not _has:
                        resp.headers["Cache-Control"] = "no-store"
                    return resp
            for p in _CACHEABLE_PATHS:
                if path == p or path.startswith(p + "/") or path.startswith(p + "?"):
                    # 이미 다른 미들웨어·엔드포인트가 Cache-Control 지정했으면 존중
                    if not _has:
                        resp.headers["Cache-Control"] = "private, max-age=30"
                    break
    except Exception:
        pass
    return resp

# 데이터 파일 초기화
# 데이터 루트가 빈 볼륨/새 설치일 수 있으므로 부모 폴더를 먼저 만든다.
# (이 줄이 없으면 도커 첫 기동 때 FileNotFoundError 로 import 자체가 실패한다)
for f, default in [
    (LLMS_FILE, {"llms": []}),
]:
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        with open(f, "w", encoding="utf-8") as fp:
            import json as _json
            _json.dump(default, fp, ensure_ascii=False, indent=2)

# 등록된 것이 모델을 안 들고 있을 때 쓰는 이름 — 한 곳에 둔다
CLAUDE_FALLBACK_MODEL = "claude-sonnet-4-5-20250929"

# Anthropic 클라이언트 (API 키 없으면 None)
_api_key = os.environ.get("ANTHROPIC_API_KEY", "")
claude_client = anthropic.Anthropic(api_key=_api_key) if _api_key else None

# WebSocket 연결 관리
active_connections: list[WebSocket] = []

# ───────────────────────────────────────────
# 유틸
# ───────────────────────────────────────────
def load_json(path: Path) -> dict:
    """없는 파일은 **빈 것**으로 읽는다.

    save_json 은 상위 폴더를 만들어 주는데 읽는 쪽에는 방비가 없어, 아직 한
    번도 저장한 적 없는 자료를 읽으면 500 이 났다 — 장비를 한 대도 등록하지
    않은 서버에서 /api/devices 가 통째로 터졌고(지적: 결함 창이 뜨자마자
    사라진다), 그 창은 열리면서 장비 목록을 읽는다.

    글이 깨진 파일은 **그대로 터뜨린다.** 그건 자료가 있는데 못 읽는 것이라,
    조용히 빈 것으로 읽으면 다음 저장이 멀쩡한 자료를 덮어쓴다.
    """
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict):
    # 상위 폴더가 없으면 만든다. 새로 클론한 곳에는 data/state 가 없어서
    # import 단계의 초기화(FOLDERS_FILE 등)가 FileNotFoundError 로 죽었다.
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _run_async(coro):
    """더미 — 예전 shim 코드가 참조하는 곳이 있을 수 있어 남겨둠. 새 이벤트 루프에서 실행."""
    try:
        return asyncio.run(coro)
    except RuntimeError:
        # 이미 loop 있는 컨텍스트 → 스레드에서 별도 loop
        import concurrent.futures as _cf
        with _cf.ThreadPoolExecutor(max_workers=1) as _ex:
            return _ex.submit(asyncio.run, coro).result(timeout=15)

# 소식 → 수정 이력. 한 곳(broadcast)에서 받아 적으면 저장 지점 여덟
# 군데를 따로 고칠 일이 없고, 새 소식이 생겨도 여기 한 줄이다.
_AUDIT_MAP = {
    "tc_updated": ("tc", "tcid", "updated"),
    "tc_deleted": ("tc", "tcid", "deleted"),
    "req_updated": ("req", "req_id", "updated"),
    "req_deleted": ("req", "req_id", "deleted"),
    "cycle_updated": ("cycle", "cycle_id", "updated"),
    "defect_updated": ("defect", "id", "updated"),
    "tc_run_history_new": ("tc", "tcid", "run"),
}


async def broadcast(message: dict):
    # 수정 이력 — 접속자가 없어도 남긴다 (알림 종·감사가 나중에 읽는다)
    try:
        m = _AUDIT_MAP.get(str(message.get("type") or ""))
        if m:
            kind, key, action = m
            extra = ""
            if message.get("type") == "tc_run_history_new":
                extra = f" PASS {message.get('pass', 0)} FAIL {message.get('fail', 0)}"
            await db.audit_add(kind, str(message.get(key) or ""), action + extra,
                               str(message.get("user") or ""))
    except Exception:
        pass  # 이력이 소식을 막으면 안 된다

    # 모든 접속자에게 병렬 전송 — 순차 await 로 하면 접속자 수만큼 지연 누적 (10명이면 delete API 응답이 왕복 10회만큼 늦어짐)
    if not active_connections:
        return
    async def _one(ws):
        try: await ws.send_json(message)
        except Exception: pass
    await asyncio.gather(*(_one(ws) for ws in list(active_connections)), return_exceptions=True)

engine.broadcast = broadcast

# ── 동시 접속 presence + 편집 제어권 ──
ws_state = {}          # id(ws) -> {"ws":ws, "user":str|None, "page":str|None}
page_controller = {}   # page -> user (제어권 보유자)

def _presence_users(page):
    seen = []
    for s in ws_state.values():
        u = s.get("user")
        if s.get("page") == page and u and u not in seen:
            seen.append(u)
    return seen

async def _broadcast_presence(page):
    if not page:
        return
    users = _presence_users(page)
    ctrl = page_controller.get(page)
    if ctrl not in users:                       # 제어자가 떠났으면 첫 접속자에게 자동 양도
        ctrl = users[0] if users else None
        if ctrl:
            page_controller[page] = ctrl
        elif page in page_controller:
            del page_controller[page]
    await broadcast({"type": "presence", "page": page, "users": users, "controller": ctrl})

_tc_running: dict = {}   # tcid -> {"user": str, "at": ts} — 지금 자동 실행 중인 시험


async def _broadcast_tc_running(tcid: str, user: str, on: bool):
    """이 시험을 **누가 지금 돌리고 있나** — 보고 있는 모두에게. 실행한 사람만
    「진행중」이 보이던 것을 남들도 보게 한다(지시)."""
    await broadcast({"type": "tc_running", "tcid": tcid, "user": user, "on": bool(on)})


async def _broadcast_focus(page):
    """이 화면에서 누가 어느 항목을 보고 있나 — {항목번호: [사람…]}"""
    if not page:
        return
    at = {}
    for st in list(ws_state.values()):
        if st.get("page") != page:
            continue
        f = st.get("focus")
        u = st.get("user")
        if f is None or not u:
            continue
        at.setdefault(str(f), [])
        if u not in at[str(f)]:
            at[str(f)].append(u)
    await broadcast({"type": "focus", "page": page, "at": at})


@app.post("/api/broadcast-reload")
async def broadcast_reload(payload: dict = None):
    # 접속 중인 모든 클라이언트에 강제 새로고침 신호 브로드캐스트.
    # payload: {"delay_sec": int (기본 3), "message": str (기본 '관리자가 새로고침을 요청했습니다')}
    _p = payload or {}
    try: _delay = int(_p.get("delay_sec", 3) or 3)
    except Exception: _delay = 3
    _msg = str(_p.get("message", "") or "관리자가 새로고침을 요청했습니다")
    await broadcast({"type": "force_reload", "delay_sec": _delay, "message": _msg})
    return {"ok": True, "targets": len(active_connections), "delay_sec": _delay}

app.include_router(engine.router)

# ───────────────────────────────────────────
# 연결 상태 체크
# ───────────────────────────────────────────
def check_tcp(ip: str, port: int, timeout: float = 2.0) -> bool:
    try:
        s = socket.create_connection((ip, port), timeout=timeout)
        s.close()
        return True
    except Exception:
        return False

def check_ssh(ip: str, port: int, username: str, password: str, timeout: float = 5.0) -> bool:
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(ip, port=port, username=username, password=password, timeout=timeout)
        client.close()
        return True
    except Exception:
        return False

def check_telnet(ip: str, port: int, timeout: float = 3.0) -> bool:
    return check_tcp(ip, port, timeout)

# ───────────────────────────────────────────
# SSH / Telnet 명령 실행
# ───────────────────────────────────────────
def ssh_exec(ip: str, port: int, username: str, password: str, command: str) -> str:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(ip, port=port, username=username, password=password, timeout=10)
    stdin, stdout, stderr = client.exec_command(command)
    output = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    client.close()
    return output + err

def tcl_exec(script_path: str) -> str:
    try:
        result = subprocess.run(
            ["tclsh", script_path],
            capture_output=True, text=True, timeout=60
        )
        return result.stdout + result.stderr
    except FileNotFoundError:
        return "[오류] tclsh 가 설치되어 있지 않거나 PATH에 없습니다."
    except subprocess.TimeoutExpired:
        return "[오류] TCL 스크립트 실행 시간 초과 (60초)"

# ───────────────────────────────────────────
# 라우터 - 페이지
# ───────────────────────────────────────────
@app.get("/")
async def index():
    return FileResponse(
        str(FRONTEND_DIR / "index.html"),
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"}
    )


# ── 자원 관리: 인원 투입(M/M) · 프로젝트 ──
@app.get("/api/resource/manpower")
async def get_manpower():
    d = _kv_load_sync("manpower", {})
    return d if isinstance(d, dict) else {}

def _rsc_backup_kv(key: str):
    """저장 전 백업 (DB 저장이라 파일 백업 대신 data/backups/ 폴더에 JSON 스냅샷 저장)."""
    try:
        _cur = _kv_load_sync(key, None)
        if not isinstance(_cur, dict): return
        nrows = sum(len((p or {}).get("rows", []) or []) for p in (_cur.get("pages", {}) or {}).values())
        nrows += len(_cur.get("rows", []) or [])
        if nrows == 0: return
        bdir = DATA_DIR / "backups"; bdir.mkdir(exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        save_json(bdir / f"{key}-{ts}.json", _cur)
        # 최근 30개 회전
        baks = sorted(bdir.glob(f"{key}-*.json"))
        for old in baks[:-30]:
            try: old.unlink()
            except Exception: pass
    except Exception:
        pass

def _rsc_backup(path: Path):
    """레거시 파일 기반 백업 — DB 이전 후엔 _rsc_backup_kv 를 씀. 호환용 shim."""
    _rsc_backup_kv(path.stem)

@app.post("/api/resource/manpower")
async def save_manpower(payload: dict):
    _rsc_backup_kv("manpower")             # 저장 전 자동 백업
    _kv_save_sync("manpower", payload)
    return {"ok": True}

@app.get("/api/resource/projects")
async def get_projects():
    if not RSC_PROJECTS_FILE.exists():
        save_json(RSC_PROJECTS_FILE, {})
    return load_json(RSC_PROJECTS_FILE)

@app.post("/api/resource/projects")
async def save_projects(payload: dict):
    save_json(RSC_PROJECTS_FILE, payload)
    return {"ok": True}


# ─────────────────── 사용자 관리 / 인증 ───────────────────
import hashlib as _hashlib
import secrets as _secrets

USERS_FILE = DATA_DIR / "state" / "users.json"
ROLES = ["관리자", "담당", "팀장", "팀원"]
SESSIONS = {}  # token -> {username, role, name, ts}  ← in-memory 캐시 (DB 는 sessions 테이블)
SESSIONS_FILE = DATA_DIR / "state" / "sessions.json"   # 레거시 — 시작 시 DB 로 1회 마이그레이션 후 미사용
_SESSION_TTL = 60 * 60 * 24 * 30  # 로그인 세션 유지 기간(30일)

def _save_one_session(sid: str):
    """세션 하나를 DB 로 저장. asyncpg 는 async 라 sync 컨텍스트에서 호출 시 fire-and-forget."""
    _s = SESSIONS.get(sid)
    if not _s: return
    try:
        _loop = _MAIN_LOOP or asyncio.get_event_loop()
        if _loop:
            asyncio.run_coroutine_threadsafe(
                db.session_upsert(sid, _s, None, _s.get("username", "")),
                _loop
            )
    except Exception:
        pass

def _delete_one_session(sid: str):
    """세션 하나를 DB 에서 삭제."""
    try:
        _loop = _MAIN_LOOP or asyncio.get_event_loop()
        if _loop:
            asyncio.run_coroutine_threadsafe(db.session_delete(sid), _loop)
    except Exception:
        pass

async def _load_sessions_from_db():
    """서버 시작 시 DB 에서 세션 로드 → in-memory SESSIONS 채움. TTL 초과분은 스킵 + DB 에서도 정리."""
    global SESSIONS
    try:
        _all = await db.sessions_all()
        _now = datetime.now().timestamp()
        _fresh = {}
        _expired = []
        for sid, s in (_all or {}).items():
            if not isinstance(s, dict): continue
            if (_now - float(s.get("ts", 0) or 0)) < _SESSION_TTL:
                _fresh[sid] = s
            else:
                _expired.append(sid)
        SESSIONS = _fresh
        # 사전을 새로 갈아 끼웠다 — core 에 매인 것은 옛 사전이라 routes/cycle 의 runner 로그인이
        # 거기 쓰면 아무도 못 본다(값 어긋남). 같은 사전을 보게 다시 맨다.
        core.bind(SESSIONS=SESSIONS)
        # 만료 세션 정리 (백그라운드)
        for sid in _expired:
            try: await db.session_delete(sid)
            except Exception: pass
    except Exception as e:
        print(f"[_load_sessions_from_db] failed: {e}", flush=True)

async def _migrate_sessions_file_to_db():
    """레거시 sessions.json 이 있으면 DB 로 1회 이전 후 파일은 legacy 폴더로 이동."""
    try:
        if not SESSIONS_FILE.exists(): return
        _d = load_json(SESSIONS_FILE)
        if not isinstance(_d, dict) or not _d: return
        _now = datetime.now().timestamp()
        _cnt = 0
        for sid, s in _d.items():
            if not isinstance(s, dict): continue
            if (_now - float(s.get("ts", 0) or 0)) >= _SESSION_TTL: continue
            # DB 에 없으면 삽입 (이미 있으면 file 값이 오래된 것일 가능성 → skip)
            _existing = await db.session_get(sid)
            if _existing is None:
                try:
                    await db.session_upsert(sid, s, None, s.get("username", ""))
                    _cnt += 1
                except Exception: pass
        # 파일은 legacy 로 이동 (혹시 몰라 보존)
        _legacy = DATA_DIR / "legacy"
        _legacy.mkdir(exist_ok=True)
        _dst = _legacy / ("sessions-migrated-" + datetime.now().strftime("%Y%m%d-%H%M%S") + ".json")
        try: SESSIONS_FILE.rename(_dst)
        except Exception: pass
        if _cnt > 0:
            print(f"[migrate] sessions.json → DB: {_cnt}건 이전, 파일은 {_dst.name} 로 백업", flush=True)
    except Exception as e:
        print(f"[_migrate_sessions_file_to_db] failed: {e}", flush=True)

def _hash_pw(password: str, salt: str) -> str:
    return _hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), str(salt).encode("utf-8"), 100000).hex()

# ── users 데이터 저장소: DB(app_kv 'users') 로 이전. 파일(users.json) 은 레거시 백업용만.
#    기존 코드 21군데의 _users_load_sync()/save_json(USERS_FILE, ...) 를 wrapper 로 흡수.
_USERS_CACHE = {"users": []}   # in-memory 캐시 (읽기 부하 최소화)
_USERS_LOADED = False

def _users_load_sync():
    """DB 에서 users 로드 → 캐시. 이미 캐시 있으면 캐시 반환 (매 요청 DB 왕복 방지).
    ★ 요청 처리 스레드가 곧 이벤트 루프 스레드라 run_coroutine_threadsafe(same_loop) 는 deadlock.
       그래서 async 컨텍스트에서 안전한 진입은 오직 캐시 반환 뿐이고, DB 로드는 startup 훅의
       _init_users_async 가 미리 캐시를 채워둔 뒤에만 유효하다. 캐시가 비었다면 파일 fallback 만."""
    global _USERS_CACHE, _USERS_LOADED
    if _USERS_LOADED:
        return _USERS_CACHE
    # 캐시 없음 = startup 이전 (드문 경로) → 파일에서만 시도, DB 접근 금지 (deadlock 회피)
    _data = None
    if USERS_FILE.exists():
        try: _data = load_json(USERS_FILE)
        except Exception: _data = None
    if not isinstance(_data, dict) or "users" not in _data:
        _data = {"users": []}
    _USERS_CACHE = _data
    _USERS_LOADED = True
    return _data

def _users_reload_sync():
    """캐시 무효화 후 다시 로드 (다른 프로세스가 DB 를 갱신했을 때)."""
    global _USERS_LOADED
    _USERS_LOADED = False
    return _users_load_sync()

def _users_save_sync(data: dict):
    """users 데이터 저장 → DB + 캐시 갱신."""
    global _USERS_CACHE
    if not isinstance(data, dict): return
    _USERS_CACHE = data
    try:
        _loop = _MAIN_LOOP
        if _loop and _loop.is_running():
            asyncio.run_coroutine_threadsafe(db.kv_set("users", data), _loop)
        else:
            asyncio.run(db.kv_set("users", data))
    except Exception as e:
        print(f"[_users_save_sync] DB write failed: {e}", flush=True)

async def _migrate_users_file_to_db():
    """레거시 users.json → DB 로 1회 이전.
    안전장치: 파일 users 수 > DB users 수 이면 파일이 정본 → 병합 (파일 계정 우선, DB 추가 계정 유지)."""
    try:
        if not USERS_FILE.exists(): return
        try: _fdata = load_json(USERS_FILE)   # 파일 직접 로드 (캐시/wrapper 우회)
        except Exception as _fe:
            print(f"[migrate] users.json 파일 읽기 실패: {_fe}", flush=True)
            return
        if not isinstance(_fdata, dict) or not isinstance(_fdata.get("users"), list) or not _fdata["users"]:
            return
        _file_users = _fdata["users"]
        _existing = await db.kv_get("users", None)
        if isinstance(_existing, dict) and isinstance(_existing.get("users"), list) and _existing["users"]:
            _db_users = _existing["users"]
            # 파일이 DB 보다 많은 계정을 가지면 → 파일을 정본으로. DB 에만 있는 계정은 뒤에 추가.
            _file_names = {u.get("username") for u in _file_users if u.get("username")}
            _extra = [u for u in _db_users if u.get("username") and u.get("username") not in _file_names]
            if len(_file_users) > len(_db_users) or _extra:
                _merged = list(_file_users) + _extra
                await db.kv_set("users", {"users": _merged})
                print(f"[migrate] users.json({len(_file_users)}) + DB({len(_db_users)}) → 병합 {len(_merged)}명 (파일 계정 우선)", flush=True)
            else:
                print(f"[migrate] users: DB({len(_db_users)}) 유지 (파일={len(_file_users)}, 이미 최신)", flush=True)
        else:
            # DB 비어있음 → 파일 통째로 이전
            await db.kv_set("users", _fdata)
            print(f"[migrate] users.json → DB ({len(_file_users)}명)", flush=True)
        # 성공적으로 처리 완료 → 파일은 legacy 로 이동 (백업 보존)
        _legacy = DATA_DIR / "legacy"; _legacy.mkdir(exist_ok=True)
        _dst = _legacy / ("users-migrated-" + datetime.now().strftime("%Y%m%d-%H%M%S") + ".json")
        try: USERS_FILE.rename(_dst)
        except Exception: pass
    except Exception as e:
        print(f"[_migrate_users_file_to_db] failed: {e}", flush=True)

async def _init_users_async():
    """startup 훅용: DB 에 users 없으면 기본 admin 1개 생성 후 캐시 로드. async 컨텍스트라 wrapper 안 씀."""
    global _USERS_CACHE, _USERS_LOADED
    _data = await db.kv_get("users", None)
    if isinstance(_data, dict) and isinstance(_data.get("users"), list) and _data["users"]:
        _USERS_CACHE = _data; _USERS_LOADED = True
        return
    # DB 완전히 비었을 때만 admin 생성
    salt = _secrets.token_hex(8)
    admin = {
        "id": "admin", "username": "admin", "name": "관리자", "role": "관리자",
        "salt": salt, "password": _hash_pw("admin", salt), "active": True,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    _new = {"users": [admin]}
    await db.kv_set("users", _new)
    _USERS_CACHE = _new; _USERS_LOADED = True
    print("[init_users_file] DB 비어있어 기본 admin 계정 생성", flush=True)

def init_users_file():
    """요청 컨텍스트용 sync 진입점. 캐시 있으면 skip. 캐시 없으면 sync wrapper 로 로드.
    (startup 훅은 대신 _init_users_async 를 씀 — 여긴 절대 부르면 안 됨: loop 재진입 deadlock)"""
    if _USERS_CACHE.get("users"): return
    _users_load_sync()
    # ★ admin 자동 생성은 async 진입점(_init_users_async) 에서만 — sync 에서는 하지 않음
    #   (sync 시점에 DB 못 읽으면 빈 캐시로 오판 → 원본 데이터를 admin 하나로 덮어쓰는 사고 발생)


# ══════════════════════════════════════════════════════════════════════
# 범용 KV wrapper — 파일(JSON) 을 app_kv(DB) 로 이전할 때 최소 리팩터링으로 쓰는 진입점.
# users 와 같은 캐시·안전장치 패턴을 KV key 별로 재사용.
# ══════════════════════════════════════════════════════════════════════
_KV_CACHE = {}          # key -> data (dict/list)
_KV_LOADED = {}         # key -> bool
_KV_FALLBACK_FILE = {}  # key -> Path (startup 이전에 캐시 없으면 이 파일에서 읽음)

def _kv_register_fallback(key: str, file_path):
    """이 key 의 파일 fallback 경로 등록. startup 훅에서 이전 미완료 시 캐시가 파일 로드."""
    _KV_FALLBACK_FILE[key] = file_path

def _kv_load_sync(key: str, default=None):
    """DB(app_kv) 에서 key 값 로드 → 캐시. 캐시 있으면 캐시 반환. 없으면 fallback 파일 로드.
    ★ sync 컨텍스트에서 loop 재진입 deadlock 방지 위해 DB 는 startup 훅 async 로만 채운다."""
    if _KV_LOADED.get(key):
        return _KV_CACHE.get(key, default)
    _data = None
    _fp = _KV_FALLBACK_FILE.get(key)
    if _fp is not None:
        try:
            if _fp.exists(): _data = load_json(_fp)
        except Exception: _data = None
    if _data is None: _data = default
    _KV_CACHE[key] = _data
    _KV_LOADED[key] = True
    return _data

def _kv_save_sync(key: str, data):
    """key 값 저장 → DB(app_kv) fire-and-forget + 캐시 갱신."""
    if data is None: return
    _KV_CACHE[key] = data
    try:
        _loop = _MAIN_LOOP
        if _loop and _loop.is_running():
            asyncio.run_coroutine_threadsafe(db.kv_set(key, data), _loop)
        else:
            asyncio.run(db.kv_set(key, data))
    except Exception as e:
        print(f"[_kv_save_sync '{key}'] DB write failed: {e}", flush=True)

async def _kv_init_async(key: str, file_path, sizeguard: bool = True):
    """startup 훅용: 파일 → DB 이전 (안전장치: 파일이 DB 보다 크면 파일이 정본).
    이전 완료 시 파일은 legacy 폴더로 이동. 캐시는 최종 값으로 채움."""
    global _KV_CACHE, _KV_LOADED
    try:
        _file_data = None
        _file_size = 0
        if file_path.exists():
            try:
                _file_data = load_json(file_path)
                _file_size = file_path.stat().st_size
            except Exception as _fe:
                print(f"[_kv_init '{key}'] 파일 읽기 실패: {_fe}", flush=True)
        _db_data = await db.kv_get(key, None)
        _db_size = len(json.dumps(_db_data, ensure_ascii=False, default=str)) if _db_data is not None else 0
        # 정책:
        # - 파일 없음 → DB 캐시로만 (이전 이미 완료 상태)
        # - 파일 있고 DB 없음 → 파일을 DB 로
        # - 둘 다 있고 파일이 크게 더 큼(sizeguard=True) → 파일이 정본, DB 덮어쓰기
        # - 둘 다 있고 DB 가 같거나 큼 → DB 유지, 파일은 legacy 로만 이동
        _chosen = None
        _reason = ""
        if _file_data is None:
            _chosen = _db_data if _db_data is not None else None
            _reason = "DB 만 존재 (이전 완료 상태)"
        elif _db_data is None:
            _chosen = _file_data
            await db.kv_set(key, _file_data)
            _reason = f"파일→DB 이전 (파일 {_file_size} bytes)"
        else:
            if sizeguard and _file_size > _db_size * 1.2:
                # 파일이 DB 보다 20%+ 크면 파일이 정본
                _chosen = _file_data
                await db.kv_set(key, _file_data)
                _reason = f"파일이 크므로 정본으로 채택 (file={_file_size}, db={_db_size})"
            else:
                _chosen = _db_data
                _reason = f"DB 유지 (file={_file_size}, db={_db_size})"
        # 파일 → legacy 로 이동
        if file_path.exists():
            _legacy = DATA_DIR / "legacy"; _legacy.mkdir(exist_ok=True)
            _dst = _legacy / (file_path.stem + "-migrated-" + datetime.now().strftime("%Y%m%d-%H%M%S") + file_path.suffix)
            try: file_path.rename(_dst)
            except Exception: pass
        _KV_CACHE[key] = _chosen
        _KV_LOADED[key] = True
        print(f"[migrate '{key}'] {_reason}", flush=True)
    except Exception as e:
        print(f"[_kv_init '{key}'] failed: {e}", flush=True)

def _public_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k not in ("password", "salt")}

def _find_user(username: str):
    init_users_file()
    for u in _users_load_sync()["users"]:
        if u.get("username") == username:
            return u
    return None

# 지금 요청의 세션. 미들웨어가 채운다.
#
# 옛 엔드포인트들은 토큰을 쿼리(?token=)로만 받는다(21곳쯤). 새 화면은
# Authorization 헤더로 보내므로 그대로 두면 전부 401 이 난다.
# 라우트를 하나씩 고치는 대신, 토큰 인자가 비었을 때 이 값으로 넘어가게
# 한다 — 미들웨어가 이미 확인한 세션이라 안전하고, 옛 화면의 ?token= 도
# 그대로 동작한다.
_CUR_SESSION: contextvars.ContextVar = contextvars.ContextVar("utop_session", default=None)


def _user_from_token(token: str):
    s = SESSIONS.get(token or "") or _CUR_SESSION.get()
    return _find_user(s.get("username")) if s else None

def _require_admin(token: str):
    u = _user_from_token(token or _REQ_TOKEN.get(""))
    if not u:
        raise HTTPException(401, "로그인이 필요합니다")
    if u.get("role") != "관리자":
        raise HTTPException(403, "관리자 권한이 필요합니다")
    return u

# ══════════════════════════════════════════════════════════════════════
# 인증 강제
#
# 지금까지 라우트 234개 중 어느 것도 로그인을 확인하지 않았다. 사내망이라
# 넘어갔지만 50명이 함께 쓰면 누가 무엇을 고쳤는지 알 수 없고, 장비 락도
# 편집 중 표시도 '누구' 를 알아야 만들 수 있다.
#
# 라우트마다 의존성을 붙이면 234곳을 고쳐야 하고 새 라우트에서 빠뜨리기
# 쉽다. 미들웨어에서 한 번에 막고, 열어둘 곳만 목록으로 둔다 —
# 기본이 '막힘' 이어야 새로 만든 라우트가 자동으로 보호된다.
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/health")
async def api_health():
    """도커 헬스체크가 부르는 곳. 로그인 없이 열려 있다.

    프로세스가 살아 있는지만 보면 의미가 없다 — uvicorn 은 떠 있는데 DB 가
    안 붙어 모든 화면이 500 인 상태가 '정상' 으로 보고된다. 그래서 DB 까지
    한 번 찔러 보고, 안 되면 503 으로 답한다.
    """
    try:
        async with db.pool().acquire() as c:
            await c.fetchval("SELECT 1")
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse({"ok": False, "db": str(e)[:200]}, status_code=503)
    return {"ok": True, "db": True}


# 로그인 없이 열어두는 경로. 접두사로 비교한다.
_AUTH_PUBLIC = (
    "/api/login",
    # 서버끼리 부르는 자리라 사람의 세션이 없다. 대신 N2X_RELAY_KEY 로
    # 자기가 확인하고, 열쇠가 안 정해져 있으면 아예 거절한다.
    "/api/n2x/send",
    # 실행기(runner 컨테이너)가 부르는 자리. 사람의 세션이 없어서 RUNNER_KEY
    # 로 자기가 확인한다. 열쇠가 안 정해져 있으면 아예 거절한다.
    "/api/runner/",
    "/api/logout",
    "/api/health",
    "/api/req-images/",     # 마크다운 안 <img> 는 헤더를 못 붙인다
    # 로그인 **화면**이 이것으로 그려진다 — 로고·회사 사진·이름. 로그인
    # 전이라 세션이 없다(지적: 로그인 시 사진이 안 나온다). 비밀이 아니라
    # 회사 간판이라 열어 둔다.
    "/api/branding",
    "/openapi.json",
    "/docs",
    "/redoc",
)


# 지금 요청의 토큰 — 미들웨어가 담아 두고 관리자 검사(_require_admin)가
# 꺼내 쓴다.
#
# 화면은 토큰을 **헤더**로 보내는데, 관리자 자리들은 함수 인자(token: str = "")
# 로 받아 **주소의 ?token=** 만 봤다. 그래서 저장이 조용히 401 로 떨어지고
# 화면은 옛 값을 다시 보여 줬다(지적: 15 를 16 으로 고쳐도 되돌아간다).
# 자리마다 손대면 또 빠뜨린다 — 한 곳에서 받는다.
_REQ_TOKEN: "contextvars.ContextVar[str]" = contextvars.ContextVar("_REQ_TOKEN", default="")


def _token_from(request) -> str:
    """Authorization: Bearer 우선, 없으면 기존 방식(쿼리 ?token=)."""
    h = request.headers.get("authorization") or ""
    if h.lower().startswith("bearer "):
        return h[7:].strip()
    return request.query_params.get("token") or ""


async def _session_of(token: str):
    """메모리 캐시 → 없으면 PG. 워커가 여러 개면 로그인한 워커에만
    메모리 세션이 있으므로 DB 를 반드시 확인해야 한다."""
    if not token:
        return None
    s = SESSIONS.get(token)
    if s:
        return s
    try:
        row = await db.session_get(token)
    except Exception:
        return None
    if row:
        SESSIONS[token] = row      # 이 워커에도 캐시
        return row
    return None


@app.middleware("http")
async def _server_timing(request, call_next):
    """서버가 이 요청에 쓴 시간을 헤더로 알린다 — `X-Server-Ms`.

    화면에서 「250ms 걸렸다」 를 봐도 그것이 장비 응답인지, 서버 처리인지,
    브라우저·화면 갱신인지 가를 길이 없었다(지시: 보이게 만들자).
    총 시간에서 이 값을 빼면 나머지가 어디서 갔는지 좁혀진다.
    """
    import time as _tm
    _t0 = _tm.perf_counter()
    resp = await call_next(request)
    try:
        resp.headers["X-Server-Ms"] = f"{(_tm.perf_counter() - _t0) * 1000:.1f}"
    except Exception:  # noqa: BLE001
        pass
    return resp


@app.middleware("http")
async def _require_login(request, call_next):
    path = request.url.path
    # 중계 전용 서버는 N2X 창구와 상태 확인만 연다. DB 가 없으니 다른
    # 창구는 어차피 터지고, 열어 두면 이 서버가 시험 서버인 줄 알고
    # 붙었다가 알 수 없는 오류만 본다.
    if N2X_RELAY_ONLY and path.startswith("/api/") and not (
        path.startswith("/api/n2x/") or path.startswith("/api/health")
    ):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            {"detail": "이 서버는 N2X 중계 전용입니다 — 시험 서버로 접속하세요"},
            status_code=503,
        )
    if request.method == "OPTIONS" or not path.startswith("/api/"):
        return await call_next(request)      # 화면·정적 파일은 통과
    if any(path.startswith(p) for p in _AUTH_PUBLIC):
        _REQ_TOKEN.set(_token_from(request))
        return await call_next(request)

    _tok = _token_from(request)
    _REQ_TOKEN.set(_tok)
    s = await _session_of(_tok)
    if not s:
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": "로그인이 필요합니다"}, status_code=401)

    # 아래 코드가 '누가 했는지' 를 알 수 있게 실어 보낸다
    request.state.user = s
    _CUR_SESSION.set(s)
    return await call_next(request)


class LoginReq(BaseModel):
    username: str
    password: str


# ══════════════ Jira 계정으로 로그인 ══════════════
#
# 사원이 모두 Jira 계정을 갖고 있어 **Jira 를 정본**으로 삼는다(합의).
# 우리는 비밀번호를 저장하지 않는다 — Jira 에서 바꾸면 그대로 따라간다.
# 로컬 계정은 안전망이다: Jira 가 죽었거나 admin 같은 비상 계정용.
#
# Jira 에는 아무것도 안 쓴다 — 로그인 한 번에 읽기 호출(myself) 하나뿐이다.

#: 연속 실패 잠그기 — 우리가 먼저 막아 Jira 까지 실패가 안 쌓이게 한다.
#: (Jira Server 는 실패가 쌓이면 CAPTCHA 를 걸어 그 사람이 웹에서 풀어야 한다)
_LOGIN_FAILS: dict = {}
#: 마지막으로 Jira 가 거절한 것 — 관리자 화면(계정 관리)에서만 본다.
#: 비밀번호는 담지 않는다. 아이디와 까닭·시각뿐이다.
_JIRA_LAST_FAIL: dict = {}
_LOGIN_FAIL_MAX = 3
_LOGIN_LOCK_SEC = 60


def _jira_verify_flag(cfg: dict) -> bool:
    """TLS 인증서를 검증할까 — **안 정했으면 검증한다.**

    설정 파일에 `verify: null` 이 들어 있는 경우가 있다(옛 화면이 남긴 값).
    `cfg.get("verify", True)` 는 그때 None 을 돌려주어 라이브러리마다 다르게
    해석된다 — 켜고 끈 기억이 없는데 동작이 달라진다.
    """
    v = cfg.get("verify")
    return True if v is None else bool(v)


def _jira_login_base(cfg: dict = None) -> str:
    """**로그인을 물어볼 Jira 주소.**

    이슈를 등록·조회하는 Jira 와 사람을 확인하는 Jira 가 다를 수 있다(지시:
    사내에 둘이다). 안 적었으면 이슈 쪽 주소를 그대로 쓴다 — 대개는 같다.
    """
    cfg = cfg if cfg is not None else _jira_cfg()
    return (str(cfg.get("login_url") or "").strip() or str(cfg.get("url") or "").strip()).rstrip("/")


def _jira_login_on() -> bool:
    cfg = _jira_cfg()
    return bool(cfg.get("login_enabled")) and bool(_jira_login_base(cfg))


async def _jira_verify_login(username: str, password: str) -> tuple:
    """그 사람의 ID/PW 로 Jira 에 물어본다.

    돌려주는 것: (Jira 가 아는 사람 정보 | None, 안 된 까닭).
    까닭이 'captcha' 면 Jira 가 사람 확인을 걸어 둔 것이라 우리가 풀 수 없다 —
    그 사람이 Jira 웹에 한 번 들어가 풀어야 한다.
    """
    import base64 as _b64
    import httpx
    cfg = _jira_cfg()
    base = _jira_login_base(cfg)          # ★ 로그인은 로그인용 주소로
    if not base:
        return None, "no-url"
    basic = _b64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    try:
        async with httpx.AsyncClient(timeout=12, verify=_jira_verify_flag(cfg)) as c:
            r = await c.get(
                base + "/rest/api/2/myself",
                headers={"Accept": "application/json", "Authorization": "Basic " + basic},
            )
    except Exception as exc:
        # Jira 가 안 뜨거나 망이 막혔다 — 로컬 계정으로 넘어간다.
        # 인증서 문제는 따로 말한다. 「닿지 못했습니다」 로 뭉개면 망을 뒤지게
        # 되는데, 실제로는 체크박스 하나(TLS 검증)나 인증서 갱신이면 끝난다.
        msg = str(exc)
        print(f"[jira-login] 붙지 못했습니다: {msg[:200]}", flush=True)
        if "CERTIFICATE" in msg.upper() or "SSL" in msg.upper():
            return None, "cert"
        return None, "unreachable"
    if r.status_code == 200:
        try:
            return r.json(), ""
        except Exception:
            return None, "bad-response"
    reason = str(r.headers.get("X-Seraph-LoginReason") or "")
    if "CAPTCHA" in reason.upper():
        return None, "captcha"
    return None, "denied"


def _jira_auto_create() -> bool:
    """모르는 사람이 Jira 로 들어오면 그 자리에서 계정을 만들까.

    사원이 모두 Jira 계정을 갖고 있으니 **회원가입을 따로 두지 않는다**(지시).
    그래서 기본은 **켜짐**이다. 명단에 있는 사람만 받고 싶은 곳(운영 정책)은
    계정 관리에서 끈다 — 그러면 관리자가 먼저 등록해야 들어온다.
    """
    cfg = _jira_cfg()
    if cfg.get("login_auto_create") is not None:
        return bool(cfg.get("login_auto_create"))
    v = str(os.environ.get("JIRA_AUTO_CREATE", "")).strip().lower()
    if v:
        return v in ("1", "true", "yes", "on")
    return True


def _upsert_jira_user(username: str, ju: dict) -> dict:
    """Jira 로 들어온 사람을 UTOP 사용자로. **비밀번호는 담지 않는다.**

    이미 있으면 이름·메일만 Jira 쪽으로 맞춘다. 관리자가 꺼 둔 계정(active
    False)을 여기서 되살리지는 않는다 — 끄는 것은 UTOP 의 결정이다.
    명단에 없고 자동 등록이 꺼져 있으면 **None** 이다(로그인도 막힌다).
    """
    data = _users_load_sync()
    name = str(ju.get("displayName") or "").strip()
    mail = str(ju.get("emailAddress") or "").strip()
    key = str(ju.get("key") or ju.get("accountId") or "").strip()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for x in data["users"]:
        if x.get("username") == username:
            if name:
                x["name"] = name
            if mail:
                x["email"] = mail
            if key:
                x["jira_key"] = key
            x["source"] = "jira"
            x["last_login"] = now
            _users_save_sync(data)
            return x
    if not _jira_auto_create():
        # 명단에 없는 사람은 여기서 끝난다 — 관리자가 계정 관리에서 먼저 등록한다
        print(f"[jira-login] 명단에 없어 막았습니다: {username}", flush=True)
        return None
    nu = {
        "id": username, "username": username, "name": name or username,
        "role": "팀원", "email": mail, "active": True, "source": "jira",
        "jira_key": key,
        "created_at": now, "last_login": now,
    }
    data["users"].append(nu)
    _users_save_sync(data)
    print(f"[jira-login] 새 사용자 등록: {username} ({name})", flush=True)
    return nu


def _touch_login(username: str) -> None:
    """마지막으로 들어온 때 — 계정 관리에서 「쓰는 사람·안 쓰는 사람」 을 가른다."""
    try:
        data = _users_load_sync()
        for x in data["users"]:
            if x.get("username") == username:
                x["last_login"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                _users_save_sync(data)
                return
    except Exception:
        pass


def _issue_session(u: dict) -> dict:
    """세션 하나 발급. 동시 로그인은 그대로 허용한다 —
    새로 들어왔다고 남의(내 다른 자리의) 세션을 끊지 않는다."""
    token = _secrets.token_hex(16)
    SESSIONS[token] = {
        "username": u["username"], "role": u.get("role"),
        "name": u.get("name"), "ts": datetime.now().timestamp(),
    }
    _save_one_session(token)   # 새 세션 하나만 저장 (전체 save 는 부하 큼)
    return {"token": token, "user": _public_user(u)}


@app.post("/api/login")
async def api_login(req: LoginReq):
    uname = req.username.strip()

    # ① 연속 실패로 잠긴 동안은 Jira 까지 가지 않는다
    lock = _LOGIN_FAILS.get(uname)
    if lock and lock.get("until", 0) > _t.time():
        left = int(lock["until"] - _t.time()) + 1
        raise HTTPException(429, f"로그인 시도가 많습니다 — {left}초 뒤에 다시 하세요")

    def _fail(msg: str):
        n = (lock.get("n", 0) if lock else 0) + 1
        _LOGIN_FAILS[uname] = {
            "n": n,
            "until": _t.time() + _LOGIN_LOCK_SEC if n >= _LOGIN_FAIL_MAX else 0,
        }
        raise HTTPException(401, msg)

    u = _find_user(uname)

    # ② **먼저 UTOP 비밀번호**를 본다.
    #
    #   Jira 를 먼저 부르면 세 가지가 한꺼번에 무너진다(지적: Jira 연동을 켜면
    #   기존 계정으로 로그인이 안 된다):
    #     · Jira 가 죽으면 admin 도 못 들어온다 — 되돌릴 손이 없어진다
    #     · 같은 아이디가 Jira 에도 있으면 실패가 쌓여 CAPTCHA 가 걸린다
    #     · 로그인마다 바깥 서버를 기다린다
    #   로컬 비밀번호는 우리 손 안에 있고 즉시 판가름 난다. 그것부터 본다.
    if (
        u
        and u.get("active", True)
        and u.get("password")
        and _hash_pw(req.password, u.get("salt", "")) == u.get("password")
    ):
        _LOGIN_FAILS.pop(uname, None)
        _touch_login(uname)
        return _issue_session(u)

    # ③ 안 맞으면 그때 Jira 에 물어본다 — 회원가입 없이 들어오는 길
    if _jira_login_on():
        ju, why = await _jira_verify_login(uname, req.password)
        if ju:
            if u and not u.get("active", True):
                raise HTTPException(401, "관리자가 꺼 둔 계정입니다 — 시스템 담당자에게 문의하세요")
            # Jira 에서 잠긴 계정은 UTOP 에도 못 들어온다 — Jira 가 정본이다
            if ju.get("active") is False:
                raise HTTPException(401, "Jira 에서 잠긴 계정입니다 — Jira 담당자에게 문의하세요")
            u2 = _upsert_jira_user(uname, ju)
            if not u2:
                raise HTTPException(
                    401,
                    "등록되지 않은 계정입니다 — 관리자에게 계정 등록을 요청하세요",
                )
            _LOGIN_FAILS.pop(uname, None)
            return _issue_session(u2)
        # 여기까지 왔으면 로컬 비밀번호도 Jira 도 아니다. 까닭은 남긴다 —
        # 「왜 안 들어가지나」 를 로그 없이 고칠 수는 없다. 비밀번호는 안 남긴다.
        print(f"[jira-login] 거절: {uname} — {why}", flush=True)
        _JIRA_LAST_FAIL.clear()
        _JIRA_LAST_FAIL.update(
            {"user": uname, "why": why, "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
        )
        if why == "captcha":
            raise HTTPException(
                401,
                "Jira 가 사람 확인(CAPTCHA)을 걸었습니다 — Jira 웹에 한 번 로그인해 풀고 다시 시도하세요",
            )
        if why == "cert":
            raise HTTPException(
                401,
                "Jira 인증서에 문제가 있어 물어보지 못했습니다(만료 등) — "
                "SETUP → Jira 연동에서 「TLS 인증서 검증」 을 끄거나 인증서를 갱신하세요",
            )
        if why == "unreachable":
            raise HTTPException(
                401, "Jira 서버에 닿지 못했습니다 — UTOP 비밀번호가 있는 계정으로 들어오세요"
            )

    _fail("아이디 또는 비밀번호가 올바르지 않거나 비활성 계정입니다")

@app.post("/api/logout")
async def api_logout(payload: dict):
    _tok = payload.get("token", "")
    SESSIONS.pop(_tok, None)
    if _tok:
        _delete_one_session(_tok)   # 해당 세션 하나만 삭제
    return {"ok": True}

@app.get("/api/me")
async def api_me(request: Request, token: str = ""):
    # 미들웨어가 이미 세션을 확인해 request.state.user 에 넣어 뒀다.
    # 옛 화면은 아직 ?token= 으로 부르므로 그 경로도 남긴다.
    s = getattr(request.state, "user", None)
    u = _find_user(s.get("username")) if s else _user_from_token(token)
    if not u:
        raise HTTPException(401, "세션이 없습니다")
    # 상단바가 이름 뒤에 팀·소속담당을 적는다 — 그 값은 **조직도가 정본**이다
    w = _org_where(u.get("name") or u.get("username") or "")
    return {"user": {**_public_user(u), **{k: v for k, v in w.items() if v}}}

@app.post("/api/me/avatar")
async def api_me_avatar(payload: dict, token: str = ""):
    u = _user_from_token(token)
    if not u:
        raise HTTPException(401, "세션이 없습니다")
    av = str(payload.get("avatar") or "")
    if len(av) > 400000:
        raise HTTPException(400, "이미지가 너무 큽니다 — 더 작게 줄여 주세요")
    data = _users_load_sync()
    for x in data["users"]:
        if x.get("username") == u.get("username"):
            if av:
                x["avatar"] = av
            else:
                x.pop("avatar", None)
            break
    _users_save_sync(data)
    return {"ok": True, "user": _public_user(_find_user(u.get("username")))}

@app.post("/api/me/change-password")
async def api_me_change_password(payload: dict, token: str = ""):
    """본인 비밀번호 변경 — 현재 비밀번호 검증 후 새 비밀번호로 교체.
    성공 시 이 사용자의 모든 세션(다른 브라우저 포함)을 종료 → 프론트가 로그아웃 처리한다."""
    u = _user_from_token(token)
    if not u:
        raise HTTPException(401, "세션이 없습니다")
    cur = str(payload.get("current_password") or "")
    new = str(payload.get("new_password") or "")
    if not cur or not new:
        raise HTTPException(400, "현재 비밀번호와 새 비밀번호를 모두 입력하세요")
    if len(new) < 4:
        raise HTTPException(400, "새 비밀번호는 4자 이상이어야 합니다")
    if new == cur:
        raise HTTPException(400, "새 비밀번호가 현재 비밀번호와 같습니다")
    # 최신 상태 재로드 (다른 관리자가 방금 바꿨을 수 있으므로 파일에서 다시 읽음)
    data = _users_load_sync()
    target = None
    for x in data["users"]:
        if x.get("username") == u.get("username"):
            target = x
            break
    if not target:
        raise HTTPException(404, "사용자를 찾을 수 없습니다")
    # 현재 비밀번호 검증
    if _hash_pw(cur, target.get("salt", "")) != target.get("password"):
        raise HTTPException(401, "현재 비밀번호가 올바르지 않습니다")
    # 새 salt + 새 hash 로 교체 (salt 재생성으로 이전 hash 사용 불가)
    salt = _secrets.token_hex(8)
    target["salt"] = salt
    target["password"] = _hash_pw(new, salt)
    _users_save_sync(data)
    # 이 사용자의 모든 세션 종료 → 즉시 재로그인 필요
    uname = u.get("username")
    to_drop = [k for k, v in SESSIONS.items() if v.get("username") == uname]
    for k in to_drop:
        SESSIONS.pop(k, None)
        _delete_one_session(k)
    return {"ok": True}

_PREF_VAL_MAX = 64 * 1024      # 키당 64KB
_PREF_TOTAL_MAX = 1024 * 1024  # 요청 총량 1MB


def _check_pref_values(values) -> None:
    """화면 설정 값 검사 — 문자열만, 크기 상한(검증: 100MB 폭탄·무한 누적)."""
    if not isinstance(values, dict) or len(values) > 300:
        raise HTTPException(400, "values(dict, 300개 이하)로 보내세요")
    total = 0
    for k, v in values.items():
        if not isinstance(k, str) or not k or len(k) > 128:
            raise HTTPException(400, "키는 128자 이하 문자열이어야 합니다")
        if v is None:
            continue
        if not isinstance(v, str):
            raise HTTPException(400, "값은 화면이 저장한 문자열 그대로 보내세요")
        if len(v) > _PREF_VAL_MAX:
            raise HTTPException(400, f"값이 너무 큽니다({k}) — 키당 64KB 이하")
        total += len(v)
    if total > _PREF_TOTAL_MAX:
        raise HTTPException(400, "전체 크기가 너무 큽니다 — 요청당 1MB 이하")


# 보기 종류 — 지금은 표만 만든다. 자리를 미리 열어 두면 나중에 표를
# 안 건드리고 보드·캘린더만 붙일 수 있다(합의).
_VIEW_KINDS = ("table", "board", "calendar", "timeline")
_VIEW_CAP_SHARED = 12   # 공용 탭 — 팀 전체가 보는 줄이라 좁게
_VIEW_CAP_MINE = 20     # 개인 탭


def _who() -> str:
    sess = _CUR_SESSION.get()
    who = str((sess or {}).get("username") or "")
    if not who:
        raise HTTPException(401, "로그인이 필요합니다")
    return who


@app.get("/api/views")
async def views_list_ep(scope: str = ""):
    """표 보기(탭) — 공용은 **모두가 같이 본다**. 개인 것은 만든 사람만."""
    who = _who()
    if not scope:
        raise HTTPException(400, "scope 를 주세요")
    return {"views": await db.views_list(scope, who)}


@app.post("/api/views")
async def view_save_ep(body: dict, token: str = ""):
    """만들기·고치기 — 로그인한 사람이면 누구나(노션과 같은 결).
    다만 **남의 개인 보기**는 못 건드리고, **공용으로 올리는 것은 관리자**만
    한다(지시: 관리자가 고민하고 승인한다)."""
    who = _who()
    vid = str(body.get("id") or "").strip()
    scope = str(body.get("scope") or "").strip()
    name = str(body.get("name") or "").strip()
    if not vid or not scope or not name:
        raise HTTPException(400, "id·scope·name 이 필요합니다")
    if len(name) > 60:
        raise HTTPException(400, "이름은 60자 이하")
    b = body.get("body")
    if not isinstance(b, dict) or len(json.dumps(b)) > 64 * 1024:
        raise HTTPException(400, "body(dict, 64KB 이하)로 보내세요")
    kind = str(body.get("kind") or "table")
    if kind not in _VIEW_KINDS:
        raise HTTPException(400, f"모르는 보기 종류입니다 — {', '.join(_VIEW_KINDS)}")
    old = await db.view_get(vid)
    if old and not old["shared"] and old["owner"] != who:
        raise HTTPException(403, "남의 개인 보기는 못 고칩니다")
    shared = bool(body.get("shared", False))
    # 공용으로 **올리는 것**만 관리자다(지시) — 만들기·고치기는 누구나,
    # 「모두에게 보이기」 는 관리자가 고민하고 승인한다. 시스템 안정성.
    if shared and not (old and old["shared"]):
        _require_admin(token)
    # 난립 막기 — 한 줄에 편히 읽히는 수를 넘지 않게(지시)
    if not old or bool(old["shared"]) != shared:
        n = await db.views_count(scope, who, shared)
        cap = _VIEW_CAP_SHARED if shared else _VIEW_CAP_MINE
        if n >= cap:
            raise HTTPException(
                400,
                f"{'공용' if shared else '내'} 탭은 {cap}개까지입니다 — 안 쓰는 것을 지우고 만드세요",
            )
    await db.view_save({
        "id": vid, "scope": scope, "name": name,
        "owner": (old or {}).get("owner") or who,
        # 기본은 **나만 보기** — 「모두에게 보이기」 를 눌러야 공용이 된다(승인)
        "shared": shared,
        "body": {**b, "kind": kind},
        "sort_order": int(body.get("sort_order") or 0),
    })
    return {"ok": True}


@app.delete("/api/views/{vid}")
async def view_delete_ep(vid: str, token: str = ""):
    """지우기 — **만든 사람 또는 관리자**만(남의 탭이 실수로 사라지지 않게)."""
    who = _who()
    v = await db.view_get(vid)
    if not v:
        raise HTTPException(404, "없는 보기입니다")
    if v["owner"] != who:
        _require_admin(token)
    await db.view_delete(vid)
    return {"ok": True}


@app.get("/api/prefs")
async def prefs_get_ep():
    """화면 설정(보기) — 계정별(지시: PC 는 안 따라간다). 내 것 + 팀 기본."""
    who = _who()
    return {"mine": await db.prefs_get(who), "team": await db.prefs_get("_team")}


@app.post("/api/prefs")
async def prefs_set_ep(body: dict):
    who = _who()
    values = body.get("values")
    _check_pref_values(values)
    if await db.prefs_count(who) + len(values) > 500:
        raise HTTPException(400, "저장된 설정이 너무 많습니다 — 초기화 후 다시 시도하세요")
    await db.prefs_set(who, values)
    return {"ok": True}


@app.post("/api/prefs-team")
async def prefs_team_ep(body: dict, token: str = ""):
    """「모두의 기본으로 저장」 — 관리자만. 신규 계정·초기화의 기본이 된다."""
    _require_admin(token)
    values = body.get("values")
    _check_pref_values(values)
    await db.prefs_set("_team", values)
    return {"ok": True}


@app.get("/api/user-names")
async def api_user_names(token: str = ""):
    """담당자 드롭다운용 — **이름만**. /api/users 는 관리자 전용이라
    일반 사용자의 담당 고르기가 장비 SSH 계정(admin·root)만 보였다(지적).
    지라에서 들어온 계정도 여기 다 있다. 퇴사자는 뺀다."""
    if not _user_from_token(token):
        raise HTTPException(401, "로그인이 필요합니다")
    out = []
    seen = set()
    for u in _users_load_sync()["users"]:
        if _is_retired(u):
            continue
        nm = str(u.get("name") or u.get("username") or "").strip()
        if not nm or nm in seen:
            continue
        seen.add(nm)
        # 조직 — 담당 고르기가 조직도 꼴로 묶어 보인다(지시)
        out.append({"name": nm, "org": str(_org_of(u) or "").strip()})
    out.sort(key=lambda x: (x["org"] or "ㅎㅎㅎ", x["name"]))
    return {"names": out}


@app.get("/api/users")
async def api_users(token: str = ""):
    _require_admin(token)
    return {
        "users": [
            {**_public_user(u), "retired": _is_retired(u), "org": _org_of(u)}
            for u in _users_load_sync()["users"]
        ],
        "roles": ROLES,
    }

@app.post("/api/users")
async def api_user_create(payload: dict, token: str = ""):
    _require_admin(token)
    data = _users_load_sync()
    uname = str(payload.get("username", "")).strip()
    if not uname:
        raise HTTPException(400, "아이디를 입력하세요")
    if any(u.get("username") == uname for u in data["users"]):
        raise HTTPException(400, "이미 존재하는 아이디입니다")
    role = payload.get("role") if payload.get("role") in ROLES else "팀원"
    email = str(payload.get("email", "")).strip()
    if not email:
        raise HTTPException(400, "이메일을 입력하세요 (필수)")
    if not _valid_email(email):
        raise HTTPException(400, "이메일 형식이 올바르지 않습니다")
    if not _allowed_email_domain(email):
        raise HTTPException(400, "@" + ALLOWED_EMAIL_DOMAIN + " 이메일만 등록할 수 있습니다")
    salt = _secrets.token_hex(8)
    pw = payload.get("password") or "1234"
    nu = {"id": uname, "username": uname, "name": payload.get("name") or uname, "role": role,
          "email": email,
          "company": str(payload.get("company", "")).strip(), "position": str(payload.get("position", "")).strip(),
          "duty": str(payload.get("duty", "")).strip(),
          "dept": str(payload.get("dept", "")).strip(), "team": str(payload.get("team", "")).strip(),
          "salt": salt, "password": _hash_pw(pw, salt), "active": bool(payload.get("active", True)),
          "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    data["users"].append(nu)
    _users_save_sync(data)
    return {"ok": True, "user": _public_user(nu)}

@app.put("/api/users/{username}")
async def api_user_update(username: str, payload: dict, token: str = "", request: Request = None):
    _require_admin(token)
    data = _users_load_sync()
    for u in data["users"]:
        if u.get("username") == username:
            if payload.get("name") is not None:
                u["name"] = payload.get("name")
            if payload.get("company") is not None:
                u["company"] = str(payload.get("company") or "").strip()   # 회사
            if payload.get("dept") is not None:
                u["dept"] = str(payload.get("dept") or "").strip()   # 소속담당
            if payload.get("team") is not None:
                u["team"] = str(payload.get("team") or "").strip()   # 소속팀
            if payload.get("position") is not None:
                u["position"] = str(payload.get("position") or "").strip()   # 직책
            if payload.get("duty") is not None:
                u["duty"] = str(payload.get("duty") or "").strip()   # 보직
            if payload.get("email") is not None:
                _em = str(payload.get("email")).strip()
                if _em and not _valid_email(_em):
                    raise HTTPException(400, "이메일 형식이 올바르지 않습니다")
                if _em and not _allowed_email_domain(_em):
                    raise HTTPException(400, "@" + ALLOWED_EMAIL_DOMAIN + " 이메일만 사용할 수 있습니다")
                u["email"] = _em
            if payload.get("role") in ROLES:
                u["role"] = payload.get("role")
                # 관리자가 손으로 정한 역할은 **못**이 된다 — Jira 동기화(role_by=jira)가
                # 다음에 팀장으로 되돌리지 않게, jira 표식을 뗀다.
                u.pop("role_by", None)
            if payload.get("active") is not None:
                _was_pending = bool(u.get("pending"))
                u["active"] = bool(payload.get("active"))
                if u["active"]:
                    u["pending"] = False
                    _mc = _load_mail_cfg()
                    if _was_pending and u.get("email") and _mc.get("enabled"):
                        try:
                            _subj = _mc.get("approval_subject") or _DEFAULT_APPROVAL_SUBJECT
                            _tpl = _mc.get("approval_html") or _DEFAULT_APPROVAL_TPL
                            # app_url: 설정값 우선, 없으면 관리자가 접속한 주소(request.base_url)로 자동 유도 → 로그인 버튼 링크 생성
                            _app_url = (_mc.get("app_url") or "").strip()
                            if not _app_url and request is not None:
                                try:
                                    _app_url = str(request.base_url).strip().rstrip("/")
                                except Exception:
                                    _app_url = ""
                            _send_mail(u["email"], _subj,
                                       _render_mail_tpl(_tpl, u.get("name"), u.get("username"), u.get("email"),
                                                        _app_url, u.get("dept"), u.get("team"),
                                                        u.get("position"), u.get("duty")),
                                       html=True)
                        except Exception:
                            pass
            if payload.get("password"):
                salt = _secrets.token_hex(8)
                u["salt"] = salt
                u["password"] = _hash_pw(payload.get("password"), salt)
            _users_save_sync(data)
            return {"ok": True, "user": _public_user(u)}
    raise HTTPException(404, "사용자를 찾을 수 없습니다")

@app.delete("/api/users/{username}")
async def api_user_delete(username: str, token: str = ""):
    _require_admin(token)
    if username == "admin":
        raise HTTPException(400, "기본 관리자(admin)는 삭제할 수 없습니다")
    data = _users_load_sync()
    before = len(data["users"])
    data["users"] = [u for u in data["users"] if u.get("username") != username]
    if len(data["users"]) == before:
        raise HTTPException(404, "사용자를 찾을 수 없습니다")
    _users_save_sync(data)
    return {"ok": True}

def _org_of(u: dict) -> str:
    """이 사람의 조직.

    관리자가 정한 소속(dept)이 있으면 그것이 정본이다. 없으면 **이름 괄호**에서
    뽑는다 — 「강경묵(생산)」·「김대원(SW3)」 처럼 Jira 표시이름이 조직을 달고
    온다. 동기화를 다시 돌리지 않아도 조직별로 묶을 수 있게 하려는 것이다.
    """
    d = str(u.get("dept") or "").strip()
    if d:
        return d
    m = re.search(r"\(([^)]+)\)", str(u.get("name") or ""))
    if not m:
        return ""
    v = m.group(1).strip()
    # 「퇴사자」·「퇴사-비활성화불가」 는 조직이 아니다
    return "" if "퇴사" in v else v


def _org_where(name: str) -> dict:
    """조직도에서 이 사람의 **팀·담당**을 찾는다.

    소속담당은 조직도가 정본이다. dept 는 Jira 표시이름 꼬리에서 뽑은 값이라
    「전규종(검증)」 → 「검증」 이 되는데, 그 사람은 실제로 **품질보증담당**의
    장이다(지적). 두 값이 다르면 조직도를 따른다.

    길에서 이름이 「…팀」 으로 끝나는 마디를 팀으로, 「…담당」 으로 끝나는
    마디를 담당으로 본다. 겸임이면 처음 찾은 자리를 쓴다 — 어느 쪽인지는
    사람이 조직도에서 정한다.
    """
    key = re.split(r"[(\[_]", str(name or ""))[0].replace(" ", "")
    if not key:
        return {}
    org = _kv_load_sync("org_tree", None)
    if not isinstance(org, dict):
        return {}
    found: dict = {}

    def walk(n: dict, path: list):
        nonlocal found
        if found:
            return
        p = [*path, str(n.get("name") or "")]
        names = []
        t = str(n.get("lead") or "").strip()
        if t:
            i = t.rfind(" ")
            names.append(t[:i] if i > 0 else t)
        names += [str(m.get("name") or "") for m in (n.get("members") or [])]
        if any(re.split(r"[(\[_]", x)[0].replace(" ", "") == key for x in names):
            found = {
                "team": next((x for x in reversed(p) if x.endswith("팀")), ""),
                "dept": next((x for x in reversed(p) if x.endswith("담당")), ""),
                "org_path": " › ".join(p[1:]),
            }
            return
        for c in (n.get("children") or []):
            walk(c, p)

    walk(org, [])
    return found


def _is_retired(u: dict) -> bool:
    """나간 사람인가.

    **Jira 비활성만 보면 안 된다**(지적: 퇴사 계정이 안 지워진다). 실제 자료를
    보면 나간 사람이 계정은 살아 있고 **이름에 표시**만 달려 있다 —
    「김진보(퇴사자)」·「김대환(Bilab) (퇴사-비활성화불가)」 처럼. 그래서 이름의
    「퇴사」 표기도 함께 본다. 둘 중 하나면 나간 사람이다.
    """
    if u.get("jira_active") is False:
        return True
    return "퇴사" in str(u.get("name") or "")


@app.get("/api/org")
async def api_org_get():
    """조직도 — 회사 → 그룹 → 담당 → 팀 → 사람.

    사람은 `{name, rank}` 다. **직급(rank)은 Jira 에 없다**(확인함) — 사람이
    준 조직도가 정본이고, 여기 담아 둔다. 계정과는 **이름으로** 잇는다:
    계정 이름이 「강경묵(생산)」 처럼 꼬리를 달고 있어 괄호·밑줄 앞까지만 본다.
    """
    return {"org": _kv_load_sync("org_tree", None)}


@app.post("/api/org")
async def api_org_save(payload: dict, token: str = ""):
    """조직도 통째로 저장. 관리자만."""
    _require_admin(token)
    org = (payload or {}).get("org")
    if not isinstance(org, dict) or not org.get("name"):
        raise HTTPException(400, "조직도 모양이 아닙니다")
    _kv_save_sync("org_tree", org)
    return {"ok": True, **_apply_org_roles(org)}


@app.post("/api/org/member-role")
async def api_org_member_role(payload: dict, token: str = ""):
    """조직도의 **계정 없는 사람**에게 역할을 준다. 관리자만.

    조직도 204명 중 40명은 계정이 아예 없다(확인함 — 이름 표기가 달라 못
    이어진 것이 아니라, 그 이름이 계정 목록 어디에도 없다). Jira 계정이
    없으면 UTOP 을 안 쓰는 사람이라 계정을 만들어 줄 수도 없다.

    그런데도 역할은 적어 두어야 한다(지시) — 조직도는 「누가 무엇을 맡나」
    를 보는 표이지 「누가 UTOP 을 쓰나」 만 보는 표가 아니다. 그래서 역할을
    **조직도 그 사람 칸에** 담는다. 나중에 그 사람의 계정이 생기면 계정 쪽
    역할이 이 값을 덮는다 — 계정이 있으면 계정이 정본이다.
    """
    _require_admin(token)
    nm = str((payload or {}).get("name") or "").strip()
    role = str((payload or {}).get("role") or "").strip()
    if not nm:
        raise HTTPException(400, "이름이 없습니다")
    org = _kv_load_sync("org_tree", None)
    if not isinstance(org, dict):
        raise HTTPException(404, "조직도가 없습니다")

    hit = 0

    def walk(n: dict):
        nonlocal hit
        for m in (n.get("members") or []):
            if str(m.get("name") or "").strip() == nm:
                if role:
                    m["role"] = role
                else:
                    m.pop("role", None)
                hit += 1
        for c in (n.get("children") or []):
            walk(c)

    walk(org)
    if not hit:
        raise HTTPException(404, f"조직도에 「{nm}」 이(가) 없습니다")
    _kv_save_sync("org_tree", org)
    return {"ok": True, "hit": hit}


def _org_walk(n: dict):
    """마디를 하나씩 내준다 — 뿌리부터 깊이 우선."""
    yield n
    for c in (n.get("children") or []):
        yield from _org_walk(c)


def _org_at(org: dict, path: list) -> dict | None:
    """이름 길로 마디를 찾는다. 같은 이름이 여러 곳에 있어도(사업1담당 밑
    네트워크사업1팀 처럼) 길로 찾으면 헷갈리지 않는다."""
    cur = org
    for step in (path or [])[1:]:
        nxt = None
        for c in (cur.get("children") or []):
            if str(c.get("name")) == str(step):
                nxt = c
                break
        if nxt is None:
            return None
        cur = nxt
    return cur if not path or str(org.get("name")) == str(path[0]) else None


@app.post("/api/org/seed")
async def api_org_seed(payload: dict = None, token: str = ""):
    """이미지에 실린 조직도를 **손으로 심는다**. 관리자만.

    시작할 때 자동으로 심지만(비어 있을 때만), 그게 안 먹은 서버에서는
    확인할 길이 없었다 — 서버에 들어갈 수 없으면 「왜 안 됐나」 를 물을 데가
    없다(253 지적). 눌러서 심고 **결과를 눈으로 보게** 한다.

    이미 조직도가 있으면 안 덮는다. 덮으려면 force 를 줘야 한다 — 화면이
    먼저 물어본 뒤에 보낸다.
    """
    _require_admin(token)
    force = bool((payload or {}).get("force"))
    cur = _kv_load_sync("org_tree", None)
    seed = Path(__file__).parent / "seed" / "org_tree.json"
    if not seed.exists():
        raise HTTPException(404, "씨앗 파일이 이미지에 없습니다 — 코드를 다시 받으세요")
    if cur and not force:
        return {"ok": False, "had": True, "name": cur.get("name"),
                "detail": "이미 조직도가 있습니다"}
    org = json.loads(seed.read_text(encoding="utf-8"))
    _kv_save_sync("org_tree", org)

    people: set = set()

    def walk(n: dict):
        t = str(n.get("lead") or "").strip()
        if t:
            i = t.rfind(" ")
            people.add(t[:i] if i > 0 else t)
        for m in (n.get("members") or []):
            people.add(str(m.get("name") or ""))
        for c in (n.get("children") or []):
            walk(c)

    walk(org)
    people.discard("")
    return {"ok": True, "had": bool(cur), "nodes": len(list(_org_walk(org))),
            "people": len(people), **_apply_org_roles(org)}


@app.post("/api/org/node")
async def api_org_node_add(payload: dict, token: str = ""):
    """조직을 하나 만든다 — 고른 조직 **아래**에. 관리자만."""
    _require_admin(token)
    path = (payload or {}).get("path") or []
    name = str((payload or {}).get("name") or "").strip()
    if not name:
        raise HTTPException(400, "조직 이름이 없습니다")
    org = _kv_load_sync("org_tree", None)
    if not isinstance(org, dict):
        raise HTTPException(404, "조직도가 없습니다")
    at = _org_at(org, path)
    if at is None:
        raise HTTPException(404, "그 조직을 못 찾았습니다")
    kids = at.setdefault("children", [])
    if any(str(c.get("name")) == name for c in kids):
        raise HTTPException(400, f"「{name}」 은(는) 이미 있습니다")
    kids.append({"name": name})
    _kv_save_sync("org_tree", org)
    return {"ok": True}


@app.post("/api/org/rename")
async def api_org_rename(payload: dict, token: str = ""):
    """조직 이름을 바꾼다. 관리자만."""
    _require_admin(token)
    path = (payload or {}).get("path") or []
    name = str((payload or {}).get("name") or "").strip()
    if not name:
        raise HTTPException(400, "새 이름이 없습니다")
    org = _kv_load_sync("org_tree", None)
    if not isinstance(org, dict):
        raise HTTPException(404, "조직도가 없습니다")
    at = _org_at(org, path)
    if at is None:
        raise HTTPException(404, "그 조직을 못 찾았습니다")
    at["name"] = name
    _kv_save_sync("org_tree", org)
    return {"ok": True}


@app.post("/api/org/delete-node")
async def api_org_node_del(payload: dict, token: str = ""):
    """**빈 조직만** 지운다. 관리자만.

    사람이나 하위 조직이 든 마디를 지우면 그 사람들이 조직도에서 통째로
    사라진다 — 되돌릴 방법이 없다. 비었을 때만 지우게 해, 잘못 만든 것을
    치우는 데만 쓰이게 한다.
    """
    _require_admin(token)
    path = (payload or {}).get("path") or []
    if len(path) < 2:
        raise HTTPException(400, "맨 위 조직은 못 지웁니다")
    org = _kv_load_sync("org_tree", None)
    if not isinstance(org, dict):
        raise HTTPException(404, "조직도가 없습니다")
    parent = _org_at(org, path[:-1])
    if parent is None:
        raise HTTPException(404, "그 조직을 못 찾았습니다")
    gone = None
    for c in (parent.get("children") or []):
        if str(c.get("name")) == str(path[-1]):
            gone = c
            break
    if gone is None:
        raise HTTPException(404, "그 조직을 못 찾았습니다")
    if (gone.get("members") or []) or (gone.get("children") or []) or gone.get("lead"):
        raise HTTPException(400, "빈 조직만 지울 수 있습니다 — 먼저 사람을 옮기세요")
    parent["children"] = [c for c in parent["children"] if c is not gone]
    _kv_save_sync("org_tree", org)
    return {"ok": True}


@app.post("/api/org/move-member")
async def api_org_move_member(payload: dict, token: str = ""):
    """사람을 다른 조직으로 옮긴다. 관리자만.

    직급·역할은 사람에게 붙은 것이라 그대로 들고 간다 — 옮겼다고 직급이
    지워지면 옮기기가 두려운 기능이 된다.
    """
    _require_admin(token)
    nm = str((payload or {}).get("name") or "").strip()
    to = (payload or {}).get("to") or []
    if not nm:
        raise HTTPException(400, "이름이 없습니다")
    org = _kv_load_sync("org_tree", None)
    if not isinstance(org, dict):
        raise HTTPException(404, "조직도가 없습니다")
    # 옮길 곳이 비었으면 **조직도에서 뺀다**(「(조직도에 없음)」 을 고른 것).
    # 넣기만 되고 빼기가 없으면, 시험 삼아 넣어 본 사람을 되돌릴 길이 없다
    # (지적: 조직도에 없는 계정으로 다시 못 바꾼다).
    dest = _org_at(org, to) if to else None
    if to and dest is None:
        raise HTTPException(404, "옮길 조직을 못 찾았습니다")

    picked = None

    def strip(n: dict):
        nonlocal picked
        keep = []
        for m in (n.get("members") or []):
            if str(m.get("name") or "").strip() == nm and picked is None:
                picked = m
            else:
                keep.append(m)
        if n.get("members") is not None:
            n["members"] = keep
        for c in (n.get("children") or []):
            strip(c)

    strip(org)
    if dest is None:
        # 빼기 — 조직도에 없던 사람이면 이미 목적을 이룬 것이라 조용히 넘긴다
        if picked is not None:
            _kv_save_sync("org_tree", org)
        return {"ok": True, "to": None, "removed": picked is not None}
    if picked is None:
        # 조직도 어디에도 없던 사람 — **새로 넣는다.** 계정은 있는데 조직도에
        # 이름이 없는 사람이 45명이다(admin·qag 를 포함해). 없다고 물리면
        # 그 45명을 조직에 넣을 방법이 아예 없다.
        for n2 in _org_walk(org):
            L = str(n2.get("lead") or "").strip()
            i2 = L.rfind(" ")
            if (L[:i2] if i2 > 0 else L) == nm:
                raise HTTPException(400, f"「{nm}」 은(는) 그 조직의 장입니다 — 조직의 장을 바꾸세요")
        picked = {"name": nm}
    dest.setdefault("members", []).append(picked)
    _kv_save_sync("org_tree", org)
    return {"ok": True, "to": dest.get("name")}


def _apply_org_roles(org: dict) -> dict:
    """조직도의 **장**을 계정 역할 「담당」 으로 맞춘다.

    표에만 「담당」 이라 적고 실제 역할은 팀원이면, 눌러서 열어 본 사람이
    두 값을 보고 어느 쪽이 맞는지 알 수 없다(지적). 실제 역할을 바꾼다.

    **관리자는 절대 안 내린다** — 조직의 장이라고 관리자 권한을 뺏으면
    그 사람이 화면을 못 쓴다(실제로 전규종이 관리자다). 팀원·팀장만 올린다.

    표식(`role_by='org'`)을 남겨, 장에서 내려오면 **우리가 올린 것만** 되돌린다.
    관리자가 손으로 정한 역할은 건드리지 않는다 — Jira 동기화의 규칙과 같다.
    """
    leads: set = set()

    def walk(n: dict):
        t = str(n.get("lead") or "").strip()
        if t:
            i = t.rfind(" ")
            leads.add((t[:i] if i > 0 else t))
        for c in (n.get("children") or []):
            walk(c)

    walk(org)

    def key(v) -> str:
        return re.split(r"[(\[_]", str(v or ""))[0].replace(" ", "")

    lead_keys = {key(x) for x in leads} | {key(re.sub(r"\d+$", "", x)) for x in leads}
    data = _users_load_sync()
    up = down = 0
    for u in data["users"]:
        if u.get("role") == "관리자":
            continue  # 관리자는 안 내린다
        k = key(u.get("name") or u.get("username"))
        if k and k in lead_keys:
            if u.get("role") != "담당":
                u["role"] = "담당"
                u["role_by"] = "org"
                up += 1
        elif u.get("role") == "담당" and u.get("role_by") == "org":
            u["role"] = "팀원"
            u.pop("role_by", None)
            down += 1
    if up or down:
        _users_save_sync(data)
    return {"role_up": up, "role_down": down}


@app.post("/api/users/delete-retired")
async def api_users_delete_retired(token: str = ""):
    """Jira 에서 나간 사람(jira_active=False)을 **명단에서 지운다**(지시: 퇴사자
    필요 없음).

    기록은 안 깨진다 — 플랜의 실행자·담당자는 이름 **문자열**로 담겨 있어
    (FK 가 아니다) 계정을 지워도 그 기록의 이름은 남는다. admin 은 못 지운다.

    다음 동기화에서 되살아나지 않게, 동기화 쪽에서 비활성 신규는 안 만든다.
    """
    _require_admin(token)
    data = _users_load_sync()
    before = len(data["users"])
    kept, gone = [], []
    for u in data["users"]:
        if u.get("username") != "admin" and _is_retired(u):
            gone.append(u.get("username"))
        else:
            kept.append(u)
    data["users"] = kept
    _users_save_sync(data)
    return {"ok": True, "deleted": before - len(kept), "names": gone[:50]}


# init_users_file() 은 startup 훅에서 호출 (모듈 로드 시점엔 DB 풀 없음)

# ───────────────────────────────────────────
# 메일(SMTP) 설정 + 발송
# ───────────────────────────────────────────
MAIL_FILE = DATA_DIR / "integrations" / "mail.json"
_MAIL_DEFAULT = {"host": "", "port": 587, "username": "", "password": "",
                 "from_addr": "", "from_name": "ubiQuoss-TOP", "security": "starttls", "enabled": False,
                 # Cycles 알림(지시) — 시험이 끝나면 실행한 사람에게 결과 메일
                 "done_enabled": False, "done_to_assignee": False, "done_only_fail": False,
                 "done_subject": "", "done_intro": "", "done_outro": "",
                 "done_sections": {"summary": True, "fails": False, "items": False, "link": True}}

def _load_mail_cfg() -> dict:
    cfg = dict(_MAIL_DEFAULT)
    try:
        if MAIL_FILE.exists():
            d = load_json(MAIL_FILE)
            if isinstance(d, dict):
                cfg.update(d)   # 저장된 모든 키 보존(approval_*, app_url, share_* 등 포함) + 기본값으로 누락 보완
    except Exception:
        pass
    return cfg

def _save_mail_cfg(cfg: dict):
    MAIL_FILE.parent.mkdir(parents=True, exist_ok=True)
    save_json(MAIL_FILE, cfg)

def _valid_email(addr: str) -> bool:
    import re as _re_mail
    return bool(_re_mail.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", str(addr or "").strip()))

# 가입 허용 이메일 도메인 (회사 메일만 허용)
ALLOWED_EMAIL_DOMAIN = "ubiquoss.com"
def _allowed_email_domain(addr: str) -> bool:
    return str(addr or "").strip().lower().endswith("@" + ALLOWED_EMAIL_DOMAIN)

def _addr_list(v) -> list:
    """주소를 목록으로 — 글자 한 줄이든 배열이든 같은 모양으로 받는다."""
    if isinstance(v, str):
        return [a.strip() for a in v.replace(";", ",").split(",") if a.strip()]
    return [str(a).strip() for a in (v or []) if str(a or "").strip()]


def _mail_inline_images(html: str):
    """본문의 `/api/req-images/…` 그림을 **메일에 실어** cid 로 바꾼다.

    메일에서는 상대 주소가 열리지 않는다(지적: Test Summary 에는 구성도가 보이는데
    받은 메일에는 제목만 있다). 절대 주소로 바꿔도 사내망 밖에서는 못 보고, 대부분의
    메일 프로그램이 외부 그림을 기본으로 막는다 — 파일을 함께 담는 것이 확실하다.

    (바뀐 HTML, [(cid, 바이트, 파일명)…]) 를 돌려준다.
    """
    found: list = []
    seen: dict = {}

    def rep(m):
        name = str(m.group(2) or "")
        # 폴더 밖으로 나가는 이름은 받지 않는다
        if not name or "/" in name or "\\" in name or name.startswith("."):
            return m.group(0)
        if name in seen:
            return f'src="cid:{seen[name]}"'
        try:
            fp = REQ_IMG_DIR / name
            if not fp.exists() or not fp.is_file():
                return m.group(0)
            blob = fp.read_bytes()
        except Exception:
            return m.group(0)
        if not blob:
            return m.group(0)
        cid = _hashlib.md5(name.encode("utf-8")).hexdigest()[:20]
        seen[name] = cid
        found.append((cid, blob, name))
        return f'src="cid:{cid}"'

    out = re.sub(r'src=(["\'])/api/req-images/([^"\'?#]+)\1', rep, str(html or ""))
    return out, found


def _send_mail(to_addrs, subject: str, body: str, html: bool = False,
               cc=None, bcc=None, files=None, from_name: str = ""):
    """SMTP로 메일 발송. to_addrs: str(콤마/세미콜론 구분) 또는 list. 실패 시 예외 발생.

    **참조·숨은 참조·첨부**(지시). 숨은 참조는 머리글에 적지 않는다 — 적으면
    받는 사람에게 보여, 숨은 참조가 아니게 된다. 보낼 주소 목록에만 넣는다.
    첨부는 [{filename, mime, data(base64)}] 로 받는다.
    """
    import smtplib, ssl as _ssl
    from email.message import EmailMessage
    cfg = _load_mail_cfg()
    if not cfg.get("host"):
        raise RuntimeError("SMTP 서버가 설정되지 않았습니다 (시스템 → 메일 설정)")
    to_list = _addr_list(to_addrs)
    cc_list = _addr_list(cc)
    bcc_list = _addr_list(bcc)
    if not to_list:
        raise RuntimeError("받는 사람이 없습니다")
    msg = EmailMessage()
    from_addr = cfg.get("from_addr") or cfg.get("username")
    # from_name 을 주면 그 이름으로(시험 종료 메일은 「UTOP」 — 지시). 아니면 메일 설정의 발신자 이름
    msg["From"] = f'{from_name or cfg.get("from_name") or "ubiQuoss-TOP"} <{from_addr}>'
    msg["To"] = ", ".join(to_list)
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)
    msg["Subject"] = subject
    if html:
        body, _inline = _mail_inline_images(body)
        msg.set_content("이 메일은 HTML 형식입니다. HTML을 지원하는 클라이언트에서 열어주세요.")
        msg.add_alternative(body, subtype="html")
        # 그림은 **HTML 조각에** 붙여야 multipart/related 가 되어 본문 안에서 보인다.
        # 바깥(msg)에 붙이면 그냥 첨부파일이 되어 본문에는 깨진 그림만 남는다.
        if _inline:
            _hp = msg.get_payload()[-1]
            for _cid, _blob, _nm in _inline:
                _sub = (_nm.rsplit(".", 1)[-1] if "." in _nm else "png").lower()
                if _sub in ("jpg", "jpe"):
                    _sub = "jpeg"
                if _sub not in ("png", "jpeg", "gif", "webp", "bmp", "svg+xml"):
                    _sub = "png"
                try:
                    _hp.add_related(_blob, maintype="image", subtype=_sub, cid=f"<{_cid}>",
                                    filename=_nm)
                except Exception:
                    pass
    else:
        msg.set_content(body)
    # 첨부 — 본문을 다 채운 **뒤에** 붙인다(add_alternative 가 먼저 와야 한다)
    for f in (files or []):
        try:
            import base64 as _b64
            raw = str((f or {}).get("data") or "")
            if raw.strip().startswith("data:") and "," in raw:
                raw = raw.split(",", 1)[1]
            blob = _b64.b64decode(raw)
            mime = str(f.get("mime") or "application/octet-stream")
            maj, _, sub = mime.partition("/")
            msg.add_attachment(blob, maintype=maj or "application", subtype=sub or "octet-stream",
                               filename=str(f.get("filename") or "attachment"))
        except Exception as e:
            raise RuntimeError(f"첨부 파일을 붙이지 못했습니다 — {f.get('filename', '')}: {e}")
    host = cfg["host"]; port = int(cfg.get("port") or 587); sec = str(cfg.get("security") or "starttls").lower()
    # **받는 사람 · 참조 · 숨은 참조를 각각 따로 보낸다**(지시).
    #
    # 한 사람이 받는 사람이면서 참조이면 그 사람은 **두 통**을 받는다 — 참조로 온
    # 것을 따로 확인하려고 그렇게 넣기 때문이다. 머리글(To·Cc)은 세 번 다 똑같이
    # 두므로 받는 쪽에서는 여느 메일과 다르지 않게 보인다. 한 묶음 안의 중복만
    # 걷는다(같은 칸에 같은 주소를 두 번 적은 경우).
    _bundles = [g for g in (to_list, cc_list, bcc_list) if g]
    refused: dict = {}
    rcpt: list = []

    def _deliver(s):
        for g in _bundles:
            seen, one = set(), []
            for a in g:
                if a.lower() not in seen:
                    seen.add(a.lower())
                    one.append(a)
            if not one:
                continue
            rcpt.extend(one)
            refused.update(s.send_message(msg, to_addrs=one) or {})

    if sec == "ssl":
        ctx = _ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, timeout=20, context=ctx) as s:
            if cfg.get("username"):
                s.login(cfg["username"], cfg.get("password") or "")
            _deliver(s)
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.ehlo()
            if sec == "starttls":
                s.starttls(context=_ssl.create_default_context()); s.ehlo()
            if cfg.get("username"):
                try:
                    s.login(cfg["username"], cfg.get("password") or "")
                except smtplib.SMTPAuthenticationError as e:
                    # **로그인이 거부돼도 인증 없이 한 번 더**(실사고: 사내 중계 서버가
                    # 인증 없이도 사내 주소로 보내 주는데, 적힌 비밀번호가 틀려 553 에서
                    # 멈춰 결과 메일이 한 통도 안 나갔다). 중계마저 거부하면 그때 원래
                    # 인증 오류를 올린다 — 비밀번호가 틀렸다는 사실은 로그에 남긴다.
                    print(f"[mail] SMTP 로그인 거부({e.smtp_code}) — 인증 없이 다시 시도합니다: {host}:{port}", flush=True)
                    try:
                        s.rset()
                    except Exception:
                        pass
                    try:
                        _deliver(s)
                    except smtplib.SMTPRecipientsRefused:
                        raise e
                    except smtplib.SMTPSenderRefused:
                        raise e
                else:
                    _deliver(s)
            else:
                _deliver(s)
    # **일부만 거절당하면 조용히 성공한다** — send_message 는 전부 거절일 때만
    # 예외를 던지고, 일부는 거절 목록을 **돌려줄 뿐**이다. 그 값을 버리고 있어서
    # 사내 주소는 나가고 바깥 주소(gmail 등)만 막혀도 화면은 「보냈다」 였다(지적).
    if refused:
        def _why(v):
            c, m = (v if isinstance(v, tuple) and len(v) == 2 else (0, v))
            if isinstance(m, bytes):
                m = m.decode("utf-8", "replace")
            return f"{c} {str(m or '').strip()[:70]}".strip()
        bad = "; ".join(f"{a} → {_why(v)}" for a, v in refused.items())
        okn = len([a for a in rcpt if a not in refused])
        raise RuntimeError(
            f"받는 메일 서버가 거절한 주소가 있습니다 — {bad}"
            + (f" (나머지 {okn}곳으로는 보냈습니다)" if okn else "")
        )
    return to_list

_DEFAULT_APPROVAL_SUBJECT = "[ubiQuoss-TOP] \U0001F389 가입이 승인되었습니다"


_DEFAULT_APPROVAL_TPL = """<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef1f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:30px 12px;font-family:'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(20,40,80,0.10);">
<tr><td bgcolor="#2d6fd4" style="background-color:#2d6fd4;background:linear-gradient(135deg,#2d6fd4,#1b59bd);padding:32px 30px;text-align:center;">
<div style="font-size:23px;font-weight:800;color:#ffffff;letter-spacing:-0.4px;">ubi<span style="color:#ff90a6;">Q</span>uoss-TOP</div>
<div style="font-size:12px;color:#cfe0ff;margin-top:5px;">Ubiquoss Test Orchestration Platform</div>
</td></tr>
<tr><td style="text-align:center;padding:36px 30px 4px;">
<div style="font-size:48px;line-height:1;">\U0001F389</div>
<div style="font-size:22px;font-weight:800;color:#1c2942;margin-top:16px;">가입을 진심으로 환영합니다!</div>
<div style="font-size:14px;color:#5a6b85;margin-top:10px;line-height:1.75;"><b style="color:#2d6fd4;">{{name}}</b>님, 가입 신청이 <b>승인</b>되었습니다.<br>이제 ubiQuoss-TOP의 모든 기능을 사용하실 수 있습니다.</div>
</td></tr>
<tr><td style="padding:24px 30px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fd;border:1px solid #e1eaf7;border-radius:12px;">
<tr><td style="padding:6px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;">
<tr><td style="padding:12px 0;border-bottom:1px solid #e6edf8;color:#8a99b5;width:92px;vertical-align:top;">아이디</td><td style="padding:12px 0;border-bottom:1px solid #e6edf8;font-weight:700;color:#1c2942;font-family:ui-monospace,monospace;">{{username}}</td></tr>
<tr><td style="padding:12px 0;border-bottom:1px solid #e6edf8;color:#8a99b5;vertical-align:top;">이름</td><td style="padding:12px 0;border-bottom:1px solid #e6edf8;font-weight:700;color:#1c2942;">{{name}}</td></tr>
<tr><td style="padding:12px 0;border-bottom:1px solid #e6edf8;color:#8a99b5;vertical-align:top;">소속담당</td><td style="padding:12px 0;border-bottom:1px solid #e6edf8;font-weight:700;color:#1c2942;">{{dept}}</td></tr>
<tr><td style="padding:12px 0;border-bottom:1px solid #e6edf8;color:#8a99b5;vertical-align:top;">소속팀</td><td style="padding:12px 0;border-bottom:1px solid #e6edf8;font-weight:700;color:#1c2942;">{{team}}</td></tr>
<tr><td style="padding:12px 0;border-bottom:1px solid #e6edf8;color:#8a99b5;vertical-align:top;">직책</td><td style="padding:12px 0;border-bottom:1px solid #e6edf8;font-weight:700;color:#1c2942;">{{position}}</td></tr>
<tr><td style="padding:12px 0;border-bottom:1px solid #e6edf8;color:#8a99b5;vertical-align:top;">보직</td><td style="padding:12px 0;border-bottom:1px solid #e6edf8;font-weight:700;color:#1c2942;">{{duty}}</td></tr>
<tr><td style="padding:12px 0;border-bottom:1px solid #e6edf8;color:#8a99b5;vertical-align:top;">메일</td><td style="padding:12px 0;border-bottom:1px solid #e6edf8;font-weight:700;color:#1c2942;">{{email}}</td></tr>
<tr><td style="padding:12px 0;color:#8a99b5;vertical-align:middle;">상태</td><td style="padding:12px 0;"><span style="display:inline-block;background:#e3f6ec;color:#00875a;font-size:12px;font-weight:700;padding:4px 13px;border-radius:20px;">&#10003; 승인 완료</span></td></tr>
</table>
</td></tr></table></td></tr>
<tr><td align="center" style="padding:22px 30px 36px;">{{login_button}}</td></tr>
<tr><td style="background:#f7f9fc;border-top:1px solid #eef1f6;padding:18px 30px;text-align:center;font-size:11.5px;color:#9aa7bd;line-height:1.7;">본 메일은 ubiQuoss-TOP 가입 승인에 따라 자동 발송되었습니다.<br>문의는 시스템 관리자에게 연락해 주세요.</td></tr>
</table></td></tr></table></body></html>"""

def _login_button_html(app_url: str = "") -> str:
    if app_url:
        url = app_url.strip().rstrip("/")
        return ('<a href="' + url + '" target="_blank" '
                'style="display:inline-block;background:#2d6fd4;color:#ffffff;text-decoration:none;'
                'font-size:15px;font-weight:700;padding:14px 40px;border-radius:10px;'
                'box-shadow:0 6px 16px rgba(45,111,212,0.35);">로그인 하러 가기 &rarr;</a>')
    return '<span style="font-size:13px;color:#8090ab;">로그인 페이지에서 로그인해 주세요.</span>'

def _repair_placeholders(html: str) -> str:
    """WYSIWYG 편집으로 {{ }} 안쪽에 끼어든 HTML 태그/엔티티 제거 → 깨진 플레이스홀더 복원."""
    if not html or "{" not in html:
        return html
    import re as _rp
    keys = "name|username|email|dept|team|position|duty|app_url|login_button"
    junk = r"(?:<[^>]*>|&nbsp;|\s)*"
    pat = r"\{\{" + junk + r"(" + keys + r")" + junk + r"\}\}"
    return _rp.sub(pat, lambda m: "{{" + m.group(1).lower() + "}}", html, flags=_rp.I)

def _render_mail_tpl(tpl: str, name: str = "", username: str = "", email: str = "", app_url: str = "",
                     dept: str = "", team: str = "", position: str = "", duty: str = "") -> str:
    """플레이스홀더 치환: {{name}} {{username}} {{email}} {{dept}} {{team}} {{position}} {{duty}} {{app_url}} {{login_button}}"""
    def _esc(s):
        return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    out = _repair_placeholders(tpl or "")
    out = out.replace("{{name}}", _esc(name or username or "회원"))
    out = out.replace("{{username}}", _esc(username or ""))
    out = out.replace("{{email}}", _esc(email or ""))
    out = out.replace("{{dept}}", _esc(dept or ""))
    out = out.replace("{{team}}", _esc(team or ""))
    out = out.replace("{{position}}", _esc(position or ""))
    out = out.replace("{{duty}}", _esc(duty or ""))
    out = out.replace("{{app_url}}", (app_url or "").strip().rstrip("/"))
    out = out.replace("{{login_button}}", _login_button_html(app_url))
    if "<html" not in out.lower():   # 위지윅이 본문 조각만 보낸 경우 메일 문서로 감쌈
        out = ('<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef1f6;">'
               + out + "</body></html>")
    return out


@app.get("/api/mail/config")
async def api_mail_config_get(token: str = ""):
    """읽기는 **로그인한 누구나**(지적: 일반 계정에는 Cycles 알림 스위치가 꺼진
    것으로 보였다 — 읽기를 관리자로 막아 빈 기본값이 그려진 것). 고치기는
    관리자만(POST). 관리자가 아니면 SMTP 비밀번호는 가린다."""
    u = _user_from_token(token or _REQ_TOKEN.get(""))
    if not u:
        raise HTTPException(401, "로그인이 필요합니다")
    admin = u.get("role") == "관리자"
    cfg = dict(_load_mail_cfg())
    if not admin:
        cfg["password"] = ""
    return {"config": cfg, "can_manage": admin,
            "default_approval_subject": _DEFAULT_APPROVAL_SUBJECT,
            "default_approval_html": _DEFAULT_APPROVAL_TPL,
            "default_cycle_subject": _DEFAULT_CYCLE_SUBJECT,
            "default_cycle_html": _DEFAULT_CYCLE_TPL,
            "default_done_subject": _cycle_routes._DONE_SUBJECT,
            "default_done_intro": _cycle_routes._DONE_INTRO}

@app.post("/api/mail/preview-approval")
async def api_mail_preview_approval(payload: dict, token: str = "", request: Request = None):
    """가입 승인 메일 미리보기 — 입력 HTML을 샘플 데이터로 렌더."""
    _require_admin(token)
    cfg = _load_mail_cfg()
    tpl = payload.get("html") or _DEFAULT_APPROVAL_TPL
    _app_url = (cfg.get("app_url") or "").strip()
    if not _app_url and request is not None:
        try:
            _app_url = str(request.base_url).strip().rstrip("/")
        except Exception:
            _app_url = ""
    html = _render_mail_tpl(tpl,
                            payload.get("name") or "홍길동",
                            payload.get("username") or "hong",
                            payload.get("email") or ("hong@" + ALLOWED_EMAIL_DOMAIN),
                            _app_url,
                            payload.get("dept") or "품질보증담당",
                            payload.get("team") or "QA팀",
                            payload.get("position") or "책임",
                            payload.get("duty") or "팀원")
    return {"ok": True, "html": html}

# ── 브랜딩(로고) ── 관리자가 직접 로고 이미지를 등록 (data URI base64)
BRANDING_FILE = DATA_DIR / "config" / "branding.json"

def _load_branding() -> dict:
    try:
        if BRANDING_FILE.exists():
            d = load_json(BRANDING_FILE)
            if isinstance(d, dict):
                return d
    except Exception:
        pass
    return {}

@app.get("/api/branding")
async def api_branding_get():
    b = _load_branding()
    return {"logo": b.get("logo") or "", "name_text": b.get("name_text") or "",
            "name_size": b.get("name_size") or "", "name_color": b.get("name_color") or "",
            "name_font": b.get("name_font") or "", "name_accent_color": b.get("name_accent_color") or "",
            "fab_greeting": b.get("fab_greeting") or "", "fab_quick": (b.get("fab_quick") if isinstance(b.get("fab_quick"), list) else []),
            "fab_prompt": b.get("fab_prompt") or "", "fab_rules": b.get("fab_rules") or "",
            "link_url": b.get("link_url") or "",
            # 로그인 화면 왼쪽 판 — 회사 건물 사진과 그 위에 얹는 글(지시)
            "login_image": b.get("login_image") or "",
            "login_title": b.get("login_title") or "",
            "login_sub": b.get("login_sub") or "",
            # 로그인 화면 로고·글자 — **메뉴 것과 따로다**(지시: 구분해).
            # 한 값을 둘이 나눠 쓰니 한쪽을 고치면 다른 쪽이 따라 바뀌었다.
            "login_logo": b.get("login_logo") or "",
            "login_size": b.get("login_size") or "",
            "login_color": b.get("login_color") or "",
            "login_accent_color": b.get("login_accent_color") or "",
            "login_font": b.get("login_font") or "",
            # 오른쪽 판(들어가는 자리) — 코드에 박혀 있던 문구를 뺀다(지시)
            "login_form_title": b.get("login_form_title") or "",
            "login_id_ph": b.get("login_id_ph") or "",
            "login_note": b.get("login_note") or "",
            "login_foot": b.get("login_foot") or "",
            "login_md": b.get("login_md") or "",
            "login_body_size": b.get("login_body_size") or "",
            "login_body_color": b.get("login_body_color") or "",
            "login_keep": b.get("login_keep") or ""}

@app.post("/api/branding")
async def api_branding_save(payload: dict, request: Request, token: str = ""):
    # 화면은 Authorization 헤더로 토큰을 보낸다. 여기서 쿼리(?token=)만 보아
    # 401 이 났고, 저장은 조용히 실패해 새로고침하면 옛 값이 돌아왔다
    # (지적: 15 를 16 으로 고쳐도 15 로 되돌아간다).
    _require_admin(token or _token_from(request))
    b = _load_branding()
    for k in ("name_text", "name_size", "name_color", "name_font", "name_accent_color", "link_url",
              "login_title", "login_sub", "login_size", "login_color", "login_accent_color",
              "login_font", "login_form_title", "login_id_ph", "login_note", "login_foot",
              "login_md", "login_body_size", "login_body_color", "login_keep"):
        if k in payload:
            b[k] = str(payload.get(k) or "")[:200]
    if "fab_greeting" in payload:
        b["fab_greeting"] = str(payload.get("fab_greeting") or "")[:1500]
    if "fab_quick" in payload:
        q = payload.get("fab_quick")
        b["fab_quick"] = [str(x)[:200] for x in q if str(x).strip()][:50] if isinstance(q, list) else []
    if "fab_prompt" in payload:
        b["fab_prompt"] = str(payload.get("fab_prompt") or "")[:4000]
    if "fab_rules" in payload:
        b["fab_rules"] = str(payload.get("fab_rules") or "")[:8000]
    save_json(BRANDING_FILE, b)
    return {"ok": True, "name_text": b.get("name_text") or "", "name_size": b.get("name_size") or "",
            "name_color": b.get("name_color") or "", "name_font": b.get("name_font") or "",
            "name_accent_color": b.get("name_accent_color") or ""}

@app.post("/api/branding/login-image")
async def api_branding_login_image(payload: dict, request: Request, token: str = ""):
    """로그인 화면 왼쪽 판에 깔 사진 — 회사 건물처럼 우리 것을 올린다(지시).

    남의 사진을 갖다 쓰지 않는다. 올리는 사람이 권리를 아는 사진이라야
    한다 — 그래서 자동으로 받아 오지 않고 **올리는 자리**만 둔다.
    """
    _require_admin(token or _token_from(request))
    img = str(payload.get("image") or "")
    if img and not img.startswith("data:image/"):
        raise HTTPException(400, "이미지 파일만 등록할 수 있습니다")
    if len(img) > 8_000_000:   # base64 약 6MB — 사진이라 로고보다 넉넉히
        raise HTTPException(400, "이미지가 너무 큽니다 (6MB 이하로 올려주세요)")
    b = _load_branding()
    b["login_image"] = img
    save_json(BRANDING_FILE, b)
    return {"ok": True}


@app.post("/api/branding/login-logo")
async def api_branding_login_logo(payload: dict, request: Request, token: str = ""):
    """로그인 화면 로고 — 메뉴 로고와 **따로** 둔다(지시)."""
    _require_admin(token or _token_from(request))
    logo = str(payload.get("logo") or "")
    if logo and not logo.startswith("data:image/"):
        raise HTTPException(400, "이미지 파일만 등록할 수 있습니다")
    if len(logo) > 4_000_000:
        raise HTTPException(400, "이미지가 너무 큽니다 (3MB 이하로 올려주세요)")
    b = _load_branding()
    b["login_logo"] = logo
    save_json(BRANDING_FILE, b)
    return {"ok": True}


@app.post("/api/branding/logo")
async def api_branding_logo(payload: dict, request: Request, token: str = ""):
    _require_admin(token or _token_from(request))
    logo = str(payload.get("logo") or "")
    if logo and not logo.startswith("data:image/"):
        raise HTTPException(400, "이미지 파일만 등록할 수 있습니다")
    if len(logo) > 4_000_000:   # base64 약 3MB 상한
        raise HTTPException(400, "이미지가 너무 큽니다 (3MB 이하로 올려주세요)")
    b = _load_branding()
    b["logo"] = logo
    save_json(BRANDING_FILE, b)
    return {"ok": True, "logo": logo}

# ── TC/REQ 공유 메일 ── 어떤 섹션을 포함할지 체크로 선택(관리자), 발송은 로그인 사용자
_DEFAULT_SHARE_SUBJECT = "[ubiQuoss-TOP] {id} {title}"
_DEFAULT_REQ_SECTIONS = {"info": True, "desc": True, "impl": True, "scenario": False, "tc": True}
_DEFAULT_TC_SECTIONS = {"info": True, "purpose": True, "topo": True, "traffic": True, "steps": True, "issue": True, "history": True, "cycle": True}

@app.get("/api/share-config")
async def api_share_config_get(token: str = ""):
    u = _user_from_token(token)
    if not u:
        raise HTTPException(401, "로그인이 필요합니다")
    cfg = _load_mail_cfg()
    rs = cfg.get("share_sections_req") or cfg.get("share_sections")   # 구버전 호환
    if not isinstance(rs, dict):
        rs = dict(_DEFAULT_REQ_SECTIONS)
    ts = cfg.get("share_sections_tc")
    if not isinstance(ts, dict):
        ts = dict(_DEFAULT_TC_SECTIONS)
    _osub = cfg.get("share_subject") or _DEFAULT_SHARE_SUBJECT   # 구버전 공통값 → 폴백
    _oin = cfg.get("share_intro") or ""
    _oout = cfg.get("share_outro") or ""
    return {
        "req": {
            "subject": cfg.get("share_req_subject") or _osub,
            "sections": rs,
            "intro": cfg.get("share_req_intro") if cfg.get("share_req_intro") is not None else _oin,
            "outro": cfg.get("share_req_outro") if cfg.get("share_req_outro") is not None else _oout,
        },
        "tc": {
            "subject": cfg.get("share_tc_subject") or _osub,
            "sections": ts,
            "intro": cfg.get("share_tc_intro") if cfg.get("share_tc_intro") is not None else _oin,
            "outro": cfg.get("share_tc_outro") if cfg.get("share_tc_outro") is not None else _oout,
        },
        "app_url": cfg.get("app_url") or "",
        "mail_enabled": bool(cfg.get("enabled")),
        "default_subject": _DEFAULT_SHARE_SUBJECT,
        "default_req_sections": _DEFAULT_REQ_SECTIONS,
        "default_tc_sections": _DEFAULT_TC_SECTIONS,
    }

@app.post("/api/share-config")
async def api_share_config_save(payload: dict, token: str = ""):
    _require_admin(token)
    cfg = _load_mail_cfg()
    req = payload.get("req")
    if isinstance(req, dict):
        if req.get("subject") is not None: cfg["share_req_subject"] = str(req.get("subject"))
        if req.get("intro") is not None: cfg["share_req_intro"] = str(req.get("intro"))
        if req.get("outro") is not None: cfg["share_req_outro"] = str(req.get("outro"))
        if isinstance(req.get("sections"), dict):
            cfg["share_sections_req"] = {str(k): bool(v) for k, v in req["sections"].items()}
    tc = payload.get("tc")
    if isinstance(tc, dict):
        if tc.get("subject") is not None: cfg["share_tc_subject"] = str(tc.get("subject"))
        if tc.get("intro") is not None: cfg["share_tc_intro"] = str(tc.get("intro"))
        if tc.get("outro") is not None: cfg["share_tc_outro"] = str(tc.get("outro"))
        if isinstance(tc.get("sections"), dict):
            cfg["share_sections_tc"] = {str(k): bool(v) for k, v in tc["sections"].items()}
    _save_mail_cfg(cfg)
    return {"ok": True}

@app.post("/api/share-mail")
async def api_share_mail(payload: dict, token: str = ""):
    u = _user_from_token(token)
    if not u:
        raise HTTPException(401, "로그인이 필요합니다")
    to = payload.get("to") or []
    if isinstance(to, str):
        to = [to]
    to = [str(x).strip() for x in to if str(x).strip()]
    if not to:
        raise HTTPException(400, "받는 사람을 입력하세요")
    subject = str(payload.get("subject") or "[ubiQuoss-TOP] 공유")
    html = str(payload.get("html") or "")
    if not html:
        raise HTTPException(400, "공유할 내용이 비어 있습니다")
    if not _load_mail_cfg().get("enabled"):
        raise HTTPException(400, "메일 발송이 꺼져 있습니다 (시스템 → 메일 설정)")
    try:
        sent = _send_mail(to, subject, html, html=True)
    except Exception as e:
        raise HTTPException(400, f"발송 실패: {e}")
    return {"ok": True, "sent": sent}


@app.post("/api/mail/config")
async def api_mail_config_save(payload: dict, token: str = ""):
    _require_admin(token)
    cfg = _load_mail_cfg()
    for k in ("host", "username", "password", "from_addr", "from_name", "security", "app_url",
              "approval_subject", "approval_html", "cycle_subject", "cycle_html",
              "done_subject", "done_intro", "done_outro"):
        if payload.get(k) is not None:
            cfg[k] = str(payload.get(k))
    # Cycles 알림 스위치 셋과 실어 보낼 것
    for k in ("done_enabled", "done_to_assignee", "done_only_fail"):
        if payload.get(k) is not None:
            cfg[k] = bool(payload.get(k))
    if isinstance(payload.get("done_sections"), dict):
        cfg["done_sections"] = {str(a): bool(b) for a, b in payload["done_sections"].items()}
    if payload.get("port") is not None:
        try:
            cfg["port"] = int(payload.get("port"))
        except Exception:
            pass
    if payload.get("enabled") is not None:
        cfg["enabled"] = bool(payload.get("enabled"))
    if str(cfg.get("security") or "").lower() not in ("starttls", "ssl", "none"):
        cfg["security"] = "starttls"
    _save_mail_cfg(cfg)
    return {"ok": True, "config": cfg}

@app.post("/api/mail/test")
async def api_mail_test(payload: dict, token: str = ""):
    _require_admin(token)
    to = str(payload.get("to", "")).strip()
    if not to:
        raise HTTPException(400, "받는 사람(테스트 수신 주소)을 입력하세요")
    try:
        sent = _send_mail(to, "[ubiQuoss-TOP] 메일 설정 테스트",
                          "ubiQuoss-TOP 메일(SMTP) 설정 테스트입니다.\n이 메일이 보이면 SMTP 발송이 정상 동작하는 것입니다.")
    except Exception as e:
        raise HTTPException(400, f"발송 실패: {e}")
    return {"ok": True, "sent": sent}

# ───────────────────────────────────────────
# 회원가입(관리자 승인) + @멘션 알림
# ───────────────────────────────────────────
@app.post("/api/signup")
async def api_signup(payload: dict):
    data = _users_load_sync()
    uname = str(payload.get("username", "")).strip()
    name = str(payload.get("name", "")).strip() or uname
    email = str(payload.get("email", "")).strip()
    company = str(payload.get("company", "")).strip()   # 회사
    dept = str(payload.get("dept", "")).strip()   # 소속담당 (예: 품질보증담당)
    team = str(payload.get("team", "")).strip()   # 소속팀 (예: QA팀)
    position = str(payload.get("position", "")).strip()   # 직책
    duty = str(payload.get("duty", "")).strip()   # 보직
    pw = payload.get("password") or ""
    if not uname:
        raise HTTPException(400, "아이디를 입력하세요")
    if not pw:
        raise HTTPException(400, "비밀번호를 입력하세요")
    if not company or not dept or not team or not position:
        raise HTTPException(400, "회사·소속담당·소속팀·직책을 모두 선택하세요")
    if not email or not _valid_email(email):
        raise HTTPException(400, "올바른 이메일을 입력하세요")
    if not _allowed_email_domain(email):
        raise HTTPException(400, "@" + ALLOWED_EMAIL_DOMAIN + " 이메일만 가입할 수 있습니다")
    if any(u.get("username") == uname for u in data["users"]):
        raise HTTPException(400, "이미 존재하는 아이디입니다")
    salt = _secrets.token_hex(8)
    nu = {"id": uname, "username": uname, "name": name, "role": "팀원", "email": email,
          "company": company, "position": position, "duty": duty, "dept": dept, "team": team,
          "salt": salt, "password": _hash_pw(pw, salt), "active": False, "pending": True,
          "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    data["users"].append(nu)
    _users_save_sync(data)
    try:
        admins = [u.get("email") for u in data["users"] if u.get("role") == "관리자" and u.get("email")]
        if admins and _load_mail_cfg().get("enabled"):
            _send_mail(admins, "[ubiQuoss-TOP] 신규 가입 승인 요청",
                       f"신규 가입 신청이 있습니다.\n\n아이디: {uname}\n회사: {company}\n소속담당: {dept}\n소속팀: {team}\n직책: {position}\n이름: {name}\n이메일: {email}\n\n[시스템 → 사용자 관리]에서 승인해주세요.")
    except Exception:
        pass
    return {"ok": True}

# ── 조직 설정: 회사 ▸ 소속담당 ▸ 소속팀 (계층) + 직책·보직(평면) ──
ORG_FILE = DATA_DIR / "config" / "org_options.json"
_ORG_DEFAULT = {
    "companies": [
        {"name": "유비쿼스", "depts": [
            {"name": "품질보증담당", "teams": ["QA팀", "검증팀"]},
            {"name": "개발담당", "teams": ["SW개발팀", "HW개발팀", "시스템개발팀"]},
            {"name": "기술지원담당", "teams": ["기술지원팀"]},
        ]},
        {"name": "유비쿼스솔루션", "depts": [
            {"name": "영업담당", "teams": ["영업1팀", "영업2팀"]},
            {"name": "경영지원담당", "teams": ["경영지원팀"]},
        ]},
    ],
    "position": ["사원", "주임", "대리", "과장", "차장", "부장", "수석", "책임", "선임", "이사"],
    "duty": ["팀원", "파트장", "팀장", "그룹장", "본부장", "PM", "PL", "해당없음"],
}

def _org_clean_list(v):
    out = []
    if isinstance(v, list):
        for x in v:
            s = str(x).strip()
            if s and s not in out:
                out.append(s)
    return out

def _org_clean_companies(v):
    out = []; seen = set()
    if isinstance(v, list):
        for c in v:
            if not isinstance(c, dict):
                continue
            nm = str(c.get("name", "")).strip()
            if not nm or nm in seen:
                continue
            seen.add(nm)
            depts = []; dseen = set()
            for d in (c.get("depts") or []):
                if not isinstance(d, dict):
                    continue
                dn = str(d.get("name", "")).strip()
                if not dn or dn in dseen:
                    continue
                dseen.add(dn)
                depts.append({"name": dn, "teams": _org_clean_list(d.get("teams"))})
            out.append({"name": nm, "depts": depts})
    return out

def _load_org() -> dict:
    import copy as _copy
    if ORG_FILE.exists():
        try:
            d = json.loads(ORG_FILE.read_text(encoding="utf-8"))
            if isinstance(d, dict) and isinstance(d.get("companies"), list):
                return {"companies": _org_clean_companies(d.get("companies")),
                        "position": _org_clean_list(d.get("position")) or list(_ORG_DEFAULT["position"]),
                        "duty": _org_clean_list(d.get("duty")) or list(_ORG_DEFAULT["duty"])}
            # 구(舊) 평면 구조 → 계층 마이그레이션(각 회사에 모든 담당, 각 담당에 모든 팀)
            if isinstance(d, dict) and (d.get("company") or d.get("dept") or d.get("team")):
                comps = _org_clean_list(d.get("company")) or [_ORG_DEFAULT["companies"][0]["name"]]
                depts = _org_clean_list(d.get("dept")); teams = _org_clean_list(d.get("team"))
                tree = [{"name": c, "depts": [{"name": dn, "teams": list(teams)} for dn in depts]} for c in comps]
                return {"companies": tree,
                        "position": _org_clean_list(d.get("position")) or list(_ORG_DEFAULT["position"]),
                        "duty": _org_clean_list(d.get("duty")) or list(_ORG_DEFAULT["duty"])}
        except Exception:
            pass
    return _copy.deepcopy(_ORG_DEFAULT)

@app.get("/api/org-options")
async def org_options_get():
    org = _load_org()
    return {"ok": True, "companies": org["companies"], "position": org["position"],
            "duty": org["duty"], "company": [c["name"] for c in org["companies"]]}

@app.post("/api/org-options")
async def org_options_save(payload: dict, token: str = ""):
    _require_admin(token)
    cur = _load_org()
    if isinstance(payload.get("companies"), list):
        cur["companies"] = _org_clean_companies(payload["companies"])
    if isinstance(payload.get("position"), list):
        cur["position"] = _org_clean_list(payload["position"])
    if isinstance(payload.get("duty"), list):
        cur["duty"] = _org_clean_list(payload["duty"])
    ORG_FILE.write_text(json.dumps(cur, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "companies": cur["companies"], "position": cur["position"],
            "duty": cur["duty"], "company": [c["name"] for c in cur["companies"]]}

FEEDBACK_FILE = DATA_DIR / "state" / "ai_feedback.json"

_ITEMS_STORE_KV_MAP = {}   # str(path) → kv key
def _load_items_store(path):
    """path 가 KV 로 이전된 파일이면 DB(app_kv) 캐시 반환. 아니면 기존 파일 로드."""
    _key = _ITEMS_STORE_KV_MAP.get(str(path))
    if _key:
        d = _kv_load_sync(_key, {"items": []})
        if isinstance(d, dict) and isinstance(d.get("items"), list):
            return d
        return {"items": []}
    try:
        if path.exists():
            d = load_json(path)
            if isinstance(d, dict) and isinstance(d.get("items"), list):
                return d
    except Exception:
        pass
    return {"items": []}

def _save_items_store(path, data):
    """path 가 KV 로 이전된 파일이면 DB(app_kv) 저장. 아니면 파일 저장 (레거시)."""
    _key = _ITEMS_STORE_KV_MAP.get(str(path))
    if _key:
        _kv_save_sync(_key, data)
        return
    save_json(path, data)

def _user_of(token):
    s = SESSIONS.get(token or "")
    if s:
        return s.get("name") or s.get("username") or ""
    return ""


NOTIF_FILE = DATA_DIR / "state" / "notifications.json"

def _load_notifs() -> dict:
    try:
        if NOTIF_FILE.exists():
            d = load_json(NOTIF_FILE)
            if isinstance(d, dict) and isinstance(d.get("items"), list):
                return d
    except Exception:
        pass
    return {"items": [], "seq": 0}

def _save_notifs(d: dict):
    NOTIF_FILE.parent.mkdir(parents=True, exist_ok=True)
    save_json(NOTIF_FILE, d)

def _add_notif(to_user: str, from_user: str, from_name: str, text: str, link: str = ""):
    d = _load_notifs()
    d["seq"] = int(d.get("seq", 0)) + 1
    item = {"id": "n" + str(d["seq"]), "to": to_user, "from": from_user, "from_name": from_name,
            "text": text, "link": link, "read": False,
            "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    d["items"].append(item)
    if len(d["items"]) > 500:
        d["items"] = d["items"][-500:]
    _save_notifs(d)
    return item

@app.get("/api/users/mentionable")
async def api_users_mentionable(token: str = ""):
    u = _user_from_token(token)
    if not u:
        raise HTTPException(401, "로그인이 필요합니다")
    # 역할(관리자·담당·팀장)도 함께 — 결과 메일 조직도가 배지로 세운다.
    # 누구를 참조로 넣을지는 자리를 봐야 정한다.
    return {"users": [{"username": x.get("username"), "name": x.get("name"), "email": x.get("email", ""),
                       "dept": x.get("dept", ""), "team": x.get("team", ""), "role": x.get("role", "")}
                      for x in _users_load_sync()["users"] if x.get("active", True)]}

@app.get("/api/notifications")
async def api_notifs_get(token: str = ""):
    u = _user_from_token(token)
    if not u:
        raise HTTPException(401, "로그인이 필요합니다")
    me = u.get("username")
    items = [n for n in _load_notifs()["items"] if n.get("to") == me]
    items = list(reversed(items))[:100]
    unread = sum(1 for n in items if not n.get("read"))
    return {"items": items, "unread": unread}

@app.post("/api/notifications/read")
async def api_notifs_read(payload: dict, token: str = ""):
    u = _user_from_token(token)
    if not u:
        raise HTTPException(401, "로그인이 필요합니다")
    me = u.get("username")
    nid = payload.get("id")
    d = _load_notifs()
    for n in d["items"]:
        if n.get("to") == me and (nid is None or n.get("id") == nid):
            n["read"] = True
    _save_notifs(d)
    return {"ok": True}

@app.post("/api/mention")
async def api_mention(payload: dict, token: str = ""):
    u = _user_from_token(token)
    if not u:
        raise HTTPException(401, "로그인이 필요합니다")
    mentions = payload.get("mentions") or []
    if isinstance(mentions, str):
        mentions = [mentions]
    text = str(payload.get("text", "")).strip()
    link = str(payload.get("link", "")).strip()
    ctx = str(payload.get("context", "")).strip()
    by_name = {x.get("username"): x for x in _users_load_sync()["users"]}
    me = u.get("username"); my_name = u.get("name") or me
    mail_cfg = _load_mail_cfg()
    notified = []
    for mname in mentions:
        tu = by_name.get(mname)
        if not tu or mname == me:
            continue
        body_text = my_name + "님이 회원님을 멘션했습니다" + ((" · " + ctx) if ctx else "") + ((": " + text) if text else "")
        _add_notif(mname, me, my_name, body_text, link)
        notified.append(mname)
        try:
            if mail_cfg.get("enabled") and tu.get("email"):
                _send_mail(tu["email"], "[ubiQuoss-TOP] " + my_name + "님의 멘션",
                           body_text + (("\n\n바로가기: " + link) if link else ""))
        except Exception:
            pass
    return {"ok": True, "notified": notified}

# ───────────────────────────────────────────
# 라우터 - REQ/TC 파일별 관리
# ───────────────────────────────────────────
REQ_DIR      = DATA_DIR / "req"
TC_DIR       = DATA_DIR / "tc"
CYCLE_DIR    = DATA_DIR / "cycle"
TRASH_DIR    = DATA_DIR / "trash"   # REQ/TC 소프트 삭제(휴지통) — 복원 가능
FOLDERS_FILE = DATA_DIR / "state" / "folders.json"

# 서버 시작 시 디렉토리 초기화
for _d in [REQ_DIR, TC_DIR, CYCLE_DIR, TRASH_DIR]:
    _d.mkdir(exist_ok=True)
if not FOLDERS_FILE.exists():
    save_json(FOLDERS_FILE, {"folders": []})



# ───────────────────────────────────────────
# 요구사항 분류 (3단 고정: 대분류 > 중분류 > 소분류)
#
# 옛 폴더 트리는 깊이 제한이 없어 프로토콜·계층·기능이 한 경로에 섞였다
# (IPV4_L2 > VLAN). 그래서 같은 기능이 여러 가지에 중복 등록됐다.
# 상한을 두되 3단까지는 허용한다. 이 규칙을 서버에서 강제한다 —
# DB 제약으로는 재귀 깊이를 막을 수 없다.
# ───────────────────────────────────────────
# 원래 폴더 구조에 이미 4단짜리가 있었다
# (U-REQ-PA1T-TC > 1. 부품 변경 > 1-1. 메인 메모리/WDT TC > 1-1-1. 부팅 1000회).
# 3단으로 묶어두니 E43·E57·LG 처럼 이미 3단을 쓴 가지가 어디로도 못 갔다.

_IMG_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"}


# ════════════ tc_req — routes/tc_req.py 로 옮겼다(2026-09-28) ════════════
# 이 파일 10곳에 흩어져 있던 것을 한 파일로 모았다. 남은 코드가 그쪽 이름을
# 쓰면 아래에서 받아 둔다(부를 때 찾으므로 여기서 한 번이면 된다). 주소는 안 바뀐다.
core.bind(
    DATA_DIR=DATA_DIR,
    CUSTOM_FIELDS_FILE=CUSTOM_FIELDS_FILE,
    load_json=load_json,
    save_json=save_json,
    broadcast=broadcast,
    kv_load_sync=_kv_load_sync,
    kv_save_sync=_kv_save_sync,
    user_from_token=_user_from_token,
    require_admin=_require_admin,
    token_from=_token_from,
    user_of=_user_of,
    REQ_DIR=REQ_DIR,
    TC_DIR=TC_DIR,
    CYCLE_DIR=CYCLE_DIR,
    TRASH_DIR=TRASH_DIR,
    FOLDERS_FILE=FOLDERS_FILE,
    IMG_EXT=_IMG_EXT,
)
from routes import tc_req as _tc_req_routes  # noqa: E402
app.include_router(_tc_req_routes.router)
_req_chain_resync = _tc_req_routes._req_chain_resync
REQ_IMG_DIR = _tc_req_routes.REQ_IMG_DIR
_next_tc_id = _tc_req_routes._next_tc_id
_tc_id_norm = _tc_req_routes._tc_id_norm
TC_SNAP_DIR = _tc_req_routes.TC_SNAP_DIR
TC_RUNHIST_DIR = _tc_req_routes.TC_RUNHIST_DIR
_TC_SCHEMA = _tc_req_routes._TC_SCHEMA
_cleanup_stale_req_tc_refs = _tc_req_routes._cleanup_stale_req_tc_refs
_cleanup_duplicate_reqs = _tc_req_routes._cleanup_duplicate_reqs




def _me(request) -> dict:
    """미들웨어가 넣어둔 세션. 없으면 401 (미들웨어가 이미 막지만 방어적으로)."""
    s = getattr(request.state, "user", None)
    if not s:
        raise HTTPException(401, "로그인이 필요합니다")
    return s


# ════════════ 장비 · 계측기 — routes/devices.py 로 옮겼다(2026-09-28, 분리 3호) ════════════
#
# 이 파일 일곱 곳(장비 PG·옛 카탈로그·랙·랙뷰·STC·N2X·옛 장비)에 흩어져 있던
# 것을 한 파일로 모았다. 여기 남은 CLI 실행·SNMP·사이클 쪽이 그쪽 이름을 쓰면
# 아래에서 받아 둔다. 주소는 하나도 안 바뀐다.
core.bind(
    DATA_DIR=DATA_DIR,
    DEVICES_FILE=DEVICES_FILE,
    load_json=load_json,
    save_json=save_json,
    broadcast=broadcast,
    check_tcp=check_tcp,
    check_ssh=check_ssh,
    check_telnet=check_telnet,
    ssh_exec=ssh_exec,
    tcl_exec=tcl_exec,
    kv_load_sync=_kv_load_sync,
    kv_save_sync=_kv_save_sync,
    who=_who,
    me=_me,
)
from routes import devices as _dev_routes  # noqa: E402
app.include_router(_dev_routes.router)
# 남은 코드가 쓰는 이름 — 부를 때 찾으므로 여기서 한 번 받아 두면 된다
_acc_of = _dev_routes._acc_of
RACKS_FILE = _dev_routes.RACKS_FILE
N2X_RELAY_ONLY = _dev_routes.N2X_RELAY_ONLY
_n2x_send = _dev_routes._n2x_send



# 파일 단위 mtime 기반 캐시 — 변경된 파일만 다시 읽고 나머지는 in-memory 값 재사용.
# 이렇게 하면 요청마다 88개 파일을 다 파싱하지 않아 API 응답 시간이 크게 줄어듦.

def _cached_load(cache: dict, path: Path, meta_keys: tuple = None, meta_extra_fn=None):
    """파일 하나를 캐시에서 가져오거나 mtime 이 바뀌었으면 다시 읽음."""
    key = str(path)
    try:
        mt = path.stat().st_mtime
    except Exception:
        return None
    hit = cache.get(key)
    if hit and hit.get("mtime") == mt:
        return hit
    try:
        d = load_json(path)
    except Exception:
        return None
    entry = {"mtime": mt, "full": d}
    if meta_keys:
        meta = {k: d.get(k) for k in meta_keys if k in d}
        if meta_extra_fn:
            try: meta_extra_fn(meta, d)
            except Exception: pass
        entry["meta"] = meta
    cache[key] = entry
    return entry

TC_SNAP_DIR.mkdir(parents=True, exist_ok=True)

TC_RUNHIST_DIR.mkdir(parents=True, exist_ok=True)




@app.get("/api/help")
async def get_help():
    if HELP_FILE.exists():
        return load_json(HELP_FILE)
    return {"sections": []}

@app.post("/api/help")
async def save_help(data: dict):
    HELP_FILE.parent.mkdir(parents=True, exist_ok=True)
    save_json(HELP_FILE, data)
    return {"ok": True}


# ══════════════ 도움말(앱 안에서 고친다) · 버전 · 라이선스 (2026-09-29, 지시) ══════════════
#
# 왼쪽 메뉴 SYSTEM 바로 위 「도움말」. 누구나 읽고, **관리자와 도움말 편집자**만 고친다.
# 처음 뜰 때 docs/features/*.md(기능별 문서)를 씨앗으로 들이고, 그 뒤로는 DB(app_kv) 의 것이 정본이다.
# 개발자용 절(동작 확인·관련 API)은 씨앗에서 뺀다 — 사용자가 읽는 글이 아니다.
HELP_SEED_DIR = BASE_DIR / "docs" / "features"
HELP_SEED_ORDER = ["wiki", "req-coverage", "cycles", "devices", "jira-defects", "ai", "settings"]
HELP_SPACE = "__help__"          # 위키 표 안의 도움말 공간 — 일반 위키 목록에는 안 보인다
_HELP_DROP_SECTIONS = ("## 동작 확인", "## 관련 API")


def _help_md_from_seed(text: str) -> tuple[str, str]:
    """씨앗 파일 → (제목, 본문 마크다운). 개발자용 절을 걷고, 문서끼리 링크(x.md)는 앱 안 주소로."""
    lines = text.split("\n")
    title = ""
    if lines and lines[0].startswith("# "):
        title = lines[0][2:].strip()
        lines = lines[1:]
    out, skipping = [], False
    for ln in lines:
        if ln.startswith("## "):
            skipping = ln.strip() in _HELP_DROP_SECTIONS
        if not skipping:
            out.append(ln)
    body = "\n".join(out).strip() + "\n"
    body = re.sub(r"\]\(([a-z0-9-]+)\.md\)", r"](?p=help&doc=help-\1)", body)
    body = re.sub(r"\]\(\.\./[^)]+\)", "](#)", body)
    return title, body


# ── 마크다운 → 블록노트 블록 ─────────────────────────────────────
# 도움말은 위키와 같은 편집기(BlockNote)로 읽고 고친다(지시: 마크다운 말고 블록노트).
# 씨앗 파일은 마크다운이라 서버가 블록으로 바꿔 심는다. 제목·문단·글머리·번호·코드·굵게·코드·링크만
# 다룬다 — 기능별 문서가 쓰는 문법이 그것뿐이다. 편집기가 저장한 실제 JSON 과 같은 꼴로 만든다.
_BN_PROPS = {"backgroundColor": "default", "textColor": "default", "textAlignment": "left"}


def _bn_inline(text: str) -> list:
    """**굵게** · `코드` · [글](주소) 를 인라인 조각으로."""
    out = []
    pat = re.compile(r"(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))")
    pos = 0
    for mm in pat.finditer(text):
        if mm.start() > pos:
            out.append({"type": "text", "text": text[pos:mm.start()], "styles": {}})
        tok = mm.group(0)
        if tok.startswith("**"):
            out.append({"type": "text", "text": tok[2:-2], "styles": {"bold": True}})
        elif tok.startswith("`"):
            out.append({"type": "text", "text": tok[1:-1], "styles": {"code": True}})
        else:
            lm = re.match(r"\[([^\]]+)\]\(([^)]+)\)", tok)
            label, href = lm.group(1), lm.group(2)
            if href == "#":
                out.append({"type": "text", "text": label, "styles": {}})
            else:
                out.append({"type": "link", "href": href, "content": [{"type": "text", "text": label, "styles": {}}]})
        pos = mm.end()
    if pos < len(text):
        out.append({"type": "text", "text": text[pos:], "styles": {}})
    return out or [{"type": "text", "text": "", "styles": {}}]


def _bn_block(btype: str, text: str, **props) -> dict:
    return {"id": str(_uuid4()), "type": btype, "props": {**_BN_PROPS, **props},
            "content": _bn_inline(text), "children": []}


def _md_to_blocks(md: str) -> list:
    blocks: list = []
    stack: list = []            # 글머리 중첩 — (들여쓰기, 블록)
    para: list = []
    code: list | None = None
    code_lang = ""

    def flush_para():
        nonlocal para
        if para:
            blocks.append(_bn_block("paragraph", " ".join(x.strip() for x in para)))
            para = []

    def close_lists():
        stack.clear()

    for raw in md.split("\n"):
        ln = raw.rstrip()
        if code is not None:
            if ln.strip().startswith("```"):
                blocks.append({"id": str(_uuid4()), "type": "codeBlock", "props": {"language": code_lang or "text"},
                               "content": [{"type": "text", "text": "\n".join(code), "styles": {}}], "children": []})
                code = None
            else:
                code.append(raw)
            continue
        if ln.strip().startswith("```"):
            flush_para(); close_lists()
            code, code_lang = [], ln.strip()[3:].strip()
            continue
        if not ln.strip():
            flush_para(); close_lists()
            continue
        hm = re.match(r"^(#{1,6})\s+(.*)$", ln)
        if hm:
            flush_para(); close_lists()
            lvl = min(3, len(hm.group(1)))
            blocks.append(_bn_block("heading", hm.group(2).strip(), level=lvl, isToggleable=False))
            continue
        lm = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", ln)
        if lm:
            flush_para()
            indent = len(lm.group(1).replace("\t", "  "))
            btype = "numberedListItem" if lm.group(2)[0].isdigit() else "bulletListItem"
            blk = _bn_block(btype, lm.group(3).strip())
            while stack and stack[-1][0] >= indent:
                stack.pop()
            (stack[-1][1]["children"] if stack else blocks).append(blk)
            stack.append((indent, blk))
            continue
        if stack and ln.startswith("  "):
            # 글머리의 이어지는 줄 — 앞 항목에 붙인다
            last = stack[-1][1]
            last["content"] = last["content"] + [{"type": "text", "text": " ", "styles": {}}] + _bn_inline(ln.strip())
            continue
        if ln.lstrip().startswith("|"):
            # 표는 이 변환기가 안 다룬다 — 줄을 문단으로 남긴다(잃는 글자는 없다)
            flush_para(); close_lists()
            blocks.append(_bn_block("paragraph", re.sub(r"\s*\|\s*", " · ", ln.strip()).strip(" ·")))
            continue
        if ln.lstrip().startswith(">"):
            flush_para(); close_lists()
            blocks.append(_bn_block("paragraph", ln.lstrip()[1:].strip()))
            continue
        close_lists()
        para.append(ln)
    flush_para()
    return blocks


def _bn_plain(blocks: list) -> str:
    out = []
    def walk(v):
        if isinstance(v, dict):
            t = v.get("text")
            if isinstance(t, str):
                out.append(t)
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
    walk(blocks)
    return " ".join(out)[:200000]


def _help_seed_docs() -> list:
    docs = []
    for i, slug in enumerate(HELP_SEED_ORDER):
        fp = HELP_SEED_DIR / f"{slug}.md"
        if not fp.exists():
            continue
        title, body = _help_md_from_seed(fp.read_text(encoding="utf-8"))
        docs.append({"id": f"help-{slug}", "slug": slug, "title": title or slug, "ord": i, "md": body})
    return docs


async def _help_write_seed(c, d: dict) -> None:
    blocks = _md_to_blocks(d["md"])
    await c.execute(
        "INSERT INTO wiki_page (id, project, parent_id, title, body, plain, ord, created_by, updated_by) "
        "VALUES ($1,$2,NULL,$3,$4::jsonb,$5,$6,$7,$7) "
        "ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, body=EXCLUDED.body, plain=EXCLUDED.plain, "
        "updated_by=EXCLUDED.updated_by, updated_at=now()",
        d["id"], HELP_SPACE, d["title"], json.dumps(blocks, ensure_ascii=False), _bn_plain(blocks), d["ord"], "seed",
    )


async def _help_seed_if_empty() -> int:
    async with db.pool().acquire() as c:
        n = await c.fetchval("SELECT count(*) FROM wiki_page WHERE project=$1", HELP_SPACE)
        if n:
            return 0
        docs = _help_seed_docs()
        for d in docs:
            await _help_write_seed(c, d)
        return len(docs)


# 계정의 역할 이름 → 권한 격자의 열쇠 (web/src/lib/perm.ts 의 ROLE_KEY_OF 와 같은 표)
_PERM_ROLE_KEY = {"관리자": "admin", "admin": "admin", "팀장": "lead", "담당": "owner", "팀원": "member"}


def _perm_has(username: str, module: str, right: str) -> bool:
    """**서버 쪽** 권한 판단 — 페이지별 접근 권한 격자를 그대로 읽는다.

    체계가 꺼져 있으면(기본) 화면은 누구나 다 보이지만, 여기서는 **관리자만**
    참이다 — 도움말처럼 「고치면 모두에게 보이는 것」 은 꺼진 채로 아무나
    고치게 둘 수 없다. 관리자는 늘 참이다."""
    u = _find_user(username) or {}
    role = str(u.get("role") or "")
    rk = _PERM_ROLE_KEY.get(role, role)
    if rk == "admin":
        return True
    d = _perm_doc()
    if not d.get("enabled"):
        return False
    rights = ((d.get("grid") or {}).get(module) or {}).get(rk) or []
    return right in rights


def _help_can_edit() -> bool:
    """관리자이거나, 페이지별 접근 권한에서 「도움말 · 고치기」 를 받은 역할(지시:
    편집자 목록은 걷고 권한 화면 한 곳에서)."""
    sess = _CUR_SESSION.get()
    who = str((sess or {}).get("username") or "")
    return bool(who) and _perm_has(who, "help", "edit")


def _help_require_editor() -> str:
    if not _help_can_edit():
        raise HTTPException(403, "도움말을 고칠 권한이 없습니다 — SETUP › 페이지별 접근 권한에서 「도움말 · 고치기」 를 줍니다")
    return _who()


@app.get("/api/help/access")
async def help_access():
    """도움말을 고칠 수 있나 — 화면이 편집 단추를 낼지 정한다. 읽기는 누구나."""
    return {"can_edit": _help_can_edit(), "space": HELP_SPACE}


@app.get("/api/help/seeds")
async def help_seeds():
    """씨앗이 있는 도움말(되돌릴 수 있는 것) 목록 — SETUP 의 「처음 글로」 단추가 읽는다."""
    return {"seeds": [{"id": d["id"], "title": d["title"]} for d in _help_seed_docs()]}


@app.post("/api/help/reset/{slug}")
async def help_reset(slug: str):
    """그 편을 씨앗(docs/features)으로 되돌린다 — 고치다 망쳤을 때. 지난 판(wiki_rev)은 위키가 남긴다."""
    who = _help_require_editor()
    d = next((x for x in _help_seed_docs() if x["slug"] == slug or x["id"] == slug), None)
    if not d:
        raise HTTPException(404, "그 도움말은 씨앗이 없습니다(앱에서 만든 것)")
    async with db.pool().acquire() as c:
        old = await c.fetchrow("SELECT title, body FROM wiki_page WHERE id=$1", d["id"])
        if old:
            await c.execute("INSERT INTO wiki_rev (page_id, title, body, who) VALUES ($1,$2,$3::jsonb,$4)",
                            d["id"], old["title"], old["body"] if isinstance(old["body"], str) else json.dumps(old["body"], ensure_ascii=False), who)
        await _help_write_seed(c, d)
    try: asyncio.create_task(broadcast({"type": "wiki_updated", "id": d["id"], "user": who}))
    except Exception: pass
    return {"ok": True, "id": d["id"]}


def _about_version() -> dict:
    """버전·판 정보 — VERSION 파일(사람이 올린다), 빌드 때 박은 커밋(UTOP_GIT_SHA)·시각(BUILD_TIME)."""
    ver = ""
    try: ver = (BASE_DIR / "VERSION").read_text(encoding="utf-8").strip()
    except Exception: pass
    built = ""
    try: built = (BASE_DIR / "BUILD_TIME").read_text(encoding="utf-8").strip()
    except Exception: pass
    return {"version": ver, "git_sha": (os.environ.get("UTOP_GIT_SHA") or "").strip()[:12], "built_at": built}


def _license_doc() -> dict:
    """등록된 라이선스 — 파일에서 읽은 칸 + 등록 기록 + 상태(남은 날수).

    파일을 등록하고 상태를 본다(지시). 손으로 적는 칸은 없다 — 파일이 서명돼
    있어 서버가 확인한 값만 보인다. status 는 licensing.status_of 참고."""
    d = _kv_load_sync("license", None)
    d = d if isinstance(d, dict) else {}
    out = {k: str(d.get(k) or "") for k in (*_licensing.FIELDS, "fp", "registered_at", "registered_by")}
    out.update(_licensing.status_of(out))
    return out


@app.get("/api/about")
async def api_about():
    """왼쪽 메뉴 도움말 위에 서는 것 — 버전과 라이선스 기간."""
    sess = _CUR_SESSION.get() or {}
    u = _find_user(str(sess.get("username") or "")) or {}
    return {**_about_version(), "license": _license_doc(), "can_manage": u.get("role") == "관리자"}


@app.post("/api/license/file")
async def api_license_file(payload: dict, token: str = ""):
    """라이선스 **파일 등록**(관리자) — 글(text)로 받아 서명을 확인하고 저장한다.

    틀린 파일은 400 과 까닭. 새 파일은 앞 것을 갈아 끼운다(하나만 산다)."""
    u = _require_admin(token)
    text = str((payload or {}).get("text") or "")
    if len(text) > 20000:
        raise HTTPException(400, "라이선스 파일이 너무 큽니다")
    try:
        lic = _licensing.parse(text)
    except _licensing.LicenseError as e:
        raise HTTPException(400, str(e))
    lic["registered_at"] = datetime.now().isoformat(timespec="seconds")
    lic["registered_by"] = str(u.get("username") or "")
    lic["text"] = text.strip()
    _kv_save_sync("license", lic)
    return {"ok": True, "license": _license_doc()}


@app.post("/api/license/clear")
async def api_license_clear(token: str = ""):
    """등록 해제(관리자) — 미등록 상태로 돌아간다."""
    _require_admin(token)
    _kv_save_sync("license", {})
    return {"ok": True, "license": _license_doc()}




import time as _t

# netmiko가 접속 시 자동으로 보내는 명령들을 끔 — 'terminal width 511'(미지원 % Invalid input) + 'terminal length 0'(disable_paging, _force_enable에서 1회만 보내도록 중복 제거 + 2초 대기 제거)
try:
    from netmiko.base_connection import BaseConnection as _NMBC
    _NMBC.set_terminal_width = lambda self, *a, **k: ""
    _NMBC.disable_paging = lambda self, *a, **k: ""
    # 접속 지연의 핵심: netmiko silence 대기(last_read 기본 2초)를 0.3초로 — find_prompt·초기 banner 읽기·session 준비가 모두 빨라짐
    _orig_rct = _NMBC.read_channel_timing
    def _fast_rct(self, last_read=0.3, read_timeout=120.0, **k):
        return _orig_rct(self, last_read=last_read, read_timeout=read_timeout, **k)
    _NMBC.read_channel_timing = _fast_rct
    # telnet_login: netmiko가 fast_cli면 delay_factor를 강제로 1로 되돌려 time.sleep(1)×여러번(≈2.5초+) → 최초 접속 지연의 주범.
    # 동일 로직을 작은 고정 지연(0.15초)으로 교체 → 텔넷 로그인 대폭 단축.
    import re as _nmr
    try:
        pass
    except Exception:
        pass
    def _fast_telnet_login(self, pri_prompt_terminator=r"#\s*$", alt_prompt_terminator=r">\s*$",
                           username_pattern=r"(?:user:|username|login|user name)", pwd_pattern=r"assword",
                           delay_factor=1.0, max_loops=20):
        # 고정 sleep/빈 RETURN(race) 대신 '실제 프롬프트가 올 때까지' 기다림 → 빠르면서 안정적(Login incorrect 방지)
        _msg = ""
        try:
            _msg += self.read_until_pattern(pattern=username_pattern, read_timeout=8, re_flags=_nmr.I)
            self.write_channel(self.username + "\r")
        except Exception:
            pass
        try:
            _msg += self.read_until_pattern(pattern=pwd_pattern, read_timeout=8, re_flags=_nmr.I)
            self.write_channel(str(self.password) + "\r")
        except Exception:
            pass
        try:
            _msg += self.read_until_pattern(pattern=r"[>#]\s*$", read_timeout=8, re_flags=_nmr.M)
        except Exception:
            pass
        return _msg
    _NMBC.telnet_login = _fast_telnet_login
    try:
        from netmiko.cisco_base_connection import CiscoBaseConnection as _NMCisco
        _NMCisco.telnet_login = _fast_telnet_login   # cisco_ios_telnet 은 여기서 override 하므로 꼭 패치해야 함
    except Exception:
        pass
except Exception:
    pass


# ── 라이브 스트리밍: SessionLog.write() 를 monkey-patch 해서 netmiko 가 read 한 데이터를
#    SessionLog 에 기록하는 순간 그대로 WebSocket 으로 push. netmiko 는 read_channel 결과를
#    session_log.write(str) 로 즉시 기록하므로, write 훅이 send_command 내부에서 실시간으로
#    호출됨 → 폴러/flush 없이 즉각 스트리밍.
_MAIN_LOOP = None   # startup 훅에서 asyncio.get_running_loop() 로 잡아둠 (워커 스레드용)



# ───────────────────────────────────────────
# 플랜 하나의 결과 메일 — 요약 카드의 「결과 메일 발송」 이 부른다.
#
# rollup/mail(폴더 단위)과 다른 물건이다: 이건 **한 플랜**의 결과다.
# 폴더 레일이 없어지면서(승인) 플랜 화면의 발송 단위도 플랜이 됐다.
# rollup/mail 은 인증도 enabled 체크도 없는데, 새 길은 share-mail 을
# 본받아 둘 다 한다 — 무인증 발송 구멍을 새로 파지 않는다.
# ───────────────────────────────────────────
_MAIL_BAD_TAG = __import__("re").compile(
    r"<\s*/?\s*(script|iframe|object|embed|form|link|meta|style|base)\b[^>]*>",
    __import__("re").I,
)
_MAIL_BAD_ATTR = __import__("re").compile(r"\son\w+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", __import__("re").I)
_MAIL_BAD_URL = __import__("re").compile(r"(href|src)\s*=\s*([\"']?)\s*javascript:", __import__("re").I)






# ── 자연어로 **새 시험 만들기** ──────────────────────────────
#
# 있는 시험을 찾아 주는 것이 아니라, 있는 것을 **참고해서** 새 시험을
# 짜고 돌리고 결과를 알려 주는 것이 목적이다.
#
# 다만 1차는 **조회 명령만** 짓게 한다. 설정을 바꾸는 명령을 AI 가 지어내
# 장비로 보내면 되돌릴 수가 없다. 조회는 틀려도 「출력이 없다」 로 끝난다.

# 이 랩에서 실제로 통한 조회 명령의 머리말. 여기 없는 것은 안 내보낸다.
_READ_HEADS = (
    "show", "display", "get", "dir", "more", "cat", "ping", "traceroute",
    "do show", "showtech", "who", "history",
)
# 한 글자라도 걸리면 자른다 — 조회처럼 보여도 뒤에 붙는 경우가 있다
_WRITE_WORDS = (
    "configure", "conf t", "config t", "write", "wr ", "reload", "erase",
    "delete", "format", "copy ", "clear ", "no ", "set ", "shutdown",
    "reset", "reboot", "boot ", "upgrade", "install", "restore", "factory",
)


# 설정 시험에서만 푸는 명령. 「무엇을 풀지」 를 여기 한 곳에 적어 둔다 —
# 여러 군데 흩어 두면 한쪽만 고쳐 놓고 풀린 줄 안다.
_CONFIG_HEADS = (
    "configure terminal", "conf t", "config t", "end", "exit",
    "interface", "int ", "no shutdown", "shutdown",
)
# 무엇을 풀어 주든 이것만은 못 지나간다. 되돌릴 수 없거나 장비가 죽는다.
_NEVER_WORDS = (
    "reload", "reboot", "erase", "format", "factory", "upgrade", "firmware",
    "install", "restore", "write ", "wr ", "copy ", "delete", "rmdir",
    "clear config", "halt", "boot ",
)


def _config_allowed(cli: str) -> bool:
    """설정 시험에서 이 명령을 써도 되나 (allow_config 일 때만 부른다).

    허용 목록 방식이다 — 「막을 것을 적는」 방식은 새 명령이 생길 때마다
    구멍이 난다. 링크를 내리고 올리는 시험에 필요한 것만 연다.
    """
    s0 = str(cli or "").strip().lower()
    if not s0:
        return False
    for line in s0.splitlines():
        ln = line.strip()
        if not ln:
            continue
        if any(w in ln for w in _NEVER_WORDS):
            return False
        if any(ch.isdigit() or ch == "." for ch in ln) and all(
            ch.isdigit() or ch == "." for ch in ln
        ):
            continue                      # OID
        if any(ln.startswith(h) for h in _READ_HEADS):
            continue                      # 조회는 언제나 된다
        if any(ln.startswith(h) for h in _CONFIG_HEADS):
            continue
        return False
    return True


def _is_read_only(cli: str) -> bool:
    """조회 명령인가. SNMP OID(숫자와 점)도 조회로 본다."""
    s = str(cli or "").strip().lower()
    if not s:
        return False
    for line in s.splitlines():
        ln = line.strip()
        if not ln:
            continue
        if all(ch.isdigit() or ch == "." for ch in ln):   # OID
            continue
        if any(w in ln for w in _WRITE_WORDS):
            return False
        if not any(ln.startswith(h) for h in _READ_HEADS):
            return False
    return True









# ══════════════════════════════════════════════════════════════════════
# 데이터 이사 — 묶음 단위 내보내기/가져오기 (설정 → 데이터)
#
# 랩마다 UTOP 이 따로 서 있어 자료를 통째로 옮기는 일이 잦다. DB 를 그대로
# 복사하면 장비 비밀번호·LLM 키까지 따라가므로, 묶음을 골라 JSON 하나로
# 뜨고, 받는 쪽은 ID 기준 합치기(upsert)로 넣는다.
# ══════════════════════════════════════════════════════════════════════

_TRANSFER_PARTS = ("wiki", "req", "tc", "cycle", "defect", "device", "catalog", "settings")








@app.get("/api/presence")
async def presence_roster(prefix: str = ""):
    """지금 접속해 있는 사람들 — prefix 로 화면을 좁힌다 (cycle → cycle:*)."""
    seen = []
    for st in ws_state.values():
        u = st.get("user")
        pg = str(st.get("page") or "")
        if u and (not prefix or pg == prefix or pg.startswith(prefix + ":")) and u not in seen:
            seen.append(u)
    return {"users": seen}


# ══════════════════════════════════════════════════════════════════
# 위키 — routes/wiki.py 로 옮겼다(2026-09-28, 분리 1호)
#
# 문서·Yjs 중계·문서 안의 표 세 블록이 이 파일 세 곳에 흩어져 있었다.
# 라우트 파일은 main 을 거꾸로 부르지 않는다 — 필요한 것(broadcast·세션·
# 그림 폴더)은 core 에 매어 두고 거기서 가져다 쓴다. 주소는 하나도 안 바뀐다.
# ══════════════════════════════════════════════════════════════════
core.bind(
    broadcast=broadcast,
    user_from_token=_user_from_token,
    require_admin=_require_admin,
    REQ_IMG_DIR=REQ_IMG_DIR,
    help_can_edit=_help_can_edit,     # 위키 공간 __help__(도움말)의 쓰기 권한
)
from routes import wiki as _wiki_routes  # noqa: E402
app.include_router(_wiki_routes.router)
_wiki_plain = _wiki_routes._wiki_plain      # 데이터 들이기(transfer)가 쓴다


@app.get("/api/audit")
async def audit_list_api(limit: int = 300):
    """수정 이력 — 알림 종이 읽는다. 최신이 앞."""
    return {"items": await db.audit_list(max(1, min(1000, limit)))}


@app.get("/api/transfer/export")
async def transfer_export(parts: str = "", secrets: int = 0):
    _require_admin("")  # 미들웨어 세션이 컨텍스트에 있다
    want = {x.strip() for x in parts.split(",") if x.strip()} or set(_TRANSFER_PARTS)
    out = {"app": "utop", "version": 1,
           "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "parts": {}}
    P = out["parts"]
    if "wiki" in want:
        # WIKI 는 문서(트리·본문)만으로는 반쪽이다 — 블록에는 표의 열쇠(tid)만
        # 담기므로 wiki_table·wiki_table_row 까지 한 묶음으로 떠야
        # 받은 쪽에서 표가 빈 껍데기가 안 된다. 지난 판(wiki_rev)은 안 싣는다.
        def _j(v, fb):
            if isinstance(v, str):
                try:
                    return json.loads(v)
                except Exception:
                    return fb
            return v if v is not None else fb
        async with db.pool().acquire() as c:
            pages = []
            for r in await c.fetch(
                    "SELECT id, project, parent_id, title, body, plain, ord"
                    " FROM wiki_page ORDER BY ord, title"):
                d = dict(r)
                d["body"] = _j(d.get("body"), [])
                pages.append(d)
            tables = []
            for r in await c.fetch(
                    "SELECT id, page_id, title, cols, calcs, view FROM wiki_table"):
                d = dict(r)
                d["cols"] = _j(d.get("cols"), [])
                d["calcs"] = _j(d.get("calcs"), {})
                d["view"] = _j(d.get("view"), {})
                tables.append(d)
            rows = []
            for r in await c.fetch(
                    "SELECT tid, rid, ord, data FROM wiki_table_row ORDER BY tid, ord"):
                d = dict(r)
                d["data"] = _j(d.get("data"), {})
                rows.append(d)
        P["wiki"] = {"pages": pages, "tables": tables, "rows": rows}
    if "req" in want:
        P["req"] = {"categories": await db.cat_list(), "reqs": await db.req_list_full()}
    if "tc" in want:
        P["tc"] = {"tcs": await db.tc_list_full()}
    if "cycle" in want:
        P["cycle"] = {"cycles": await db.cycle_list_full()}
    if "defect" in want:
        P["defect"] = {"defects": await db.defect_list(limit=100000)}
    if "device" in want:
        devs = await db.device_list()
        if not secrets:
            # 비밀번호는 기본 제외 — 파일이 어디로 돌지 모른다
            for d in devs:
                d.pop("password", None)
                d.pop("enable_password", None)
                for a in d.get("access") or []:
                    a.pop("password", None)
                    a.pop("enable_password", None)
        P["device"] = {"devices": devs, "secrets": bool(secrets)}
    if "catalog" in want:
        P["catalog"] = {"items": await db.catalog_list(),
                        "racks": _kv_load_sync("racks", {}) or {}}
    if "settings" in want:
        cfs = await db.cf_list("")
        P["settings"] = {
            "custom_fields": cfs,
            "global_params": _load_global_params(),
            "branding": _load_branding(),
        }
    return out


@app.post("/api/transfer/import")
async def transfer_import(payload: dict):
    """합치기(upsert) — 같은 ID 는 덮고 없는 것은 만든다. 지우지는 않는다."""
    _require_admin("")
    parts = payload.get("parts") or {}
    done: dict = {}

    if "wiki" in parts:
        # 문서·표·줄 셋 다 upsert — parent_id 는 FK 가 아니라 차례 걱정이 없다.
        def _j2(v, fb):
            if isinstance(v, str):
                try:
                    return json.loads(v)
                except Exception:
                    return fb
            return v if v is not None else fb
        n = 0
        async with db.pool().acquire() as c:
            for pg in parts["wiki"].get("pages") or []:
                pid = str(pg.get("id") or "").strip()
                if not pid:
                    continue
                try:
                    body = _j2(pg.get("body"), [])
                    if not isinstance(body, list):
                        body = []
                    await c.execute(
                        "INSERT INTO wiki_page (id, project, parent_id, title,"
                        " body, plain, ord, created_by, updated_by)"
                        " VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$8)"
                        " ON CONFLICT (id) DO UPDATE SET project=EXCLUDED.project,"
                        " parent_id=EXCLUDED.parent_id, title=EXCLUDED.title,"
                        " body=EXCLUDED.body, plain=EXCLUDED.plain, ord=EXCLUDED.ord,"
                        " updated_by=EXCLUDED.updated_by, updated_at=now()",
                        pid, str(pg.get("project") or ""), pg.get("parent_id") or None,
                        str(pg.get("title") or ""), json.dumps(body, ensure_ascii=False),
                        str(pg.get("plain") or "") or _wiki_plain(body),
                        int(pg.get("ord") or 0), "transfer",
                    )
                    n += 1
                except Exception as e:
                    done.setdefault("_errors", []).append(f"WIKI {pid}: {e}")
            for t in parts["wiki"].get("tables") or []:
                tid = str(t.get("id") or "").strip()
                if not tid:
                    continue
                try:
                    await c.execute(
                        "INSERT INTO wiki_table (id, page_id, title, cols, calcs, view)"
                        " VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)"
                        " ON CONFLICT (id) DO UPDATE SET page_id=EXCLUDED.page_id,"
                        " title=EXCLUDED.title, cols=EXCLUDED.cols,"
                        " calcs=EXCLUDED.calcs, view=EXCLUDED.view, updated_at=now()",
                        tid, str(t.get("page_id") or ""), str(t.get("title") or ""),
                        json.dumps(_j2(t.get("cols"), []), ensure_ascii=False),
                        json.dumps(_j2(t.get("calcs"), {}), ensure_ascii=False),
                        json.dumps(_j2(t.get("view"), {}), ensure_ascii=False),
                    )
                except Exception as e:
                    done.setdefault("_errors", []).append(f"WIKI 표 {tid}: {e}")
            for rw in parts["wiki"].get("rows") or []:
                tid = str(rw.get("tid") or "").strip()
                rid = str(rw.get("rid") or "").strip()
                if not tid or not rid:
                    continue
                try:
                    data = _j2(rw.get("data"), {})
                    if not isinstance(data, dict):
                        data = {}
                    await c.execute(
                        "INSERT INTO wiki_table_row (tid, rid, ord, data)"
                        " VALUES ($1,$2,$3,$4::jsonb)"
                        " ON CONFLICT (tid, rid) DO UPDATE SET ord=EXCLUDED.ord,"
                        " data=EXCLUDED.data, updated_at=now()",
                        tid, rid, int(rw.get("ord") or 0),
                        json.dumps(data, ensure_ascii=False),
                    )
                except Exception as e:
                    done.setdefault("_errors", []).append(f"WIKI 표 줄 {tid}/{rid}: {e}")
        done["wiki"] = n

    if "req" in parts:
        n = 0
        # 분류는 **부모 먼저** 넣는다.
        #
        # 파일에 실린 차례는 트리 차례가 아니다. 자식이 먼저 오면 외래키
        # (req_category.parent_id) 가 막아 **가져오기가 통째로 500 으로 멈춘다**
        # (지적: 데이터 가져오기 했는데 500). 게다가 여기만 try 가 없어서 한 줄이
        # 걸리면 뒤따르는 요구사항·시험항목까지 한꺼번에 못 들어갔다.
        #
        # 부모가 파일에도 DB 에도 없는 고아는 **뿌리로 올려서라도 살린다** — 분류
        # 하나 때문에 옮기던 자료 전부를 잃는 것보다 낫다. 무엇이 그랬는지는 알린다.
        _cats = [c for c in (parts["req"].get("categories") or []) if c.get("id") and c.get("name")]
        try:
            _have = {str(x.get("id") or "") for x in (await db.cat_list() or [])}
        except Exception:
            _have = set()
        _left, _orphans = list(_cats), []
        while _left:
            _wave = [c for c in _left
                     if not c.get("parent_id") or str(c.get("parent_id")) in _have]
            _cut = False
            if not _wave:                      # 남은 것은 전부 부모를 못 찾는다
                _wave, _cut = _left, True
            for c in _wave:
                _pid = c.get("parent_id") or None
                if _cut and _pid and str(_pid) not in _have:
                    _orphans.append(f'{c.get("name")}({c.get("id")})')
                    _pid = None
                try:
                    await db.cat_upsert(str(c["id"]), str(c["name"]), _pid,
                                        int(c.get("sort_order") or 0))
                    _have.add(str(c["id"]))
                except Exception as e:
                    done.setdefault("_errors", []).append(f'분류 {c.get("id")}: {e}')
            _ids = {id(c) for c in _wave}
            _left = [c for c in _left if id(c) not in _ids]
        if _orphans:
            done.setdefault("_errors", []).append(
                "상위 분류를 못 찾아 최상위로 올린 분류: " + ", ".join(_orphans[:20])
                + (f" 외 {len(_orphans) - 20}건" if len(_orphans) > 20 else ""))
        for r in parts["req"].get("reqs") or []:
            rid = str(r.get("id") or "").strip()
            if not rid:
                continue
            try:
                await db.req_upsert(rid, _strip_derived(r))
                n += 1
            except Exception as e:
                done.setdefault("_errors", []).append(f"요구사항 {rid}: {e}")
        done["req"] = n

    if "tc" in parts:
        n = 0
        for t in parts["tc"].get("tcs") or []:
            tid = str(t.get("tcid") or t.get("id") or "").strip()
            if not tid:
                continue
            try:
                await db.tc_upsert(tid, _strip_derived(t))
                n += 1
            except Exception as e:
                done.setdefault("_errors", []).append(f"시험 {tid}: {e}")
        done["tc"] = n

    if "cycle" in parts:
        n = 0
        for cyc in parts["cycle"].get("cycles") or []:
            cid = str(cyc.get("id") or "").strip()
            if not cid:
                continue
            try:
                await db.cycle_upsert(cid, _strip_derived(cyc))
                n += 1
            except Exception as e:
                done.setdefault("_errors", []).append(f"플랜 {cid}: {e}")
        done["cycle"] = n

    if "defect" in parts:
        n = 0
        for d in parts["defect"].get("defects") or []:
            did = str(d.get("id") or "").strip()
            if not did:
                continue
            try:
                if await db.defect_get(did):
                    await db.defect_update(did, d)
                else:
                    await db.defect_create(d)
                n += 1
            except Exception as e:
                done.setdefault("_errors", []).append(f"결함 {did}: {e}")
        done["defect"] = n

    if "device" in parts:
        n = 0
        errs: list = []
        for d in parts["device"].get("devices") or []:
            ip = str(d.get("ip") or "").strip()
            if not ip:
                continue
            try:
                # 장비의 실질 키는 IP 다. 서버마다 id 를 다르게 만들어 둬서,
                # 239의 id 로 넣으면 id 충돌은 안 나고 ip UNIQUE 에 걸려
                # 통째로 500 이 났다 — IP 로 찾은 기존 장비의 id 를 입힌다.
                cur = await db.device_get(ip)
                if cur:
                    d["id"] = cur["id"]
                    # 비밀번호 없이 온 파일이면 기존 비밀번호를 지킨다 —
                    # upsert 가 전 칸을 쓰므로 그냥 넣으면 빈 값으로 덮인다
                    for k in ("password", "enable_password"):
                        if not d.get(k):
                            d[k] = cur.get(k)
                    accs = {a.get("protocol"): a for a in (cur.get("access") or [])}
                    for a in d.get("access") or []:
                        old = accs.get(a.get("protocol")) or {}
                        for k in ("password", "enable_password"):
                            if not a.get(k):
                                a[k] = old.get(k)
                await db.device_upsert(_strip_derived(d))
                n += 1
            except Exception as e:
                if len(errs) < 10:
                    errs.append(f"장비 {ip}: {e}")
        done["device"] = n
        if errs:
            done.setdefault("_errors", []).extend(errs)

    if "catalog" in parts:
        n = 0
        for it in parts["catalog"].get("items") or []:
            if it.get("kind") and it.get("name"):
                await db.catalog_upsert(_strip_derived(it))
                n += 1
        racks = parts["catalog"].get("racks")
        if isinstance(racks, dict) and (racks.get("racks") or racks.get("labs")):
            _kv_save_sync("racks", racks)
        done["catalog"] = n

    if "settings" in parts:
        st = parts["settings"]
        n = 0
        for cf in st.get("custom_fields") or []:
            try:
                await db.cf_upsert({k: v for k, v in cf.items() if k not in ("used",)})
                n += 1
            except Exception:
                pass
        gp = st.get("global_params")
        if isinstance(gp, dict) and gp:
            GLOBAL_PARAMS_FILE.write_text(
                json.dumps(gp, ensure_ascii=False, indent=2), encoding="utf-8")
        br = st.get("branding")
        if isinstance(br, dict) and br:
            save_json(BRANDING_FILE, br)
        done["settings"] = n
    errs = done.pop("_errors", [])
    return {"ok": True, "done": done, "errors": errs[:10],
            "error_count": len(errs)}




_AUTO_WORDS = {"자동", "A", "AUTO", "AUTOMATIC"}




def _user_name_of(who: str) -> str:
    """계정 아이디·이름 어느 쪽이 와도 **이름**을 돌려준다(화면에 적을 값)."""
    w = str(who or "").strip()
    if not w:
        return ""
    try:
        for u in (_users_load_sync().get("users") or []):
            if str(u.get("name") or "") == w:
                return w
            if str(u.get("username") or "") == w:
                return str(u.get("name") or w)
    except Exception:
        pass
    return w


def _user_id_of(who: str) -> str:
    """표시 이름·계정 아이디 어느 쪽이 와도 **계정 아이디**를 돌려준다.

    일감에는 「관리자」 처럼 이름이 적히는데, Jira 보고자 칸은 계정 아이디를
    받는다(fields.reporter.name). 못 찾으면 받은 값을 그대로 돌려준다 —
    이미 아이디였을 수 있다."""
    w = str(who or "").strip()
    if not w:
        return ""
    try:
        for u in (_users_load_sync().get("users") or []):
            if str(u.get("username") or "") == w:
                return w
            if str(u.get("name") or "") == w:
                return str(u.get("username") or w)
    except Exception:
        pass
    return w


# ════════════ cycle — routes/cycle.py 로 옮겼다(2026-09-28) ════════════
# 이 파일 28곳에 흩어져 있던 것을 한 파일로 모았다. 남은 코드가 그쪽 이름을
# 쓰면 아래에서 받아 둔다(부를 때 찾으므로 여기서 한 번이면 된다). 주소는 안 바뀐다.
core.bind(
    DATA_DIR=DATA_DIR,
    DEVICES_FILE=DEVICES_FILE,
    PROCEDURES_FILE=PROCEDURES_FILE,
    RESULTS_DIR=RESULTS_DIR,
    load_json=load_json,
    save_json=save_json,
    broadcast=broadcast,
    tc_running=_tc_running,
    ssh_exec=ssh_exec,
    SESSIONS=SESSIONS,
    save_one_session=_save_one_session,
    users_load_sync=_users_load_sync,
    kv_load_sync=_kv_load_sync,
    kv_save_sync=_kv_save_sync,
    user_from_token=_user_from_token,
    token_from=_token_from,
    who=_who,
    org_where=_org_where,
    load_mail_cfg=_load_mail_cfg,
    addr_list=_addr_list,
    send_mail=_send_mail,
    repair_placeholders=_repair_placeholders,
    user_of=_user_of,
    CYCLE_DIR=CYCLE_DIR,
    me=_me,
    tc_id_norm=_tc_id_norm,
    TC_RUNHIST_DIR=TC_RUNHIST_DIR,
    MAIN_LOOP=_MAIN_LOOP,
    MAIL_BAD_TAG=_MAIL_BAD_TAG,
    MAIL_BAD_ATTR=_MAIL_BAD_ATTR,
    MAIL_BAD_URL=_MAIL_BAD_URL,
    user_name_of=_user_name_of,
)
from routes import cycle as _cycle_routes  # noqa: E402
app.include_router(_cycle_routes.router)
_DEFAULT_CYCLE_SUBJECT = _cycle_routes._DEFAULT_CYCLE_SUBJECT
_DEFAULT_CYCLE_TPL = _cycle_routes._DEFAULT_CYCLE_TPL
_clean_cycle_refs = _cycle_routes._clean_cycle_refs
run_cli = _cycle_routes.run_cli
_strip_derived = _cycle_routes._strip_derived
_model_group_of = _cycle_routes._model_group_of
_jira_defect_defaults = _cycle_routes._jira_defect_defaults
_item_verdict = _cycle_routes._item_verdict
_OLD_CYCLE_SUMMARY_SYS = _cycle_routes._OLD_CYCLE_SUMMARY_SYS
_rp_squash = _cycle_routes._rp_squash
_cb_run_state = _cycle_routes._cb_run_state
_on_cycle_complete = _cycle_routes._on_cycle_complete

# ───────────────────────────────────────────
# 라우터 - 장비
# ───────────────────────────────────────────
# ── 페이지·모듈 권한 ─────────────────────────────────────────────────
# 참고한 것: QMetry(모듈 × 권리 격자) · TestRail(역할 = 권한 묶음, 이름을
# 바꾸고 새로 만들 수 있다) · Zephyr Scale(맨 위 켬/끔) · Xray(제 체계를 안
# 만들고 Jira 권한에 얹는다).
#
# 어느 툴도 「메뉴 보임」 을 따로 관리하지 않는다 — 격자 하나에서 파생시킨다.
# 표를 두 벌 두면 반드시 어긋나기 때문이다. 여기도 그 방식이다: 「보기」 가
# 없으면 메뉴에 안 뜬다.
#
# **꺼진 채로 나간다.** 켜는 순간 아무도 아무것도 못 하는 사고를 막는다 —
# 표를 다 채운 뒤 사람이 켠다.
#
# 역할에 `jira` 칸을 비워 둔다. 계정 연동이 정리되면 Jira 그룹·프로젝트
# 역할이 여기 들어와 정본이 된다(지시). 그때 표를 다시 짜지 않아도 되게.
_PERM_RIGHTS = ("view", "create", "edit", "delete", "run", "folder")

_PERM_DEFAULT_ROLES = [
    {"key": "admin", "label": "관리자", "builtin": True, "jira": []},
    {"key": "lead", "label": "팀장", "builtin": True, "jira": []},
    {"key": "owner", "label": "담당", "builtin": True, "jira": []},
    {"key": "member", "label": "팀원", "builtin": True, "jira": []},
]


def _perm_doc() -> dict:
    """저장된 권한 문서. 없으면 「사용 안 함」 기본값."""
    d = _kv_load_sync("permissions", None)
    if not isinstance(d, dict):
        d = {}
    roles = d.get("roles")
    if not isinstance(roles, list) or not roles:
        roles = [dict(r) for r in _PERM_DEFAULT_ROLES]
    grid = d.get("grid")
    if not isinstance(grid, dict):
        grid = {}
    return {
        "enabled": bool(d.get("enabled")),
        "roles": roles,
        "grid": grid,
        # 옛 화면이 읽던 칸 — 아직 살려 둔다
        "perms": d.get("perms") if isinstance(d.get("perms"), dict) else {},
    }


@app.get("/api/permissions")
async def get_permissions():
    """모든 화면이 메뉴를 그리기 전에 읽는다 — 로그인만 하면 볼 수 있다."""
    return _perm_doc()


@app.post("/api/permissions")
async def save_permissions(data: dict = None, token: str = ""):
    """**관리자만**(지시) — 여기서 잘못 저장하면 아무도 못 들어온다."""
    _require_admin(token)
    data = data or {}
    cur = _perm_doc()

    roles = data.get("roles")
    if isinstance(roles, list) and roles:
        cur["roles"] = [
            {
                "key": str(r.get("key") or "").strip(),
                "label": str(r.get("label") or "").strip(),
                "builtin": bool(r.get("builtin")),
                "jira": [str(x) for x in (r.get("jira") or []) if str(x).strip()],
            }
            for r in roles
            if isinstance(r, dict) and str(r.get("key") or "").strip()
        ]
    grid = data.get("grid")
    if isinstance(grid, dict):
        cur["grid"] = {
            str(m): {
                str(rk): [x for x in (rv or []) if x in _PERM_RIGHTS]
                for rk, rv in (mv or {}).items()
            }
            for m, mv in grid.items()
        }
    if "enabled" in data:
        cur["enabled"] = bool(data.get("enabled"))
    if isinstance(data.get("perms"), dict):
        cur["perms"] = data["perms"]

    # **관리자를 0명으로 만들 수 없다.** 관리자 역할에서 SETUP 접근을 빼면
    # 아무도 이 화면에 다시 못 들어온다 — 잠긴 방에 열쇠를 두고 나오는 꼴이다.
    admin_key = next((r["key"] for r in cur["roles"] if r.get("builtin") and r["key"] == "admin"), "admin")
    cur["grid"].setdefault("settings", {})
    cur["grid"]["settings"][admin_key] = list(_PERM_RIGHTS)

    _kv_save_sync("permissions", cur)
    return {"ok": True, **cur}




@app.on_event("startup")
async def _prompt_next_migrate():
    """Coverage AI · Basic **저장본**에 [다음 행동] 절이 없으면 한 번 이어 붙인다(지시: 웹에 반영).

    장비를 묻을지·확정할지·항목을 물을지는 이 절이 정하는데, 사람이 SETUP 에서 저장해 둔
    프롬프트는 기본 글을 통째로 덮어 새 절이 화면에도 LLM 에도 안 실렸다(213 확인).
    쓴 글은 그대로 두고 절만 뒤에 붙인다 — 붙은 뒤에는 SETUP 에서 고칠 수 있다.
    """
    try:
        from routes.ai import CAI_BASIC_NEXT
        if not PROMPTS_FILE.exists():
            return
        data = load_json(PROMPTS_FILE) or {}
        purposes = data.get("purposes") or {}
        p = purposes.get("cai_basic") or {}
        sysp = str(p.get("system") or "")
        if sysp.strip() and "[다음 행동]" not in sysp:
            p["system"] = sysp.rstrip() + "\n\n" + CAI_BASIC_NEXT
            purposes["cai_basic"] = p
            data["purposes"] = purposes
            save_json(PROMPTS_FILE, data)
            print("[startup] Coverage AI · Basic 프롬프트 저장본에 [다음 행동] 절을 이어 붙였다", flush=True)
        elif sysp.strip() and "순서는 늘 장비 → 항목" not in sysp and "[다음 행동]" in sysp:
            # 절은 있는데 순서 규칙(지시: 장비 → 항목)이 빠진 저장본 — 머리줄 뒤에 0) 줄을 끼운다
            head_end = sysp.find("\n", sysp.find("[다음 행동]"))
            line0 = next((l for l in CAI_BASIC_NEXT.split("\n") if l.startswith("0) ")), "")
            if head_end > 0 and line0:
                p["system"] = sysp[:head_end] + "\n" + line0 + sysp[head_end:]
                purposes["cai_basic"] = p
                data["purposes"] = purposes
                save_json(PROMPTS_FILE, data)
                print("[startup] Coverage AI · Basic 프롬프트 저장본에 순서 규칙(0) 장비 → 항목)을 끼웠다", flush=True)
    except Exception as e:
        print(f"[startup] 프롬프트 [다음 행동] 이어붙이기 실패: {e}", flush=True)


@app.on_event("startup")
async def _prompt_migrate():
    """옛 Cycle-Test Summary 프롬프트를 걷는다.

    설정 화면이 기본값을 그대로 저장해 둔 값이라 **사람이 적은 글이 아니다**(옛
    기본값과 글자 하나 다르지 않다). 그런데 내용이 「전체·수동·자동 현황을 표로」 라서
    새 형식(표는 서버가 만들고 LLM 은 본문 문장만 쓴다)과 정면으로 부딪치고, 화면에는
    옛 글이 보이는데 실제 동작은 새 규칙이라 「설정한 대로 안 나온다」 로 읽힌다(지적).

    지우면 _prompt_of 가 새 기본값으로 내려앉아 **화면과 동작이 같아진다.**
    사람이 한 글자라도 고쳐 둔 값은 건드리지 않는다.
    """
    try:
        if not PROMPTS_FILE.exists():
            return
        pj = load_json(PROMPTS_FILE) or {}
        pp = dict(pj.get("purposes") or {})
        cs = dict(pp.get("cycle_summary") or {})
        if not cs or _rp_squash(cs.get("system")) != _rp_squash(_OLD_CYCLE_SUMMARY_SYS):
            return
        cs["system"] = ""
        pp["cycle_summary"] = cs
        pj["purposes"] = pp
        save_json(PROMPTS_FILE, pj)
        print("[startup] 옛 Cycle-Test Summary 프롬프트를 걷었습니다 — 기본값을 씁니다", flush=True)
    except Exception as _e:
        print(f"[startup] 프롬프트 정리 건너뜀: {_e}", flush=True)


# 판단 규칙이 프롬프트로 들어오기 **전**의 Coverage AI 기본값 — 저장 화면이
# 이 글자 그대로 담아 둔 것은 사람이 적은 글이 아니라서, 새 기본값([판단] 포함)
# 으로 내려앉힌다. 한 글자라도 고친 값은 건드리지 않는다.
_OLD_CAI_SYS = {
    "cai_basic": (
        "너는 UBIQUOSS 네트워크 장비 시험 플랫폼(UTOP)의 Coverage AI 도우미다. "
        "Basic mode 는 이미 만들어진 시험 항목을 골라 장비에서 돌리는 자리다.\n"
        "규칙:\n"
        "1) 한국어로 간결히 답한다.\n"
        "2) 네트워크 장비·시험 지식 범위에서 답하고, 모르는 것은 모른다고 말한다 — 지어내지 않는다.\n"
        "3) 화면 사용법을 물으면 「장비 고르기 → 시험 항목 고르기 → 시험 시작」 순서를 안내한다.\n"
        "4) 시험을 하고 싶어 하는 말이면 장비 모델명(예: E6100)과 무엇을 확인할지를 "
        "함께 적어 다시 요청하도록 안내한다."
    ),
    "cai_advanced": (
        "너는 UBIQUOSS 네트워크 장비 시험 플랫폼(UTOP)의 Coverage AI 도우미다. "
        "Advanced mode 는 자연어로 시험 절차를 새로 만들고 고치는 자리다.\n"
        "규칙:\n"
        "1) 한국어로 간결히 답한다.\n"
        "2) 네트워크 장비·시험 지식 범위에서 답하고, 모르는 것은 모른다고 말한다 — 지어내지 않는다.\n"
        "3) 화면 사용법을 물으면 「장비 고르기 → 시험 항목 → 절차 만들기·고치기 → 시험 시작」 을 안내한다.\n"
        "4) 시험을 만들고 싶어 하는 말이면 장비 모델명과 확인하려는 동작을 "
        "함께 적어 다시 요청하도록 안내한다."
    ),
}


@app.on_event("startup")
async def _cai_prompt_migrate():
    """옛 Coverage AI 프롬프트([판단] 없던 판)를 걷는다 — 기본값이 대신 선다."""
    try:
        if not PROMPTS_FILE.exists():
            return
        pj = load_json(PROMPTS_FILE) or {}
        pp = dict(pj.get("purposes") or {})
        hit = False
        for k, old in _OLD_CAI_SYS.items():
            cur = dict(pp.get(k) or {})
            if cur and _rp_squash(cur.get("system")) == _rp_squash(old):
                cur["system"] = ""
                pp[k] = cur
                hit = True
        if not hit:
            return
        pj["purposes"] = pp
        save_json(PROMPTS_FILE, pj)
        print("[startup] 옛 Coverage AI 프롬프트를 걷었습니다 — [판단] 든 기본값을 씁니다", flush=True)
    except Exception as _e:
        print(f"[startup] Coverage AI 프롬프트 정리 건너뜀: {_e}", flush=True)


@app.on_event("startup")
async def _db_init():
    """PostgreSQL 커넥션 풀 초기화 (필수 — 이후 모든 데이터 접근이 db.* 로 감).
    정리·백필 작업은 서버 기동을 막지 않도록 백그라운드로 미룸."""
    if N2X_RELAY_ONLY:
        print("[startup] N2X 중계 전용 — DB 를 잡지 않습니다", flush=True)
        return
    await db.init_pool()
    # 스키마를 기동할 때마다 적용한다. 도커 initdb 훅은 볼륨이 빌 때 한 번만
    # 돌아서, 이미 쓰고 있는 설치처에는 나중에 추가한 컬럼이 반영되지 않는다.
    try:
        await db.apply_schema()
    except Exception as e:
        print(f'[startup] 스키마 적용 실패: {e}', flush=True)
    # 겹싸여 저장된 jsonb(장비 data · 접속 params) 벗기기 — 한 번만 돌면 끝난다
    try:
        await db._repair_double_json()
    except Exception as e:
        print(f'[startup] jsonb 손질 실패: {e}', flush=True)
    # ID 옮기기가 칸만 고치고 data 는 안 고친 판이 나갔다. req 는 data 가
    # 정본이라 화면에 옛 ID 가 그대로 보였다. 어긋난 것이 있으면 맞춘다 —
    # 없으면 아무 일도 안 하므로 매번 돌아도 된다.
    try:
        async with db.pool().acquire() as _c:
            _f = await id_migrate.repair(_c)
        if _f["req"] or _f["tc"] or _f["cycle"] or _f.get("plan_run"):
            print(
                f"[id] 반쪽 옮김 손질 — 요구사항 {_f['req']} · 시험항목 {_f['tc']} · "
                f"사이클 {_f['cycle']} · 실행 {_f.get('plan_run', 0)}건",
                flush=True,
            )
    except Exception as e:
        print(f'[startup] ID 손질 실패: {e}', flush=True)
    # 모델그룹 이름 정규화 — 옛 값(LGU+_E61xx)이 프로젝트·TC 문서에 남아
    # 화면이 카탈로그 정본(E61xx)과 어긋났다(지적: 자동으로 따라와야 한다).
    # 규칙은 ID 옮기기와 같다: **카탈로그에 있는 꼬리**일 때만 바꾸고,
    # 지어내지 않는다. 멱등이라 기동마다 돌아도 된다 — 253 도 update.sh 만
    # 돌리면 자동으로 맞는다.
    try:
        _groups = {
            str(it.get("name") or "").strip()
            for it in await db.catalog_list()
            if str(it.get("kind")) == "group"
        }
        _groups.discard("")

        def _norm_mg(v) -> str | None:
            t = str(v or "").strip()
            if not t or t in _groups or "_" not in t:
                return None
            tail = t.split("_", 1)[1]
            return tail if tail in _groups else None

        if _groups:
            _fixed = {"project": 0, "tc": 0, "cycle": 0}
            async with db.pool().acquire() as _c:
                for _r in await _c.fetch(
                    "SELECT id, model_group FROM project "
                    "WHERE COALESCE(model_group,'') <> ''"
                ):
                    _t = _norm_mg(_r["model_group"])
                    if _t:
                        await _c.execute(
                            "UPDATE project SET model_group=$2 WHERE id=$1", _r["id"], _t
                        )
                        _fixed["project"] += 1
                for _r in await _c.fetch(
                    "SELECT tcid, data->>'model_group' AS mg FROM tc "
                    "WHERE COALESCE(data->>'model_group','') <> ''"
                ):
                    _t = _norm_mg(_r["mg"])
                    if _t:
                        await _c.execute(
                            "UPDATE tc SET data = jsonb_set(data, '{model_group}', "
                            "to_jsonb($2::text)) WHERE tcid=$1",
                            _r["tcid"], _t,
                        )
                        _fixed["tc"] += 1
                for _r in await _c.fetch(
                    "SELECT id, data->>'model_group' AS mg FROM cycle "
                    "WHERE COALESCE(data->>'model_group','') <> ''"
                ):
                    _t = _norm_mg(_r["mg"])
                    if _t:
                        await _c.execute(
                            "UPDATE cycle SET data = jsonb_set(data, '{model_group}', "
                            "to_jsonb($2::text)) WHERE id=$1",
                            _r["id"], _t,
                        )
                        _fixed["cycle"] += 1
            if any(_fixed.values()):
                print(f"[startup] 모델그룹 정규화: {_fixed}", flush=True)
    except Exception as e:
        print(f"[startup] 모델그룹 정규화 실패: {e}", flush=True)
    # 워커 스레드(run_cli 등)에서 asyncio.run_coroutine_threadsafe 호출용 메인 루프 참조 저장.
    # 스레드 안에서는 asyncio.get_event_loop() 가 새 루프를 만들거나 실패하므로,
    # 요청 처리 스레드에서 broadcast() 를 예약하려면 반드시 여기서 잡은 루프를 써야 한다.
    global _MAIN_LOOP
    try: _MAIN_LOOP = asyncio.get_running_loop()
    except Exception: _MAIN_LOOP = None
    core.bind(MAIN_LOOP=_MAIN_LOOP)     # routes/cycle 의 run_cli 스레드가 이 루프로 broadcast 를 예약한다

    # 세션: 레거시 sessions.json → DB 이전 (1회) 후 DB → in-memory 로드
    try: await _migrate_sessions_file_to_db()
    except Exception as e: print(f"[startup] session migration failed: {e}", flush=True)
    try: await _load_sessions_from_db()
    except Exception as e: print(f"[startup] session load failed: {e}", flush=True)

    # 사용자: 레거시 users.json → DB(app_kv 'users') 로 이전 (1회)
    try: await _migrate_users_file_to_db()
    except Exception as e: print(f"[startup] users migration failed: {e}", flush=True)
    # 사용자 캐시 초기 로드 + 기본 admin 계정 보장 (DB 비었으면 생성). async 로 호출해야 loop deadlock 없음.
    try: await _init_users_async()
    except Exception as e: print(f"[startup] init_users_file failed: {e}", flush=True)

    # 결함 ID — 옛 무작위 꼬리(DEF-a1b2c3…)를 DEF-<프로젝트키>-<순번> 으로 이전 (멱등)
    try:
        _dn = await db.defect_renumber_legacy()
        if _dn: print(f"[startup] 결함 ID {_dn}건을 새 체계로 이전", flush=True)
    except Exception as e:
        print(f"[startup] defect renumber failed: {e}", flush=True)

    # 플랜 부여 ID — cid 없는 회차에 C-<연2><주차2>-<순번3> 을 채운다 (멱등)
    try:
        _cn = await db.cycle_backfill_cids()
        if _cn: print(f"[startup] 플랜 ID {_cn}건 부여 (C-연주차-순번)", flush=True)
    except Exception as e:
        print(f"[startup] cycle cid backfill failed: {e}", flush=True)

    # 옛 실행 키 _R0001 → _E0001 (지시: 요구사항 -R0001 과 겹쳐 읽힌다).
    # 기동 때 옮겨 두면 253 도 update.sh 만으로 같아진다 (멱등).
    try:
        _rn = await db.plan_run_rekey_r_to_e()
        if _rn: print(f"[startup] 실행 키 {_rn}건을 _R → _E 로 이전", flush=True)
    except Exception as e:
        print(f"[startup] plan_run rekey failed: {e}", flush=True)

    # 옛 사이클 부여 ID -P0001 → -C0001 (지시: 기존 것도). ce·ceid 파생과
    # 옛 링크 별칭까지 함께 — 멱등.
    try:
        _pn = await db.cycle_rekey_p_to_c()
        if _pn: print(f"[startup] 사이클 ID {_pn}건을 P → C 로 이전", flush=True)
    except Exception as e:
        print(f"[startup] cycle rekey failed: {e}", flush=True)

    # 실행 판정을 네 글자(p/f/b/n)에서 셋업 판정 값으로(승인: b→Blocked).
    # 기동 때 옮겨 두면 253 도 update.sh 만으로 같아진다 — 멱등.
    try:
        _vn = await db.plan_run_verdicts_full()
        if _vn: print(f"[startup] 실행 판정 {_vn}건을 셋업 값으로 이전", flush=True)
    except Exception as e:
        print(f"[startup] plan_run verdicts failed: {e}", flush=True)

    # 항목별 실행 번호(E61xx-E0001) 채우기 — 실행 하나에 번호 하나뿐이라
    # 62 줄이 모두 같은 번호로 보였다(지적). 이미 돈 것에도 한 번 매겨 둔다.
    try:
        _en = await db.plan_run_exec_backfill()
        if _en: print(f"[startup] 항목별 실행 번호 {_en}건 부여", flush=True)
    except Exception as e:
        print(f"[startup] plan_run exec backfill failed: {e}", flush=True)

    # 실행 타입 「혼합」 은 뺐다(합의) — 기동 때 지워 두면 253 도
    # update.sh 만으로 같아진다. 없으면 그냥 지나간다(멱등).
    try:
        if await db.code_delete("tc_run_type", "혼합"):
            print("[startup] 실행 타입 「혼합」 제거", flush=True)
    except Exception as e:
        print(f"[startup] 혼합 제거 실패: {e}", flush=True)

    # 폴더 이동으로 낡은 요구사항 분류 사슬(cat1~4)을 트리 기준으로
    # 재작성한다 — 이동 API 가 그때그때 맞추지만, 그 전에 낡은 자료가
    # 이미 있고 253 도 update.sh 만으로 같아져야 한다 (멱등).
    try:
        _rn = await _req_chain_resync()
        if _rn:
            print(f"[startup] 요구사항 분류 사슬 {_rn}건 재작성", flush=True)
    except Exception as e:
        print(f"[startup] 사슬 재작성 실패: {e}", flush=True)

    # 파일 → DB(app_kv) 이전 (파일이 정본이면 DB 덮어씀). ai_usage/ai_feedback 는 _load_items_store 매핑도 등록.
    _KV_MIGRATIONS = [
        ("chat_sessions", CHAT_SESS_FILE),
        ("ai_usage", AI_USAGE_FILE),
        ("ai_feedback", FEEDBACK_FILE),
        ("learned_procedures", LEARNED_FILE),
        ("release_summary", RELEASE_SUMMARY_FILE),
        ("manpower", RSC_MANPOWER_FILE),
        ("device_catalog", DEVICE_CATALOG_FILE),
        ("racks", RACKS_FILE),
        # ★ 여기 빠지면 저장(DB)은 되는데 재시작 후 안 읽힌다 —
        #   _kv_load_sync 는 등록된 키만 기동 때 DB 에서 캐시로 채운다.
        #   실사고: 253 에서 update.sh(재시작) 뒤 탭 이름이 초기값으로 복귀.
        #   파일은 원래 없던 키라 경로는 자리표시용이다(파일 없음 → DB 만).
        ("code_kind_labels", DATA_DIR / "code_kind_labels.json"),
        ("code_kind_hidden", DATA_DIR / "code_kind_hidden.json"),
        # INFO 필드의 폭·모양·정렬·글꼴. 바로 위 두 형제는 등록해 두고 이것만
        # 빠져 있었다 — 저장은 DB 에 되는데 다시 올리면 `_kv_load_sync` 가
        # 빈 값을 캐시에 박고, 다음 저장이 그 빈 값으로 DB 를 덮어썼다.
        # 실사고: 「폭이 자꾸 변경돼」 — 배포할 때마다 열 폭이 기본값으로 복귀.
        ("code_kind_style", DATA_DIR / "code_kind_style.json"),
        # 페이지·모듈 권한. 옛 파일(config/permissions.json)이 정본이면 그것을
        # DB 로 옮긴다. 등록을 빼면 재시작 때 빈 격자가 캐시에 박히고 다음
        # 저장이 DB 를 덮어써 **권한이 통째로 날아간다** — 바로 위에서 겪은 것.
        ("permissions", PERMISSIONS_FILE),
        ("cycle_desc_template", DATA_DIR / "cycle_desc_template.json"),
        # 자연어 시험 첫 화면의 질문 보기 — 등록 안 하면 재시작 때 빈 값이
        # 캐시에 박히고 다음 저장이 DB 를 덮어쓴다(원본 앱에서 겪은 덫).
        ("ai_examples", DATA_DIR / "ai_examples.json"),
        # 자연어 시험 기록. 등록 안 하면 재시작 때 _kv_load_sync 가 빈 값을
        # 캐시에 박고(등록된 키만 DB 에서 채운다), 다음 저장이 그 빈 값으로
        # DB 를 덮어써 **기록이 통째로 날아간다**. 실사고: 재시작 뒤 시험
        # 기록이 사라졌다.
        ("nl_chats", DATA_DIR / "nl_chats.json"),
        # 대화 목록의 폴더 이름(계정별). 등록을 빼면 재시작 때 빈 값이 캐시에
        # 박히고 다음 저장이 DB 를 덮어써 **폴더가 통째로 날아간다** —
        # 실사고: 「업데이트하면 폴더명이 삭제돼」(지적).
        ("nl_chat_folders", DATA_DIR / "nl_chat_folders.json"),
        # 👍👎 답변 평가 — 같은 덫. 재시작마다 쌓은 평가가 사라지면
        # 프롬프트 개선 근거가 못 된다.
        ("nl_feedback", DATA_DIR / "nl_feedback.json"),
        # 조직도(회사 → 그룹 → 담당 → 팀 → 사람). 계정 화면이 이걸로 묶어 본다.
        # 등록을 빼면 재시작 때 빈 조직도가 캐시에 박히고 다음 저장이 DB 를
        # 덮어써 통째로 날아간다 — 위 형제들이 겪은 그 덫이다.
        ("org_tree", DATA_DIR / "org_tree.json"),
        # 라이선스 파일(2026-09-29). 등록을 빼면 재시작 때 빈 값이
        # 캐시에 박히고 다음 저장이 DB 를 덮어쓴다 — 위 형제들이 겪은 그 덫.
        # (도움말 편집자 목록 help_editors 는 걷었다 — 페이지별 접근 권한 격자가 맡는다)
        ("license", DATA_DIR / "license.json"),
    ]
    for _key, _fp in _KV_MIGRATIONS:
        _kv_register_fallback(_key, _fp)
        try: await _kv_init_async(_key, _fp, sizeguard=True)
        except Exception as _me: print(f"[startup] KV migrate '{_key}' failed: {_me}", flush=True)
    # 도움말 씨앗 — 위키 공간 __help__ 이 **비어 있을 때만** docs/features/*.md 를 블록으로 바꿔 들인다.
    # 그 뒤로는 앱(위키 편집기)에서 고친 것이 정본이다. 되돌리기는 SETUP › 버전·라이선스.
    try:
        _n = await _help_seed_if_empty()
        if _n:
            print(f"[startup] 도움말 씨앗 {_n}편 심음 (위키 공간 __help__)", flush=True)
    except Exception as _he:
        print(f"[startup] 도움말 씨앗 실패: {_he}", flush=True)
    # 조직도 씨앗 — **비어 있을 때만** 채운다.
    #
    # 조직도는 app_kv(DB) 에 산다. 그래서 코드만 받은 서버(253)는 계정 화면이
    # 예전 납작한 목록 그대로였다(지적). DATA_DIR 은 도커 볼륨이라 자료를
    # 거기 두면 이미지를 따라가지 못한다 — 그래서 씨앗은 backend/ 안에 둔다.
    #
    # 이미 조직도가 있으면 **손대지 않는다.** 사람이 옮겨 놓은 것을 배포할
    # 때마다 되돌리면, 고쳐도 소용없는 화면이 된다.
    try:
        if not _kv_load_sync("org_tree", None):
            _seed = Path(__file__).parent / "seed" / "org_tree.json"
            if _seed.exists():
                _kv_save_sync("org_tree", json.loads(_seed.read_text(encoding="utf-8")))
                print("[startup] 조직도 씨앗 심음", flush=True)
    except Exception as _se:
        print(f"[startup] 조직도 씨앗 실패: {_se}", flush=True)

    # 플랜의 **단계·유형** 씨앗 — 목업(Plans/Runs)이 쓰는 값이다.
    #
    # 표에서 값을 만들 수 있지만, 칸이 텅 비어 있으면 처음 여는 사람이
    # 무엇을 골라야 할지 모른다. 그래서 **비어 있을 때만** 기본값을 심고,
    # 하나라도 있으면 손대지 않는다(사람이 고친 것을 배포가 덮으면 안 된다).
    try:
        _defaults = {
            "cycle_stage": [("준비", "#6B7280"), ("진행", "#2563eb"),
                            ("검토", "#b45309"), ("발행", "#0F7B6C")],
            "cycle_type": [("표준항목", "#0F7B6C"), ("개선내역", "#b45309")],
            "cycle_mode": [("자동", "#2563eb"), ("수동", "#b45309")],
        }
        for _kind, _vals in _defaults.items():
            _have = [x for x in (await db.code_list()) if x.get("kind") == _kind]
            if _have:
                continue
            for _i, (_v, _c) in enumerate(_vals):
                await db.code_upsert({
                    "kind": _kind, "value": _v, "sort_order": _i,
                    "note": json.dumps({"color": _c, "fg": "#fff", "icon": "", "show": "both"}),
                })
            print(f"[startup] {_kind} 씨앗 {len(_vals)}개 심음", flush=True)
    except Exception as _se:
        print(f"[startup] 플랜 코드 씨앗 실패: {_se}", flush=True)

    # 역할 씨앗 — **딱 한 번만** 심는다.
    #
    # 팀장 24 · 담당 18 은 사람이 손으로 정한 값이다(role_by 가 비어 있다).
    # 조직도처럼 다시 만들어 낼 수 없어, 아이디→역할 명단을 씨앗으로 싣는다.
    #
    # 두 가지를 지킨다.
    #  · **팀원인 사람만** 올린다 — 이미 정해 둔 역할을 배포가 덮으면 안 된다.
    #    관리자는 손도 안 댄다(내리면 그 사람이 화면을 못 쓴다).
    #  · 한 번 심고 표식을 남긴다. 안 그러면 253 에서 누군가를 일부러 팀원으로
    #    되돌려도 다음 재시작이 도로 올려, 고쳐도 소용없는 화면이 된다.
    try:
        _rd = _users_load_sync()
        if not _rd.get("role_seed_v1"):
            _rs = Path(__file__).parent / "seed" / "roles.json"
            _seeded = 0
            if _rs.exists():
                _want = json.loads(_rs.read_text(encoding="utf-8"))
                for _u in _rd["users"]:
                    _r = _want.get(_u.get("username"))
                    if _r and _u.get("role") == "팀원":
                        _u["role"] = _r
                        _seeded += 1
            _rd["role_seed_v1"] = True
            _users_save_sync(_rd)
            if _seeded:
                print(f"[startup] 역할 씨앗 {_seeded}명 심음", flush=True)
    except Exception as _re2:
        print(f"[startup] 역할 씨앗 실패: {_re2}", flush=True)

    # 조직도의 장 → 계정 역할 「담당」 을 **한 번 맞춘다**. 저장할 때만 맞추면
    # 이미 들어 있는 조직도는 아무도 다시 저장하기 전까지 표(담당)와 편집판
    # (팀원)이 어긋난 채로 남는다(지적). 관리자는 안 내린다.
    try:
        _org = _kv_load_sync("org_tree", None)
        if isinstance(_org, dict) and _org.get("name"):
            _r = _apply_org_roles(_org)
            if _r.get("role_up") or _r.get("role_down"):
                print(f"[startup] 조직 역할 맞춤: {_r}", flush=True)
    except Exception as _oe:
        print(f"[startup] 조직 역할 맞춤 실패: {_oe}", flush=True)

    # ai_usage/ai_feedback 는 _load_items_store(path) 우회 매핑 등록
    _ITEMS_STORE_KV_MAP[str(AI_USAGE_FILE)] = "ai_usage"
    _ITEMS_STORE_KV_MAP[str(FEEDBACK_FILE)] = "ai_feedback"

    async def _bg_maintenance():
        # cycle.data_summary 백필
        try:
            n = await db.cycle_backfill_summary()
            if n > 0:
                print(f"[startup-bg] cycle data_summary backfilled: {n} rows")
        except Exception as e:
            print(f"[startup-bg] cycle backfill failed: {e}")
        # REQ.tc 안 stale 참조 정리
        try:
            n = await _cleanup_stale_req_tc_refs()
            if n > 0:
                print(f"[startup-bg] REQ 안 stale TC 참조 정리: {n} 건")
        except Exception as e:
            print(f"[startup-bg] stale ref cleanup failed: {e}")
        # REQ 중복 row 정리
        try:
            n = await _cleanup_duplicate_reqs()
            if n > 0:
                print(f"[startup-bg] 중복 REQ row 정리: {n} 건")
        except Exception as e:
            print(f"[startup-bg] duplicate REQ cleanup failed: {e}")

    asyncio.create_task(_bg_maintenance())
    # 지라 이슈 저장소 — 매일 07:00(KST) 변경분 동기화(승인: ⑵안)
    asyncio.create_task(_jira_cache_scheduler())



@app.on_event("shutdown")
async def _db_close():
    try:
        await db.close_pool()
    except Exception:
        pass

@app.on_event("startup")
async def _rag_warmup():
    if N2X_RELAY_ONLY:
        return
    """시작 시 임베딩 캐시(.npy)·코퍼스를 백그라운드로 미리 로드 → 첫 RAG 질의도 빠름."""
    import threading
    def _warm():
        try:
            _embed_load(); _manual_chunk_corpus()
        except Exception:
            pass
    threading.Thread(target=_warm, daemon=True).start()



async def _why_http(client, url: str, model: str, r) -> str:
    """200 이 아닐 때 사람이 읽을 이유를 만든다.

    가장 흔한 실수가 모델 이름이라, 서버가 살아 있으면 /v1/models 를 물어
    '주소는 맞는데 그 모델이 없다' 를 따로 짚어 준다. 이것을 안 하면
    주소부터 다시 의심하느라 시간을 버린다.
    """
    if r.status_code in (401, 403):
        return f"인증 실패 ({r.status_code}) — 키를 확인하세요"
    try:
        m = await client.get(url + "/v1/models")
        if m.status_code == 200:
            names = [x.get("id") for x in (m.json().get("data") or []) if x.get("id")]
            if names and model not in names:
                return f"서버는 응답하는데 '{model}' 모델이 없습니다 (있는 것: {', '.join(names[:5])})"
    except Exception:
        pass
    body = (r.text or "").strip().replace("\n", " ")[:200]
    return f"응답 코드 {r.status_code}{' — ' + body if body else ''}"




# ════════════ ai — routes/ai.py 로 옮겼다(2026-09-28) ════════════
# 이 파일 19곳에 흩어져 있던 것을 한 파일로 모았다. 남은 코드가 그쪽 이름을
# 쓰면 아래에서 받아 둔다(부를 때 찾으므로 여기서 한 번이면 된다). 주소는 안 바뀐다.
core.bind(
    DATA_DIR=DATA_DIR,
    DEVICES_FILE=DEVICES_FILE,
    LLMS_FILE=LLMS_FILE,
    PROMPTS_FILE=PROMPTS_FILE,
    CONFLUENCE_FILE=CONFLUENCE_FILE,
    CLAUDE_FALLBACK_MODEL=CLAUDE_FALLBACK_MODEL,
    claude_client=claude_client,
    load_json=load_json,
    save_json=save_json,
    broadcast=broadcast,
    users_load_sync=_users_load_sync,
    kv_load_sync=_kv_load_sync,
    kv_save_sync=_kv_save_sync,
    user_from_token=_user_from_token,
    require_admin=_require_admin,
    FEEDBACK_FILE=FEEDBACK_FILE,
    load_items_store=_load_items_store,
    save_items_store=_save_items_store,
    user_of=_user_of,
    next_tc_id=_next_tc_id,
    tc_id_norm=_tc_id_norm,
    run_cli=run_cli,
    NEVER_WORDS=_NEVER_WORDS,
    config_allowed=_config_allowed,
    is_read_only=_is_read_only,
    TC_SCHEMA=_TC_SCHEMA,
    why_http=_why_http,
    item_verdict=_item_verdict,
)
from routes import ai as _ai_routes  # noqa: E402
app.include_router(_ai_routes.router)
LEARNED_FILE = _ai_routes.LEARNED_FILE
LLM_PURPOSES = _ai_routes.LLM_PURPOSES
_prompt_of = _ai_routes._prompt_of
_purpose_params = _ai_routes._purpose_params
_apply_purpose_params = _ai_routes._apply_purpose_params
_llm_pick = _ai_routes._llm_pick
AI_USAGE_FILE = _ai_routes.AI_USAGE_FILE
_embed_load = _ai_routes._embed_load
_manual_chunk_corpus = _ai_routes._manual_chunk_corpus
_ai_settings = _ai_routes._ai_settings
_ai_llm = _ai_routes._ai_llm
_ai_chat = _ai_routes._ai_chat
_ai_json = _ai_routes._ai_json
_rag_index_cycle = _ai_routes._rag_index_cycle
_rag_index_req = _ai_routes._rag_index_req


@app.get("/api/dashboard")
async def dashboard_data():
    """대시보드 집계 — 위젯 전부를 한 번에. 플랜은 요약본(data_summary)만 읽어 가볍다."""
    from datetime import datetime as _dt, timedelta as _td
    devices = await db.device_list()
    meters = [d for d in devices if str(d.get("role") or "") == "계측기"]
    dev_groups = {}
    for d in devices:
        role = str(d.get("role") or "")
        if role == "계측기":
            continue
        g = role or "기타"
        dev_groups[g] = dev_groups.get(g, 0) + 1
    try:
        defects = await db.defect_list()
    except Exception:
        defects = []
    _closed = ("closed", "resolved", "done", "완료", "해결", "닫힘")
    opened = [x for x in defects if str(x.get("status") or "").strip().lower() not in _closed]
    wk = (_dt.now() - _td(days=7)).strftime("%Y-%m-%d")
    week_new = sum(1 for x in opened if str(x.get("created_at") or "")[:10] >= wk)
    metas = await db.cycle_list_meta()
    today = _dt.now().strftime("%Y-%m-%d")
    yday = (_dt.now() - _td(days=1)).strftime("%Y-%m-%d")
    days = [(_dt.now() - _td(days=i)).strftime("%Y-%m-%d") for i in range(13, -1, -1)]
    daily = {d2: {"runs": 0, "ok": 0, "bad": 0} for d2 in days}
    versions = []

    def _vd(it):
        """항목 결과를 화면 말로 — Blocked·WIP·커스텀도 살린다 (_item_verdict 는 PASS/FAIL 만)"""
        raw = str(it.get("result") or "").strip()
        if raw and raw != "미실행":
            return raw
        v0 = _item_verdict(it)
        return {"PASS": "Pass", "FAIL": "Fail", "N/A": "진행불가"}.get(v0, "")

    overall = {}
    attention = []
    latest_by_tc = {}
    for c in metas:
        items = [x for x in (c.get("items") or []) if isinstance(x, dict)]
        ok2 = bad = done = 0
        for it in items:
            v = _item_verdict(it)
            lb = _vd(it)
            overall[lb or "미실행"] = overall.get(lb or "미실행", 0) + 1
            at2 = str(it.get("executed_at") or "")
            tid = str(it.get("tcid") or "")
            if tid and lb:
                cur0 = latest_by_tc.get(tid)
                if not cur0 or at2 >= cur0[0]:
                    latest_by_tc[tid] = (at2, lb)
            if lb in ("Fail", "Blocked", "진행불가"):
                attention.append({
                    "tcid": tid, "name": str(it.get("name") or ""), "label": lb,
                    "cycle_id": str(c.get("id") or ""), "version": str(c.get("version") or c.get("cid") or ""),
                    "at": at2,
                })
            if v == "PASS":
                ok2 += 1
            elif v == "FAIL":
                bad += 1
            if v:
                done += 1
            d3 = at2[:10]
            if d3 in daily:
                daily[d3]["runs"] += 1
                if v == "PASS":
                    daily[d3]["ok"] += 1
                elif v == "FAIL":
                    daily[d3]["bad"] += 1
        versions.append({
            "id": c.get("id"), "cid": str(c.get("cid") or ""),
            "version": str(c.get("version") or ""), "name": str(c.get("name") or ""),
            "updated": str(c.get("_updated_at_pg") or ""),
            "total": len(items), "ok": ok2, "bad": bad, "done": done,
        })
    versions.sort(key=lambda x: x.get("updated") or "", reverse=True)
    run = None
    st2 = _cb_run_state
    if st2 and _t.time() - st2.get("_at", 0) <= 1800:
        run = {k: st2.get(k) for k in ("key", "name", "done", "total", "user")}
    # 자산 현황 + 자동화율 — TC 메타에서
    try:
        tcs = await db.tc_list_meta()
    except Exception:
        tcs = []
    try:
        reqs_n = len(await db.req_list_full())
    except Exception:
        reqs_n = 0
    auto_n = sum(1 for t2 in tcs if str(t2.get("kind") or t2.get("run_type") or "").strip() == "자동")
    # 자주 깨지는 TC — 모든 회차의 Fail 을 tcid 로 센다
    fail_by = {}
    for c in metas:
        for it in (c.get("items") or []):
            if not isinstance(it, dict):
                continue
            v = _item_verdict(it)
            tid = str(it.get("tcid") or "")
            if not tid or not v:
                continue
            rec = fail_by.setdefault(tid, {"tcid": tid, "name": str(it.get("name") or ""), "fails": 0, "runs": 0})
            rec["runs"] += 1
            if v == "FAIL":
                rec["fails"] += 1
    top_fail = sorted((x for x in fail_by.values() if x["fails"] > 0), key=lambda x: -x["fails"])[:5]
    attention.sort(key=lambda x: x.get("at") or "", reverse=True)
    # 요구사항 커버리지 — TC 가 가리키는 요구사항 / 전체
    try:
        reqs_all = await db.req_list_full()
        req_ids = set()
        for r2 in reqs_all:
            for k2 in ("id", "reqid"):
                v2 = str(r2.get(k2) or "").strip()
                if v2:
                    req_ids.add(v2)
        covered = {str(t2.get("req_id") or "").strip() for t2 in tcs} & req_ids
        coverage = {"total": len(reqs_all), "covered": len({str(r2.get("id") or r2.get("reqid") or "") for r2 in reqs_all if (str(r2.get("id") or "").strip() in covered) or (str(r2.get("reqid") or "").strip() in covered)})}
    except Exception:
        coverage = {"total": 0, "covered": 0}
    # TC 실행 현황 — 최근 결과 기준(항목당 마지막 회차)
    tc_ids_all = {str(t2.get("tcid") or "") for t2 in tcs if t2.get("tcid")}
    exec_pass = sum(1 for tid, (_, lb) in latest_by_tc.items() if tid in tc_ids_all and lb == "Pass")
    exec_fail = sum(1 for tid, (_, lb) in latest_by_tc.items() if tid in tc_ids_all and lb == "Fail")
    exec_n = sum(1 for tid in latest_by_tc if tid in tc_ids_all)
    tcexec = {"total": len(tc_ids_all), "executed": exec_n, "passed": exec_pass, "failed": exec_fail}
    recent_defects = [
        {k: str(x.get(k) or "") for k in ("id", "title", "severity", "status", "created_at", "cycle_id", "tcid")}
        for x in opened[:5]
    ]
    return {
        "devices": {"total": len(devices) - len(meters), "groups": dev_groups},
        "meters": {"total": len(meters)},
        "defects": {"open": len(opened), "week_new": week_new},
        "today": daily.get(today, {"runs": 0, "ok": 0}),
        "daily": [{"date": d2, **daily[d2]} for d2 in days],
        "versions": versions[:8],
        "running": run,
        "assets": {"reqs": reqs_n, "tcs": len(tcs), "cycles": len(metas)},
        "overall": overall,
        "yday_runs": daily.get(yday, {}).get("runs", 0) if yday in daily else 0,
        "attention": attention[:6],
        "coverage": coverage,
        "tcexec": tcexec,
        "automation": {"auto": auto_n, "manual": max(len(tcs) - auto_n, 0)},
        "top_fail": top_fail,
        "recent_defects": recent_defects,
    }


engine.on_cycle_complete = _on_cycle_complete



# ───────────────────────────────────────────
# WebSocket
# ───────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    ws_state[id(websocket)] = {"ws": websocket, "user": None, "page": None}
    try:
        while True:
            txt = await websocket.receive_text()
            try:
                msg = json.loads(txt)
            except Exception:
                continue
            if not isinstance(msg, dict):
                continue
            t = msg.get("type")
            st = ws_state.get(id(websocket))
            if t == "presence" and st is not None:
                old = st.get("page")
                if msg.get("user"):
                    st["user"] = str(msg.get("user"))
                st["page"] = msg.get("page")
                if old and old != st["page"]:
                    await _broadcast_presence(old)
                if st["page"]:
                    await _broadcast_presence(st["page"])
            elif t == "focus" and st is not None:
                # 같은 플랜 안에서 **어느 항목**을 보고 있나.
                #
                # 접속자(presence)는 화면 단위라, 플랜을 같이 보고 있다는
                # 것까지만 안다. 플랜은 항목을 나눠 돌리는 자리라 정작
                # 부딪히는 곳은 항목이다 — 둘이 같은 항목에 결과를 찍으면
                # 나중 사람이 앞사람 것을 덮는다.
                st["focus"] = msg.get("at")
                pg = msg.get("page") or st.get("page")
                if pg:
                    await _broadcast_focus(pg)
            elif t == "tc_running" and st is not None:
                # 실행 시작/끝을 모두에게 알린다. 연결이 끊기면(러너가 죽으면)
                # 아래 disconnect 에서 이 연결이 켠 것들을 자동으로 끈다.
                _tcid = str(msg.get("tcid") or "").strip()
                _on = bool(msg.get("on"))
                _u = str(msg.get("user") or st.get("user") or "").strip()
                if _tcid:
                    if _on:
                        _tc_running[_tcid] = {"user": _u, "at": _t.time()}
                        st.setdefault("running_tcs", set()).add(_tcid)
                    else:
                        _tc_running.pop(_tcid, None)
                        if isinstance(st.get("running_tcs"), set):
                            st["running_tcs"].discard(_tcid)
                    await _broadcast_tc_running(_tcid, _u, _on)
            elif t == "takeover":
                pg = msg.get("page"); u = msg.get("user")
                if pg and u:
                    page_controller[pg] = str(u)
                    await _broadcast_presence(pg)
    except WebSocketDisconnect:
        st = ws_state.pop(id(websocket), None)
        if websocket in active_connections:
            active_connections.remove(websocket)
        # 러너가 창을 닫거나 끊기면, 이 연결이 켠 「실행 중」을 자동으로 끈다 —
        # 아니면 유령 진행중이 남는다.
        for _rt in list((st or {}).get("running_tcs") or []):
            _tc_running.pop(_rt, None)
            try: await _broadcast_tc_running(_rt, "", False)
            except Exception: pass
        if st and st.get("page"):
            await _broadcast_presence(st["page"])
            await _broadcast_focus(st["page"])
    except Exception:
        ws_state.pop(id(websocket), None)
        if websocket in active_connections:
            try:
                active_connections.remove(websocket)
            except Exception:
                pass

# ───────────────────────────────────────────
# 전체 상태 체크 (백그라운드)
# ───────────────────────────────────────────
@app.get("/api/status")
async def get_status():
    """옛 장비 목록(devices.json)의 접속 상태 집계 — 옛 UI 대시보드가 읽는다.

    새 설치에는 그 파일이 없다. 그때 500 을 내던 것을(스모크에서 잡힘, 2026-09-29) 0 집계로 답한다 —
    장비는 이제 PG(/api/devices2)에 있고 이 길은 옛 화면 호환용이다.
    """
    summary = {"connected": 0, "disconnected": 0, "unknown": 0}
    try:
        data = load_json(DEVICES_FILE)
    except Exception:
        return summary
    for d in (data.get("devices") or []) if isinstance(data, dict) else []:
        s = d.get("status", "unknown")
        summary[s] = summary.get(s, 0) + 1
    return summary



# ══════════════ Jira · 결함 — routes/jira.py 로 옮겼다(2026-09-28, 분리 2호) ══════════════
#
# 이 파일 다섯 곳(연동·로그인 시험·이슈·캐시·묻기·결함)에 흩어져 있던 것을
# 한 파일로 모았다. 여기 남은 Jira 계정 로그인·_auto_defect·Confluence 가
# 그쪽 이름을 쓰므로 아래에서 받아 둔다. 주소는 하나도 안 바뀐다.
core.bind(
    DATA_DIR=DATA_DIR,
    LLMS_FILE=LLMS_FILE,
    JIRA_FILE=JIRA_FILE,
    DEFECT_CLASS_FILE=DEFECT_CLASS_FILE,
    load_json=load_json,
    save_json=save_json,
    broadcast=broadcast,
    kv_load_sync=_kv_load_sync,
    kv_save_sync=_kv_save_sync,
    find_user=_find_user,
    require_admin=_require_admin,
    token_from=_token_from,
    JIRA_LAST_FAIL=_JIRA_LAST_FAIL,
    jira_verify_flag=_jira_verify_flag,
    jira_login_base=_jira_login_base,
    jira_login_on=_jira_login_on,
    jira_verify_login=_jira_verify_login,
    jira_auto_create=_jira_auto_create,
    ALLOWED_EMAIL_DOMAIN=ALLOWED_EMAIL_DOMAIN,
    prompt_of=_prompt_of,
    purpose_params=_purpose_params,
    apply_purpose_params=_apply_purpose_params,
    llm_pick=_llm_pick,
    user_of=_user_of,
    REQ_IMG_DIR=REQ_IMG_DIR,
    model_group_of=_model_group_of,
    user_id_of=_user_id_of,
    jira_defect_defaults=_jira_defect_defaults,
)
from routes import jira as _jira_routes  # noqa: E402
app.include_router(_jira_routes.router)
# 남은 코드가 쓰는 이름 — 부를 때 찾으므로 여기서 한 번 받아 두면 된다
_jira_cfg = _jira_routes._jira_cfg
_jira_call = _jira_routes._jira_call
_jira_fetch_users = _jira_routes._jira_fetch_users
_jira_leaders = _jira_routes._jira_leaders
jira_create_issue = _jira_routes.jira_create_issue
_JIRA_CACHE_DIR = _jira_routes._JIRA_CACHE_DIR
_jira_cache_read = _jira_routes._jira_cache_read
_jira_cache_scheduler = _jira_routes._jira_cache_scheduler
RELEASE_SUMMARY_FILE = _jira_routes.RELEASE_SUMMARY_FILE
_jira_llm_complete = _jira_routes._jira_llm_complete


@app.get("/api/users/jira-sync")
async def api_users_jira_sync_status(token: str = ""):
    """지난번 동기화가 언제·어떻게 됐나 (화면 머리줄)."""
    _require_admin(token)
    cfg = _jira_cfg()
    return {
        "ok": True,
        "url": str(cfg.get("url") or ""),
        "login_url": _jira_login_base(cfg),
        "user": str(cfg.get("user") or ""),
        "login_enabled": bool(cfg.get("login_enabled")),
        "auto_create": _jira_auto_create(),
        "last": cfg.get("last_user_sync") or None,
    }


@app.post("/api/users/jira-sync")
async def api_users_jira_sync(payload: dict = None, token: str = ""):
    """Jira 사용자를 UTOP 명단으로 **끌어온다.**

    ★ 관리자가 정한 것은 안 덮는다 — 역할(role)과 잠금(active)은 그대로 둔다.
      Jira 가 정본인 것은 **누가 있는가·이름·메일·Jira 활성**까지다.
    ★ 비밀번호는 여기서도 없다. Jira 가 갖고 있다.
    """
    _require_admin(token)
    q = str((payload or {}).get("search") or "").strip()
    rows, err = await asyncio.to_thread(_jira_fetch_users, q)
    if err:
        return {"ok": False, **err}
    # 직급(리더) 유추 — 팀장·그룹장 그룹의 구성원. 못 읽어도 동기화는 계속한다.
    try:
        leaders = await asyncio.to_thread(_jira_leaders)
    except Exception:
        leaders = set()
    data = _users_load_sync()
    by_name = {str(u.get("username") or "").lower(): u for u in data["users"]}
    by_key = {str(u.get("jira_key") or ""): u for u in data["users"] if u.get("jira_key")}
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_n = chg_n = off_n = back_n = lead_n = 0
    for j in rows:
        cur = by_key.get(j["jira_key"]) if j["jira_key"] else None
        if cur is None:
            cur = by_name.get(j["username"].lower())
        if cur is None:
            # **비활성(퇴사자) 신규는 안 만든다**(지시: 퇴사자 필요 없음).
            # 명단에 없고 이미 Jira 에서 나간 사람은 애초에 추가하지 않는다 —
            # 안 그러면 지워도 다음 동기화마다 되살아난다.
            if not j["jira_active"]:
                continue
            _is_lead = j["username"].lower() in leaders
            nu = {
                "id": j["username"], "username": j["username"], "name": j["name"],
                "role": "팀장" if _is_lead else "팀원", "email": j["email"], "active": True,
                "dept": j.get("dept") or "",
                "source": "jira",
                "jira_key": j["jira_key"], "jira_active": True,
                "created_at": now, "synced_at": now,
            }
            if _is_lead:
                nu["role_by"] = "jira"
                lead_n += 1
            data["users"].append(nu)
            new_n += 1
            continue
        before = (cur.get("name"), cur.get("email"), cur.get("jira_active"), cur.get("jira_key"))
        if j["name"]:
            cur["name"] = j["name"]
        if j["email"]:
            cur["email"] = j["email"]
        if j["jira_key"]:
            cur["jira_key"] = j["jira_key"]
        if j.get("dept") and not str(cur.get("dept") or "").strip():
            cur["dept"] = j["dept"]   # 비어 있을 때만 — 관리자가 정한 소속은 그대로
        # 직급(리더) — Jira 의 팀장/그룹장 그룹이 정본. **관리자가 손으로 정한
        # 역할(관리자·담당, 또는 손으로 준 팀장)은 안 건드린다** — jira 가 준
        # 것(role_by=jira)만 올리고 내린다. 이 규칙은 active 의 locked_by 와 같다.
        _is_lead = str(cur.get("username") or "").lower() in leaders
        if _is_lead and cur.get("role") == "팀원":
            cur["role"] = "팀장"; cur["role_by"] = "jira"; lead_n += 1
        elif not _is_lead and cur.get("role") == "팀장" and cur.get("role_by") == "jira":
            cur["role"] = "팀원"; cur.pop("role_by", None)
        cur["jira_active"] = j["jira_active"]
        cur["source"] = "jira"
        cur["synced_at"] = now
        """
        Jira 에서 나간 사람은 **여기서도 잠근다.**

        퇴사자가 명단에 활성으로 남아 있으면 「누가 들어올 수 있나」 가 틀린
        답을 준다. 다만 **우리가 잠근 것만** 되돌린다(locked_by) — 관리자가
        따로 잠근 사람을 Jira 가 살아났다고 풀어 주면 안 된다.
        """
        if not j["jira_active"] and cur.get("active", True):
            cur["active"] = False
            cur["locked_by"] = "jira"
            off_n += 1
        elif j["jira_active"] and cur.get("active") is False and cur.get("locked_by") == "jira":
            cur["active"] = True
            cur.pop("locked_by", None)
            back_n += 1
        if before != (cur.get("name"), cur.get("email"), cur.get("jira_active"), cur.get("jira_key")):
            chg_n += 1
    _users_save_sync(data)
    stat = {"at": now, "found": len(rows), "new": new_n, "changed": chg_n,
            "locked": off_n, "unlocked": back_n, "leads": lead_n,
            "active": len([x for x in rows if x["jira_active"]]),
            "inactive": len([x for x in rows if not x["jira_active"]])}
    cfg = _jira_cfg()
    cfg["last_user_sync"] = stat
    save_json(JIRA_FILE, cfg)
    return {"ok": True, **stat}











# ===== 게시판 (수정사항 요청) =====
BOARD_FILE = DATA_DIR / "state" / "board.json"
BOARD_FILES_DIR = DATA_DIR / "board_files"
BOARD_FILES_DIR.mkdir(parents=True, exist_ok=True)


def _board_load():
    if BOARD_FILE.exists():
        try:
            return load_json(BOARD_FILE)
        except Exception:
            return {"posts": []}
    return {"posts": []}


@app.get("/api/board")
async def board_list():
    return _board_load()


@app.post("/api/board")
async def board_add(payload: dict):
    data = _board_load()
    posts = data.get("posts", [])
    import time as _t
    post = {
        "id": str(int(_t.time() * 1000)),
        "title": (str(payload.get("title", "")).strip() or "(제목 없음)"),
        "body": str(payload.get("body", "")).strip(),
        "author": (str(payload.get("author", "")).strip() or "익명"),
        "status": "open",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "done_at": "",
        "attachments": (payload.get("attachments") or []),
    }
    posts.insert(0, post)
    data["posts"] = posts
    save_json(BOARD_FILE, data)
    await broadcast({"type": "board_update"})
    return {"success": True, "post": post}


@app.post("/api/board/{pid}")
async def board_update(pid: str, payload: dict):
    data = _board_load()
    for p in data.get("posts", []):
        if p.get("id") == pid:
            if "status" in payload:
                p["status"] = str(payload.get("status") or "open").strip()  # open/approved/rejected/done 그대로 저장
                p["done_at"] = datetime.now().strftime("%Y-%m-%d %H:%M") if p["status"] == "done" else ""
            for k in ("title", "body", "author"):
                if k in payload:
                    p[k] = str(payload[k]).strip()
            if isinstance(payload.get("attachments"), list):
                import os as _os
                new_names = set(str((a or {}).get("name", "")) for a in payload["attachments"] if isinstance(a, dict))
                for old in (p.get("attachments") or []):
                    on = str((old or {}).get("name", ""))
                    if on and on not in new_names:
                        try:
                            fp = BOARD_FILES_DIR / _os.path.basename(on)
                            if fp.exists():
                                fp.unlink()
                        except Exception:
                            pass
                p["attachments"] = payload["attachments"]
            save_json(BOARD_FILE, data)
            try: asyncio.create_task(broadcast({"type": "board_update"}))
            except Exception: pass
            return {"success": True, "post": p, "_v": "v2", "_rs": payload.get("status"), "_haskey": ("status" in payload)}
    raise HTTPException(404, "글을 찾을 수 없습니다")


@app.delete("/api/board/{pid}")
async def board_remove(pid: str):
    import os as _os
    data = _board_load()
    keep = []
    for p in data.get("posts", []):
        if p.get("id") == pid:
            for a in (p.get("attachments") or []):
                try:
                    fp = BOARD_FILES_DIR / _os.path.basename(str(a.get("name", "")))
                    if fp.exists():
                        fp.unlink()
                except Exception:
                    pass
        else:
            keep.append(p)
    data["posts"] = keep
    save_json(BOARD_FILE, data)
    await broadcast({"type": "board_update"})
    return {"success": True}


@app.post("/api/board-upload")
async def board_upload(payload: dict):
    import time as _t
    import re as _re
    import base64 as _b64
    orig = str(payload.get("orig", "file")) or "file"
    data = str(payload.get("data", ""))
    if data.startswith("data:") and "," in data:
        data = data.split(",", 1)[1]
    try:
        raw = _b64.b64decode(data)
    except Exception:
        raise HTTPException(400, "파일 디코드 실패")
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(413, "파일이 너무 큽니다 (25MB 이하)")
    safe = _re.sub(r"[^A-Za-z0-9._-]", "_", orig)
    fname = str(int(_t.time() * 1000)) + "_" + safe
    with open(BOARD_FILES_DIR / fname, "wb") as fp:
        fp.write(raw)
    ext = orig.rsplit(".", 1)[-1].lower() if "." in orig else ""
    is_image = ext in ("png", "jpg", "jpeg", "gif", "webp", "bmp", "svg")
    return {"success": True, "name": fname, "orig": orig, "url": "/api/board/file/" + fname, "size": len(raw), "is_image": is_image}


@app.get("/api/board/file/{fname}")
async def board_file(fname: str):
    import os as _os
    dest = BOARD_FILES_DIR / _os.path.basename(fname)
    if not dest.exists():
        raise HTTPException(404, "파일 없음")
    return FileResponse(str(dest))


@app.post("/api/board/{pid}/reply")
async def board_reply_add(pid: str, payload: dict):
    import time as _t
    data = _board_load()
    for p in data.get("posts", []):
        if p.get("id") == pid:
            if not isinstance(p.get("replies"), list):
                p["replies"] = []
            reply = {
                "id": "r" + str(int(_t.time() * 1000)),
                "author": (str(payload.get("author", "")).strip() or "익명"),
                "body": str(payload.get("body", "")).strip(),
                "attachments": (payload.get("attachments") or []),
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
            }
            p["replies"].append(reply)
            save_json(BOARD_FILE, data)
            await broadcast({"type": "board_update"})
            return {"success": True, "reply": reply}
    raise HTTPException(404, "글을 찾을 수 없습니다")


@app.post("/api/board/{pid}/reply/{rid}")
async def board_reply_update(pid: str, rid: str, payload: dict):
    import os as _os
    data = _board_load()
    for p in data.get("posts", []):
        if p.get("id") == pid:
            for rp in (p.get("replies") or []):
                if rp.get("id") == rid:
                    if "body" in payload:
                        rp["body"] = str(payload["body"]).strip()
                    if "author" in payload:
                        rp["author"] = str(payload["author"]).strip() or "익명"
                    if isinstance(payload.get("attachments"), list):
                        new_names = set(str((a or {}).get("name", "")) for a in payload["attachments"] if isinstance(a, dict))
                        for old in (rp.get("attachments") or []):
                            on = str((old or {}).get("name", ""))
                            if on and on not in new_names:
                                try:
                                    fp = BOARD_FILES_DIR / _os.path.basename(on)
                                    if fp.exists():
                                        fp.unlink()
                                except Exception:
                                    pass
                        rp["attachments"] = payload["attachments"]
                    rp["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
                    save_json(BOARD_FILE, data)
                    await broadcast({"type": "board_update"})
                    return {"success": True, "reply": rp}
            raise HTTPException(404, "답글을 찾을 수 없습니다")
    raise HTTPException(404, "글을 찾을 수 없습니다")


@app.delete("/api/board/{pid}/reply/{rid}")
async def board_reply_remove(pid: str, rid: str):
    import os as _os
    data = _board_load()
    for p in data.get("posts", []):
        if p.get("id") == pid:
            keep = []
            for rp in (p.get("replies") or []):
                if rp.get("id") == rid:
                    for a in (rp.get("attachments") or []):
                        try:
                            fp = BOARD_FILES_DIR / _os.path.basename(str(a.get("name", "")))
                            if fp.exists():
                                fp.unlink()
                        except Exception:
                            pass
                else:
                    keep.append(rp)
            p["replies"] = keep
            save_json(BOARD_FILE, data)
            await broadcast({"type": "board_update"})
            return {"success": True}
    raise HTTPException(404, "글을 찾을 수 없습니다")




# ── 시스템 UI 옵션 (관리자 설정 → 전체 유저 공유) ──
UI_OPTIONS_FILE = DATA_DIR / "config" / "ui_options.json"
def _load_ui_options():
    if UI_OPTIONS_FILE.exists():
        try: return json.loads(UI_OPTIONS_FILE.read_text(encoding="utf-8"))
        except: pass
    return {"show_req_id": True, "show_tc_id": True}

@app.get("/api/ui-options")
async def ui_options_get():
    return _load_ui_options()

@app.post("/api/ui-options")
async def ui_options_save(payload: dict, token: str = ""):
    _require_admin(token)
    cur = _load_ui_options()
    if "show_req_id" in payload: cur["show_req_id"] = bool(payload["show_req_id"])
    if "show_tc_id" in payload: cur["show_tc_id"] = bool(payload["show_tc_id"])
    UI_OPTIONS_FILE.write_text(json.dumps(cur, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, **cur}

# ── Global Parameters (TC 변수 치환용) ──
def _load_global_params():
    if GLOBAL_PARAMS_FILE.exists():
        try: return json.loads(GLOBAL_PARAMS_FILE.read_text(encoding="utf-8"))
        except: pass
    return {}

@app.get("/api/global-params")
async def global_params_get():
    return _load_global_params()

@app.post("/api/global-params")
async def global_params_save(payload: dict):
    GLOBAL_PARAMS_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════
# TO-DO (관리자 공용) — app_kv 에 저장. WebSocket 으로 실시간 동기화.
# 형식: {"items": [{text, status, at}, ...]}
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/todo")
async def todo_list():
    d = await db.kv_get("admin_todo") or {}
    items = d.get("items") if isinstance(d, dict) else None
    return {"items": items if isinstance(items, list) else []}


@app.post("/api/todo")
async def todo_save(payload: dict):
    items = (payload or {}).get("items")
    if not isinstance(items, list):
        raise HTTPException(400, "items 는 배열이어야 합니다")
    # 정리 (문자열 필드만, 상태 화이트리스트)
    _valid_st = {"todo", "doing", "done"}
    _clean = []
    for it in items:
        if not isinstance(it, dict):
            continue
        _cmts_raw = it.get("comments") if isinstance(it.get("comments"), list) else []
        _cmts = []
        for c in _cmts_raw:
            if not isinstance(c, dict):
                continue
            _imgs_raw = c.get("images") if isinstance(c.get("images"), list) else []
            # 이미지는 dataURL 문자열만, 5MB 이하 각각·항목당 최대 10개
            _imgs = []
            for im in _imgs_raw[:10]:
                if isinstance(im, str) and im.startswith("data:") and len(im) < 5_000_000:
                    _imgs.append(im)
            _cmts.append({
                "id": str(c.get("id") or "")[:64],
                "text": str(c.get("text") or "")[:4000],
                "images": _imgs,
                "author": str(c.get("author") or "")[:100],
                "at": c.get("at") or 0,
            })
        _clean.append({
            "text": str(it.get("text") or "")[:2000],
            "status": (it.get("status") if it.get("status") in _valid_st else "todo"),
            "at": it.get("at") or 0,
            "comments": _cmts,
        })
    await db.kv_set("admin_todo", {"items": _clean})
    try: asyncio.create_task(broadcast({"type": "todo_updated"}))
    except Exception: pass
    return {"ok": True, "items": _clean}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)








# ══════════════════════════════════════════════════════════════════════
# 자연어 시험 (AI Assistant) — 길 9개
#
# 다른 UTOP 서버에서 돌던 것을 옮겨 왔다. 이제 routes/nl_test.py 이고 main 을
# 거꾸로 부르지 않는다(core·routes/ai 를 본다) — 그래도 자리는 맨 끝에 둔다.
#
# 못 붙어도 서버는 그대로 뜬다 — 자연어 시험만 죽고 나머지 화면은 산다.
# 시연을 앞두고 화면 한 칸 때문에 전체가 안 뜨는 일은 없어야 한다.
# ══════════════════════════════════════════════════════════════════════
try:
    from routes import nl_test as _nl_routes  # noqa: E402
    app.include_router(_nl_routes.router)
    print("[startup] 자연어 시험(nl_test) 붙음 — /api/ai/nl-* · /api/ai/examples", flush=True)
except Exception as _nl_e:  # pragma: no cover - 기동 로그로만 알린다
    print(f"[startup] 자연어 시험(nl_test) 못 붙임: {_nl_e}", flush=True)


# ── 엑셀 읽기 ───────────────────────────────────────────────────────────────
# xlsx 는 **zip 안의 xml** 이다. 그래서 읽는 데 꾸러미가 필요 없다 —
# 이 서버에는 openpyxl 도 pandas 도 없고(requirements 확인), 망이 막힌 곳에
# 설치하러 가는 것보다 표준 라이브러리로 읽는 편이 확실하다.

_XL_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def _xl_col(ref: str) -> int:
    """칸 이름 → 자리. A1 → 0, AB12 → 27"""
    n = 0
    for ch in ref:
        if not ch.isalpha():
            break
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1


def _xl_txt(v) -> str:
    """엑셀 칸 값 → 글자. 사람이 엑셀에서 보던 대로 적는다."""
    import datetime as _dt      # 이 이름은 이 파일의 전역에 없다(자리마다 따로 들인다)
    if v is None:
        return ""
    if isinstance(v, bool):
        return "예" if v else "아니오"
    if isinstance(v, _dt.datetime):
        return v.strftime("%Y-%m-%d") if (v.hour, v.minute, v.second) == (0, 0, 0) else v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, _dt.date):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, float) and v == int(v):
        return str(int(v))      # 3.0 은 3 으로 — 엑셀이 정수도 실수로 준다
    return str(v)


def _xlsx_grid(raw: bytes) -> list[list[str]]:
    """엑셀 한 통 → 줄·칸. 첫 장만 읽는다.

    openpyxl 이 있으면 그것으로 읽는다 — **날짜 때문이다.** 엑셀은 날짜를
    45000 같은 날수로 담고 「보이는 꼴」 은 서식에 따로 둔다. 손으로 풀면 그
    숫자가 그대로 나온다.

    다만 openpyxl 은 지금 markitdown 이 딸려 들여온 것이라(requirements 에
    제 이름으로 적혀 있지 않다) 언제 사라져도 이상하지 않다. 그때를 위해 손으로
    푸는 길을 남겨 둔다 — xlsx 는 zip 안의 xml 이라 꾸러미 없이도 읽힌다.
    """
    try:
        import io as _io
        from openpyxl import load_workbook  # noqa: PLC0415
    except Exception:
        return _xlsx_grid_zip(raw)

    wb = load_workbook(_io.BytesIO(raw), read_only=True, data_only=True)
    try:
        ws = wb[wb.sheetnames[0]]
        grid = [[_xl_txt(v) for v in row] for row in ws.iter_rows(values_only=True)]
    finally:
        wb.close()
    return _xl_trim(grid)


def _xl_trim(grid: list[list[str]]) -> list[list[str]]:
    """끝에 붙은 빈 줄을 떼고 오른쪽 빈 칸을 줄인다 — 엑셀 끝에 흔히 붙는다."""
    for r in grid:
        while r and not str(r[-1]).strip():
            r.pop()
    while grid and not any(str(x).strip() for x in grid[-1]):
        grid.pop()
    return grid


def _xlsx_grid_zip(raw: bytes) -> list[list[str]]:
    """꾸러미 없이 손으로 푼다 — zip 안의 xml."""
    import io as _io
    import zipfile as _zf
    from xml.etree import ElementTree as _ET

    z = _zf.ZipFile(_io.BytesIO(raw))
    names = z.namelist()

    # 글자는 한곳에 모아 두고 칸은 번호로 가리킨다(sharedStrings)
    shared: list[str] = []
    if "xl/sharedStrings.xml" in names:
        for si in _ET.fromstring(z.read("xl/sharedStrings.xml")):
            shared.append("".join(t.text or "" for t in si.iter(_XL_NS + "t")))

    sheets = sorted(n for n in names if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
    if not sheets:
        return []
    root = _ET.fromstring(z.read(sheets[0]))

    grid: list[list[str]] = []
    for r in root.iter(_XL_NS + "row"):
        cells: dict[int, str] = {}
        for c in r.findall(_XL_NS + "c"):
            t = c.get("t")
            v = c.find(_XL_NS + "v")
            if t == "s":
                txt = shared[int(v.text)] if v is not None and v.text else ""
            elif t == "inlineStr":
                txt = "".join(x.text or "" for x in c.iter(_XL_NS + "t"))
            else:
                txt = (v.text or "") if v is not None else ""
                # 엑셀은 0.5 를 0.5 로, 3 을 3 으로 주지만 가끔 3.0 으로 준다
                if txt and re.fullmatch(r"-?\d+\.0+", txt):
                    txt = txt.split(".")[0]
            if txt:
                cells[_xl_col(c.get("r", "A"))] = txt
        grid.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])

    return _xl_trim(grid)


@app.post("/api/xlsx-read")
async def xlsx_read(file: UploadFile = File(...)):
    """올린 엑셀을 **글자 판**으로 돌려준다.

    화면은 이미 붙여넣은 글(탭으로 갈린 것)을 다룰 줄 안다. 그러니 엑셀도
    같은 모양으로 바꿔 주면 미리보기·열 맞추기·「모두 지우고」 가 전부 그대로
    돌아간다 — 들이는 길을 둘로 만들지 않는다.

    지적: 엑셀을 고르면 자료가 깨졌다. 그때껏 화면이 파일을 **글자로** 읽고
    있었는데, xlsx 는 압축된 덩어리라 그대로 읽으면 알아볼 수 없는 것이 된다.
    """
    raw = await file.read()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(400, "파일이 너무 큽니다(20MB 까지)")
    if raw[:2] != b"PK":
        raise HTTPException(400, "엑셀(.xlsx) 파일이 아닙니다 — 옛 .xls 는 xlsx 로 저장해 주세요")
    try:
        grid = _xlsx_grid(raw)
    except Exception as e:
        raise HTTPException(400, f"엑셀을 읽지 못했습니다: {e}")
    if not grid:
        raise HTTPException(400, "빈 장입니다")
    w = max(len(r) for r in grid)
    tsv = "\n".join("\t".join((r + [""] * w)[:w]) for r in grid)
    return {"ok": True, "rows": len(grid), "cols": w, "tsv": tsv}
