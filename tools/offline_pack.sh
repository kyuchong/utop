#!/usr/bin/env bash
# 오프라인 갱신 꾸러미 만들기 — **인터넷이 되는 서버**(213)에서 돌린다.
#
#   tools/offline_pack.sh [내보낼 파일.tgz]
#
# 인터넷이 안 되는 PC(시험망만 붙은 서버)는 git pull 도, 도커 바탕 이미지도
# 못 받아 update.sh 가 빌드 단계에서 죽는다. 그래서 여기서 구운 이미지 셋과
# 소스(git bundle)를 한 꾸러미로 묶어 시험망으로 넘기고, 받는 쪽은
# tools/offline_apply.sh 로 푼다. 기본 이름은 utop-offline-<커밋>.tgz 다.
set -euo pipefail
cd "$(dirname "$0")/.."
SHA="$(git rev-parse --short HEAD)"
OUT="${1:-$HOME/utop-offline-$SHA.tgz}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "[1] 소스 묶기 ($SHA)"
git bundle create "$TMP/utop.bundle" HEAD >/dev/null 2>&1 || git bundle create "$TMP/utop.bundle" main
echo "$SHA" > "$TMP/COMMIT"
echo "[2] 이미지 확인 — 없으면 굽는다"
for s in web api runner; do
    if ! docker image inspect "utop-$s:latest" >/dev/null 2>&1; then
        GIT_SHA="$SHA" docker compose build "$s"
    fi
done
echo "[3] 이미지 저장 (api 가 커서 몇 분 걸립니다)"
docker save utop-web:latest utop-api:latest utop-runner:latest -o "$TMP/images.tar"
echo "[4] 묶기 → $OUT"
# 푸는 도구도 같이 넣는다 — 받는 PC 의 옛 소스에는 아직 이 도구가 없다
cp tools/offline_apply.sh "$TMP/offline_apply.sh"
tar -C "$TMP" -czf "$OUT" offline_apply.sh utop.bundle COMMIT images.tar
ls -lh "$OUT"
echo
echo "다음: 이 파일을 대상 PC 로 옮기고(scp 등) 거기서"
echo "  tar xzf $(basename "$OUT") offline_apply.sh && bash offline_apply.sh $(basename "$OUT")"
