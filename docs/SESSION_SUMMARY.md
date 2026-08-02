# SESSION_SUMMARY.md

> ⚠️ 이 문서는 과거 기록입니다. 더 이상 갱신하지 않습니다.
> 변경 이력은 `git log` 를 참조하세요.

이 문서는 세션별 작업 기록을 누적하는 문서이다. Codex는 작업 종료 시 이 문서를 갱신해야 한다.

## 작성 규칙

- 최신 세션을 위에 추가한다.
- 날짜는 `YYYY-MM-DD` 형식으로 작성한다.
- 수정한 파일 목록은 실제 파일 경로를 적는다.
- 해결하지 못한 문제는 다음 세션 작업에 남긴다.

---

## 2026-06-08

### 사용자 요청

- Dashboard의 시험항목 Dashboard를 실행 결과 중심으로 개선.
- 실행 중인 시험 목록과 실행한 시험 목록을 실시간/주기 갱신하도록 조정.
- 실행한 시험 목록이 많아질 경우 최근 20개만 표시.
- Requirements & Test Coverage의 Test Case 상세, Test Environments, Test Procedure UI 개선.
- Test Procedure 판정기준을 직접 문자열 입력이 아닌 메뉴 선택 방식으로 변경.
- Baseline 비교 판정기준은 기존 저장 Baseline을 선택하고 미리보기/수정할 수 있도록 개선.
- `Interface 모두 Connect`, `정규식 일치`처럼 사용 난이도나 필요성이 낮은 판정기준 메뉴 제거.
- 지금까지 변경 내용을 프로젝트 MD 문서에 기록.

### 수행한 작업

**Dashboard 시험항목 Dashboard 개선**
- 기존 placeholder였던 시험항목 Dashboard를 실제 화면으로 구성.
- 실행 중인 시험 목록 추가:
  - TC Cycle WebSocket 이벤트(`cycle_*`)와 Test Run WebSocket 이벤트(`run_start`, `step_start`, `step_done`, `run_done`)를 반영.
  - 실행 완료 후 바로 사라지지 않고 일정 시간 완료 상태로 유지.
  - Step 상세 행은 사용자 요청으로 제거하고 현재 상태만 한 줄로 표시.
- 실행한 시험 목록 추가:
  - TC Cycle 결과(`/api/cycle`)와 Test Run 결과(`/api/results`)를 합산 표시.
  - 서버 부담을 줄이기 위해 5초 주기 갱신.
  - 검색/상태 필터 적용 후 최근 20개만 표시.

**Requirements & Test Coverage UI 개선**
- Test Case의 `Test Environments` 탭에서 왼쪽 `시험 구성도` 라벨 제거.
- 시험 구성도가 전체 너비를 사용하도록 레이아웃 조정.
- Test Procedure의 판정기준 textarea를 메뉴형 rule builder로 변경.
- 사용 메뉴:
  - 출력에 포함
  - 모두 포함
  - 포함되면 실패
  - Baseline 비교
- `Interface 모두 Connect`와 `정규식 일치`는 신규 메뉴에서 제거.
- 기존 데이터 호환을 위해 내부 해석 로직은 유지.

**Baseline picker 개선**
- Baseline 비교 선택 시 Baseline 선택 모달 자동 표시.
- Baseline 입력칸 클릭 시 picker 표시.
- 이미 선택된 `dev009/show_version` 같은 기준을 클릭하면 장비/키가 자동 선택되도록 개선.
- Baseline picker에서 선택한 Baseline의 저장 출력 미리보기 추가.
- picker 내부 `수정` 버튼으로 해당 Baseline 편집 모달 진입 가능.
- 수정 후 기존 Baseline 관리 편집 흐름을 재사용.

### 수정한 파일 목록

- `frontend/index.html`
- `CURRENT_TASK.md`
- `SESSION_SUMMARY.md`
- `CHANGELOG.md`
- `AGENTS.md`

### 발견된 문제

- 실행한 시험 목록을 1초마다 `/api/cycle`, `/api/results`로 조회하면 서버 부담이 생길 수 있음.
- Test Procedure 기준 추가 시 빈 기준은 저장 후 다시 렌더링될 때 사라지는 문제.
- Baseline 기준 클릭 시 기존 선택값이 picker에 유지되지 않던 문제.
- Step 진행 정보가 실행 중 목록에 과도하게 표시되어 UI가 복잡해지는 문제.

