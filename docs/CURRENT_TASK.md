# CURRENT_TASK.md

이 문서는 현재 프로젝트 상태와 진행 중인 작업을 추적하기 위한 문서이다. 새 작업을 시작할 때 읽고, 작업이 끝나면 최신 상태로 갱신한다.

마지막 업데이트: 2026-06-08

## 현재 프로젝트 상태

- FastAPI + Vanilla JS 기반 로컬 네트워크 시험 자동화 도구가 동작 중이다.
- 데이터는 `data/` 하위 JSON 파일에 저장된다.
- 장비 자동 CLI 실행은 Netmiko 기반으로 전환되었다.
- TC Cycle 자동 실행: Netmiko SSH → enable 모드 → CLI 실행 → 판정기준 P/F → PPTX 생성.
- 판정기준 UI는 메뉴형 rule builder로 개선되었다.
- 일반 사용 메뉴: `출력에 포함(contains)`, `모두 포함(contains_all)`, `포함되면 실패(not_contains)`, `Baseline 비교(baseline:)`.
- 내부 판정 로직은 기존 데이터 호환을 위해 `regex`, `interface_connected`도 해석 가능하지만 신규 UI 메뉴에서는 숨김 처리되어 있다.
- Baseline 관리 기능: 장비별 CLI 결과를 사전 저장하고 판정기준(`baseline:key`)으로 비교.
- Baseline 판정기준 선택 시 현재 저장된 Baseline 출력 미리보기와 수정 진입을 지원한다.
- REQ/TC 관리: 동작 시나리오 추가/삭제 시 TC 자동 생성·동기화.
- Requirements & Test Coverage 화면은 폴더/REQ/TC 3열 구조이며, 폴더 드래그앤드랍, REQ/TC 상세 탭, Test Procedure 편집을 지원한다.
- Dashboard의 시험항목 Dashboard는 실행 중 시험 목록(WebSocket)과 실행한 시험 목록(5초 갱신, 최근 20개 표시)을 제공한다.
- 프로젝트 관리 문서 4종 운영 중.

## 최근 완료 작업

- Dashboard 시험항목 Dashboard 구현 및 개선:
  - 실행 중인 시험 목록 WebSocket 실시간 표시.
  - 실행한 시험 목록에 TC Cycle 결과와 Test Run 결과를 함께 표시.
  - 실행한 시험 목록은 서버 부담을 고려해 5초 주기 갱신, 최근 20개만 표시.
- Requirements & Test Coverage UI 개선:
  - `Test Environments` 탭의 시험 구성도 라벨 제거로 구성도 영역 전체 너비 사용.
  - Test Procedure 판정기준 입력을 메뉴형 UI로 변경.
  - Baseline 비교 선택 시 Baseline picker 자동 실행.
  - 기존 Baseline 기준 클릭 시 현재 장비/키/출력 미리보기 자동 선택.
  - Baseline picker에서 현재 Baseline 출력 미리보기와 수정 버튼 제공.
- 판정기준 UI에서 난이도가 높은 `정규식 일치`와 불필요한 `Interface 모두 Connect` 메뉴 제거.
- TC Summary가 시나리오 제목 변경 시 자동 갱신되지 않던 문제 수정.
- Baseline 비교 판정기준 기능 추가 (backend API + frontend UI 전체).
- Baseline 관리 페이지 오류("bls.map is not a function") 수정.
- Baseline 공백 정규화: 내부 공백·탭도 단일 공백으로 처리.
- 동작 시나리오 추가 시 tc4-body에 TC가 반영되지 않던 문제 수정.
- 시나리오·TC 삭제 후 재추가 시 SC ID 충돌로 엉뚱한 TC가 매핑되던 버그 수정.
- TC Cycle 목록에서 같은 버전이 여러 개일 때 날짜/TC 수를 같이 표시하도록 개선.
- 새 Cycle 생성 시 기존 Cycle ID와 충돌하면 suffix를 붙여 덮어쓰지 않도록 수정.
- TC Cycle 상세 화면에서 기존 TC를 추가할 수 있는 기능 추가.

