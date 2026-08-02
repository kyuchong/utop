#!/usr/bin/env bash
# UTOP 실행 스크립트 (리눅스 / macOS)
#
#   ./start.sh
#
# 하는 일:
#   1. 최신 소스 받기 (git pull)
#   2. .env 가 없으면 만들고 비밀번호 자동 생성
#   3. 도커 이미지 빌드 + 기동
#   4. 뜰 때까지 기다렸다가 접속 주소 안내
#
# 몇 번을 실행해도 안전하다 (데이터는 도커 볼륨에 그대로 남는다).

set -euo pipefail
cd "$(dirname "$0")"

step() { printf '\n[%s] %s\n' "$1" "$2"; }
ok()   { printf '    %s\n' "$1"; }

printf '\n  UTOP\n  ====\n'

# ── 0. 사전 확인 ────────────────────────────────────────────────
step 0 "도커 확인"
if ! docker version >/dev/null 2>&1; then
    printf '\n  [오류] Docker 가 실행 중이 아니거나 권한이 없습니다.\n'
    printf '         sudo 없이 쓰려면: sudo usermod -aG docker $USER  (재로그인 필요)\n\n'
    exit 1
fi
ok "Docker 실행 중"

# ── 1. 최신 소스 ────────────────────────────────────────────────
step 1 "최신 소스 받기"
if [ -d .git ]; then
    if git pull --ff-only; then ok "최신 상태"; else ok "git pull 실패 — 현재 소스로 계속"; fi
else
    ok "git 저장소가 아님 — 현재 소스로 진행"
fi

# ── 2. .env ─────────────────────────────────────────────────────
step 2 "설정 파일(.env) 확인"
if [ ! -f .env ]; then
    cp .env.example .env
    # 비밀번호는 손으로 넣게 하지 않는다 — 약한 비번이 굳는 걸 막는다.
    PW="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
    sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PW}|" .env && rm -f .env.bak
    ok ".env 생성 · DB 비밀번호 자동 생성"
else
    ok ".env 이미 있음 (건드리지 않음)"
fi

PORT="$(grep -E '^\s*WEB_PORT\s*=' .env | head -1 | sed 's/.*=\s*//' | tr -d '\r' || true)"
[ -n "${PORT:-}" ] || PORT=9000

# ── 3. 빌드 + 기동 ──────────────────────────────────────────────
step 3 "빌드 및 기동 (처음이면 몇 분 걸립니다)"
if ! docker compose up -d --build; then
    printf '\n  [오류] 기동 실패. 원인 확인:  docker compose logs api\n\n'
    exit 1
fi

# ── 4. 준비될 때까지 대기 ───────────────────────────────────────
step 4 "서버가 응답할 때까지 대기"
URL="http://localhost:${PORT}"
READY=0
for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null --max-time 3 "$URL"; then READY=1; break; fi
    sleep 2
done

printf '\n'
if [ "$READY" -eq 1 ]; then
    printf '  준비 완료 →  %s\n' "$URL"
    # 다른 PC 에서 접속할 주소도 같이 알려준다.
    IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    [ -n "${IP:-}" ] && printf '  다른 PC 에서 →  http://%s:%s\n' "$IP" "$PORT"
else
    # 흔한 실패 하나는 원인을 짚어준다.
    # PostgreSQL 은 POSTGRES_PASSWORD 를 볼륨 최초 생성 때만 적용한다.
    # "DB 볼륨은 이미 있는데 .env 를 새로 만든" 경우 비밀번호가 어긋나 api 가 무한 재시작한다.
    APILOG="$(docker compose logs api --tail 50 2>&1 || true)"
    printf '  서버가 응답하지 않습니다.\n'
    if printf '%s' "$APILOG" | grep -qE 'InvalidPasswordError|password authentication failed'; then
        printf '\n  원인: DB 비밀번호가 맞지 않습니다.\n'
        printf '        이미 만들어진 DB 볼륨의 비밀번호와 .env 의 값이 다릅니다.\n'
        printf '        (PostgreSQL 은 볼륨을 처음 만들 때의 비밀번호를 계속 씁니다)\n\n'
        printf '  해결 1) 기존 데이터를 버려도 되면 — DB 를 지우고 다시 만든다:\n'
        printf '           docker compose down -v\n'
        printf '           ./start.sh\n\n'
        printf '  해결 2) 데이터를 지켜야 하면 — .env 의 POSTGRES_PASSWORD 를\n'
        printf '           예전에 쓰던 값으로 되돌린 뒤 다시 실행한다.\n'
    else
        printf '  로그 확인:  docker compose logs -f api\n'
    fi
fi

printf '\n  정지:       docker compose down\n'
printf '  로그:       docker compose logs -f api\n'
printf '  데이터삭제: docker compose down -v\n\n'