### 해결한 문제

- 실행한 시험 목록 갱신 주기를 5초로 조정.
- 빈 기준도 `contains:` 형태로 보존해 기준 추가 직후 행이 유지되도록 수정.
- Baseline picker가 현재 장비/키/미리보기를 자동 선택하도록 수정.
- 실행 중 목록에서 Step 상세 행과 `Step 1 PASS` 같은 문구 제거.

### 다음 세션에서 이어서 할 작업

- 실제 브라우저에서 판정기준 메뉴 추가/수정/삭제 저장 흐름 확인.
- Baseline picker에서 현재 선택 유지, 미리보기, 수정 후 재선택 흐름 확인.
- Dashboard 실행 중 목록과 실행 완료 목록이 실제 장비 실행 중 안정적으로 반영되는지 확인.
- REQ/TC 상태 체계 분리(`문서 상태` vs `실행 결과`) 검토.

---

## 2026-06-05 (세션 3)

### 사용자 요청

- TC Cycle 페이지의 `cycle-list-body`에서 같은 버전(`r1.1.1` 등)이 2개 이상 있을 때 선택이 안 되거나 구분이 어려운 문제 수정.
- Cycle 상세(`cycle-detail-body`)에서 기존 TC를 추가할 수 있는 기능 추가.

### 수행한 작업

- Cycle 목록 렌더링 개선:
  - 같은 release 그룹 안에서 동일 버전이 여러 개일 때 날짜와 TC 수를 함께 표시.
  - Cycle item에 실제 `cycle.id`를 title로 표시.
  - 같은 버전은 날짜/생성일 기준으로도 정렬.
- 새 Cycle 생성 시 ID 충돌 방지:
  - `uniqueCycleId(baseId)` 추가.
  - 같은 모델/버전/날짜로 생성해도 기존 Cycle 파일을 덮지 않고 `-2`, `-3` suffix를 붙임.
- Cycle 상세에 기존 TC 추가 기능 추가:
  - 상단과 TC 실행 결과 영역에 `TC 추가` 버튼 추가.
  - `openAddTCToCycle`, `submitAddTCToCycle`, `syncCycleAddGroupCheck` 구현.
  - 이미 Cycle에 포함된 TC는 비활성화하고 `이미 포함`으로 표시.
  - 선택한 기존 TC를 현재 Cycle의 `tc_ids`에 추가하고 Cycle JSON 저장.

### 수정한 파일 목록

- `frontend/index.html`
- `AGENTS.md`
- `CURRENT_TASK.md`
- `SESSION_SUMMARY.md`
- `CHANGELOG.md`

### 발견된 문제

- 같은 모델/버전/날짜로 Cycle을 새로 만들면 기존 Cycle ID와 충돌하여 JSON 파일을 덮을 수 있는 구조였음.

### 해결한 문제

- 중복 버전 Cycle이 목록에서 구분되지 않던 문제.
- Cycle 생성 시 동일 ID 충돌 가능성.
- 기존 TC를 추가하려면 Cycle을 새로 만들어야 했던 불편.

### 다음 세션에서 이어서 할 작업

- 실제 브라우저에서 중복 버전 Cycle 선택 확인.
- 실제 브라우저에서 Cycle 상세의 `TC 추가` 모달과 저장 흐름 확인.

---

## 2026-06-05 (세션 2)

### 사용자 요청

- TC Summary가 동작 시나리오 제목 수정 시 갱신되지 않는 문제 수정.
- 장비별 CLI 결과를 사전 저장하고 판정기준에 비교하는 "Baseline 비교" 기능 추가.
- Baseline 관리 페이지에서 "bls.map is not a function" 오류 수정.
- Baseline 비교 시 공백·탭 정규화 여부 확인 및 적용.
- 동작 시나리오 추가 시 tc4-body에 TC가 반영되지 않는 문제 수정.
- 시나리오/TC 삭제 후 새 시나리오 추가 시 엉뚱한 TC가 매핑되는 문제 수정.

### 수행한 작업

**TC Summary 갱신 수정**
- `syncScenarioTCRefs`에 `hasSCIdLink` 조건 추가.
- `sc_id`로 직접 연결된 TC는 시나리오 제목 변경 시 항상 이름을 동기화.

