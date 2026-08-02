"""판정 로직 회귀 테스트.

명세 근거: docs/conventions.md '판정기준 문법' 절.
알려진 함정: harness/bugs.md (BUG-0001, BUG-0002, DEBT-0001~0004).

원칙: 이 파일은 구현(engine.py) 이 아니라 명세를 기준으로 쓴다.
    명세와 코드가 다르면 멈추고 bugs.md 등록 후 xfail 로 표시한다.
    단 xfail(strict=True) 는 "올바른 동작"이 확정된 경우에만 쓴다 — harness/bugs.md 규약.
"""
from __future__ import annotations
import pytest

from engine import (
    judge_by_criteria,
    judge_cli_result,
    normalize_for_baseline,
    apply_baseline_masks,
    safe_name,
)


# ═══════════════════════════════════════════════════════════════════
# judge_by_criteria — contains
# ═══════════════════════════════════════════════════════════════════

def test_contains_single_token_pass():
    """단일 토큰이 출력에 있으면 PASS."""
    r = judge_by_criteria("Version 1.0.0 running", "contains:1.0.0")
    assert r[0] == "PASS"


def test_contains_single_token_fail():
    """단일 토큰이 출력에 없으면 FAIL."""
    r = judge_by_criteria("Version 1.0.1 running", "contains:9.9.9")
    assert r[0] == "FAIL"


def test_contains_no_prefix_treated_as_contains():
    """접두사 없는 값은 contains 로 처리."""
    r = judge_by_criteria("Version 1.0.0", "1.0.0")
    assert r[0] == "PASS"


def test_comma_contains_is_or():
    """콤마는 값 내부의 OR — 하나만 있어도 PASS."""
    assert judge_by_criteria("vlan 1 only", "contains:vlan 1,vlan 4096")[0] == "PASS"


def test_contains_all_tokens_missing_fails():
    """콤마 OR 토큰 모두 없으면 FAIL."""
    r = judge_by_criteria("Version 9.9.9", "contains:1.0.0,1.0.1")
    assert r[0] == "FAIL"


def test_contains_case_insensitive():
    """매칭은 대소문자 무관 (의도된 동작, conventions.md 명시)."""
    r = judge_by_criteria("interface eth0 up", "contains:UP")
    assert r[0] == "PASS"


def test_multiline_contains_is_and_across_rules():
    """줄바꿈은 rule 분리자이므로 각 줄이 AND 로 집계된다.

    contains:vlan 1
    contains:vlan 4096  (폴백)
    → 두 rule 모두 매치되어야 PASS.
    """
    both = "vlan 1\nvlan 4096 configured"
    one  = "vlan 1 only"
    assert judge_by_criteria(both, "contains:vlan 1\nvlan 4096")[0] == "PASS"
    assert judge_by_criteria(one,  "contains:vlan 1\nvlan 4096")[0] == "FAIL"


# ═══════════════════════════════════════════════════════════════════
# judge_by_criteria — contains_all / not_contains
# ═══════════════════════════════════════════════════════════════════

def test_contains_all_all_present_pass():
    """모든 토큰이 있어야 PASS."""
    r = judge_by_criteria("foo bar baz", "contains_all:foo,bar")
    assert r[0] == "PASS"


def test_contains_all_missing_one_fails():
    """하나라도 없으면 FAIL."""
    r = judge_by_criteria("foo bar", "contains_all:foo,qux")
    assert r[0] == "FAIL"


def test_not_contains_none_present_pass():
    """금지 토큰이 없으면 PASS."""
    r = judge_by_criteria("all good", "not_contains:error,fail")
    assert r[0] == "PASS"


def test_not_contains_one_present_fails():
    """금지 토큰이 하나라도 있으면 FAIL."""
    r = judge_by_criteria("Error occurred", "not_contains:error,fail")
    assert r[0] == "FAIL"


# ═══════════════════════════════════════════════════════════════════
# judge_by_criteria — 여러 규칙 AND (rule 분리자)
# ═══════════════════════════════════════════════════════════════════

def test_multiple_rules_all_pass():
    """세미콜론 또는 개행으로 나눈 여러 규칙은 모두 PASS 여야 PASS."""
    r = judge_by_criteria("foo bar", "contains:foo\ncontains:bar")
    assert r[0] == "PASS"


