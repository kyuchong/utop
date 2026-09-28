#!/usr/bin/env bash
# 기능별 동작 검증 — **빈 DB 위에 새 api 를 띄워** 각 묶음의 길을 실제로 부른다.
#
# 라우트 목록 대조나 컴파일로는 「뜨긴 뜨는데 값이 어긋나는」 종류를 못 잡는다.
# 그래서 진짜 서버를 세우고 만들고·읽고·고치고·지운다. 운영 DB 는 건드리지 않는다
# (compose 프로젝트 이름이 다르고, 비밀번호도 매번 새로 만든다).
#
#   ./tools/smoke.sh              # 전부 (tests/smoke/*_smoke.py)
#   ./tools/smoke.sh wiki cycle   # 고른 묶음만
#   KEEP=1 ./tools/smoke.sh       # 끝나고 스택을 남긴다(디버깅)
#
# 각 대본은 docs/features/<묶음>.md 의 「동작 확인」 절과 짝이다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJ="${PROJ:-utop-smoke}"
ENVF="$(mktemp)"
printf 'POSTGRES_PASSWORD=%s\nWEB_PORT=9999\nTZ=Asia/Seoul\n' "$(python3 -c 'import secrets;print(secrets.token_hex(8))')" > "$ENVF"
cleanup() {
  if [ -z "${KEEP:-}" ]; then
    docker compose -p "$PROJ" --env-file "$ENVF" -f "$ROOT/docker-compose.yml" down -v --rmi local >/dev/null 2>&1 || true
  fi
  rm -f "$ENVF"
}
trap cleanup EXIT

echo "[smoke] 빈 DB + api 띄우기 ($PROJ)"
docker compose -p "$PROJ" --env-file "$ENVF" -f "$ROOT/docker-compose.yml" up -d --build db api >/dev/null
API="${PROJ}-api-1"
for i in $(seq 1 80); do
  st="$(docker inspect -f '{{.State.Health.Status}}' "$API" 2>/dev/null || true)"
  [ "$st" = healthy ] && break
  sleep 3
done
if [ "${st:-}" != healthy ]; then
  echo "[smoke] api 가 뜨지 않았습니다 (health=$st)"; docker logs "$API" 2>&1 | tail -30; exit 1
fi

if [ $# -gt 0 ]; then parts=("$@"); else parts=(); for f in "$ROOT"/tests/smoke/*_smoke.py; do parts+=("$(basename "$f" _smoke.py)"); done; fi
fail=0
for p in "${parts[@]}"; do
  f="$ROOT/tests/smoke/${p}_smoke.py"
  [ -f "$f" ] || { echo "[smoke] 대본이 없습니다: $f"; fail=1; continue; }
  echo; echo "──── $p ────"
  if docker exec -i "$API" python - < "$f" 2>&1 | grep -v 'warn'; then :; else echo "[smoke] $p 실패"; fail=1; fi
done
echo
[ $fail -eq 0 ] && echo "[smoke] 전부 통과" || { echo "[smoke] 실패한 묶음이 있습니다"; exit 1; }
