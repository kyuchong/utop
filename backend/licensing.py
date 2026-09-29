"""라이선스 파일 — 발급(서명)과 검증.

**파일을 등록하고 상태를 본다**(지시). 손으로 날짜를 적는 칸은 없다 —
Jira Data Center·GitLab EE·SonarQube 가 하는 그대로다: 발급처가 서명한
파일을 관리자가 올리면, 서버가 서명을 확인해 사용처·기간·발급 ID 를
보이고 남은 날수를 센다.

파일 꼴 (텍스트, 확장자 .lic)::

    -----BEGIN UTOP LICENSE-----
    <base64url(payload)>.<base64url(signature)>   (64자마다 줄바꿈)
    -----END UTOP LICENSE-----

payload 는 정규 JSON(정렬·공백 없음)이라 한 글자만 고쳐도 서명이 깨진다::

    {"holder":"…","id":"UL-2026-0001","issued_at":"…","issuer":"ubiQuoss",
     "note":"…","product":"utop","start":"2026-01-01","until":"2027-12-31","v":1}

서명은 Ed25519. **공개키만** 여기 박히고, 개인키는 저장소 밖에 둔다
(발급 도구 tools/license_issue.py — 기본 ~/.utop-license/private.pem).
검사(pytest)는 UTOP_LICENSE_PUBKEY 환경변수로 공개키를 바꿔 끼운다.
"""
from __future__ import annotations

import base64
import datetime as _dt
import hashlib
import json
import os

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519

# 발급용 개인키의 짝 — 2026-09-29 생성. 개인키는 ~/.utop-license/private.pem(213).
PUBKEY_HEX = "8d8789f1f9376e4ab1fde3be2019306b970a9c485a210787da9e13a16b9fd9ac"

BEGIN = "-----BEGIN UTOP LICENSE-----"
END = "-----END UTOP LICENSE-----"
PRODUCT = "utop"
FIELDS = ("id", "product", "holder", "start", "until", "note", "issued_at", "issuer")


class LicenseError(ValueError):
    """사람에게 그대로 보여 줄 수 있는 까닭."""


def pubkey_hex() -> str:
    return (os.environ.get("UTOP_LICENSE_PUBKEY") or PUBKEY_HEX).strip()


