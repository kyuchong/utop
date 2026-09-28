# Defects · Jira Issue · Releases — 결함과 Jira

## 무엇을 하는 화면인가

시험에서 깨진 것을 **결함**으로 모으고, 추린 뒤 **Jira** 이슈로 민다. Jira 에 있는 이슈를 가져다 보고, 릴리즈(fixVersion)별로
이슈와 그것을 덮는 시험을 견준다. 결함은 UTOP 이 따로 갖는 자료가 아니라 Jira 이슈가 정본이고, 로그인도 Jira 계정으로 한다.

## 어디 있나

왼쪽 메뉴 INTEGRATION › **Defects** · **Jira Issue** · **Releases**. Jira 를 붙이는 설정은 SETUP › **Jira 연동**.

## 하는 일

### 결함 (Defects)
- 사이클 실행에서 실패한 항목의 「이슈 생성」 이 결함을 하나 만든다(항목 하나에 결함 하나). ID 는 `E6100-DF0001` 꼴.
  깨진 스텝의 명령·응답·근거를 통째로 담고, 시험 항목이 어느 폴더 길에 있는지(빵부스러기)도 적는다.
- **바로 Jira 로 올리지 않는다.** 64건 돌려 20건 깨지면 열여덟은 같은 원인이거나 시험이 잘못된 것이라, 여기서 사람이 추린다.
- 「지라 등록」 으로 민다. 프로젝트·이슈유형·우선순위·담당·구성요소·수정버전은 사이클의 모델그룹에서 기본값을 채워 준다.
  본문은 Jira 위키 마크업으로 만들고(패널 틀은 SETUP › Jira 프로젝트 패널 설정), 첨부와 댓글도 보낸다.
- 등록한 결함은 Jira 의 **지금 상태**를 한 번에 물어 와 보인다. 상태·비고를 여기서 고칠 수 있다.
- 사이클 저장 때 **자동 결함**을 켜 두면 실패 항목마다 결함을 자동으로 건다(AI 설정).

### Jira 이슈 (Jira Issue)
- Jira 를 실시간으로 두드리지 않는다. 이슈를 **UTOP 에 저장**하고 화면은 저장본을 읽는다. 매일 아침 「마지막 이후 바뀐 것」 만 받아 온다.
  첫 실행은 백필(화면에 선 이슈 전부)이고 진행률이 보인다. 「지금 동기화」 로 바로 받을 수도 있다.
- 표의 열은 SETUP 에서 고른다(사용자 정의 필드 포함). 필터·검색은 저장본에서 한다.
- 이슈 상세는 드로어로 열린다(설명·댓글·첨부). 그림은 볼 때만 Jira 에서 중계한다.
- **묻기(ask)** — 자연어로 「지난달 E6100 미해결 이슈」 처럼 물으면 LLM 이 JQL 로 바꿔 찾고 답한다. 담당자 이름은 Jira 사용자로 풀어 준다.
- 결함 분류(현장장애·상용망검증 / 장비·카테고리·항목·유형)를 이슈 내용으로 LLM 이 매기고, 사람이 고칠 수 있다.

### 릴리즈 (Releases)
- Jira 프로젝트와 버전(fixVersion)을 고르면 그 버전의 이슈와, 각 이슈를 덮는 시험 항목·결과가 노션 꼴 표로 선다.
- 릴리즈 요약은 저장해 두고 결과서에 쓴다. 이슈 상세는 저장본을 lazy 로 읽는다.

### Jira 계정으로 로그인
- 사원이 모두 Jira 계정을 갖고 있어 **Jira 가 정본**이다. UTOP 은 비밀번호를 저장하지 않는다. Jira 에서 바꾸면 그대로 따라간다.
- 로컬 계정은 안전망이다(admin 같은 비상 계정). 연속 실패는 UTOP 이 먼저 잠가 Jira 에 실패가 쌓이지 않게 한다.
- 로그인 서버(devums)와 이슈 서버(ums)가 다를 수 있다. 인증서가 만료된 서버는 TLS 검증을 끈다(SETUP › Jira 연동의 verify).
- 「사용자 동기화」 로 Jira 사용자 목록을 받아 계정을 만들고, 퇴사자는 잠근다. 팀장·그룹장은 Jira 그룹으로 유추한다.

## 규칙과 주의

- Jira 서버가 없으면 이 화면들은 「연결 실패」 를 안내로 보인다. 결함 모으기는 Jira 없이도 된다.
- 결함 ID 를 누르면 Defects 화면으로, 시험 항목 ID 는 REQ-Coverage 로 간다.
- 시험 묶음(RFP·UBQS·표준Config) 축은 Jira 결함 분류에만 있고 시험 항목에는 그 칸이 없다.

## 관리자가 할 일

- SETUP › **Jira 연동**: 주소·계정·토큰·기본 프로젝트·이슈유형·즐겨찾는 프로젝트·verify·계정 로그인 켜기.
- SETUP › **Jira 프로젝트 패널 설정**: 결함 본문 틀. SETUP › **계정 관리**: 사용자 동기화.

## 동작 확인

```bash
./tools/smoke.sh jira
```

대본 `tests/smoke/jira_smoke.py`: Jira 설정 저장·읽기·base → 연결 시험이 서버 없을 때 `ok:false` 로 답하는가 → 로그인 점검·시험 →
캐시 상태·칸 저장·반영 → 결함 분류 틀·저장·읽기 → 릴리즈 요약 저장·반영 → 이슈 저장본·목록 → 버전·fields·projects·이슈 상세·생성·ask 가
500 이 아닌가 → 결함 만들기·목록·항목의 결함·같은 항목은 기존 것·고치기·지라 상태·밀기(프로젝트 없으면 안내)·빵부스러기·지우기·404. 37개.

실제 Jira 조회는 서버가 있어야 한다. 새 판을 올린 뒤 Jira Issue 화면을 한 번 연다.

## 관련 API

`/api/jira/config·base·test·login-test·login-check·user-search·components·projects·issuetypes·createmeta·fields·columns·versions` ·
`/api/jira/issues`(저장본) 와 `sync·backfill` · `/api/jira/issue` 만들기 · `/api/jira/issue/{key}` 와 `attach·comment·description` ·
`/api/jira/cache-status·cache-sync` · `/api/jira/ask·ask-stream·search-all` · `/api/jira/defect/schema·class·classify` ·
`/api/defects` 와 `{id}·{id}/push·for-item·jira-status` · `/api/tc/{id}/crumb` · `/api/issues/{project}·sync` · `/api/release-summary` ·
`/api/users/jira-sync`.
