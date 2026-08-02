# UTOP PostgreSQL Schema

- **DB**: `utop` on PostgreSQL 17 (port **5433**, `.env: DATABASE_URL`)
- **접속 계정**: `utop / ubiquoss`
- **총 테이블**: 7개
- **생성 스크립트**: [db/schema.sql](schema.sql) (멱등, `IF NOT EXISTS`)
- **마이그레이션**: [tools/migrate_json_to_pg.py](../tools/migrate_json_to_pg.py) — `data/*.json` → DB
- **DB 접속 레이어**: [backend/db.py](../backend/db.py) (asyncpg 풀 + CRUD 헬퍼)

---

## 설계 원칙

**하이브리드 스키마** — 하드 컬럼(검색/정렬/필터) + `data JSONB`(전체 원본).

이유:
- 앱 로직이 이미 JSON dict 로 다뤄서 코드 변경 최소화
- 스키마 강제 없이 유연한 필드 추가 가능
- 검색·인덱스가 필요한 필드만 컬럼으로 승격
- 원본은 그대로 보존 → 프론트 응답에 즉시 사용

**대량 리소스** (`tc`, `cycle`, `req`, `manuals`) → 개별 테이블
**컨테이너 파일** (`users`, `board`, `racks` 등 19종) → `app_kv` 통합 테이블
**세션** → `sessions` 별도 (조회 자주, TTL 관리)
**RAG 임베딩** → `rag_embed` (아직 미사용, pgvector 확장 여지)

---

## 공통 규칙

| 컬럼 | 용도 |
|---|---|
| `data JSONB` | 원본 dict 전체. asyncpg 가 자동으로 Python dict ↔ JSONB 변환 |
| `created_at TIMESTAMPTZ` | INSERT 시 자동 (`DEFAULT now()`) |
| `updated_at TIMESTAMPTZ` | 매 UPDATE 마다 자동 갱신 (`set_updated_at()` 트리거) |
| **PK** | 각 리소스의 사용자 지정 id (예: `tc.tcid`, `cycle.id`) — 서버 auto-increment 아님 |

**JSONB 자동 변환**: `db.py` 의 `_init_conn` 이 커넥션마다 codec 등록해서 asyncpg 가 JSONB 컬럼을 자동으로 파이썬 dict/list 로 파싱해줌.

---

## 테이블 1: `tc` (테스트 케이스)

**용도**: TC 하나 = 한 row. `data.checks[]` 안에 스텝 배열.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `tcid` **PK** | TEXT | TC ID (예: `U-REQ-SYS-SW-ENV-TC-001`) |
| `name` | TEXT | TC 제목 |
| `status` | TEXT | 상태 (`Draft`/`Review`/`In Working`/`Approved`/`Deprecated`) |
| `req_id` | TEXT | 상위 REQ 참조 |
| `type` | TEXT | Function / Performance / Security 등 |
| `severity` | TEXT | Blocker / Critical / Major / Normal / Minor |
| `kind` | TEXT | 자체 / 사업 등 |
| `created_by`, `updated_by` | TEXT | 생성자·수정자 이름 |
| `step_count` | INT | `data.checks` 배열 길이 (검색 성능용) |
| `data` | JSONB | 원본 TC 전체 (checks[], sessions[], custom_fields{} 등) |
| `created_at`, `updated_at` | TIMESTAMPTZ | 자동 |

**인덱스**:
- `idx_tc_req_id` (req_id) — REQ 별 TC 조회
- `idx_tc_status` (status)
- `idx_tc_updated_at` (updated_at DESC) — 최근 순 목록
- `idx_tc_data_gin` (GIN, jsonb_path_ops) — data 내부 JSONB 검색

**주요 CRUD** (backend/db.py):
- `tc_get(tcid)` — 단건 조회
- `tc_upsert(tcid, data)` — 저장/갱신
- `tc_delete(tcid)` — 삭제
- `tc_list_full()` — 전체 목록
- `tc_list_meta()` — 목록용 슬림 응답 (`data - checks - steps - sessions - result_history - issue_list`)

---

## 테이블 2: `cycle` (테스트 사이클)

