# Data Model

## PostgreSQL 스키마

정본 정의는 [`db/schema.sql`](../db/schema.sql). 주요 테이블 요약:

| 테이블 | Primary Key | 성격 |
|---|---|---|
| `tc` | `tcid` | 테스트 케이스 (파일당 1레코드) |
| `cycle` | `id` | 테스트 사이클 |
| `req` | `id` | 요구사항 |
| `manuals` | `id` | 매뉴얼/문서 |
| `app_kv` | `name` | 컨테이너 파일 통합 (board, folders, users 등) |
| `sessions` | `session_id` | 로그인 세션 |
| `rag_embed` | `id` (bigserial) | RAG 임베딩 (준비 중) |

공통 컬럼: `data JSONB` (원본 통째), `created_at`, `updated_at` (트리거로 자동 갱신). 검색·필터·정렬용 메타 컬럼(`name`, `status`, `req_id` 등)은 인덱스 대상.

## app_kv 구조

컨테이너 파일 하나 = `app_kv` 한 행. `name` 이 파일명 (확장자 제외), `data` 는 JSON 통째.

접근:
```python
data = await db.kv_get("board")
await db.kv_set("board", {"posts": [...]})
```

sync 컨텍스트:
```python
data = _kv_load_sync("board", default={"posts": []})
_kv_save_sync("board", data)
```

`_kv_load_sync` 는 startup 훅이 채운 캐시에서 반환한다. 캐시가 없으면 등록된 fallback 파일에서 읽는다. sync 컨텍스트에서 event loop 재진입을 피하려는 설계이므로 async 함수에서는 `db.kv_get` 을 직접 사용한다.

## 파일 정본 (아직 DB 이관 안 됨)

- `data/devices/devices.json` — 장비 목록 (실제 IP/username/password/enable password 포함)
- `data/state/board.json` / `folders.json` / `manual_folders.json` / `projects.json`, `data/config/help.json` / `permissions.json` / `page_ai.json` / `ui_options.json`, `data/integrations/dify_assistants.json` — 컨테이너 파일 중 `_KV_MIGRATIONS` 목록 밖의 것
- `data/integrations/llms.json` / `jira.json` / `confluence_config.json` — 자격증명 포함, gitignore (`.sample` 만 커밋)

## 🚫 Baseline 스펙 (제거 예정)

Baseline 기능은 제거 결정됨. 실사용 0건, UI 미구현, 데이터 파일 0개.
백엔드 코드(engine.py 판정 분기·API 라우트 6개)와 아래 명세는 잔존하나 신규 참조 금지.
자세한 상태와 제거 범위는 [REMOVAL-0001](../harness/bugs.md#removal-0001) 참조.

<details>
<summary>과거 명세 (참고용, 확장하면 표시)</summary>

- 저장 경로: `data/baselines/{device_id}/{key}.json`
- 저장 필드: `device_id`, `key`, `command`, `raw` (원본 출력), `masks` (사용자 정규식 마스크 목록), `captured_at`, `description`
- 비교 시 `DEFAULT_MASKS` (uptime·카운터·속도·타임스탬프 등) + 사용자 마스크를 적용한 뒤 `normalize_for_baseline` 로 정규화
- `normalize_for_baseline`: 앞뒤 공백 제거, 내부 연속 공백·탭을 단일 공백으로, 빈 줄 제거
- 판정기준 `baseline:key` 는 현재 Step 실행 장비 ID 를 사용, `baseline:device_id/key` 는 장비 ID 를 직접 지정
- 프론트엔드 "Baseline 관리" 페이지에서 캡처, 편집, 삭제, 마스크 패턴 관리
- TC 판정기준 편집 UI 의 "Baseline" 버튼으로 키 선택 후 자동 삽입

</details>

## 자동 생성 데이터 (gitignore)

| 경로 | 생성 시점 | 재생성 가능? |
|---|---|---|
| `data/backups/` | 저장 시 자동 백업 | 앱이 계속 만듦 |
| `data/backups/device_catalog/` | device_catalog 저장 시 (최근 30개 유지). 평문 비번 포함 | 앱이 계속 만듦 |
| `data/trash/` | REQ/TC 소프트 삭제 시 이동 | 복원 API 있음 |
| `data/tc_snapshots/` | TC 저장 시 스냅샷 | 앱이 계속 만듦 |
| `data/tc_run_history/` | TC 실행 이력 append | 앱이 계속 만듦 |
| `data/artifacts/<cycle_id>/` | Cycle 실행 시 CLI 출력 이미지 | 재실행 시 재생성 |
| `data/pptx/` | Cycle 리포트 PPTX | 재생성 가능 |
| `data/board_files/` | 게시판 첨부 업로드 | 원본이 없으면 게시글 첨부 링크 깨짐 |
| `data/state/rag_embed.npy` / `rag_embed_keys.json` | RAG 인덱싱 시 | 매뉴얼 재색인으로 재생성 |
| `data/legacy/` | PG 이관 완료 파일 백업 (평문 자격증명 포함) | 이관 완료 이후 참조 안 함 |
