"""프로젝트 회귀 검사 진입점. AGENTS.md 의 검증 명령.

실행: .venv\\Scripts\\python.exe tools\\verify.py   (저장소 어디서 실행해도 됨)
"""
from __future__ import annotations
import os, shutil, subprocess, sys
from pathlib import Path

# tools/ 안에 있으므로 저장소 루트는 부모의 부모다.
# 모든 검사가 이 ROOT 기준 경로를 쓰고, subprocess 도 cwd=ROOT 로 돈다.
ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable

# Windows: winget 로 설치한 nodejs 가 셸 세션에 잡히지 않은 경우가 있음.
# 표준 경로가 있으면 이 프로세스 PATH 에도 삽입해 subprocess (npx → node) 가 성공하도록.
_NODE_STD_DIRS = [r"C:\Program Files\nodejs", r"C:\Program Files (x86)\nodejs"]
for _d in _NODE_STD_DIRS:
    if Path(_d).exists() and _d not in os.environ.get("PATH", ""):
        os.environ["PATH"] = _d + os.pathsep + os.environ.get("PATH", "")
# npx 는 Windows 에선 npx.cmd 로 등록됨. shutil.which 로 실제 경로 해석.
# 못 찾으면 Windows 표준 설치 경로도 시도, 그래도 없으면 None → 프론트 린트 자체를 스킵
# (주 개발 환경에 node 없어도 회귀검사는 계속 진행).
NPX = shutil.which("npx") or shutil.which("npx.cmd")
if not NPX:
    for _cand in (r"C:\Program Files\nodejs\npx.cmd", r"C:\Program Files (x86)\nodejs\npx.cmd"):
        if Path(_cand).exists():
            NPX = _cand
            break

# Windows 기본 cp949 로 한글 로그 출력하면 UnicodeEncodeError. UTF-8 강제.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

CHECKS: list[tuple[str, list[str]]] = [
    ("py_compile backend/main.py",   [PY, "-m", "py_compile", str(ROOT / "backend" / "main.py")]),
    ("py_compile backend/engine.py", [PY, "-m", "py_compile", str(ROOT / "backend" / "engine.py")]),
    ("py_compile backend/db.py",     [PY, "-m", "py_compile", str(ROOT / "backend" / "db.py")]),
    ("py_compile scripts/launcher.py", [PY, "-m", "py_compile", str(ROOT / "scripts" / "launcher.py")]),
    ("api-reference.md 드리프트",     [PY, str(ROOT / "tools" / "gen_api_docs.py"), "--check"]),
    ("eslint globals 드리프트",       [PY, str(ROOT / "tools" / "gen_eslint_globals.py"), "--check"]),
    ("린트 (파이썬)",                  [PY, "-m", "ruff", "check", "."]),
    ("테스트",                        [PY, "-m", "pytest"]),
    ("하네스 자기 검사",               [PY, str(ROOT / "harness" / "checks" / "check_harness.py")]),
]
if NPX:
    CHECKS.append(("린트 (프론트)", [NPX, "eslint", "frontend/static/js"]))


def run(name: str, cmd: list[str]) -> str:
    """검사 하나를 실행. 결과 상태 반환: 'ok' | 'fail' | 'skip'."""
    print(f"[..] {name}", flush=True)
    try:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
    except FileNotFoundError as e:
        # 필수 실행 파일 없음(예: ruff/npx 미설치) — 스킵으로 표시.
        # 통과가 아니라 별도 상태. 다른 PC 에서 검사가 사라진 걸 발견하기 위함.
        missing = cmd[0] if cmd else "?"
        print(f"[SKIP] {name} — 실행 파일 없음: {missing}  ({e.strerror})")
        return "skip"
    if r.returncode == 0:
        print(f"[OK] {name}")
        return "ok"
    print(f"[FAIL] {name}")
    if r.stdout.strip(): print(r.stdout.rstrip())
    if r.stderr.strip(): print(r.stderr.rstrip())
    return "fail"


def main() -> int:
    total = len(CHECKS)
    failed: list[str] = []
    skipped: list[tuple[str, str]] = []  # (name, missing tool)
    for name, cmd in CHECKS:
        s = run(name, cmd)
        if s == "fail":
            failed.append(name)
        elif s == "skip":
            skipped.append((name, cmd[0] if cmd else "?"))
    passed = total - len(failed) - len(skipped)
    executed = total - len(skipped)

    print()
    print(f"실행 {executed}/{total}")
    if skipped:
        print(f"⚠️  건너뜀 {len(skipped)}건 — 도구 미설치로 검사가 실행되지 않았습니다:")
        for name, tool in skipped:
            print(f"    - {name}  (도구 없음: {tool})")
    if failed:
        print(f"실패 {len(failed)}/{executed}:")
        for n in failed:
            print(f"  - {n}")
        return 1
    if skipped:
        # 실패는 없지만 스킵이 있음: 사용자가 놓치지 않도록 마지막 줄에 다시 강조.
        print(f"⚠️  통과 {passed}/{executed} (스킵 {len(skipped)}건 — 위 목록 확인)")
        return 0
    print(f"✅ {passed}/{total} 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
