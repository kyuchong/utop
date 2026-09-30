#!/usr/bin/env bash
# 오프라인 갱신 꾸러미 풀기 — **인터넷이 안 되는 PC** 에서 돌린다.
#
#   tools/offline_apply.sh utop-offline-<커밋>.tgz
#
# tools/offline_pack.sh 가 만든 꾸러미에서 소스(git bundle)를 당겨 오고 이미지를
# 실은 뒤, 빌드 없이 기동한다. .env 와 DB 볼륨은 건드리지 않는다.
set -euo pipefail
PACK="${1:?꾸러미 파일을 적으세요: tools/offline_apply.sh utop-offline-xxxx.tgz}"
cd "$(dirname "$0")/.."
DC="docker compose"; docker version >/dev/null 2>&1 || DC="sudo docker compose"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "[1] 꾸러미 풀기"
tar -C "$TMP" -xzf "$PACK"
SHA="$(cat "$TMP/COMMIT" 2>/dev/null || echo '?')"
echo "[2] 소스 맞추기 → $SHA"
if [ -d .git ]; then
    git checkout -- . 2>/dev/null || true
    git fetch "$TMP/utop.bundle" HEAD 2>/dev/null && git merge --ff-only FETCH_HEAD || \
    { git fetch "$TMP/utop.bundle" main && git merge --ff-only FETCH_HEAD; }
    echo "    현재 커밋: $(git rev-parse --short HEAD)"
else
    echo "    git 저장소가 아니라 소스는 그대로 둡니다"
fi
echo "[3] 이미지 싣기 (몇 분 걸립니다)"
$DC pull --ignore-buildable >/dev/null 2>&1 || true
docker load -i "$TMP/images.tar"
echo "[4] 기동 (빌드 없이)"
$DC up -d --no-build
echo
echo "끝. 화면을 Ctrl+F5 로 새로 받으세요.  버전 확인: SETUP › 버전·라이선스"
