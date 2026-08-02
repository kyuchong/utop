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

-- ── 장비 ──────────────────────────────────────────────────────
-- 키는 IP 다. 같은 모델이 여러 대여도 접속 대상은 IP 로 갈린다.
-- 토폴로지·장비 락·TC 스텝이 모두 이 행을 가리킨다.
--
-- 비밀번호는 평문이다(2026-08-02 결정). 장비 CLI 접속에 원문이 필요해
-- 단방향 해시를 쓸 수 없다. 나중에 암호화로 바꿀 수 있도록 컬럼을
-- password_enc 로 나눠두지 않고 password 하나로 두되, 읽고 쓰는 지점을
-- db.py 한 곳에 모아 그때 그 함수만 고치면 되게 한다.
-- ★ DB 백업 파일이 곧 사내 장비 전체의 비밀번호다. 저장소·공유 폴더 금지.
CREATE TABLE IF NOT EXISTS device (
  id            TEXT PRIMARY KEY,          -- ip 를 그대로 쓰거나 별도 id
  ip            TEXT NOT NULL UNIQUE,      -- ★ 실질 키
  name          TEXT,                      -- 사람이 부르는 이름 (E6100 #1)
  model         TEXT,                      -- 모델명 (E6100-48X)
  vendor        TEXT,
  device_group  TEXT,
  -- 어느 시험실에 있는 장비인가. 같은 모델이 여러 랩에 흩어져 있어서
  -- 랩을 모르면 "그 장비 어디 있어요" 를 매번 물어야 한다.
  lab           TEXT,
  role          TEXT,                      -- OLT · ONU · DUT · 대향 …
  protocol      TEXT DEFAULT 'ssh',        -- ssh | telnet
  port          INT,
  username      TEXT,
  password      TEXT,
  description   TEXT,
  status        TEXT,
  data          JSONB DEFAULT '{}'::jsonb, -- 그 밖의 것 (원본 보존용)
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
-- 이미 만들어진 DB 에는 CREATE TABLE IF NOT EXISTS 가 컬럼을 더해주지 않는다.
-- 새로 넣는 컬럼은 반드시 ALTER 로 한 줄 더 적어야 기존 설치가 따라온다.
ALTER TABLE device ADD COLUMN IF NOT EXISTS lab TEXT;
CREATE INDEX IF NOT EXISTS idx_device_model ON device(model);
CREATE INDEX IF NOT EXISTS idx_device_group ON device(device_group);
CREATE INDEX IF NOT EXISTS idx_device_lab ON device(lab);
DROP TRIGGER IF EXISTS trg_device_updated ON device;
CREATE TRIGGER trg_device_updated BEFORE UPDATE ON device
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 장비 접속 방식 ────────────────────────────────────────────
-- 한 장비에 telnet 과 ssh 가 함께 열려 있는 것이 보통이고, TC 스텝마다
-- 어느 쪽으로 붙을지 고를 수 있어야 한다. 그래서 device.protocol 하나로
-- 고정하지 않고 방식을 행으로 쌓는다. 나중에 console/netconf 가 붙어도
-- 스키마를 안 건드린다.
--
-- 계정을 방식마다 따로 두는 이유: telnet 만 enable 비밀번호가 따로인
-- 장비가 흔하다. 비워두면 device 의 공용 계정을 쓴다.
--
-- console 은 장비에 직접 붙지 않는다. 터미널 서버(콘솔 서버)의 IP 로 가서
-- 7001 처럼 장비마다 배정된 포트에 telnet 하는 방식이다. 그래서 host 를
-- 방식마다 따로 둔다 — 비어 있으면 device.ip 를 쓴다(telnet/ssh 는 보통 비운다).
CREATE TABLE IF NOT EXISTS device_access (
  id            BIGSERIAL PRIMARY KEY,
  device_id     TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  protocol      TEXT NOT NULL,             -- telnet | ssh | console | snmp
  host          TEXT,                      -- 비면 device.ip. console 은 콘솔서버 IP
  port          INT,                       -- telnet 23 · ssh 22 · console 7001… · snmp 161
  username      TEXT,                      -- 비면 device.username. snmp v3 는 user
  password      TEXT,                      -- 비면 device.password (평문)
  enable_password TEXT,
  -- snmp 전용. v1/v2c 는 community 만 있으면 되고 그게 대부분이다.
  -- v3 의 auth/priv 프로토콜 같은 나머지는 params 에 넣는다.
  community     TEXT,
  params        JSONB DEFAULT '{}'::jsonb,
  enabled       BOOLEAN DEFAULT TRUE,
  is_default    BOOLEAN DEFAULT FALSE,     -- 스텝이 방식을 안 적었을 때 쓰는 것
  -- 마지막 연결 확인 결과. 목록에서 '연결상태' 로 보여준다.
  last_status   TEXT,                      -- ok | fail | (null=확인 안 함)
  last_error    TEXT,
  last_checked_at TIMESTAMPTZ,
  note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_device_access_dev ON device_access(device_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_access ON device_access(device_id, protocol);

-- 이미 등록된 장비를 잃지 않는다. device.protocol/port 로 한 행을 만들어 준다.
-- (schema.sql 은 기동할 때마다 도니 ON CONFLICT 로 두 번째부터는 아무 일도 안 한다)
INSERT INTO device_access (device_id, protocol, host, port, username, password, enabled, is_default)
SELECT d.id, COALESCE(NULLIF(lower(d.protocol), ''), 'ssh'), NULL,
       COALESCE(d.port, CASE WHEN lower(d.protocol) = 'telnet' THEN 23 ELSE 22 END),
       d.username, d.password, TRUE, TRUE
FROM device d
ON CONFLICT (device_id, protocol) DO NOTHING;

-- ── 장비 인터페이스 ───────────────────────────────────────────
-- 모델이 아니라 '실제 장비' 에 붙인다. 같은 모델이어도 카드 구성이
-- 다를 수 있고, 모델에 미리 다 채워두려 하면 등록을 시작조차 못 한다.
-- 모델 카탈로그는 나중에 '기본값' 을 채워주는 역할만 한다.
CREATE TABLE IF NOT EXISTS device_interface (
  id            BIGSERIAL PRIMARY KEY,
  device_id     TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,             -- gi1/0/1 · te1/1
  -- general 이 기본. 스위치는 48포트가 전부 같아서 업링크/가입자 구분이
  -- 없다 — 어느 포트를 업링크로 쓰는지는 시험 구성도에서 정한다.
  -- OLT 처럼 하드웨어로 갈리는 장비만 uplink/subscriber 를 적는다.
  kind          TEXT,                      -- general | uplink | subscriber | mgmt
  speed         TEXT,
  note          TEXT,
  sort_order    INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_device_if_dev ON device_interface(device_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_if ON device_interface(device_id, name);

-- ── 자원 점유 (장비 · 계측기) ──────────────────────────────────
-- 장비와 계측기를 한 테이블로 다룬다. 둘 다 '누가 잡고 있나' 라는 같은
-- 문제이고, 나누면 '장비는 비었는데 계측기가 잡혀 있다' 를 한 번에 볼 수 없다.
--
-- 락은 사이클이 끝날 때까지 유지된다(시간 만료 없음). 대신 살아있음 신호
-- (heartbeat_at)를 남겨, 신호가 끊긴 지 오래면 화면에서 '응답 없음' 으로
-- 보여준다. 자동으로 풀지는 않는다 — 실제 시험 중인 장비를 남이 뺏으면
-- 시험이 통째로 망가진다. 푸는 것은 사람이 판단한다.
CREATE TABLE IF NOT EXISTS resource_lock (
  resource_id   TEXT PRIMARY KEY,          -- 장비 id 또는 계측기 id
  kind          TEXT NOT NULL,             -- 'device' | 'instrument'
  locked_by     TEXT NOT NULL,             -- username
  locked_name   TEXT,                      -- 표시용 이름
  cycle_id      TEXT,                      -- 이 사이클이 끝나면 풀린다
  note          TEXT,
  locked_at     TIMESTAMPTZ DEFAULT now(),
  heartbeat_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resource_lock_by    ON resource_lock(locked_by);
CREATE INDEX IF NOT EXISTS idx_resource_lock_cycle ON resource_lock(cycle_id);

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
