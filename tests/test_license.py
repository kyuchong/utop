"""라이선스 파일 — 발급·검증·상태 (backend/licensing.py).

공개키는 UTOP_LICENSE_PUBKEY 로 바꿔 끼운다 — 실제 개인키는 저장소에 없다.
"""
import datetime as dt

import pytest

import licensing


@pytest.fixture()
def keypair(monkeypatch):
    pem, pub = licensing.gen_keypair()
    monkeypatch.setenv("UTOP_LICENSE_PUBKEY", pub)
    return pem


def test_issue_and_parse_roundtrip(keypair):
    text = licensing.issue(keypair, "LG유플러스 검증팀", "2027-12-31", "2026-01-01", "계약 1", "UL-1")
    assert text.startswith(licensing.BEGIN) and text.rstrip().endswith(licensing.END)
    lic = licensing.parse(text)
    assert lic["holder"] == "LG유플러스 검증팀"
    assert lic["start"] == "2026-01-01" and lic["until"] == "2027-12-31"
    assert lic["id"] == "UL-1" and lic["product"] == "utop" and lic["issuer"] == "ubiQuoss"
    assert len(lic["fp"]) == 16


def test_parse_ignores_whitespace_and_markers(keypair):
    text = licensing.issue(keypair, "A", "2027-01-01")
    body = text.replace(licensing.BEGIN, "").replace(licensing.END, "")
    squashed = "  " + body.replace("\n", "   ") + "\n\n"
    assert licensing.parse(squashed)["holder"] == "A"


def test_tampered_payload_rejected(keypair):
    text = licensing.issue(keypair, "A", "2027-01-01")
    p, s = "".join(text.replace(licensing.BEGIN, "").replace(licensing.END, "").split()).split(".")
    raw = licensing._b64d(p).decode()
    hacked = licensing._b64e(raw.replace("2027-01-01", "2099-01-01").encode()) + "." + s
    with pytest.raises(licensing.LicenseError, match="서명"):
        licensing.parse(hacked)


def test_wrong_key_rejected(keypair, monkeypatch):
    text = licensing.issue(keypair, "A", "2027-01-01")
    _, other_pub = licensing.gen_keypair()
    monkeypatch.setenv("UTOP_LICENSE_PUBKEY", other_pub)
    with pytest.raises(licensing.LicenseError):
        licensing.parse(text)


def test_garbage_rejected(keypair):
    with pytest.raises(licensing.LicenseError):
        licensing.parse("이건 라이선스가 아니다")
    with pytest.raises(licensing.LicenseError):
        licensing.parse("")


def test_issue_validates_dates(keypair):
    with pytest.raises(licensing.LicenseError):
        licensing.issue(keypair, "A", "2027/01/01")
    with pytest.raises(licensing.LicenseError):
        licensing.issue(keypair, "", "2027-01-01")


def test_start_after_until_rejected(keypair):
    text = licensing.issue(keypair, "A", "2026-01-01", "2027-01-01")
    with pytest.raises(licensing.LicenseError, match="시작일"):
        licensing.parse(text)


def test_status_of():
    today = dt.date(2026, 9, 29)
    assert licensing.status_of({}, today)["status"] == "none"
    assert licensing.status_of({"until": "2027-09-29", "start": "2026-01-01"}, today)["status"] == "ok"
    warn = licensing.status_of({"until": "2026-10-10"}, today)
    assert warn["status"] == "warn" and warn["days_left"] == 11
    exp = licensing.status_of({"until": "2026-09-01"}, today)
    assert exp["status"] == "expired" and exp["days_left"] == -28
    ny = licensing.status_of({"until": "2027-12-31", "start": "2026-10-10"}, today)
    assert ny["status"] == "not_yet" and ny["days_used"] == 0
    mid = licensing.status_of({"until": "2026-12-31", "start": "2026-01-01"}, today)
    assert mid["days_total"] == 364 and mid["days_used"] == 271


# ── 개인 PC 발급기 꼴(봉인 · 분 단위 · 장비 고정, 2026-10-01) ─────────────────
import base64
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


@pytest.fixture()
def pc_keys(monkeypatch):
    """발급기와 같은 짝(서명 키 + 봉인 키)을 새로 만들어 끼운다 — 실제 키는 발급 PC 에만 있다."""
    from cryptography.hazmat.primitives.asymmetric import ed25519

    sk = ed25519.Ed25519PrivateKey.generate()
    seal = AESGCM.generate_key(bit_length=256)
    from cryptography.hazmat.primitives import serialization as ser

    pub = sk.public_key().public_bytes(ser.Encoding.Raw, ser.PublicFormat.Raw).hex()
    monkeypatch.setenv("UTOP_LICENSE_PC_PUBKEY", pub)
    monkeypatch.setenv("UTOP_LICENSE_PC_SEAL", base64.urlsafe_b64encode(seal).decode())
    return sk, seal


def _pc_issue(keys, **lic) -> str:
    """발급기(local/backend/licensing.py issue)와 같은 식으로 만든다."""
    sk, seal = keys
    magic = b"UTOP-LIC1"
    nonce = os.urandom(12)
    ct = nonce + AESGCM(seal).encrypt(nonce, json.dumps(lic, ensure_ascii=False).encode(), magic)
    b64 = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")  # noqa: E731
    body = f"UTOP-LIC1.{b64(ct)}.{b64(sk.sign(magic + ct))}"
    lines = [body[i:i + 64] for i in range(0, len(body), 64)]
    return "\n".join(["-----BEGIN UTOP LICENSE (LOCAL TEST)-----", *lines, "-----END UTOP LICENSE (LOCAL TEST)-----"]) + "\n"


