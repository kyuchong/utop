# Migration Log — nettest → 현재 프로젝트

> ⚠️ 이 문서는 과거 기록입니다. 더 이상 갱신하지 않습니다.
> 언급된 임시 백업 파일(`frontend/index.backup-cycleport.html` 등)은 이후 정리되어 존재하지 않습니다.

> nettest(테스트/nettest)의 기능·디자인을 현재 프로젝트에 단계적 이식한 작업 기록.
> 원칙: 한 번에 하나의 기능, 완료·검증 후 다음. 기존 기능 안정성 최우선.

---

## [2026-06-10] 1단계 — 프로젝트 비교 분석
- **기능명**: 두 프로젝트 정밀 비교 분석 (이식 계획 수립)
- **수정 파일**: 없음 (분석 전용)
- **추가 파일**: `migration-summary.md`, `migration-log.md`
- **삭제 파일**: 없음
- **변경 이유**: 이식 대상·중복·우선순위 판별
- **방법**: 4-에이전트 워크플로 (현재 프로필 / 참고 프로필 / 참고 기능목록 / 양방향 diff)
- **결과**:
  - 현재 프로젝트가 참고 기능 대부분 보유(동등 이상). 실제 이식 후보는 SNMP·Lab콘솔·Ping·TCL 4개.
  - 이번 세션에 이미 이식: Report, LLM(드래그/field_prompts), Confluence, iTest Sequencer 절차.
  - 우선순위: ①Ping ②Lab 콘솔 ③SNMP ④TCL
- **발견 버그**: 없음
- **남은 작업**: 2단계 — Ping(`/api/ping`) 이식부터 진행

---
## [2026-06-10] 2단계 — 기능1: Ping 유틸리티
- **기능명**: 장비 도달성 Ping (`/api/ping`)
- **수정 파일**: `backend/main.py` (엔드포인트 추가), `frontend/index.html` (pingDevice/_pingShow + Ping 버튼)
- **추가 파일**: 없음
- **변경 이유**: 참고 `/api/ping` 이식 — 시험 전 장비 IP 도달성 확인
- **예상 영향**: 추가형(기존 기능 무영향). 서버 재시작 필요(엔드포인트 활성화).
- **실제 결과**: 백엔드 py_compile OK / 프론트 node --check OK. 장비 상세 "연결 시도" 옆 **Ping** 버튼 → 모달로 ping 결과 표시(응답/무응답/오류).
- **발견 버그**: 없음
- **남은 작업**: 기능2 Lab 콘솔

## [2026-06-10] 2단계 — 기능2: Lab 콘솔 페이지
- **기능명**: Lab 콘솔 (page-lab) — 등록 장비에 즉석 CLI/Ping 실행
- **수정 파일**: `frontend/index.html` (page-lab div, 네비 dd-item, showPage 훅/navId, renderLab/labRunCli/labPing/labClear/_labAppend)
- **추가 파일**: 없음
- **변경 이유**: 참고 Lab Test 콘솔 이식 — 절차 없이 빠른 CLI 실행/도달성 확인
- **예상 영향**: 추가형 새 페이지(기존 무영향). 기존 `/api/devices/{id}/command` + `/api/ping` 재사용 → 백엔드 추가 없음.
- **실제 결과**: node --check OK. Device Management 메뉴에 "Lab 콘솔" 추가, 장비 선택 → CLI Enter 실행/Ping/지우기, 터미널 출력 누적.
- **발견 버그**: 없음
- **남은 작업**: 기능3 SNMP

## [2026-06-10] 2단계 — 기능3: SNMP GET
- **기능명**: SNMP GET 조회 (`/api/snmp-get`)
- **수정 파일**: `backend/main.py` (엔드포인트), `requirements.txt` (pysnmp>=6.2.0), `frontend/index.html` (Lab콘솔 SNMP행 + labSnmpGet)
- **변경 이유**: 참고 SNMP 조회 이식 — 현재 SNMP 역량 0 → 새 역량. 참고의 전용 SNMP 페이지 대신 **Lab 콘솔에 통합**(현재 구조에 맞춤).
- **예상 영향**: 추가형. pysnmp는 함수 내 인라인 import + try/except → **미설치여도 백엔드 정상**, SNMP 호출 시에만 실패. `pip install pysnmp` 필요.
- **실제 결과**: py_compile OK / node --check OK. Lab 콘솔에서 장비+community+OID → SNMP GET 결과 표시.
- **발견 버그**: 없음
- **기술 부채**: 참고의 표준 OID 라이브러리/OID 관리 페이지는 미이식(추후).
- **남은 작업**: 기능4 TCL (현재 보유 여부 확인 중)