**Baseline 비교 판정기준 기능 추가**
- `backend/main.py`:
  - `BASELINES_DIR = DATA_DIR / "baselines"` 상수 및 디렉터리 자동 생성.
  - `DEFAULT_MASKS`: uptime·카운터·속도·타임스탬프 등 자동 마스킹 패턴 정의.
  - `normalize_for_baseline`: 앞뒤 공백 제거 + 내부 공백·탭 단일 공백으로 정규화 + 빈 줄 제거.
  - `apply_baseline_masks(text, extra_masks)`: DEFAULT_MASKS + 사용자 마스크 적용 후 치환.
  - `load_baseline(device_id, key)`: 저장된 baseline JSON 로드.
  - `judge_by_criteria` 시그니처에 `device_id=""` 추가, `baseline:` / `bl:` 접두사 처리.
  - CRUD API 추가: `GET /api/baselines`, `GET /api/baselines/{device_id}`, `GET /api/baselines/{device_id}/{key}`, `POST /api/baselines/{device_id}/{key}`, `DELETE /api/baselines/{device_id}/{key}`.
- `frontend/index.html`:
  - "Baseline 관리" 페이지 (`page-baseline`) 추가.
  - 새 Baseline 캡처 모달 (`modal-baseline-capture`): 장비 선택, 키 입력, 명령 실행, 설명, raw 출력 편집, 커스텀 마스크 패턴 관리.
  - Baseline 피커 모달 (`modal-baseline-picker`): 장비→키 드롭다운 → `baseline:device_id/key` 문자열 생성 → TC 판정기준에 삽입.
  - TC 판정기준 UI에 "Baseline" 버튼 추가 (openBaselinePicker 호출).
  - `blEditingOrig` 전역 변수로 편집/신규 모드 구분, 키 변경 시 이전 파일 삭제.
  - `renderBaselinesBody`, `loadBaselinesPage`, `openCaptureModal`, `blViewEdit`, `blSaveCapture`, `blDeleteBaseline` 함수 구현.

**Baseline 관리 페이지 오류 수정**
- `loadBaselinesPage`: `res.ok` 체크 추가, 오류 시 안내 메시지 표시.
- `renderBaselinesBody`: `data.detail` 존재 시 오류 UI 표시, 각 장비의 배열 타입 검증 (`Array.isArray`) 추가.

**동작 시나리오 추가 시 tc4-body 미반영 수정**
- `addScenario`를 `async function`으로 전환.
- 시나리오 추가와 동시에 TC를 생성하고 `r.tc`에 참조 추가 및 파일 저장.
- 완료 후 `refreshTC4ForREQ(r)` 호출로 tc4-body 즉시 갱신.

**엉뚱한 TC 매핑 버그 수정**
- 원인: `addScenario`에서 새 SC 번호를 `scenarios.length + 1`로 계산.
  삭제 후 재추가 시 기존 SC ID와 번호 충돌 → 새 SC와 기존 TC가 같은 sc_id를 가짐.
- 수정: 기존 SC ID에서 번호를 파싱하여 `max(기존 SC 번호) + 1`로 계산.
  삭제 이력과 무관하게 항상 고유한 SC ID 생성.

### 수정한 파일 목록

- `backend/main.py`
- `frontend/index.html`

### 발견된 문제

- Baseline 관리 페이지는 서버 재시작 후에만 정상 응답하는 경우가 있음 (서버가 구버전으로 실행 중일 때).

### 해결한 문제

- TC Summary가 시나리오 제목 변경 시 자동 갱신되지 않던 문제.
- Baseline 관리 페이지에서 서버 미재시작 시 "bls.map is not a function" 오류.
- 동작 시나리오 추가 시 tc4-body에 새 TC가 표시되지 않던 문제.
- 시나리오·TC 삭제 후 재추가 시 기존 SC ID와 충돌하여 엉뚱한 TC가 매핑되던 문제.

### 다음 세션에서 이어서 할 작업

- 실제 브라우저에서 Baseline 캡처·비교 흐름 전체 확인.
- Cycle 실행 시 `baseline:` 판정기준 PASS/FAIL 동작 확인.
- 루트의 API key로 보이는 파일 처리 방침 확인.

---

## 2026-06-05

### 사용자 요청