## 진행 중인 작업

- 없음.

## 다음 작업 예정

- 실제 브라우저에서 Test Procedure 판정기준 메뉴 추가/삭제/저장 흐름 확인.
- 실제 브라우저에서 Baseline picker의 현재 선택 유지, 미리보기, 수정 흐름 확인.
- Dashboard 실행 중 목록과 실행한 시험 목록이 실제 장비 실행 중 안정적으로 갱신되는지 확인.
- 실제 브라우저에서 TC Cycle 중복 버전 선택과 기존 TC 추가 흐름 확인.
- 실제 브라우저에서 Baseline 캡처·비교 흐름 확인.
- Cycle 실행 시 `baseline:` 판정기준 PASS/FAIL 동작 확인.
- 장비별 Netmiko profile 관리 구조 검토.
- 판정기준 rule builder UI 검토.
- PPTX 결과 양식 개선 검토.
- 민감정보 저장 방식 개선 검토.

## 발견된 버그 (이력)

- Test Procedure에서 기준 추가 시 빈 기준이 사라짐 → `contains:` 빈 기준도 보존하도록 수정 완료.
- Baseline 기준 클릭 시 기존 선택값이 picker에 유지되지 않음 → 장비/키/미리보기 자동 선택으로 수정 완료.
- Dashboard 실행한 시험 목록 1초 갱신은 서버 부담 가능 → 5초 주기로 조정 완료.
- `enable_password` 빈 값 덮힘 → 수정 완료.
- E5724RL enable 모드 필요 → enable 진입 로직 추가 완료.
- 구버전 Cycle 결과 reason/pass_criteria 누락 → 신규 저장부터 포함, UI fallback 제거 완료.
- TC Summary 시나리오 제목 비동기화 → `hasSCIdLink` 조건 추가 완료.
- Baseline 관리 페이지 "bls.map is not a function" → `res.ok` 체크 + 타입 검증 추가 완료.
- 시나리오 추가 시 tc4-body 미반영 → `addScenario` async 전환 + TC 생성 + `refreshTC4ForREQ` 완료.
- 삭제 후 재추가 시 엉뚱한 TC 매핑 → SC 번호를 `max(기존)+1`로 계산하도록 수정 완료.
- 같은 Cycle 버전이 여러 개일 때 목록에서 구분/선택이 어려움 → 중복 버전일 때 날짜와 TC 수 표시 완료.
- 같은 모델/버전/날짜 Cycle 생성 시 기존 파일을 덮을 수 있음 → `uniqueCycleId` suffix 처리 완료.

## 확인 필요한 사항

- 실제 운영 장비별 Netmiko `device_type` 목록.
- E5724RL 외 장비도 enable fallback이 필요한지 여부.
- TC/REQ 데이터의 운영/샘플 구분.
- 루트에 존재하는 API key로 보이는 파일의 처리 방침.
- PPTX 템플릿 요구사항.
- React 전환 필요 여부와 범위.

## 우선순위 목록

1. Test Procedure 판정기준 메뉴형 UI 브라우저 실동작 확인.
2. Baseline picker 현재 선택 유지/미리보기/수정 흐름 확인.
3. Dashboard 실행 중/실행 완료 목록 실시간성 확인.
4. TC Cycle 중복 버전 선택 및 기존 TC 추가 브라우저 실동작 확인.
5. 민감정보 관리 정책 수립.

## 업데이트 템플릿

새 작업 완료 시 아래 블록을 복사해 상단 또는 관련 섹션에 반영한다.

```md
### YYYY-MM-DD 업데이트

- 완료:
  - 
- 진행 중:
  - 
- 다음:
  - 
- 발견된 문제:
  - 
- 확인 필요:
  - 
```
