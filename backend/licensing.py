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

**개인 PC 발급기 꼴(2026-10-01, 지시: 발급은 개인 PC 에서)** — 본문이 봉인돼 있다::

    -----BEGIN UTOP LICENSE (…)-----
    UTOP-LIC1.<base64url(nonce + AES-GCM(JSON))>.<base64url(Ed25519 서명)>
    -----END UTOP LICENSE (…)-----

서명은 "UTOP-LIC1" + 봉인 글에 건다. 봉인 키가 여기 박히므로 봉인은 **읽기를 번거롭게
할 뿐** 비밀이 아니다 — 위조를 막는 것은 서명이고, 그 개인키는 발급 PC 에만 있다.
시작·만료는 KST 「YYYY-MM-DD HH:MM」(분 단위, 만료는 그 분이 끝날 때까지),
machine = {"hostname", "macs"} 가 있으면 이 서버의 실제 NIC MAC 중 하나라도 목록에
있고 호스트명(적혔으면)도 같아야 쓸 수 있다(check_machine). 검사는
UTOP_LICENSE_PC_PUBKEY(hex) · UTOP_LICENSE_PC_SEAL(base64url) 로 키를 바꿔 끼운다.
"""
from __future__ import annotations

import base64
import datetime as _dt
import hashlib
import json
import os
import re
import socket
from pathlib import Path

from cryptography.exceptions import InvalidSignature, InvalidTag
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# 발급용 개인키의 짝 — 2026-09-29 생성. 개인키는 ~/.utop-license/private.pem(213).
PUBKEY_HEX = "8d8789f1f9376e4ab1fde3be2019306b970a9c485a210787da9e13a16b9fd9ac"

# 개인 PC 발급기(local/lic/public.pem · seal.key)의 짝 — 2026-10-01 받음. 개인키는 그 PC 에만 있다.
PC_PUBKEY_HEX = "54b6499c93882d8d1d1f871f2d8961195edfdc929077af961579a05c10ba17a2"
PC_SEAL_B64 = "z-LudGitx9RDNMKDEKBOBXvSxxeNOXMgfPDulvqOCjY="
SEALED_MAGIC = "UTOP-LIC1"

BEGIN = "-----BEGIN UTOP LICENSE-----"
END = "-----END UTOP LICENSE-----"
PRODUCT = "utop"
FIELDS = ("id", "product", "holder", "start", "until", "note", "issued_at", "issuer")


class LicenseError(ValueError):
    """사람에게 그대로 보여 줄 수 있는 까닭."""


def pubkey_hex() -> str:
    return (os.environ.get("UTOP_LICENSE_PUBKEY") or PUBKEY_HEX).strip()


def pc_pubkey_hex() -> str:
    return (os.environ.get("UTOP_LICENSE_PC_PUBKEY") or PC_PUBKEY_HEX).strip()


def pc_seal_key() -> bytes:
    return _b64d(os.environ.get("UTOP_LICENSE_PC_SEAL") or PC_SEAL_B64)


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
    body = _MARK_RE.sub(" ", str(text or ""))
    body = "".join(body.split())
    if body.startswith(SEALED_MAGIC + "."):
        return _parse_sealed(body)
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
    out["machine"] = {}
    return out


# BEGIN/END 줄 — 「-----BEGIN UTOP LICENSE (LOCAL TEST)-----」 처럼 꼬리가 붙어도 걷는다
_MARK_RE = re.compile(r"-----(?:BEGIN|END) UTOP LICENSE[^-]*-----")


def _when(s: str, end: bool = False) -> "_dt.datetime | None":
    """'YYYY-MM-DD HH:MM'(분) 또는 'YYYY-MM-DD'(날짜만 — 시작은 0시, 만료는 23:59)."""
    s = str(s or "").strip()
    if not s:
        return None
    if len(s) == 10:
        d = _dt.date.fromisoformat(s)
        return _dt.datetime.combine(d, _dt.time(23, 59) if end else _dt.time(0, 0))
    return _dt.datetime.fromisoformat(s.replace("T", " ")[:16])


def _norm_machine(m) -> dict:
    if not isinstance(m, dict):
        return {}
    macs = parse_macs(" ".join(str(x) for x in (m.get("macs") or [])))
    host = str(m.get("hostname") or "").strip()
    return {"hostname": host, "macs": macs} if (macs or host) else {}


def _parse_sealed(body: str) -> dict:
    """개인 PC 발급기 꼴 — 서명 확인 → 봉인 풀기 → 칸 검사."""
    parts = body.split(".")
    if len(parts) != 3:
        raise LicenseError("라이선스 파일 꼴이 아닙니다 — 봉인 본문과 서명이 점(.)으로 이어져야 합니다")
    try:
        ct, sig = _b64d(parts[1]), _b64d(parts[2])
    except (ValueError, TypeError) as e:
        raise LicenseError("라이선스 파일이 깨졌습니다 (본문을 읽을 수 없음)") from e
    try:
        pk = ed25519.Ed25519PublicKey.from_public_bytes(bytes.fromhex(pc_pubkey_hex()))
        pk.verify(sig, SEALED_MAGIC.encode() + ct)
    except InvalidSignature as e:
        raise LicenseError("서명이 맞지 않습니다 — 발급된 파일이 아니거나 내용이 고쳐졌습니다") from e
    except ValueError as e:
        raise LicenseError("서버의 라이선스 공개키가 잘못돼 있습니다") from e
    try:
        raw = AESGCM(pc_seal_key()).decrypt(ct[:12], ct[12:], SEALED_MAGIC.encode())
        payload = json.loads(raw.decode("utf-8"))
    except (InvalidTag, ValueError, UnicodeDecodeError) as e:
        raise LicenseError("라이선스 내용을 풀지 못했습니다 (봉인 키가 다릅니다)") from e
    if not isinstance(payload, dict):
        raise LicenseError("라이선스 본문이 JSON 이 아닙니다")
    out = {k: str(payload.get(k) or "").strip() for k in FIELDS}
    out["product"] = PRODUCT
    out["issuer"] = out["issuer"] or "ubiQuoss"
    if not out["holder"]:
        raise LicenseError("사용처가 비어 있습니다")
    try:
        until, start = _when(out["until"], end=True), _when(out["start"])
    except ValueError as e:
        raise LicenseError("시작·만료가 날짜 꼴(YYYY-MM-DD HH:MM)이 아닙니다") from e
    if until is None:
        raise LicenseError("만료가 없습니다")
    if start and start > until:
        raise LicenseError("시작이 만료보다 뒤입니다")
    out["fp"] = hashlib.sha256(ct).hexdigest()[:16]
    out["machine"] = _norm_machine(payload.get("machine"))
    return out


# ── 장비 확인 ─────────────────────────────────────────────────────────
# 앞뒤로 옥텟이 더 붙은 것(EUI-64 등)은 빼되, "mac:AA:.." 의 "ac:" 는 옥텟으로 보지 않는다(발급기와 같은 식)
_MAC_RE = re.compile(r"(?<![0-9A-Fa-f])(?<!(?<![0-9A-Za-z])[0-9A-Fa-f]{2}[:-])"
                     r"(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}(?![0-9A-Fa-f]|[:-][0-9A-Fa-f])")


def parse_macs(text: str) -> list:
    """글에서 MAC 을 뽑아 AA:BB:CC:DD:EE:FF 꼴로(겹침 · 0 · 브로드캐스트 · 멀티캐스트는 뺀다)."""
    out: list = []
    for m in _MAC_RE.findall(str(text or "")):
        m = m.replace("-", ":").upper()
        if m in ("00:00:00:00:00:00", "FF:FF:FF:FF:FF:FF") or int(m[:2], 16) & 1 or m in out:
            continue
        out.append(m)
    return out


def host_machine() -> dict:
    """이 서버의 호스트명과 실제 NIC MAC.

    컨테이너는 가상 NIC·가상 호스트명만 보므로 docker-compose 가 호스트의 /sys 를
    /hostsys 에, /etc/hostname 을 /etc/host_hostname 에 읽기 전용으로 붙인다.
    실제 장치가 있는 NIC 만 센다(lo · docker0 · veth · br- 는 device 가 없다)."""
    sysdir = Path(os.environ.get("UTOP_HOST_SYS") or "/hostsys")
    seen_host = (sysdir / "class" / "net").is_dir()
    if not seen_host:
        sysdir = Path("/sys")
    macs: list = []
    for d in sorted((sysdir / "class" / "net").glob("*")):
        if (d / "device").exists():
            try:
                macs += [m for m in parse_macs((d / "address").read_text()) if m not in macs]
            except OSError:
                pass
    host = ""
    hf = Path(os.environ.get("UTOP_HOST_HOSTNAME_FILE") or "/etc/host_hostname")
    try:
        if hf.is_file():
            host = hf.read_text(encoding="utf-8").strip()
    except OSError:
        host = ""
    return {"hostname": host or socket.gethostname(), "macs": macs, "from_host": seen_host}


def machine_text(info: dict | None = None) -> str:
    """발급 담당자에게 보내는 글 — 발급 페이지의 장비 칸에 통째로 붙여 넣으면 된다."""
    info = info or host_machine()
    return "[UTOP MACHINE INFO]\nhostname: " + str(info.get("hostname") or "") + "\n" + \
        "".join(f"mac: {m}\n" for m in info.get("macs") or [])


def check_machine(lic: dict, info: dict | None = None) -> tuple[bool, str]:
    """(맞는지, 까닭). 라이선스에 machine 이 없으면 장비 고정이 없는 것으로 본다."""
    want = _norm_machine(lic.get("machine"))
    if not want:
        return True, "장비 고정 없음"
    info = info or host_machine()
    if want.get("hostname") and want["hostname"].lower() != str(info.get("hostname") or "").lower():
        return False, f"호스트명이 다릅니다 (이 서버: {info.get('hostname') or '-'}, 라이선스: {want['hostname']})"
    if want.get("macs"):
        mine = set(info.get("macs") or [])
        if not mine:
            return False, "이 서버의 NIC(MAC)를 읽지 못했습니다 — docker-compose 의 /hostsys 연결을 확인하세요"
        if not set(want["macs"]) & mine:
            return False, "라이선스에 적힌 NIC(MAC)가 이 서버에 없습니다"
    return True, "이 서버와 일치"


WARN_RATIO, WARN_MIN_SEC, WARN_DAYS_NO_START = 0.2, 3600, 30


def _dur(sec: int) -> str:
    """사람이 읽는 길이 — 3일 이상은 날만, 그 아래는 시간·분까지."""
    sec = abs(int(sec))
    d, h, m = sec // 86400, sec % 86400 // 3600, sec % 3600 // 60
    if d >= 3:
        return f"{d}일"
    if d >= 1:
        return f"{d}일" + (f" {h}시간" if h else "")
    if h >= 1:
        return f"{h}시간" + (f" {m}분" if m else "")
    return f"{max(1, m)}분"


def status_of(lic: dict, now: "_dt.date | _dt.datetime | None" = None) -> dict:
    """등록된 라이선스의 상태 — 화면·상단바가 쓴다.

    status: none(미등록) · not_yet(시작 전) · ok · warn · expired.
    warn 은 남은 시간이 전체 기간의 20% 이하(최소 1시간) — 발급기와 같은 기준.
    시작이 없는 옛 파일만 만료 30일 안을 warn 으로 본다.
    left_text 「만료까지 3일」 · left_short 「D-3」/「45분 남음」 은 화면이 그대로 적는다."""
    if now is None:
        now = _dt.datetime.now()  # 컨테이너 TZ=Asia/Seoul
    elif not isinstance(now, _dt.datetime):
        now = _dt.datetime.combine(now, _dt.time(0, 0))
    empty = {"status": "none", "days_left": None, "days_total": None, "days_used": None,
             "remaining_sec": None, "used_pct": None, "left_text": "", "left_short": ""}
    try:
        until, start = _when(lic.get("until") or "", end=True), _when(lic.get("start") or "")
    except ValueError:
        return empty
    if until is None:
        return empty
    end = until + _dt.timedelta(minutes=1)          # 만료는 그 분이 끝날 때까지
    rem = int((end - now).total_seconds())
    days_left = (until.date() - now.date()).days
    total = used = pct = None
    total_sec = None
    if start:
        total = max(0, (until.date() - start.date()).days)
        used = max(0, min(total, (now.date() - start.date()).days))
        total_sec = max(60.0, (end - start).total_seconds())
        pct = round(max(0.0, min(1.0, (now - start).total_seconds() / total_sec)) * 100)
    if start and now < start:
        st = "not_yet"
        used, pct = 0, 0
        txt, short = f"시작까지 {_dur((start - now).total_seconds())}", "시작 전"
    elif rem <= 0:
        st = "expired"
        txt = f"만료된 지 {_dur(-rem)}"
        short = f"{_dur(-rem)} 지남"
    else:
        warn = rem <= max(WARN_MIN_SEC, total_sec * WARN_RATIO) if total_sec else days_left <= WARN_DAYS_NO_START
        st = "warn" if warn else "ok"
        txt = f"만료까지 {_dur(rem)}"
        short = f"D-{days_left}" if rem >= 86400 else f"{_dur(rem)} 남음"
    return {"status": st, "days_left": days_left, "days_total": total, "days_used": used,
            "remaining_sec": rem, "used_pct": pct, "left_text": txt, "left_short": short}


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