def test_multiple_rules_one_fails_all_fail():
    """여러 규칙 중 하나라도 FAIL 이면 FAIL."""
    r = judge_by_criteria("foo bar", "contains:foo\ncontains:qux")
    assert r[0] == "FAIL"


def test_criteria_as_list():
    """판정기준은 문자열 또는 배열을 지원한다."""
    r = judge_by_criteria("foo bar", ["contains:foo", "contains:bar"])
    assert r[0] == "PASS"


# ═══════════════════════════════════════════════════════════════════
# 경계 케이스
# ═══════════════════════════════════════════════════════════════════

def test_empty_criteria_returns_none():
    """빈 판정기준은 None (판정 안 함)."""
    assert judge_by_criteria("anything", "") is None


def test_empty_output_with_criteria_fails():
    """출력이 비었는데 판정기준이 있으면 FAIL."""
    r = judge_by_criteria("", "contains:foo")
    assert r[0] == "FAIL"


def test_none_output_is_treated_as_empty():
    """output=None 은 빈 문자열처럼 처리."""
    r = judge_by_criteria(None, "contains:foo")
    assert r[0] == "FAIL"


def test_korean_criteria_and_output():
    """한글 판정기준 · 한글 출력 매칭."""
    r = judge_by_criteria("접속 성공 확인", "contains:성공")
    assert r[0] == "PASS"


# ═══════════════════════════════════════════════════════════════════
# judge_cli_result — 오류 패턴 감지
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("out", [
    "% invalid input detected",
    "invalid input at line 3",
    "unknown command 'foo'",
    "command not found",
    "syntax error near unexpected",
    "permission denied",
    "authentication failed",
    "[오류] 접속 실패",
])
def test_judge_cli_result_error_patterns_fail(out):
    """8개 오류 패턴 중 어느 하나라도 출력에 있으면 FAIL (판정기준 무관)."""
    r = judge_cli_result(out, expected="anything", criteria="contains:anything")
    assert r[0] == "FAIL"


def test_judge_cli_result_error_patterns_case_insensitive():
    """오류 패턴도 대소문자 무관."""
    r = judge_cli_result("PERMISSION DENIED", expected="", criteria="")
    assert r[0] == "FAIL"


def test_judge_cli_result_no_error_no_criteria_pass_when_output_present():
    """오류 없고 판정기준 없으면 출력이 있으면 PASS."""
    r = judge_cli_result("Version 1.0.0 running", expected="", criteria="")
    assert r[0] == "PASS"


def test_judge_cli_result_no_error_empty_output_fails():
    """출력이 비어 있으면 FAIL."""
    r = judge_cli_result("", expected="", criteria="")
    assert r[0] == "FAIL"


# ═══════════════════════════════════════════════════════════════════
# normalize_for_baseline
# ═══════════════════════════════════════════════════════════════════

def test_normalize_strips_leading_trailing_ws_per_line():
    """각 라인의 앞뒤 공백을 제거한다."""
    assert normalize_for_baseline("  foo  \n  bar  ") == "foo\nbar"


def test_normalize_collapses_internal_ws():
    """내부 연속 공백·탭을 단일 공백으로."""
    assert normalize_for_baseline("foo   \t   bar") == "foo bar"


def test_normalize_removes_empty_lines():
    """빈 줄을 제거한다."""
    assert normalize_for_baseline("foo\n\n\nbar\n\n") == "foo\nbar"


def test_normalize_all_together():
    """세 규칙 모두 함께."""
    text = "  foo    bar  \n\n\t  baz   qux  \n"
    assert normalize_for_baseline(text) == "foo bar\nbaz qux"


def test_normalize_empty_input():
    """빈 입력은 빈 문자열."""
    assert normalize_for_baseline("") == ""


# ═══════════════════════════════════════════════════════════════════
# apply_baseline_masks / DEFAULT_MASKS
# ═══════════════════════════════════════════════════════════════════

def test_default_mask_uptime_wd_format():
    """`1w2d` 같은 uptime 표기는 마스킹된다."""
    assert "**" in apply_baseline_masks("uptime 3w4d", [])


def test_default_mask_uptime_hms():
    """`HH:MM:SS` 형태도 마스킹."""
    assert "**" in apply_baseline_masks("last: 01:23:45", [])


