#!/usr/bin/env python3
"""라이선스 파일 발급 도구 — 개인키로 서명한 .lic 를 만든다.

    # 처음 한 번: 키쌍 만들기 (개인키는 저장소 밖에, 공개키 hex 를 backend/licensing.py 에)
    python3 tools/license_issue.py --gen-key ~/.utop-license

    # 발급
    python3 tools/license_issue.py --holder "LG유플러스 검증팀" --start 2026-10-01 --until 2027-09-30 \
        --note "계약 2026-123" --out lguplus-2027.lic

    # 파일 확인(서명·칸)
    python3 tools/license_issue.py --show lguplus-2027.lic

개인키 기본 자리는 ~/.utop-license/private.pem 이다(--key 로 바꾼다). 이 PC 의 파이썬에
cryptography 가 없으면 api 이미지 안에서 돌린다:
    docker run --rm -v "$PWD":/w -v ~/.utop-license:/k:ro -w /w utop-api \\
        python tools/license_issue.py --key /k/private.pem --holder ... --until ... --out x.lic
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
import licensing  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="utop 라이선스 파일 발급")
    ap.add_argument("--gen-key", metavar="DIR", help="이 폴더에 private.pem·public.hex 를 만든다(이미 있으면 안 덮는다)")
    ap.add_argument("--key", default=str(Path.home() / ".utop-license" / "private.pem"), help="개인키 PEM")
    ap.add_argument("--holder", help="사용처(고객사·부서)")
    ap.add_argument("--start", default="", help="시작일 YYYY-MM-DD (없어도 됨)")
    ap.add_argument("--until", help="만료일 YYYY-MM-DD")
    ap.add_argument("--note", default="", help="비고(계약 번호 등)")
    ap.add_argument("--id", default="", help="발급 ID (없으면 자동)")
    ap.add_argument("--issuer", default="ubiQuoss")
    ap.add_argument("--out", help="쓸 파일 (.lic). 없으면 화면에 낸다")
    ap.add_argument("--show", metavar="FILE", help="라이선스 파일을 읽어 서명을 확인하고 칸을 보인다")
    a = ap.parse_args()

    if a.gen_key:
        d = Path(a.gen_key).expanduser()
        d.mkdir(parents=True, exist_ok=True)
        priv = d / "private.pem"
        if priv.exists():
            print(f"이미 있습니다: {priv} — 덮지 않습니다", file=sys.stderr)
            return 2
        pem, pub = licensing.gen_keypair()
        priv.write_bytes(pem)
        priv.chmod(0o600)
        (d / "public.hex").write_text(pub + "\n", encoding="utf-8")
        print(f"개인키: {priv}\n공개키(hex): {pub}\n→ backend/licensing.py 의 PUBKEY_HEX 에 넣고 api 를 다시 굽는다")
        return 0

    if a.show:
        text = Path(a.show).read_text(encoding="utf-8")
        try:
            lic = licensing.parse(text)
        except licensing.LicenseError as e:
            print(f"확인 실패: {e}", file=sys.stderr)
            return 1
        st = licensing.status_of(lic)
        for k in licensing.FIELDS:
            print(f"{k:10s} {lic.get(k, '')}")
        print(f"{'fp':10s} {lic['fp']}")
        print(f"{'status':10s} {st['status']}  (남은 날수 {st['days_left']})")
        return 0

    if not a.holder or not a.until:
        ap.error("--holder 와 --until 이 필요합니다 (또는 --gen-key / --show)")
    key_path = Path(a.key).expanduser()
    if not key_path.exists():
        print(f"개인키가 없습니다: {key_path} — 먼저 --gen-key 로 만드세요", file=sys.stderr)
        return 2
    try:
        text = licensing.issue(key_path.read_bytes(), a.holder, a.until, a.start, a.note, a.id, a.issuer)
    except licensing.LicenseError as e:
        print(f"발급 실패: {e}", file=sys.stderr)
        return 1
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8")
        lic = licensing.parse(text)
        print(f"썼습니다: {a.out}  (id {lic['id']} · {lic['holder']} · {lic['start'] or '-'} ~ {lic['until']})")
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
