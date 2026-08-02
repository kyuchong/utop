# CHANGELOG.md

> ⚠️ 이 문서는 과거 기록입니다. 더 이상 갱신하지 않습니다.
> 변경 이력은 `git log` 를 참조하세요.

이 문서는 프로젝트 변경 이력을 날짜별로 기록한다. 새 변경은 최신 날짜를 위에 추가한다.

## 2026-06-08

### Added

- Dashboard `시험항목 Dashboard` 실제 화면 추가.
- 실행 중인 시험 목록 추가:
  - TC Cycle WebSocket 진행 이벤트 반영.
  - Test Run WebSocket 진행 이벤트 반영.
- 실행한 시험 목록 추가:
  - TC Cycle 결과와 Test Run 결과를 통합 표시.
  - 검색/상태 필터 지원.
  - 최근 20개 표시.
- Test Procedure 판정기준 메뉴형 UI 추가.
- Baseline 비교 선택 모달에 저장 출력 미리보기 추가.
- Baseline 선택 모달에서 선택 Baseline 수정 버튼 추가.
- 이미 선택된 Baseline 기준 클릭 시 장비/키/미리보기 자동 선택 기능 추가.

### Changed

- 실행한 시험 목록 갱신 주기를 5초로 조정.
- 실행 중인 시험 목록은 WebSocket 기반 즉시 갱신 구조로 유지.
- Test Case `Test Environments` 탭에서 시험 구성도 라벨을 제거하고 구성도가 전체 너비를 사용하도록 개선.
- Test Procedure 판정기준 입력을 직접 문자열 입력에서 메뉴 선택 + 값 입력 방식으로 변경.
- Baseline 비교는 직접 입력 대신 picker 선택 중심 흐름으로 변경.

### Fixed

- Test Procedure에서 `기준 추가`를 눌러도 빈 기준이 사라지던 문제 수정.
- Baseline 기준을 다시 클릭했을 때 기존 장비/키 선택이 유지되지 않던 문제 수정.
- 실행 중 목록에 `Step 1 PASS`, `새 절차` 등 불필요한 Step 문구가 표시되던 문제 수정.
- Dashboard 상단 드롭다운에서 시험 Dashboard 탭 연결이 잘못된 문제 수정.

### Removed

- 판정기준 메뉴에서 `Interface 모두 Connect` 제거.
- 판정기준 메뉴에서 `정규식 일치` 제거.
- 실행 중 시험 목록의 Step 상세 누적 행 제거.

### Known Issues

- 기존 데이터에 저장된 `regex:` 또는 `interface_connected` 기준은 내부 판정 로직에서 계속 해석되지만 신규 UI 메뉴에는 표시되지 않는다.
- Test Procedure 판정기준 메뉴형 UI는 실제 브라우저에서 추가/삭제/저장 흐름 확인이 필요하다.
- Dashboard 실행 중 목록은 WebSocket 이벤트에 의존하므로 서버 이벤트 지연 시 표시도 지연될 수 있다.

---

## 2026-06-05 (세션 3)

### Added

- TC Cycle 상세 화면에서 기존 TC를 현재 Cycle에 추가하는 `TC 추가` 기능 추가.
- Cycle 추가 모달에서 이미 포함된 TC는 비활성화하고 `이미 포함` 상태로 표시.
- 새 Cycle 생성 시 기존 ID와 충돌하면 `-2`, `-3` suffix를 붙이는 `uniqueCycleId` 처리 추가.

### Changed

- Cycle 목록에서 동일 버전이 여러 개 있을 경우 날짜와 TC 수를 함께 표시하도록 개선.
- Cycle 목록 정렬을 버전 기준 후 날짜/생성일 기준으로 보강.

### Fixed

- 같은 버전 Cycle이 여러 개일 때 목록에서 구분/선택이 어려운 문제 수정.
- 같은 모델/버전/날짜 Cycle 생성 시 기존 Cycle 파일을 덮어쓸 수 있는 문제 방지.
- 기존 TC를 추가하려면 Cycle을 새로 만들어야 하던 불편 수정.

### Removed

- 없음.

### Known Issues

- TC 추가 모달은 브라우저 실동작 확인이 필요하다.

---

## 2026-06-05 (세션 2)

### Added