**용도**: 특정 모델·버전에 대한 TC 실행 계획. `data.items[]` 안에 TC 참조 + 실행 결과.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` **PK** | TEXT | 사이클 ID (예: `cycle-1784177467986-0`) |
| `name` | TEXT | 사이클 이름 |
| `model` | TEXT | 장비 모델 (예: `E4320-24P`) |
| `version` | TEXT | 펌웨어 버전 (예: `R200_2026_07_16`) |
| `version_group` | TEXT | 버전 그룹 |
| `folder_id` | TEXT | 프로젝트 폴더 참조 |
| `status`, `assignee` | TEXT | 상태·담당자 |
| `start_date`, `end_date` | DATE | 계획 기간 |
| `item_count` | INT | `data.items` 길이 |
| `data` | JSONB | 원본 사이클 전체 (items[] 각각에 tcid, steps[], 실행결과 등) |
| **`data_summary`** ⭐ | JSONB | 목록 응답용 미리 계산된 lite (items.steps 는 result/action/manual 만) — 조회 성능 극대화 |
| `created_at`, `updated_at` | TIMESTAMPTZ | 자동 |

**인덱스**:
- `idx_cycle_model` (model)
- `idx_cycle_folder_id` (folder_id)
- `idx_cycle_version_group` (version_group)
- `idx_cycle_updated_at` (updated_at DESC)
- `idx_cycle_data_gin` (GIN)

**`data_summary` 컬럼의 의미**:
- `cycle_upsert` 시 자동 계산해 저장 (`_cycle_data_summary` 함수)
- `cycle_list_meta()` 는 이 컬럼만 SELECT — Python 순회·재조립 없음
- 8000 스텝 사이클도 목록 조회 15ms
- `cycle_backfill_summary()` — 서버 startup 시 legacy row 백필

**주요 CRUD**:
- `cycle_get/upsert/delete/list_full/list_meta`

---

## 테이블 3: `req` (요구사항)

**용도**: REQ 하나 = 한 row. `data.tc[]` 배열은 TC 참조 (실제 TC 는 `tc` 테이블).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` **PK** | TEXT | REQ 고유 id (예: `req-1784102224810` 또는 사용자 지정 `Booting-001`) |
| `reqid` | TEXT | 표시용 REQ 번호 (사용자 지정 가능) |
| `title` | TEXT | REQ 제목 |
| `folder` | TEXT | 폴더 참조 |
| `status` | TEXT | Draft/Review/In Working/Approved/Deprecated |
| `priority` | TEXT | Blocker/Critical/Major/Normal/Minor |
| `created_by`, `updated_by` | TEXT | 생성자·수정자 |
| `data` | JSONB | 원본 REQ 전체 (`tc[]` 는 `{tcid, name, status}` 참조만) |
| `created_at`, `updated_at` | TIMESTAMPTZ | 자동 |

**인덱스**:
- `idx_req_reqid` (reqid)
- `idx_req_folder` (folder)
- `idx_req_status`, `idx_req_updated_at`
- `idx_req_data_gin` (GIN)

**저장 규칙** (backend/main.py `save_req`):
- URL id 와 `data.id` 를 강제 통일 (다르면 두 row 로 갈라짐)
- `data.tc[]` 안 ref 만 있고 DB 에 없는 TC 는 skip (예전 자동 재생성 버그 해결)

**주요 CRUD**: `req_get/upsert/delete/list_full`

---

## 테이블 4: `manuals` (매뉴얼 / 지식 문서)