- 프로젝트 구조 설명 및 UI 반응형 조정.
- 실행하지 않은 서버가 열려 있는 문제 확인 및 서버 종료.
- 런처 종료 시 서버가 남지 않도록 수정.
- Test Management의 REQ/TC 관리와 TC Cycle 실행 흐름 개선.
- TC 절차를 자동 실행하여 장비 CLI 결과를 수집하고 P/F 판단 및 PPTX 저장.
- Cycle 실행 상태/완료 여부와 실패 사유 표시 개선.
- Device의 E5724RL 자동 실행 FAIL 원인 분석.
- 판정기준 여러 개 추가 기능.
- Paramiko 대신 Netmiko 전환.
- enable 입력 후 비밀번호가 필요한 장비 처리.
- TC Cycle 결과 행 클릭 시 TC 상세 레이아웃 표시.
- 프로젝트 관리 문서 생성.

### 수행한 작업

- `launcher.py`에 서버 프로세스 정리 로직 추가.
- 현재 실행 중인 서버 프로세스 확인 및 종료 작업 수행.
- `backend/main.py`에 TC Cycle 실행 API 추가 및 보강.
- Netmiko 기반 SSH CLI 실행으로 전환.
- enable 모드 진입 로직 추가.
- E5724RL의 `show version` 명령이 enable 후 정상 동작하는지 실제 확인.
- 판정기준 로직 추가:
  - 다중 기준 지원
  - 배열/문자열 기준 지원
  - 접두사 없는 값은 contains로 처리
  - contains, contains_all, not_contains, regex, interface_connected 지원
- `frontend/index.html`에 TC Step 판정기준 여러 개 추가/삭제 UI 추가.
- `frontend/index.html`에 TC Cycle 자동 실행 UI와 상태 표시 개선.
- Cycle 결과 메모에 실패 사유를 표시하도록 개선.
- 구버전 결과에서 장비 출력이 실패 사유처럼 표시되지 않도록 수정.
- TC Cycle 결과 행 클릭 시 TC 상세 레이아웃이 펼쳐지도록 추가.
- CLI 출력 이미지와 PPTX 생성 기능 추가.
- `requirements.txt`에 Netmiko, python-pptx, Pillow 반영.
- 프로젝트 관리 문서 4종 생성.

### 수정한 파일 목록

- `launcher.py`
- `backend/main.py`
- `frontend/index.html`
- `requirements.txt`
- `data/devices/devices.json`
- `data/tc/test-VERSION-TC-01-001.json`
- `data/cycle/E5724RL-r1.1.1-20260605.json`
- `AGENTS.md`
- `CURRENT_TASK.md`
- `SESSION_SUMMARY.md`
- `CHANGELOG.md`

### 발견된 문제

- VSC/터미널에서 launcher를 Ctrl+C로 종료하면 uvicorn reload 자식 프로세스가 남을 수 있었음.
- 8000번 포트에 이전 서버가 계속 떠 있어 변경사항이 반영되지 않는 것처럼 보이는 상황이 있었음.
- E5724RL은 로그인 직후 일반 모드에서 `show version`이 invalid이며 enable 모드가 필요함.
- Device 저장 시 enable 관련 필드가 누락되거나 빈 값으로 덮일 수 있었음.
- Cycle 결과 파일에 reason/pass_criteria가 없는 구버전 데이터는 화면에서 장비 출력이 사유처럼 보일 수 있었음.
- 루트에 API key로 보이는 파일이 존재함. 처리 방침 확인 필요.

### 해결한 문제

- 런처 종료 시 `taskkill /T /F`로 서버 프로세스 트리를 정리하도록 수정.
- Netmiko 실행 시 enable 명령과 enable 비밀번호를 사용할 수 있도록 수정.
- E5724RL은 enable 비밀번호가 비어도 로그인 비밀번호 fallback을 사용하도록 보강.
- Device 업데이트 시 기존 Netmiko 관련 필드가 빈 값으로 덮이지 않도록 보강.
- 판정기준 `1.0.0` 또는 `contains:1.0.0`이 모두 PASS로 처리되도록 수정.
- TC Cycle 결과 상세에서 Step별 result/reason/output/pass_criteria를 볼 수 있도록 개선.

### 다음 세션에서 이어서 할 작업

- 실제 브라우저에서 TC Cycle 결과 상세 펼침 UI 확인.
- E5724RL Cycle 재실행 후 PASS 상태가 유지되는지 재확인.
- 루트의 API key로 보이는 파일 처리 방침 확인.
- 민감정보 저장 방식 개선 검토.
- 판정기준 UI를 rule builder로 개선할지 검토.
