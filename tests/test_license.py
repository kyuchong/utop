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
