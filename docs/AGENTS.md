# AGENTS.md

새 세션에서 이 파일을 먼저 읽고, 필요한 세부는 아래 참조 문서로 이동한다.

## 프로젝트 한 줄

유비쿼스 네트워크 장비 시험을 관리·자동화하는 웹 도구. 도커 compose 다섯 서비스 — FastAPI(`backend/main.py` + `routes/*`) · PostgreSQL · React+TypeScript(`web/`) · 실행기(`runner/`, 화면과 같은 판정기) · adminer.

## 참조 문서

- [architecture.md](architecture.md) — 디렉토리 구조, 시스템 구조, 데이터 흐름
- [api-reference.md](api-reference.md) — 주요 API 목록 (자동 생성물, 직접 수정 금지)
- [data-model.md](data-model.md) — PostgreSQL 스키마, `app_kv` 구조, Baseline 스펙
- [conventions.md](conventions.md) — 판정기준 문법, 개발 규칙, 수정 시 주의사항
- [backup.md](backup.md) — 백업/복원 실행 방법, 저장 경로 정책, 스케줄러 등록
- [CURRENT_TASK.md](CURRENT_TASK.md) — 여러 세션에 걸치는 작업의 진행 상태
- [README.md](README.md) — 문서 목록. 지금 것과 옛 기록을 가른다

## 검증

코드 수정 후 `tools/verify.sh` 실행 — api 이미지 안에서 `tools/verify.py`(py_compile·ruff·pytest·문서 드리프트)를 돌린다.
화면·판정기를 고쳤으면 `cd web && npm run typecheck && npm test`. 도커 빌드(`docker compose build api web`)가 통과해야 푸시한다 —
`docker build | tail` 은 실패를 삼키니 종료 코드를 본다.
실패 시 방금 수정한 코드를 고치고 재실행. 같은 에러로 3회 실패하면 중단하고 보고.

## 아키텍처 핵심 원칙

1. **PostgreSQL 이 정본**. `tc`/`req`/`cycle`/`manuals` 등 리소스는 물론 컨테이너 자료(게시판·도움말·UI 옵션 등)도 `app_kv` 테이블로 옮겼다. 파일 정본은 없다.
2. **파일 접근은 헬퍼로만**. DB 는 `backend/db.py` 의 `kv_get/kv_set/tc_upsert` 등, 파일은 `load_json/save_json`. `_kv_load_sync/_kv_save_sync` 는 sync 컨텍스트 진입점.
3. **백엔드 라우트는 `backend/routes/<묶음>.py`**(APIRouter). main 의 것이 필요하면 `import core` 뒤 `core.X` 로 부를 때 찾는다 — `from main import`·`from core import X` 금지. 새 공용 이름은 `core.py` 에 자리를 두고 main 접합부 `core.bind` 에 더한다. 기동 때 다시 대입되는 값은 그 자리에서 `core.bind` 를 다시 부른다.
4. **화면은 `web/src/pages/`**. 새 화면은 페이지 파일 + `components/Layout.tsx` 의 `NAV` + `App.tsx` 분기. 판정기(`components/tc/judge.ts`)를 고치면 `judge.test.ts` 정답표가 통과해야 한다. 옛 `frontend/`(Vanilla JS)는 게시판·할일·도움말·리소스만 남았다.
5. **`data/` 는 용도별 폴더**. 루트에 파일을 새로 만들지 않는다 — 설정은 `data/config/`, 외부 연동은 `data/integrations/`, 런타임 상태는 `data/state/`, MIB 추출물은 `data/snmp/`.
6. **시크릿은 코드/커밋 밖에**. 자격증명이 담긴 파일은 `.gitignore` + `.sample` 템플릿 (미완료 과제: `.env` 로 통합).
7. **자동 생성물은 gitignore**. `data/backups/`, `data/trash/`, `data/artifacts/`, `data/pptx/`, `data/tc_snapshots/`, `data/tc_run_history/`, `data/board_files/`, `data/state/rag_embed.*`, `data/legacy/` — 커밋하지 않는다.

## 커밋 규칙

- 기능 단위로 즉시 커밋. 워킹트리에 여러 작업을 쌓아두지 않는다.
- `git add -A` / `git commit -a` 금지. 경로를 명시한다.
- 커밋 전 `git status --short` 로 스테이지 내용을 보고한다.
- 하나의 커밋이 1,000줄을 넘으면 분리 가능한지 먼저 검토한다.

## 시크릿

- `sk-ant-`, `sk-`, 토큰, 비밀번호가 포함된 파일을 절대 커밋하지 않는다.
- 자격증명은 `data/integrations/*.json` 이 아니라 `.env` 로 분리한다 (미완료 과제).
- 답변에 API 키나 장비 비밀번호를 그대로 출력하지 않는다.

## 예외 처리

- `except Exception: pass` 금지. 최소한 로그를 남긴다.
  (device_catalog 회귀가 이 패턴으로 은폐된 사례 있음.)

## 절대 금지

- 사용자 승인 없이 장비 접속 정보/비밀번호를 삭제·변경하지 않는다.
- 사용자 승인 없이 DB 의 `tc`/`req`/`cycle`/`manuals` row 를 대량 삭제하지 않는다.
- 사용자 요청 없이 `git reset --hard`, 대량 revert, 대량 포맷팅을 하지 않는다.
- API key 나 장비 비밀번호를 답변에 그대로 노출하지 않는다.