BASE = {"id": "UL-00002", "holder": "ubi_253", "start": "2026-10-01 10:01", "until": "2026-10-01 11:01", "note": ""}


def test_sealed_roundtrip(pc_keys):
    lic = licensing.parse(_pc_issue(pc_keys, **BASE, machine={"hostname": "", "macs": ["d8-bb-c1-57-4d-01"]}))
    assert lic["holder"] == "ubi_253" and lic["id"] == "UL-00002" and lic["product"] == "utop"
    assert lic["start"] == "2026-10-01 10:01" and lic["until"] == "2026-10-01 11:01"
    assert lic["machine"] == {"hostname": "", "macs": ["D8:BB:C1:57:4D:01"]}
    assert len(lic["fp"]) == 16


def test_sealed_tamper_and_wrong_keys(pc_keys, monkeypatch):
    text = _pc_issue(pc_keys, **BASE)
    lines = text.splitlines()
    ch = lines[1][20]
    lines[1] = lines[1][:20] + ("A" if ch != "A" else "B") + lines[1][21:]
    with pytest.raises(licensing.LicenseError, match="서명"):
        licensing.parse("\n".join(lines))
    monkeypatch.setenv("UTOP_LICENSE_PC_SEAL", base64.urlsafe_b64encode(AESGCM.generate_key(bit_length=256)).decode())
    with pytest.raises(licensing.LicenseError, match="봉인"):
        licensing.parse(text)


def test_sealed_rejects_bad_period(pc_keys):
    with pytest.raises(licensing.LicenseError, match="시작"):
        licensing.parse(_pc_issue(pc_keys, **{**BASE, "start": "2026-10-02 00:00"}))
    with pytest.raises(licensing.LicenseError, match="사용처"):
        licensing.parse(_pc_issue(pc_keys, **{**BASE, "holder": ""}))


def test_status_minutes():
    lic = {"start": "2026-10-01 10:01", "until": "2026-10-01 11:01"}
    early = licensing.status_of(lic, dt.datetime(2026, 10, 1, 9, 0))
    assert early["status"] == "not_yet" and early["left_text"] == "시작까지 1시간 1분"
    mid = licensing.status_of(lic, dt.datetime(2026, 10, 1, 10, 30))
    assert mid["status"] == "warn" and mid["left_text"] == "만료까지 32분" and mid["left_short"] == "32분 남음"
    assert mid["used_pct"] == 48
    last = licensing.status_of(lic, dt.datetime(2026, 10, 1, 11, 1, 30))  # 만료 분 안 — 아직 쓴다
    assert last["status"] == "warn"
    gone = licensing.status_of(lic, dt.datetime(2026, 10, 1, 11, 2))
    assert gone["status"] == "expired" and gone["left_short"] == "1분 지남"


def test_status_week_warn_is_ratio():
    """1주일짜리는 남은 시간이 20%(최소 1시간) 아래로 떨어져야 주황 — 발급 즉시 주황이 아니다."""
    lic = {"start": "2026-10-01 00:00", "until": "2026-10-07 23:59"}
    assert licensing.status_of(lic, dt.datetime(2026, 10, 2, 12, 0))["status"] == "ok"
    assert licensing.status_of(lic, dt.datetime(2026, 10, 2, 12, 0))["left_short"] == "D-5"
    assert licensing.status_of(lic, dt.datetime(2026, 10, 7, 0, 0))["status"] == "warn"


def test_check_machine():
    info = {"hostname": "utop", "macs": ["B0:22:7A:E2:76:FD", "70:5D:CC:FF:62:04"]}
    assert licensing.check_machine({}, info) == (True, "장비 고정 없음")
    assert licensing.check_machine({"machine": {"macs": ["70-5d-cc-ff-62-04"]}}, info)[0]
    ok, why = licensing.check_machine({"machine": {"macs": ["D8:BB:C1:57:4D:01"]}}, info)
    assert not ok and "NIC" in why
    ok, why = licensing.check_machine({"machine": {"hostname": "ubi253", "macs": ["70:5D:CC:FF:62:04"]}}, info)
    assert not ok and "호스트명" in why
    ok, why = licensing.check_machine({"machine": {"macs": ["70:5D:CC:FF:62:04"]}}, {"hostname": "x", "macs": []})
    assert not ok and "읽지 못했습니다" in why


def test_machine_text_and_parse_macs():
    t = licensing.machine_text({"hostname": "utop", "macs": ["B0:22:7A:E2:76:FD"]})
    assert t == "[UTOP MACHINE INFO]\nhostname: utop\nmac: B0:22:7A:E2:76:FD\n"
    # 발급기에 붙여 넣는 글을 그대로 다시 읽을 수 있어야 한다 — "mac:" 의 "ac:" 는 MAC 이 아니다
    assert licensing.parse_macs(t) == ["B0:22:7A:E2:76:FD"]
    assert licensing.parse_macs("01:00:5E:00:00:01 FF:FF:FF:FF:FF:FF 00:00:00:00:00:00") == []