def test_default_mask_counters():
    """`123 packets` 같은 카운터는 `** packets` 로."""
    result = apply_baseline_masks("input 12345 packets, 0 errors", [])
    assert "** packets" in result
    assert "** errors" in result


def test_default_mask_speeds():
    """`100 Mbps` 는 `** Mbps` 로."""
    assert "** Mbps" in apply_baseline_masks("speed 100 Mbps", [])


def test_extra_mask_applied_after_default():
    """사용자 마스크도 추가 적용된다."""
    extra = [{"pattern": r"tempC=\d+", "replace": "tempC=**"}]
    r = apply_baseline_masks("sensor tempC=42", extra)
    assert "tempC=**" in r


def test_invalid_extra_mask_ignored():
    """잘못된 사용자 마스크는 예외 없이 스킵되어야 한다."""
    extra = [{"pattern": "[unclosed", "replace": "X"}]  # 정규식 오류
    r = apply_baseline_masks("hello world", extra)
    assert r == "hello world"


# ═══════════════════════════════════════════════════════════════════
# safe_name — 성질 기반 (매직 문자열 금지)
# ═══════════════════════════════════════════════════════════════════

def test_safe_name_keeps_ascii_alnum_and_allowed_punctuation():
    """영숫자·`.`·`_`·`-` 는 그대로 유지."""
    src = "TC-001.json_v2"
    assert safe_name(src) == src  # 허용 문자만이라 변경 없음


def test_safe_name_replaces_slash_and_space_with_underscore():
    """슬래시·공백은 `_` 로."""
    r = safe_name("path/to name")
    assert "/" not in r
    assert " " not in r
    assert set(r) <= set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")


def test_safe_name_removes_non_ascii():
    """비-ASCII(한글 등) 문자는 결과에 남지 않는다."""
    r = safe_name("부팅-TC-001")
    # 결과의 모든 문자가 허용 charset 안에 있음
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
    assert set(r) <= allowed
    # ASCII 꼬리 -TC-001 은 보존
    assert r.endswith("-TC-001")


def test_safe_name_length_cap_180():
    """길이 180자 상한."""
    long = "a" * 500
    assert len(safe_name(long)) == 180


def test_safe_name_deterministic():
    """같은 입력은 항상 같은 결과."""
    src = "부팅-TC-001"
    assert safe_name(src) == safe_name(src)


def test_safe_name_non_string_input():
    """int 등 non-str 도 str 캐스팅 후 처리."""
    assert safe_name(12345) == "12345"


# ═══════════════════════════════════════════════════════════════════
# BUG-0001 — 단어 경계 미적용 (xfail: 고쳐지면 xpass 로 신호)
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.xfail(strict=True, reason="BUG-0001 단어 경계 미적용")
def test_contains_up_rejects_down_interface():
    """인터페이스가 DOWN 이면 출력에 uptime 이 있어도 FAIL 이어야 한다.

    현재 코드는 서브스트링 매치라 `uptime` 의 `UP` 부분에 매치되어 PASS 로 판정한다.
    단어 경계를 도입하면 이 테스트가 xpass 로 뒤집혀 마커 제거 신호가 된다.
    """
    out = "System uptime is 3 days\nGiga0/11 DOWN full a-1000"
    r = judge_by_criteria(out, "contains:UP")
    assert r[0] == "FAIL"


# ═══════════════════════════════════════════════════════════════════
# BUG-0002 — 폴백 규칙: not_contains 여러 줄 의미 반전 (xfail)
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.xfail(strict=True, reason="BUG-0002 폴백 규칙: 여러 줄 not_contains 의미 반전")
def test_multiline_not_contains_keeps_negation():
    """not_contains 의 2번째 줄도 부정 판정이어야 한다.

    현재 코드에서 `not_contains:error\\ntimeout` 은
      rule 0: not_contains:error   (부정)
      rule 1: timeout               → 폴백 contains:timeout (긍정)
    로 갈라져 timeout 이 출력에 있으면 rule 1 이 PASS 되고
    rule 0 도 error 는 없으니 PASS → 최종 PASS. 의도(FAIL)와 반대.
    """
    out = "connection timeout occurred"
    assert judge_by_criteria(out, "not_contains:error\ntimeout")[0] == "FAIL"