**용도**: RAG 지식 소스. TC 별첨 문서, Confluence 페이지, 매뉴얼 텍스트 등.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` **PK** | TEXT | 문서 id |
| `name` | TEXT | 문서 이름 |
| `source` | TEXT | 출처 (`manual`/`confluence`/`tc`/`req` 등) — RAG 검색 필터용 |
| `folder` | TEXT | 폴더 분류 |
| `chars` | INT | 텍스트 문자 수 |
| `active` | BOOLEAN | RAG 색인 포함 여부 |
| `data` | JSONB | 원본 (text, images[], url, confluence_id 등) |
| `created_at`, `updated_at` | TIMESTAMPTZ | 자동 |

**인덱스**: `idx_manuals_source`, `idx_manuals_folder`, `idx_manuals_updated_at`

**주요 CRUD**: `manuals_get/upsert/delete/list_full`

---

## 테이블 5: `app_kv` (통합 설정·집합 저장)

**용도**: 파일 하나 = 레코드 하나 형태 (컨테이너 파일 대체).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `name` **PK** | TEXT | 원본 파일명(확장자 제외) — 예: `users`, `board`, `racks` |
| `data` | JSONB | 파일 원본 통째 |
| `updated_at` | TIMESTAMPTZ | 자동 |

**현재 저장된 name (예시)**:

| name | 원본 파일 | 용도 |
|---|---|---|
| `users` | users.json | 계정 |
| `projects` | projects.json | 프로젝트 칸반 |
| `folders` | folders.json | REQ 폴더 |
| `cycle_folders` | cycle_folders.json | Cycle 폴더 |
| `manual_folders` | manual_folders.json | Manual 폴더 |
| `notifications` | notifications.json | 알림 |
| `board` | board.json | 게시판 |
| `manpower` | manpower.json | 인력 관리 |
| `racks` | racks.json | 랙 배치 |
| `device_catalog` | device_catalog.json | 장비 카탈로그 |
| `jira` | jira.json | Jira 연동 설정 |
| `confluence_config` | confluence_config.json | Confluence 연동 |
| `chat_sessions` | chat_sessions.json | 채팅 |
| `ai_feedback` | ai_feedback.json | AI 피드백 |
| `ai_usage` | ai_usage.json | AI 사용 이력 |
| `learned_procedures` | learned_procedures.json | 학습된 절차 |
| `release_summary` | release_summary.json | 릴리스 요약 |
| `release_judge` | release_judge.json | 릴리스 판정 |
| `zephyr_cache` | zephyr_cache.json | Zephyr Scale 캐시 |
| `admin_todo` | (신규) | 관리자 TO-DO |

**주요 CRUD**:
- `kv_get(name)` — 조회
- `kv_set(name, data)` — 저장 (upsert)
- `kv_delete(name)` — 삭제
- `kv_list_names()` — 이름 목록

---

## 테이블 6: `sessions` (로그인 세션)

**용도**: 로그인 세션 저장. 재기동 시에도 세션 유지.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `session_id` **PK** | TEXT | secrets.token_hex(16) |
| `username` | TEXT | 소유자 (인덱스) |
| `data` | JSONB | `{username, role, name, ts, ...}` |
| `expires_at` | TIMESTAMPTZ | 만료 시각 |
| `created_at`, `updated_at` | TIMESTAMPTZ | 자동 |

**인덱스**: `idx_sessions_username`, `idx_sessions_expires_at`

**주요 CRUD**:
- `session_get(sid)`, `session_upsert(sid, data, expires_at, username)`, `session_delete(sid)`
- `sessions_all()` — 부팅 시 in-memory `SESSIONS` dict 복원용

---

## 테이블 7: `rag_embed` (RAG 임베딩 벡터)

**용도**: 향후 pgvector 확장 대비 껍데기. 지금은 `rag_embed.npy` 파일 사용 중.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` **PK** | BIGSERIAL | auto |
| `key` | TEXT | 청크 key |
| `embed` | BYTEA | float32 벡터 raw bytes (pgvector 도입 시 `vector` 타입) |
| `meta` | JSONB | 문서명·청크 인덱스 등 |
| `created_at` | TIMESTAMPTZ | |

**인덱스**: `idx_rag_embed_key`

---

## 유틸리티 함수 (SQL)

### `set_updated_at()` — 자동 updated_at 갱신 트리거 함수
```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
```
모든 테이블에 `BEFORE UPDATE ... FOR EACH ROW EXECUTE FUNCTION set_updated_at()` 트리거 부착.

---

## 주요 성능·안정성 최적화