- Baseline 비교 판정기준 기능 전체 추가:
  - `backend/main.py`: `BASELINES_DIR`, `DEFAULT_MASKS`, `normalize_for_baseline`, `apply_baseline_masks`, `load_baseline` 함수.
  - `judge_by_criteria`에 `baseline:` / `bl:` 접두사 지원 추가 (`device_id` 매개변수 추가).
  - CRUD API: `GET|POST|DELETE /api/baselines`, `GET /api/baselines/{device_id}`, `GET|POST|DELETE /api/baselines/{device_id}/{key}`.
  - `frontend/index.html`: "Baseline 관리" 페이지, Baseline 캡처 모달, Baseline 피커 모달.
  - TC 판정기준 편집 UI에 "Baseline" 버튼 추가.

### Fixed

- `syncScenarioTCRefs`: `hasSCIdLink` 조건 추가 — `sc_id`로 연결된 TC가 시나리오 제목 변경 시 항상 동기화.
- Baseline 관리 페이지 "bls.map is not a function" 오류: `res.ok` 체크 + `Array.isArray` 타입 검증 추가.
- `addScenario` async 전환: 시나리오 추가 시 TC 동시 생성 + `refreshTC4ForREQ` 호출로 tc4-body 즉시 반영.
- SC ID 충돌 버그: 시나리오 번호를 `scenarios.length+1` 대신 `max(기존 SC 번호)+1`로 계산하여 삭제 후 재추가 시 ID 중복 방지.

---

## 2026-06-05

### Added

- 프로젝트 관리 문서 추가:
  - `AGENTS.md`
  - `CURRENT_TASK.md`
  - `SESSION_SUMMARY.md`
  - `CHANGELOG.md`
- TC Cycle 자동 실행 API 추가.
- TC Cycle PPTX 생성 및 다운로드 기능 추가.
- CLI 출력 이미지 산출물 생성 기능 추가.
- Cycle 실행 상태 WebSocket 이벤트 추가.
- TC Step 다중 판정기준 UI 추가.
- 판정기준 배열/문자열 저장 지원.
- 접두사 없는 판정기준을 `contains`로 해석하는 로직 추가.
- Netmiko 기반 SSH 실행 추가.
- Device 등록/수정 UI에 Netmiko 타입, enable 명령, enable 비밀번호, 사전 명령 필드 추가.
- enable 모드 진입 후 CLI 실행 기능 추가.
- TC Cycle 결과 행 클릭 시 TC 상세 레이아웃 펼침 기능 추가.

### Changed

- SSH CLI 실행 방식을 Paramiko 직접 호출에서 Netmiko `ConnectHandler` 기반으로 변경.
- TC Cycle 결과 표시에서 실패 사유와 장비 출력을 분리.
- Cycle 결과 저장 시 Step별 `reason`, `pass_criteria`, `output`을 포함하도록 개선.
- 런처 종료 시 uvicorn 서버 프로세스 트리를 정리하도록 개선.
- 프론트엔드 일부 레이아웃을 반응형으로 개선.

### Fixed

- launcher 종료 후 서버가 남아 있는 문제 수정.
- E5724RL에서 enable 모드 진입 전 `show version`이 invalid로 실패하는 문제 수정.
- Device 저장 시 enable 관련 값이 빈 값으로 덮이는 문제 방지.
- TC 판정기준에 `1.0.0`만 넣었을 때 기준이 무시될 수 있는 문제 수정.
- 구버전 Cycle 결과에서 장비 출력이 실패 사유처럼 표시되는 문제 수정.
- Cycle 실행이 끝났는데 “진행중” 상태 문구가 남는 문제 수정.
- REQ 동작 시나리오 제목 수정이 TC 쪽에 반영되지 않던 문제 수정.

### Removed

- 앱 코드의 Paramiko 직접 사용 제거.

### Known Issues

- Netmiko는 내부적으로 Paramiko를 사용하므로 Paramiko deprecation warning이 출력될 수 있다.
- `frontend/index.html`이 매우 큰 단일 파일이라 변경 시 템플릿 문자열 오류 위험이 있다.
- 실제 장비 접속 정보와 비밀번호가 `data/devices/devices.json`에 평문으로 저장된다.
- 루트에 API key로 보이는 파일이 존재한다. 보안 처리 방침 확인 필요.
- TC/REQ/Cycle 데이터가 JSON 파일 기반이라 동시 편집/충돌 관리가 약하다.
- React 또는 모듈화 전환은 아직 수행되지 않았다.