## [2026-06-10] 2단계 — 기능4: TCL 스크립트 실행 (이식 불필요 — 이미 존재)
- **기능명**: TCL 실행
- **수정 파일**: 없음
- **변경 이유**: 점검 결과 현재 `backend/main.py`의 `tcl_exec()`가 참고와 **완전 동일**, `run_command`에서 `protocol=="TCL"` 분기로 이미 동작.
- **결과**: 원칙(중복 기능 미수정)에 따라 **수정 없이 기록만**. → 중복 기능.

## [2026-06-10] 2단계 — 버그 탐색·검증 (신규 코드 전체)
- **대상**: 기능1~3 신규 코드 (Ping, Lab 콘솔, SNMP)
- **점검 항목 / 결과**:
  - 빌드: `py_compile` OK · `node --check` OK
  - 통합: `devices` 전역 init 적재 확인, `.ip` 필드 보유, `loadDevices` 존재 확인 → 정상
  - 중복 정의: 신규 함수 8개·page-lab·네비 각 1개(중복 0)
  - 런타임 스모크: renderLab/labRunCli/labSnmpGet/pingDevice 전부 무오류 + 기대 출력
  - 다크모드: `--bg2` 정의 확인 → 테마 대응 정상
  - 회귀: 변경은 전부 추가형(엔드포인트·페이지·함수·버튼 추가), 기존 코드 수정은 device 상세 버튼 1줄·showPage 조건 추가뿐 → node --check 통과, 회귀 위험 없음
- **발견 버그**: **0건**
- **남은 작업**: 없음 (이식 대상 4개 처리 완료). 추후: SNMP OID 라이브러리/관리 페이지, tc.steps↔tc.checks 브리지(최종 리팩토링 단계)

## [2026-06-10] 3단계 — 페이지 이식 ①: 실행 보드 (page-board)
- **기능명**: 실행 보드 (REQ·TC·실행 통합) — 참고본 page-board
- **수정 파일**: `frontend/index.html` (page-board div, 네비 dd-item, showPage 훅, testMgmtPages, board 전역 6개 + 함수 13개)
- **추가 파일**: 없음
- **변경 이유**: 참고본과 똑같은 형태로 실행 보드 이식 (추가형, 기존 무영향)
- **방법**: 워크플로 매핑(4 에이전트) → 참고본 board* 함수/div 추출 → 의존성 전부 현재에 존재(cycleFolderList·resultStatuses·cycleItemStatus·resultVerdict·resultMeta·reqList·tcList·cycleList·tcTabContent) 확인 → 거의 그대로 이식
- **예상 영향**: 추가형 새 페이지. 3열은 내 tcTabProcedure(iTest Sequencer) 재사용 → 완전 연동.
- **실제 결과**: node --check OK / 런타임 스모크 전부 통과(필터·1·2·3열 렌더·선택흐름·REQ배지·사이클연동). 충돌 0.
- **발견 버그**: page-lab 들여쓰기 불일치로 div 1차 미삽입 → 정확 앵커로 재삽입 해결.
- **남은 작업**: ② Test Cycle 페이지(내 기능 유지), ③ Explorer 유사화

## [2026-06-10] 3단계 — 페이지 이식 ②: Test Cycle 매트릭스 보기
- **기능명**: TC × 모델 매트릭스 보기 (참고본 cycle의 standout 기능)
- **수정 파일**: `frontend/index.html` (cycleMx* 전역 2개 + 매트릭스 함수 6개 + cycle 헤더 "매트릭스" 버튼)
- **추가 파일**: `frontend/index.backup-cycleport.html` (안전 백업)
- **분석 결과(중요)**: 참고본 cycle은 `cb*` 컬럼보드 아키텍처(44함수·~809줄) — 현재(0/44, 완전 다른 구조 + WebSocket·Baseline·AI). **전체 교체 = ~1000줄 다른 아키텍처 + WebSocket 재배선 → 작동 중 cycle 파손 고위험**(사용자 원칙 "안정성 최우선" 위배).
- **결정**: 전체 교체 대신 **참고본의 핵심 차별 기능인 매트릭스 보기만 안전하게 추가**. 매트릭스는 cb*에 비의존(cbSel 1줄만 적응), cycleList·cycleCalcStats·cycleItemStatus·resultMeta·**cycleRenderExecTable(내 실행표)** 재사용.
- **실제 결과**: node --check OK / 스모크 전부 통과(TC×모델 테이블·Pass/Fail 색·셀클릭→내 실행표 모달). 기존 cycle(WebSocket·AI·Baseline) 무영향.
- **발견 버그**: 없음 (테스트 스텁의 `.remove()` 미구현은 테스트 한계, 실제 `?.remove()` 정상)
- **남은 작업**: 전체 cb* 교체는 별도 대형/고위험 작업으로 보류(백업 보유). ③ Explorer는 이미 참고본 디자인 보유.

