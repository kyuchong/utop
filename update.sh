#!/usr/bin/env bash
# UTOP 받아 올리기 — **어느 서버에서나 같은 한 줄.**
#
#   ./update.sh
#
# 253 홈에만 있던 것을 저장소로 옮겼다. 서버마다 주소·도커 권한이 달라 각자
# 손으로 고친 판을 들고 있으면, 고쳐 올린 것이 어디까지 갔는지 알 수 없다.
#
# 하는 일은 start.sh 와 같다(소스 받기 · .env 확인 · 빌드 · 기동 · 주소 안내).
# 다른 점은 앞에서 **이 서버에서 손댄 것을 버리는 것** 하나뿐이다 — 운용 서버는
# 고쳐 쓰는 곳이 아니라 받아 쓰는 곳이라, 남은 수정이 pull 을 막으면 안 된다.
# 처음 세우는 서버에서 돌려도 된다(.env 는 start.sh 가 만든다).
set -euo pipefail
cd "$(dirname "$0")"

if [ -d .git ]; then
    # 받아 온 것과 어긋나는 수정만 버린다. 새로 만든 파일(.env 등)은 건드리지
    # 않는다 — `git clean` 을 쓰면 .env 가 날아가 DB 비밀번호가 어긋난다.
    git checkout -- . 2>/dev/null || true
fi

exec ./start.sh
