-- UTOP PostgreSQL schema (v1)
-- 실행: psql -h localhost -p 5433 -U utop -d utop -f schema.sql
-- 멱등: 여러 번 실행해도 안전 (IF NOT EXISTS)

-- ══════════════════════════════════════════════════════════════════════
-- 헬퍼: updated_at 자동 갱신 트리거용 함수
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════════════
-- A 그룹: 다건 리소스 (파일당 1레코드)
-- 공통 컬럼 = id + 검색·필터·정렬용 메타 + data(전체 JSON)
-- 앱은 data JSONB 로 원본 그대로 읽고 씀. 메타 컬럼은 인덱스·조인용.
-- ══════════════════════════════════════════════════════════════════════

-- ── TC (테스트 케이스) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tc (
  tcid          TEXT PRIMARY KEY,
  name          TEXT,
  status        TEXT,
  req_id        TEXT,
  type          TEXT,
  severity      TEXT,
  kind          TEXT,
  created_by    TEXT,
  updated_by    TEXT,
  step_count    INT DEFAULT 0,
  data          JSONB NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tc_req_id      ON tc(req_id);
CREATE INDEX IF NOT EXISTS idx_tc_status      ON tc(status);
CREATE INDEX IF NOT EXISTS idx_tc_updated_at  ON tc(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tc_data_gin    ON tc USING GIN (data jsonb_path_ops);
DROP TRIGGER IF EXISTS trg_tc_updated ON tc;
CREATE TRIGGER trg_tc_updated BEFORE UPDATE ON tc
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Cycle (테스트 사이클) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cycle (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  model         TEXT,
  version       TEXT,
  version_group TEXT,
  folder_id     TEXT,
  status        TEXT,
  assignee      TEXT,
  start_date    DATE,
  end_date      DATE,
  item_count    INT DEFAULT 0,
  data          JSONB NOT NULL,
  -- 목록 조회용 경량 요약. data 는 수십 MB 까지 커져서 목록에서 SELECT 하면 안 된다.
  -- db.py:_cycle_data_summary 가 저장 시점에 계산해 넣고, cycle_list 가 이것만 읽는다.
  -- (이 컬럼이 없으면 cycle_upsert 가 INSERT 단계에서 바로 실패한다 — db.py:292)
  data_summary  JSONB,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
-- 기존 DB 대응: 컬럼이 없던 시절에 만들어진 스키마를 따라잡는다 (멱등).
ALTER TABLE cycle ADD COLUMN IF NOT EXISTS data_summary JSONB;
CREATE INDEX IF NOT EXISTS idx_cycle_model         ON cycle(model);
CREATE INDEX IF NOT EXISTS idx_cycle_folder_id     ON cycle(folder_id);
CREATE INDEX IF NOT EXISTS idx_cycle_version_group ON cycle(version_group);
CREATE INDEX IF NOT EXISTS idx_cycle_updated_at    ON cycle(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cycle_data_gin      ON cycle USING GIN (data jsonb_path_ops);
DROP TRIGGER IF EXISTS trg_cycle_updated ON cycle;
CREATE TRIGGER trg_cycle_updated BEFORE UPDATE ON cycle
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 요구사항 분류 (3단 고정: 대분류 > 중분류 > 소분류) ────────
-- parent_id 가 NULL 이면 대분류. 그 아래 두 단계까지만 허용한다.
-- 깊이에 상한을 두는 이유: 옛 폴더 트리는 제한이 없어서 프로토콜·계층·기능이
-- 한 경로에 섞이고(IPV4_L2 > VLAN) 같은 기능이 여러 가지에 중복 등록됐다.
-- 상한은 서버(main.py)가 강제한다 — DB 로는 재귀 제약을 걸 수 없다.
CREATE TABLE IF NOT EXISTS req_category (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES req_category(id) ON DELETE CASCADE,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_req_category_parent ON req_category(parent_id);
-- 같은 상위 아래 이름 중복 금지. 대분류(parent 없음)끼리도 중복 금지.
CREATE UNIQUE INDEX IF NOT EXISTS uq_req_category_child
  ON req_category(parent_id, name) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_req_category_root
  ON req_category(name) WHERE parent_id IS NULL;
DROP TRIGGER IF EXISTS trg_req_category_updated ON req_category;
CREATE TRIGGER trg_req_category_updated BEFORE UPDATE ON req_category
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── REQ (요구사항) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS req (
  id            TEXT PRIMARY KEY,
  reqid         TEXT,
  title         TEXT,
  folder        TEXT,
  status        TEXT,
  priority      TEXT,
  created_by    TEXT,
  updated_by    TEXT,
  -- 분류. 대/중/소분류 각각 req_category.id 를 담는다.
  -- 분류가 지워져도 요구사항은 남아야 하므로 FK 는 걸지 않는다(고아는 UI 에서 '미분류'로 표시).
  cat1          TEXT,
  cat2          TEXT,
  cat3          TEXT,
  cat4          TEXT,
  data          JSONB NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
-- 기존 DB 따라잡기 (멱등)
ALTER TABLE req ADD COLUMN IF NOT EXISTS cat1 TEXT;
ALTER TABLE req ADD COLUMN IF NOT EXISTS cat2 TEXT;
ALTER TABLE req ADD COLUMN IF NOT EXISTS cat3 TEXT;
ALTER TABLE req ADD COLUMN IF NOT EXISTS cat4 TEXT;
CREATE INDEX IF NOT EXISTS idx_req_reqid       ON req(reqid);
CREATE INDEX IF NOT EXISTS idx_req_folder      ON req(folder);
CREATE INDEX IF NOT EXISTS idx_req_status      ON req(status);
CREATE INDEX IF NOT EXISTS idx_req_cat1        ON req(cat1);
CREATE INDEX IF NOT EXISTS idx_req_cat2        ON req(cat2);
CREATE INDEX IF NOT EXISTS idx_req_cat3        ON req(cat3);
CREATE INDEX IF NOT EXISTS idx_req_cat4        ON req(cat4);
CREATE INDEX IF NOT EXISTS idx_req_updated_at  ON req(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_req_data_gin    ON req USING GIN (data jsonb_path_ops);
DROP TRIGGER IF EXISTS trg_req_updated ON req;
CREATE TRIGGER trg_req_updated BEFORE UPDATE ON req
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Manuals (매뉴얼/문서) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manuals (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  source        TEXT,
  folder        TEXT,
  chars         INT DEFAULT 0,
  active        BOOLEAN DEFAULT true,
  data          JSONB NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manuals_source     ON manuals(source);
CREATE INDEX IF NOT EXISTS idx_manuals_folder     ON manuals(folder);
CREATE INDEX IF NOT EXISTS idx_manuals_updated_at ON manuals(updated_at DESC);
DROP TRIGGER IF EXISTS trg_manuals_updated ON manuals;
CREATE TRIGGER trg_manuals_updated BEFORE UPDATE ON manuals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════════════
-- B 그룹: 컨테이너 파일 (파일 하나 = 레코드 하나)
-- app_kv 로 통합. name 이 파일명(확장자 제외), data 는 JSON 통째.
-- 앱은 kv_get('users') / kv_set('users', {...}) 로 접근.
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app_kv (
  name          TEXT PRIMARY KEY,
  data          JSONB NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_app_kv_updated ON app_kv;
CREATE TRIGGER trg_app_kv_updated BEFORE UPDATE ON app_kv
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════════════
-- 세션 (로그인 세션 — 파일 sessions.json 에서 이관)
-- key 갯수 많고 만료 체크 자주 함 → 별도 테이블
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sessions (
  session_id    TEXT PRIMARY KEY,
  username      TEXT,
  data          JSONB NOT NULL,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_username   ON sessions(username);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
DROP TRIGGER IF EXISTS trg_sessions_updated ON sessions;
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════════════
-- RAG 임베딩 (data/rag_embed_keys.json + data/rag_embed.npy)
-- 24555 항목 예상. NumPy 배열은 BYTEA (또는 pgvector) 로.
-- 지금은 단순 BYTEA 로 두고 필요시 나중에 pgvector 확장.
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rag_embed (
  id            BIGSERIAL PRIMARY KEY,
  key           TEXT NOT NULL,
  embed         BYTEA,
  meta          JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rag_embed_key ON rag_embed(key);
