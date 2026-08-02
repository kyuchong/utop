# Migration Summary — nettest → 현재 프로젝트

최종 갱신: 2026-06-10

## 0. 분석 요약
- **현재 프로젝트가 참고(테스트/nettest) 기능 대부분을 이미 보유하거나 더 강함.**
- 현재가 **우위**인 영역: 실제 판정엔진(`engine.py`), TC/Cycle 자동실행(`/api/tc/{id}/run`, `/api/cycle/{id}/run`), Baseline 수집·비교(6 엔드포인트), PPTX 리포트, Netmiko(멀티벤더), 판정기준 빌더, Cycle AI 요약, iTest Sequencer 절차(세션기록/실행로그/Fail강조/스트리밍/되돌리기).
- 참고에만 있는 것(이식 후보): **SNMP, Lab 콘솔, Ping, TCL**.

## 1. 완료된 기능 (이번 세션에 이미 이식)
| 기능 | 비고 |
|---|---|
| Test Report (Chart.js + Excel/PDF) | report 페이지 |
| LLM 설정 (트리뷰 + 드래그 정렬 + field_prompts) | llm 페이지 |
| Confluence 연동 (`/api/confluence/fetch`) | REQ 정보 URL → TC 생성 |
| iTest 시험절차 Sequencer | 노드/드래그/들여쓰기/실행/세션기록/실행로그/Fail강조/스트리밍/Ctrl+Z |

## 1-b. 완료된 기능 (2026-06-10 2단계 이식)
| 기능 | 수정/추가 | 검증 | 비고 |
|---|---|---|---|
| **Ping** (`/api/ping`) | backend/main.py + Ping 버튼·모달 | py_compile·node·smoke OK | 장비 도달성 확인 |
| **Lab 콘솔** (page-lab) | 새 페이지+네비+함수 | node·smoke OK | 즉석 CLI/Ping/SNMP |
| **SNMP GET** (`/api/snmp-get`) | backend + requirements(pysnmp) + Lab SNMP행 | py_compile·node·smoke OK | `pip install pysnmp` 필요 |
| **TCL 실행** | (수정 없음) | — | 이미 존재(중복) — 기록만 |

**버그 탐색 결과: 신규 코드 버그 0건** (빌드·통합·중복·런타임 스모크·다크모드·회귀 전부 통과)

## 2. 진행중 기능
- 없음 (이식 후보 4개 전부 처리 완료)

## 3. 미완료 기능
- 없음 (참고 대비 추가 이식 대상 소진)
- 추후(선택): SNMP 표준 OID 라이브러리/전용 관리 페이지

## 4. 중복/유사 기능 (건드리지 않음 — 기록만)
AI 채팅 · Dashboard(제품/계측기/시험 3탭) · Explorer(REQ/TC 커버리지) · Test Cycle · Test Report · Device/Model/Linecard/Vendor/Meter 등록 · 커스텀 필드 · LLM 설정 · Export/Import · 절차/템플릿/결과 · 시스템 설정 페이지군 · WebSocket(/ws) · TinyMCE 편집 · 다크/라이트 테마 · 폴더 계층/드래그앤드롭/검색/필터/정렬/컨텍스트메뉴 · 마크다운 렌더 · 로딩/깜빡임 애니메이션 · Top Nav 드롭다운 · 빈 상태 메시지
→ 모두 현재 프로젝트에 존재(동등 이상). **재구현 금지.**

## 5. 제외된 기능
| 기능 | 제외 이유 |
|---|---|
| Paramiko 직접 SSH | 현재 Netmiko가 상위 호환 |
| `/api/run-cli` | 현재 `/api/devices/{id}/command` 로 대체됨 |
| 절차/실행/결과(procedures/run/results 별도 모델) | 현재 cycle 실행 + engine.py 가 더 강함 |

## 6. 기술 부채
- `frontend/index.html` 단일 파일 ~900KB inline JS (컴포넌트화 여지)
- `tc.steps`(레거시) vs `tc.checks`(신규 Sequencer) 이중 모델 — Cycle 실행은 아직 steps 기반
- orphan 함수 잔존 (구 `tcStepRunCli`/`tcRunAllSteps`)

## 7. 추후 개선 항목
- 모든 이식 후 최종 리팩토링(컴포넌트화/공통함수/상수분리) — 동작 변경 없이
- `tc.steps ↔ tc.checks` 브리지 정리 (Sequencer 절차를 Cycle 실행과 연결)