## [2026-06-10] 3단계 — Test Cycle 전체 교체 (cb* 컬럼보드, 사용자 요청)
- **기능명**: Test Cycle을 참고본 `cb*` 5열 캐스케이딩 컬럼보드로 전체 교체 + WebSocket 재작성
- **수정 파일**: `frontend/index.html` (page-cycle div 교체 6492→1091, initCyclePage 교체, cb* 영역 ~1120줄 + 헬퍼 3개 삽입, cbAutoRun WebSocket 오버라이드, cycleHandleWS에 cb 보드 갱신 배선)
- **백업**: `index.backup-cycleport.html`
- **방법(2-stage)**: A) 헬퍼(_judgeCheck→critJudge 매핑·_checksToSteps·_stepStatusKey) + cb* 영역 + cbAutoRun을 추가형 삽입(무영향) → B) div·initCyclePage 교체로 활성화 + WebSocket 배선
- **WebSocket 재작성**: cbAutoRun → 내 `cycleRunAll(cycleId)`(/api/cycle/{id}/run + WS) 호출, cycleHandleWS가 WS 이벤트마다 `cbRefreshItems()`로 cb 보드 실시간 갱신
- **의존성 적응**: 참고 `_judgeCheck`→현재 critJudge 매핑, `/api/run-cli`는 WebSocket 재작성으로 불필요
- **실제 결과**: node --check OK / 런타임 스모크 통과(renderCycleBoard 3컬럼·cbReset·cbTreeSelect·cbAutoRun). 매트릭스 보기도 그대로.
- **변경점**: cb* 보드(트리·TC·실행 + 리사이즈·컨텍스트메뉴) + 매트릭스 + WebSocket 자동실행 = 참고본 형태. 현재 고유였던 대시보드·AI요약·Baseline 미리보기는 cb 보드에 없어 미표시(함수는 보존, orphan).
- **발견 버그**: 없음 (스모크 스텁 누락은 테스트 한계)
- **롤백**: 문제 시 `index.backup-cycleport.html`로 복구

