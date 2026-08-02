"""PreToolUse hook: Bash 로 위험 명령을 사전 차단.

입력: stdin JSON  { "tool_input": { "command": "..." } }

차단 대상:
  - git add -A / git add .
  - git commit -a / git commit -am
  - git reset --hard
  - git push --force / --force-with-lease / +refspec (이력 덮어쓰기)
  - rm -rf 로 data/ 또는 db/ 하위 대상
  - db/schema.sql 직접 수정 (Edit/Write 로만 허용)
  - alembic/versions 디렉토리 직접 수정 (마이그레이션 파일)

허용으로 바꾼 것:
  - 일반 git push  — 2026-08-02 사용자 결정.
    에이전트가 수정·검증·커밋·푸시까지 하고, 사용자는 GitHub 에서 받아 확인한다.
    다만 강제 푸시는 원격 이력을 지우므로 계속 막는다.

차단 시 stderr 에 사유 + 대안 명시하고 exit 2.

차단 시 stderr 에 사유 + 대안 명시하고 exit 2.
"""
from __future__ import annotations
import json
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


# (정규식, 사유, 대안) 튜플. 명령 문자열에 매치되면 차단.
RULES: list[tuple[re.Pattern, str, str]] = [
    (re.compile(r"\bgit\s+add\s+(-A\b|\.\s*$|\.\s*&)"),
     "git add -A / git add . 금지",
     "커밋할 경로를 명시해서 add 하세요. 예: git add backend/main.py"),
    (re.compile(r"\bgit\s+commit\s+.*-a[m]?\b"),
     "git commit -a / -am 금지",
     "먼저 git add 로 스테이지 후 git commit 하세요."),
    (re.compile(r"\bgit\s+reset\s+--hard\b"),
     "git reset --hard 금지",
     "작업을 잃을 수 있습니다. git stash 또는 새 브랜치로 우회하세요."),
    # 일반 push 는 허용(2026-08-02 결정). 이력을 덮어쓰는 강제 푸시만 막는다.
    (re.compile(r"\bgit\s+push\b[^|;&]*(--force\b|--force-with-lease\b|\s-f\b|\s\+[\w./-]+:)"),
     "git push --force 금지 (원격 이력이 사라집니다)",
     "일반 push 로 되지 않으면 원인을 확인하고, 강제 푸시가 꼭 필요하면 사용자가 직접 실행하세요."),
    (re.compile(r"\brm\s+-r[a-z]*f[a-z]*\s+.*\b(data|db)/"),
     "rm -rf 로 data/ 또는 db/ 하위 삭제 금지",
     "삭제가 필요하면 이유와 대상을 사용자에게 먼저 승인받으세요."),
    (re.compile(r"\b(sed|awk|perl)\b[^|]*\s+.*db/schema\.sql\b"),
     "db/schema.sql 을 스트림 편집기로 수정 금지",
     "스키마 변경은 Edit 도구로 명시적으로 수정하세요."),
    (re.compile(r"\b(rm|mv|cp)\s+.*\balembic/versions/"),
     "alembic/versions 파일 이동/삭제 금지",
     "마이그레이션 파일은 alembic revision 등으로만 관리하세요."),
]


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception as e:
        print(f"[no_dangerous_bash] stdin JSON 파싱 실패: {e}", file=sys.stderr)
        return 0
    cmd = (payload.get("tool_input") or {}).get("command") or ""
    if not isinstance(cmd, str) or not cmd.strip():
        return 0

    for rx, reason, advice in RULES:
        if rx.search(cmd):
            print(f"[no_dangerous_bash] 차단: {reason}", file=sys.stderr)
            print(f"  명령: {cmd[:200]}", file=sys.stderr)
            print(f"  대안: {advice}", file=sys.stderr)
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
