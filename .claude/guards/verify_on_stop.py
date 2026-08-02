"""Stop hook: 세션 종료 전 python tools/verify.py 실행.

실패 시 stderr 로 결과를 흘리고 exit 2 로 계속 작업하도록 유도.
성공 시 exit 0.

주의: tools/verify.py 실측 시간 평균 ~8.4s. 이 훅 timeout 은 settings.json 에서 30s 로 잡음.
"""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


ROOT = Path(__file__).resolve().parent.parent.parent
VERIFY = ROOT / "tools" / "verify.py"


def main() -> int:
    if not VERIFY.exists():
        print(f"[verify_on_stop] tools/verify.py 없음: {VERIFY}", file=sys.stderr)
        return 0
    r = subprocess.run(
        [sys.executable, str(VERIFY)],
        cwd=ROOT,
        capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )
    if r.returncode == 0:
        # 성공이라도 스킵이 있으면(⚠️ 마커) 사용자가 놓치지 않도록 stderr 로 알림.
        if r.stdout and "⚠️" in r.stdout:
            print("[verify_on_stop] tools/verify.py 통과 — 다만 스킵된 검사가 있습니다:", file=sys.stderr)
            for ln in r.stdout.rstrip().split("\n"):
                if "⚠️" in ln or "건너뜀" in ln or "SKIP" in ln:
                    print(f"  {ln}", file=sys.stderr)
        return 0
    print("[verify_on_stop] tools/verify.py 실패 — 계속 작업하세요.", file=sys.stderr)
    if r.stdout.strip():
        print(r.stdout.rstrip(), file=sys.stderr)
    if r.stderr.strip():
        print(r.stderr.rstrip(), file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
