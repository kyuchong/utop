# CURRENT_TASK.md

여러 세션에 걸치는 일의 진행 상태. 새 작업을 시작할 때 읽고, 끝나면 갱신한다.

마지막 업데이트: 2026-09-29

## 지금 상태

- 도커 compose 다섯 서비스(db·adminer·api·web·runner)로 돈다. 접속 http://<서버>:9000. 213 이 운영, 253 은 `update.sh` 로 받는다.
- 백엔드 `main.py` 는 2026-09-28 에 여섯 묶음(`routes/wiki·jira·devices·ai·nl_test·cycle·tc_req`)으로 나눴다.
  24,417줄 → 4,999줄. 주소는 하나도 안 바뀌었다. 방식은 [architecture.md](architecture.md) 「main.py 와 routes/ 의 관계」.
- 판정기 `web/src/components/tc/judge.ts` 에 정답표(`judge.test.ts`, 명세 38 + 실제 기록 21)가 생겼고 web 도커 빌드가 먼저 돈다(2026-09-29).
- 옛 파이썬 판정기의 BUG-0002(여러 줄 기준 폴백)는 고쳤다. BUG-0001(단어 경계)은 xfail 로 남아 있다.
- 기능별 문서 [features/](features/README.md) 일곱 편과 기능별 동작 확인 `tools/smoke.sh`(빈 DB 스택에 실호출, `tests/smoke/*`)가 생겼다(2026-09-29).
  문서는 SETUP 하위 도움말로 실릴 예정 — 기능을 고치면 그 편과 대본을 같이 고친다.
- 왼쪽 메뉴 SYSTEM 위에 **도움말**(2026-09-29): 위키 공간 `__help__` — 기능별 문서가 블록노트 문서로 심어지고 위키 편집기로 고친다(관리자·편집자, 나머지는 읽기만). 그 위에 판·라이선스 표시.
  SETUP › 도움말·라이선스에서 라이선스 기간과 편집자를 정한다. 버전은 루트 `VERSION`, 커밋은 start.sh 가 빌드 때 넘긴다.
- 회귀 검사는 `tools/verify.sh`(api 이미지 안에서 verify.py). 문서 경로·API 문서 드리프트·ruff·pytest·하네스 전부 통과 상태다.

## 진행 중

- 없음.

## 다음 할 일

- **옛 UI 잔재 정리.** `frontend/` 에 새 UI 로 안 옮긴 화면이 넷 남았다 — 게시판(`/api/board`)·할일(`/api/todo`)·도움말(`/api/help`)·리소스(인력·프로젝트, `/api/resource`).
  옮기면 `main.py` 의 `/static`·`/` 마운트, `backend/Dockerfile` 의 `COPY frontend/`, `.dockerignore` 주석, `tools/verify.py` 의 프론트 린트를 함께 걷는다.
- **engine.py 의 죽은 경로.** `data/tc`·`data/cycle`·`baselines` 폴더를 만드는 코드와 Baseline 기능([REMOVAL-0001](../harness/bugs.md#removal-0001)) 제거.
- **옛 결함 둘.** `routes/jira.py` 의 `issues_sync` 안 미정의 이름 `project`(호출되면 NameError), `routes/nl_test.py` 518~549줄의 함수 밖으로 밀린 죽은 조각.
- **판정기 정답표 키우기.** DB 에 기준 있는 실행 스텝이 32건뿐이었다. 사이클이 쌓이면 같은 SQL 로 다시 뽑아 `__fixtures__/judge-cases.json` 을 늘린다.
- **web 의 큰 파일.** `pages/Cycles.css` 11,000줄, `components/cycle/AskBar.tsx` 7,300줄. 짝 없는 CSS(`Requirements.css`·`RunsBoard.css`)와 데모 HTML 12개 정리.

## 하지 않기로 한 것

- main.py 를 더 쪼개기 — 남은 것은 인증·사용자·조직·설정·게시판·알림·WebSocket 이라 한 파일이 맞다.
- 판정기를 파이썬으로 다시 쓰기 — 두 벌이면 어긋난다. runner 가 TS 판정기를 그대로 쓴다.