def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def _b64d(s: str) -> bytes:
    s = s.strip()
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def canonical(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _date_ok(s: str) -> bool:
    try:
        _dt.date.fromisoformat(s[:10])
        return True
    except ValueError:
        return False


def parse(text: str) -> dict:
    """파일 글을 읽어 서명을 확인하고 칸을 돌려준다. 틀리면 LicenseError."""
    body = str(text or "")
    if BEGIN in body:
        body = body.split(BEGIN, 1)[1]
    if END in body:
        body = body.split(END, 1)[0]
    body = "".join(body.split())
    if not body or body.count(".") != 1:
        raise LicenseError("라이선스 파일 꼴이 아닙니다 — BEGIN/END 사이에 본문과 서명이 점(.)으로 이어져야 합니다")
    p, s = body.split(".")
    try:
        raw, sig = _b64d(p), _b64d(s)
    except (ValueError, TypeError) as e:  # base64 가 아니다
        raise LicenseError("라이선스 파일이 깨졌습니다 (본문을 읽을 수 없음)") from e
    try:
        pk = ed25519.Ed25519PublicKey.from_public_bytes(bytes.fromhex(pubkey_hex()))
        pk.verify(sig, raw)
    except InvalidSignature as e:
        raise LicenseError("서명이 맞지 않습니다 — 발급된 파일이 아니거나 내용이 고쳐졌습니다") from e
    except ValueError as e:  # 공개키 hex 가 잘못됨
        raise LicenseError("서버의 라이선스 공개키가 잘못돼 있습니다") from e
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as e:
        raise LicenseError("라이선스 본문이 JSON 이 아닙니다") from e
    if not isinstance(payload, dict) or payload.get("v") != 1 or payload.get("product") != PRODUCT:
        raise LicenseError("이 제품(utop)의 라이선스가 아닙니다")
    out = {k: str(payload.get(k) or "").strip() for k in FIELDS}
    if not out["holder"]:
        raise LicenseError("사용처가 비어 있습니다")
    if not out["until"] or not _date_ok(out["until"]):
        raise LicenseError("만료일이 없거나 날짜 꼴(YYYY-MM-DD)이 아닙니다")
    if out["start"] and not _date_ok(out["start"]):
        raise LicenseError("시작일이 날짜 꼴(YYYY-MM-DD)이 아닙니다")
    if out["start"] and out["start"][:10] > out["until"][:10]:
        raise LicenseError("시작일이 만료일보다 뒤입니다")
    out["fp"] = hashlib.sha256(raw).hexdigest()[:16]
    return out


def status_of(lic: dict, today: _dt.date | None = None) -> dict:
    """등록된 라이선스의 상태 — 화면·왼쪽 배지가 쓴다.

    status: none(미등록) · not_yet(시작 전) · ok · warn(만료 30일 안) · expired
    """
    today = today or _dt.date.today()
    until = str(lic.get("until") or "")[:10]
    start = str(lic.get("start") or "")[:10]
    if not until or not _date_ok(until):
        return {"status": "none", "days_left": None, "days_total": None, "days_used": None}
    u = _dt.date.fromisoformat(until)
    days_left = (u - today).days
    total = used = None
    if start and _date_ok(start):
        s = _dt.date.fromisoformat(start)
        total = max(0, (u - s).days)
        used = max(0, min(total, (today - s).days))
        if today < s:
            return {"status": "not_yet", "days_left": days_left, "days_total": total, "days_used": 0}
    st = "expired" if days_left < 0 else "warn" if days_left <= 30 else "ok"
    return {"status": st, "days_left": days_left, "days_total": total, "days_used": used}


def issue(private_pem: bytes, holder: str, until: str, start: str = "", note: str = "",
          lic_id: str = "", issuer: str = "ubiQuoss") -> str:
    """개인키로 서명한 라이선스 파일 글을 만든다(발급 도구가 쓴다)."""
    key = serialization.load_pem_private_key(private_pem, password=None)
    if not isinstance(key, ed25519.Ed25519PrivateKey):
        raise LicenseError("Ed25519 개인키가 아닙니다")
    if not holder.strip():
        raise LicenseError("사용처가 비어 있습니다")
    if not _date_ok(until):
        raise LicenseError("만료일은 YYYY-MM-DD 꼴이어야 합니다")
    if start and not _date_ok(start):
        raise LicenseError("시작일은 YYYY-MM-DD 꼴이어야 합니다")
    now = _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0)
    payload = {
        "v": 1,
        "product": PRODUCT,
        "id": lic_id.strip() or f"UL-{now:%Y%m%d}-{hashlib.sha1(f'{holder}{until}{now.isoformat()}'.encode()).hexdigest()[:6].upper()}",
        "holder": holder.strip(),
        "start": start[:10] if start else "",
        "until": until[:10],
        "note": note.strip(),
        "issued_at": now.isoformat(),
        "issuer": issuer.strip() or "ubiQuoss",
    }
    raw = canonical(payload)
    body = _b64e(raw) + "." + _b64e(key.sign(raw))
    lines = [body[i:i + 64] for i in range(0, len(body), 64)]
    return "\n".join([BEGIN, *lines, END]) + "\n"


def gen_keypair() -> tuple[bytes, str]:
    """(개인키 PEM, 공개키 hex) — 발급 도구의 --gen-key 가 쓴다."""
    k = ed25519.Ed25519PrivateKey.generate()
    pem = k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                          serialization.NoEncryption())
    pub = k.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()
    return pem, pub
