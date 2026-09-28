# docs/ — 무엇을 어디서 읽나

설치·실행은 저장소 루트의 [README.md](../README.md) 가 정본이다(도커 하나로 뜬다). 여기는 그 다음에 읽을 것들이다.

## 지금 것 (코드와 같이 고친다)

| 문서 | 내용 |
|---|---|
| [AGENTS.md](AGENTS.md) | 새 세션이 먼저 읽는 것 — 원칙·검증 방법·참조 문서 |
| [features/](features/README.md) | **기능별 문서** — 화면 묶음 하나에 한 편. SETUP 도움말로 실릴 것. 각 편에 `tools/smoke.sh <묶음>` 동작 확인이 붙어 있다 |
| [architecture.md](architecture.md) | 도커 서비스 다섯 개, backend/routes 구조, main↔routes 접합 규칙, 데이터 흐름 |
| [api-reference.md](api-reference.md) | 라우트 전체 목록. `tools/gen_api_docs.py` 가 만든다 — 직접 고치지 않는다 |
| [data-model.md](data-model.md) | PostgreSQL 표·app_kv 요약 (정본은 `db/schema.sql`) |
| [conventions.md](conventions.md) | 판정기준 문법, 개발 규칙, 시크릿·커밋 규칙 |
| [RUN_SERVER.md](RUN_SERVER.md) | 실행기(runner) 구조와 다른 PC 에 두는 법 |
| [N2X_RELAY.md](N2X_RELAY.md) | IXIA N2X 윈도우 중계 |
| [backup.md](backup.md) | 백업·복원 |
| [coverage-ai-chat-rules.md](coverage-ai-chat-rules.md) | Coverage AI 대화 규칙 |
| [CURRENT_TASK.md](CURRENT_TASK.md) | 지금 진행 중·다음 할 일 |
| [../harness/bugs.md](../harness/bugs.md) | 알려진 결함·부채 대장 |

## 기록 (그때 그대로 둔다 — 지금 구조와 다르다)

도커 이전, main.py 한 파일 시절의 계획과 정리다. 지금 코드를 설명하지 않으니 참고만 한다.

- [INSTALL.md](INSTALL.md) — 윈도우 venv 로컬 설치(2026-06). 지금은 도커
- [CHANGELOG.md](CHANGELOG.md) · [SESSION_SUMMARY.md](SESSION_SUMMARY.md) · [BUG_REPORT.md](BUG_REPORT.md)
- [REFACTORING_PLAN.md](REFACTORING_PLAN.md) · [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) · [SERVER_RUN_PLAN.md](SERVER_RUN_PLAN.md)
- [migration-log.md](migration-log.md) · [migration-summary.md](migration-summary.md) — JSON 파일 → PostgreSQL 이관
- [tests-crud-audit-20260721.md](tests-crud-audit-20260721.md)
- [UTOP_기능목록_및_개발요구사항.md](UTOP_기능목록_및_개발요구사항.md)
