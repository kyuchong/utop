"""Jira Issue Sync — 이슈 유형을 골라 받기(routes/jira.py 의 JQL·기준 시각).

받아 둔 자료는 온 서버에 한 벌이라 유형마다 「마지막 갱신 시각」 을 따로 둔다(프로젝트::유형).
"""
from routes.jira import _sync_jql, _sync_mark_key, _sync_mark_of


def test_jql_project_only_and_with_type():
    assert _sync_jql("P106", "", None) == 'project = "P106" ORDER BY updated ASC'
    assert _sync_jql("P106", "", "개발 Defect") == 'project = "P106" AND issuetype = "개발 Defect" ORDER BY updated ASC'


def test_jql_mark_goes_five_minutes_back_and_quotes_are_escaped():
    j = _sync_jql("P106", "2026-10-07T14:11:00.000+0900", 'A"B')
    assert 'issuetype = "A\\"B"' in j
    assert 'updated >= "2026-10-07 14:06"' in j
    assert _sync_jql("P106", "not-a-time", None) == ""


def test_mark_per_type_falls_back_to_whole_project_mark():
    st = {
        "P106": {"last_updated": "2026-10-01T00:00:00"},
        "P106::Defect": {"last_updated": "2026-10-05T00:00:00"},
    }
    assert _sync_mark_key("P106", None) == "P106"
    assert _sync_mark_key("P106", "Defect") == "P106::Defect"
    assert _sync_mark_of(st, "P106", "Defect") == "2026-10-05T00:00:00"
    # 처음 고른 유형 — 프로젝트 전부를 받은 표시가 그 유형도 덮는다
    assert _sync_mark_of(st, "P106", "Task") == "2026-10-01T00:00:00"
    assert _sync_mark_of({}, "P106", "Task") == ""
    assert _sync_mark_of(st, "P106", None) == "2026-10-01T00:00:00"