| 항목 | 어디 | 왜 |
|---|---|---|
| **JSONB 자동 codec** | `db.py _init_conn` | dict ↔ JSONB 무손실·자동 |
| **커넥션 풀** | `db.init_pool` (min 2, max 20) | 요청마다 연결 오버헤드 회피 |
| **max_inactive_connection_lifetime=300** | `db.init_pool` | 5분 idle 커넥션 자동 폐기 (Postgres idle timeout 충돌 회피) |
| **exception filter** | `_install_asyncpg_noise_filter` | 백그라운드 heartbeat 의 `ConnectionDoesNotExistError` 로그 스팸 억제 |
| **cycle.data_summary 미리계산** | `cycle_upsert` | 목록 조회 500ms → 15ms |
| **cycle_list_meta 는 data 제외** | `db.cycle_list_meta` | 20 MB 안 읽음 |
| **save_req URL/data.id 통일** | `main.py save_req` | REQ 두 row 로 갈라지는 버그 방지 |
| **_cleanup_duplicate_reqs** | startup 훅 | 기존 잔재 REQ 자동 병합 |
| **_cleanup_stale_req_tc_refs** | startup 훅 | 삭제된 TC 참조 자동 청소 |
| **_clean_cycle_refs** | delete_tc 후 백그라운드 | 삭제된 TC 참조하는 사이클 items 정리 |
| **broadcast 병렬화** | `broadcast()` | 접속자 N명 순차 send → 병렬 gather |
| **trash 파일 write 백그라운드** | `delete_tc` | 응답 지연 감소 |
| **gzip 압축 미들웨어** | `GZipMiddleware(minimum_size=500)` | 응답 크기 최대 45배 감소 |
| **정적 파일 캐시 헤더** | `_CachedStatic` | `?v=xxx` 있으면 1년 immutable |
| **API 응답 캐시 헤더** | `_api_cache_headers` 미들웨어 | `max-age=10, stale-while-revalidate=60` |

---

## 재현·초기화

**깨끗한 DB 재구축**:
```powershell
# 1. DB 삭제·재생성 (주의: 데이터 다 날아감)
$env:PGPASSWORD='ubiquoss'
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5433 -U postgres -d postgres -c "DROP DATABASE IF EXISTS utop;"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5433 -U postgres -d postgres -c "CREATE DATABASE utop OWNER utop ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';"

# 2. 스키마 적용
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5433 -U utop -d utop -f "C:\utop\db\schema.sql"

# 3. JSON 원본에서 데이터 마이그레이션
Set-Location C:\utop
& ".venv\Scripts\python.exe" "tools\migrate_json_to_pg.py"
```

**단순 재이관** (스키마 유지, 데이터만 새로 채움):
```powershell
Set-Location C:\utop
& ".venv\Scripts\python.exe" "tools\migrate_json_to_pg.py"
# 멱등: 기존 row 는 upsert, 없는 것만 새로 삽입
```

---

## 백업·복원

**전체 DB 덤프** (custom format, 압축):
```powershell
$env:PGPASSWORD='ubiquoss'
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -h localhost -p 5433 -U utop -d utop -F c -f "C:\utop\db\utop-seed.dump"
```

**복원**:
```powershell
$env:PGPASSWORD='ubiquoss'
& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -h localhost -p 5433 -U utop -d utop --clean --if-exists "C:\utop\db\utop-seed.dump"
```

**신규 PC 셋업**: [setup-on-new-pc.ps1](../scripts/setup-on-new-pc.ps1)

---

## ERD (관계 요약)

```
folders (app_kv)              cycle_folders (app_kv)
    │                              │
    │ 1:N                          │ 1:N
    ▼                              ▼
   req ────1:N───┐              cycle ──▶ data.items[].tcid ──┐
    │           │                                              │
    │           └─▶ data.tc[].tcid ─────▶ tc ◀─────────────────┘
    │                                     │
    │                                     ├─▶ data.checks[]
    │                                     ├─▶ data.sessions[]
    │                                     └─▶ data.custom_fields{}
    │
    └─▶ data.reqid, data.title 등
```

**참조 무결성**: DB 레벨 FK 없음 (JSONB 안 참조라 강제 불가).
대신 startup 훅 `_cleanup_stale_req_tc_refs` 로 오손 참조 자동 정리.
