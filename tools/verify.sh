#!/usr/bin/env bash
# 회귀 검사를 **api 이미지 안에서** 돈다.
#
# tools/verify.py 가 요구하는 것(ruff·pytest·httpx·asyncpg …)이 이 PC 의 파이썬에는
# 없어도 된다 — 서버가 도는 바로 그 이미지에서 같은 파이썬으로 검사한다. 어느 PC 에서
# 돌려도 같은 결과가 나온다. 저장소는 읽기 전용으로 붙이고, 검사가 만드는 캐시는 버린다.
#
#   ./tools/verify.sh            # 기본 이미지 utop-api:latest
#   IMAGE=utop-api:test ./tools/verify.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${IMAGE:-utop-api:latest}"
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "[verify.sh] 이미지가 없습니다: $IMAGE — 먼저 docker compose build api" >&2
  exit 2
fi
docker run --rm -v "$ROOT":/src:ro -e DATABASE_URL=postgresql://x:x@localhost/x "$IMAGE" sh -c '
  cp -r /src /work && cd /work \
  && pip install -q ruff pytest >/dev/null 2>&1 \
  && python tools/verify.py'
