# 기능별 문서

UTOP 의 기능을 **화면 묶음 하나에 문서 하나**로 적는다. 사용자가 읽는 도움말이 되도록 썼다 —
왼쪽 메뉴 SYSTEM 바로 위 **「도움말」** 에 실린다(2026-09-29). 코드 이름보다 화면에서 보이는 말로 쓴다.

앱은 처음 뜰 때 이 파일들을 **위키와 같은 블록노트 문서**로 바꿔 위키 표의 도움말 공간(`__help__`)에 심는다(「동작 확인」·「관련 API」 절은 뺀다).
그 뒤로는 **앱 안에서 고친 것이 정본**이다. 고칠 수 있는 사람은 관리자와 SETUP › 페이지별 접근 권한에서 「도움말 · 고치기」 를 받은 역할이고, 같은 화면의 「처음 글로 되돌리기」 가 이 파일의 글로 되돌린다.
그래서 여기 파일을 고쳐도 이미 뜬 서버의 도움말은 안 바뀐다.

각 문서의 짜임은 같다.

1. **무엇을 하는 화면인가** — 한 문단.
2. **어디 있나** — 왼쪽 메뉴 위치와 화면 구성.
3. **하는 일** — 흐름을 순서대로. 단추 이름은 화면 그대로.
4. **규칙과 주의** — 알아 두어야 헷갈리지 않는 것.
5. **관리자가 할 일** — 설정 화면에서 미리 해 둘 것.
6. **동작 확인** — 이 기능이 살아 있는지 기계로 확인하는 법(`tools/smoke.sh <묶음>`)과 그 대본이 무엇을 보는지.
7. **관련 API** — 화면이 부르는 서버 길. 전체 목록은 [../api-reference.md](../api-reference.md).

| 문서 | 화면(왼쪽 메뉴) | 서버 코드 | 동작 확인 |
|---|---|---|---|
| [wiki.md](wiki.md) | WIKI | `routes/wiki.py` | `tools/smoke.sh` wiki |
| [req-coverage.md](req-coverage.md) | REQ-Coverage | `routes/tc_req.py` | `tools/smoke.sh` tc_req |
| [cycles.md](cycles.md) | Cycles (실행·판정·결과) | `routes/cycle.py` · runner | `tools/smoke.sh` cycle |
| [devices.md](devices.md) | Devices · Traffic Gen · Rack View | `routes/devices.py` | `tools/smoke.sh` devices |
| [jira-defects.md](jira-defects.md) | Defects · Jira Issue · Releases | `routes/jira.py` | `tools/smoke.sh` jira |
| [ai.md](ai.md) | Test AI · Knowledge AI · Coverage AI · LLM 설정 | `routes/ai.py` · `routes/nl_test.py` | `tools/smoke.sh` ai |
| [settings.md](settings.md) | 로그인 · SETUP(계정·조직·권한·브랜딩·메일·데이터) | `main.py` | `tools/smoke.sh` settings |

## 동작 확인이란

`tools/smoke.sh` 는 **빈 DB 위에 새 서버를 하나 띄우고** 각 묶음의 길을 실제로 부른다 — 만들고, 읽고, 고치고, 지운다.
운영 DB 는 건드리지 않는다(compose 프로젝트 이름과 비밀번호가 다르다). 장비·Jira·LLM 이 없을 때는
「500 오류가 아니라 안내로 답하는가」 를 본다. 대본은 `tests/smoke/<묶음>_smoke.py` 에 있고, 사람이 읽어도 그 기능이
무엇을 하는지 알 수 있게 한 줄에 한 확인씩 적었다. 전부 돌리면 약 5분이다.

기능을 고쳤으면 그 묶음의 문서와 대본을 같이 고친다. 문서에 없는 동작은 없는 기능이다.