## [2026-06-11] REQ 상세 "구현내용" 탭 이식 + 다크모드 전면 보정
- **① 구현내용 탭**: 참고본 `req2TabImpl`/`req2SaveImpl` 이식 — REQ 상세 rail에 `{id:'impl',icon:'ti-code',label:'구현내용'}` + 디스패처 분기 추가. `r.implementation` 필드 textarea(CLI 조회결과·구현상세) → `saveOneREQ`로 저장 → **LLM TC 생성에 자동 반영**. textarea 배경은 다크 대응 var(--bg2).
- **② 다크모드 보정**: 이식 코드의 하드코딩 라이트색 **총 384건 → 테마 변수/rgba**(흰배경→var(--bg2), 라이트틴트→var(--bg3)/rgba, 진한글자→var(--text), 테두리→var(--border)). 접두사 치환 버그(#fff가 #ffffff 잠식) 1건 수정. **다크 select/option/input CSS** 추가(드롭다운 흰박스 제거). 의미색(Pass녹·Fail빨·Blocked주황·경고노랑)은 유지.
- **검증**: node --check OK. 라이트모드 영향 0(var(--bg2) 라이트=#fff). 잔여 밝은배경=의미색뿐.

## [2026-06-11] 이슈(Issue) Jira(UMS) 연동 + TC 생성 증분/삭제 즉시반영
- **TC 생성 증분**: `llmGenTC` — 전부 모은 뒤 일괄 반영 → **하나씩 push+saveTCFile+saveOneREQ+렌더(160ms 간격)**. `expDeleteTC`/`deleteTC4`에 상세 표 재렌더 추가 → **삭제 즉시 반영**.
- **Jira 백엔드**(`backend/main.py`): `JIRA_FILE=data/jira.json` + `/api/jira/issue`(키→`/rest/api/2/search?jql=key=X`로 요약·상태·담당자 조회), `/api/jira/config`(get/set), `/api/jira/projects`. 인증: JIRA_FILE의 token(Bearer) 또는 username/password(Basic), 없으면 Confluence 자격증명 폴백. httpx는 함수 내 import(py_compile만으론 못 잡는 런타임 NameError였음 → 수정).
- **Jira 프론트**: `req2AddIssue`/`tcAddIssue` — 키 입력 → placeholder 즉시 표시 → `/api/jira/issue` 조회 → 실데이터 채움 → 재렌더(실시간). `req2DeleteIssue` 실시간 렌더. **[Jira 설정] 모달**(`jiraConfigOpen/Save`: base+토큰/아이디·비번) + 이슈 탭 버튼.
- **검증**: py_compile OK / node --check OK. **서버 재시작 + [Jira 설정]에서 자격증명 입력 필요**.

## [2026-06-11] Test Cycle cb보드 — 참고본 신버전 향상 반영
- **추가/변경**(`frontend/index.html` cb 영역):
  - 트리 **정렬 토글**(`cbTreeSortToggle`+`cbTreeSort`+`_cbSortFolders/_cbSortStr`) — 헤더 버튼(오름/내림/끔, 한글 localeCompare)
  - 트리 **우클릭 컨텍스트 메뉴**(`cbTreeCtx`/`cbTreeCtxClose`) — 생성/수정/삭제(기존 호버 버튼 대체, cbNodeAct 재사용)
  - 버전 노드 **합격/불합격 %배지**(`_cbVerBadge`) — 초록 pass% / 빨강 fail% (예: 67%/33%)
  - 중앙 표 **"이슈" 컬럼** 추가(cbCol2Html) — TC의 issue_list 개수 배지(빨강) / 없으면 ·
  - **TC ID 단축** `U-REQ-XXX-` 접두 제거(참고본 "HW-Spec-TC-01-001" 표기 일치)
- **검증**: node --check OK / 런타임 스모크 전부 통과(우클릭메뉴·%배지 67·33·정렬토글·이슈컬럼·결과드롭다운). 참고본 HTML과 일치.

## [2026-06-11] NCM(참고) UI 디자인 접목 ① 색 팔레트
- **분석**: 워크플로 3에이전트로 참고/head.txt·body.txt(ManageEngine NCM) + U-TOP 분석. NCM = 밝은·플랫·각진 엔터프라이즈(녹색 CTA #1fce82/#45bd7f, 파랑 악센트 #3f8ed9, 회색 중립). U-TOP = 둥근·다크지원·블루 중심.
- **적용(안전·CSS 색값만)**: U-TOP 브랜드 악센트를 NCM으로 **전역 일관 치환 562건**(테마변수 + 인라인 하드코딩 hex + rgba 트리플, 라이트+다크 모두). blue #2d6fd4→#3f8ed9, green #00a872→#1bbd7c(다크 #1fce82), red #e53e5a→#ef4458, yellow #c48a00→#d99000 등.
- **무손상**: JS·onclick·함수·구조·id 미변경. node --check OK. 구 브랜드색 0 잔존(완전 일관). 백업 `index.backup-precolor.html`.
- **미적용(위험·구조변경이라 보류)**: NCM의 좌측 사이드바 레이아웃·각진 모서리(radius 0)·컴포넌트 디테일. 색만으로 분위기 전환. 추가 원하면 별도 진행.

## [2026-06-11] 서버(220.1.1.236)→내파일 기능 이식 — Feature 1: SNMP
- **방향**: 사용자 선택 "내 파일 기준 + 서버 기능 이식". 서버 = U-TOP 최신(167함수 더 많음: ITMS·SNMP·인증·랙·인수시험 등). 자족 기능부터 하나씩.
- **이식 내용**: `page-snmp` div(snmp-body 컨테이너) + SNMP 함수 12개(renderSnmp·loadSnmp·saveSnmp·snmpAdd/Del/Sel/Set Comm·Oid·snmpAddStdMibs) + `SNMP_STD_OIDS` 상수(6165자 표준 OID) + showPage render훅·navId(snmp→nav-devices) + Device Management 드롭다운에 "SNMP OID Management" 항목.
- **백엔드**: 불필요 — SNMP OID/커뮤니티는 **localStorage 저장**(loadSnmp/saveSnmp).
- **검증**: node --check OK / 렌더 스모크 통과(snmp-body 25202자·표준 OID·snmpAddOid). 충돌 0(renderSnmp/page-snmp 내 파일에 없었음).
- **발견 의존성**: `SNMP_STD_OIDS`(const라 함수검사에서 누락) → 추출·추가로 해결.
- **남은 작업**: ②ITMS/랙(최대) ③로그인/사용자 ④인수시험/부적합 ⑤Cycle/TC 개선

<!-- 이후 작업은 이 아래에 누적 -->
