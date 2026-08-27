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

-- ── 프로젝트 ─────────────────────────────────────────────────
-- 요구사항 트리의 최상위 폴더가 곧 프로젝트다(itest 방식).
-- 이름의 정본은 그 폴더(req_category.name) — 여기는 고객사·모델 같은
-- 메타만 담는다. 폴더 이름을 바꾸면 프로젝트명도 따라가고, 폴더를
-- 지우면 프로젝트도 함께 사라진다(CASCADE).
CREATE TABLE IF NOT EXISTS project (
  id          TEXT PRIMARY KEY,
  cat_id      TEXT NOT NULL UNIQUE REFERENCES req_category(id) ON DELETE CASCADE,
  customer    TEXT NOT NULL DEFAULT '',
  model_group TEXT NOT NULL DEFAULT '',
  model       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

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
-- 공용 enable 비번. 계정은 보통 telnet/ssh 가 같은 것을 쓴다 — 방식마다
-- 따로 받으면 같은 값을 두 번 치게 된다. 다를 때만 device_access 로 덮는다.
ALTER TABLE device ADD COLUMN IF NOT EXISTS enable_password TEXT;
CREATE INDEX IF NOT EXISTS idx_device_model ON device(model);
CREATE INDEX IF NOT EXISTS idx_device_group ON device(device_group);
CREATE INDEX IF NOT EXISTS idx_device_lab ON device(lab);
-- 랙 자리 — 랙뷰가 이 장비를 어느 랙 몇 U 에 그릴지. 랙 틀 자체(구역·랙
-- 이름·높이)는 app_kv 'racks' 에 있다. pos 는 아래에서 센 U 번호.
ALTER TABLE device ADD COLUMN IF NOT EXISTS rack_id    TEXT;
ALTER TABLE device ADD COLUMN IF NOT EXISTS rack_pos   INT;
ALTER TABLE device ADD COLUMN IF NOT EXISTS rack_units INT;
-- 소모전력(W) — 랙 단위 전력 합계를 랙뷰 머리에 보여 주기 위한 것
ALTER TABLE device ADD COLUMN IF NOT EXISTS power_w    INT;
CREATE INDEX IF NOT EXISTS idx_device_rack ON device(rack_id);
DROP TRIGGER IF EXISTS trg_device_updated ON device;
CREATE TRIGGER trg_device_updated BEFORE UPDATE ON device
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 코드 목록 (TC 유형 · 상태 · 중요도 …) ─────────────────────
-- 화면의 드롭다운에 들어가는 값을 코드에 박아두면 항목 하나 늘릴 때마다
-- 배포를 해야 하고, 같은 목록이 여러 파일에 흩어져 서로 어긋난다
-- (실제로 TcForm 과 TcDetail 에 상태 목록이 따로 있었다).
--
-- 장비 카탈로그와 나누는 이유: 저쪽은 제조사·모델처럼 서로 참조하는 자료고,
-- 이쪽은 그냥 고를 값의 목록이다. 한 테이블에 넣으면 kind 가 뒤섞인다.
CREATE TABLE IF NOT EXISTS code_item (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,   -- tc_type | tc_status | tc_severity | tc_run_type | tc_origin
  value       TEXT NOT NULL,   -- 화면에 보이고 그대로 저장되는 값
  sort_order  INT DEFAULT 0,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_code_item ON code_item(kind, value);
CREATE INDEX IF NOT EXISTS idx_code_item_kind ON code_item(kind);

-- 기본값 — ★ 그 kind 가 **비어 있을 때만**(첫 설치) 심는다.
-- 전에는 기동마다 무조건 심어서, 지운 값(tc_status 의 PASS·FAIL 등)이
-- 재시작할 때마다 살아났다(실사고: "몇 번을 지워도 다시 생긴다").
-- 사람이 지운 것은 지워진 채로 있어야 한다.
INSERT INTO code_item (kind, value, sort_order)
SELECT v.kind, v.value, v.sort_order FROM (VALUES
  ('tc_status','작성중',1), ('tc_status','검토중',2), ('tc_status','승인',3),
  ('tc_status','PASS',4),   ('tc_status','FAIL',5),   ('tc_status','보류',6),
  ('tc_severity','치명',1), ('tc_severity','중대',2),
  ('tc_severity','보통',3), ('tc_severity','경미',4),
  ('tc_run_type','수동',1), ('tc_run_type','자동',2),
  ('tc_origin','자체',1),   ('tc_origin','고객',2),
  ('tc_type','FT',1),       ('tc_type','Function',2),
  ('req_status','작성중',1), ('req_status','검토중',2), ('req_status','검토완료',3),
  ('req_status','보류',4),   ('req_status','폐기',5),
  ('req_priority','High',1), ('req_priority','Medium',2), ('req_priority','Low',3)
) AS v(kind, value, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM code_item c WHERE c.kind = v.kind)
ON CONFLICT (kind, value) DO NOTHING;

-- (제거) 쓰고 있는 값을 목록으로 끌어올리던 백필 — 지운 값을 실데이터가
-- 계속 되살리는 통로였다. 목록에 없는 값을 든 기록은 편집 창이 그대로
-- 보여 주므로 사라지지 않는다.

-- ── 커스텀 필드 ────────────────────────────────────────────────
-- 팀마다 TC·요구사항에 적어두고 싶은 항목이 다르다(수행자, 시험 환경,
-- 고객사, 관련 이슈…). 그때마다 컬럼을 늘리고 배포하면 따라갈 수 없다.
--
-- 값은 여기가 아니라 tc.data->'custom' / req.data->'custom' 에 key 로 들어간다.
-- 이 테이블은 '무슨 칸이 있는지' 만 정한다. 값을 여기에 같이 넣으면
-- 요구사항 하나를 읽는 데 조인이 하나 더 붙는다.
--
-- target 을 두는 이유: TC 와 요구사항은 쓰는 사람도 시점도 다르다.
-- 한 목록으로 두면 TC 에만 필요한 칸이 요구사항 편집 화면까지 따라온다.
CREATE TABLE IF NOT EXISTS custom_field (
  id          BIGSERIAL PRIMARY KEY,
  target      TEXT NOT NULL,            -- tc | req
  key         TEXT NOT NULL,            -- data->'custom' 안의 키. 영문/숫자/_ 만
  label       TEXT NOT NULL,            -- 화면에 보이는 이름
  type        TEXT NOT NULL DEFAULT 'text',  -- text|textarea|number|select|date|checkbox
  options     TEXT,                     -- select 일 때 줄바꿈으로 구분한 값 목록
  required    BOOLEAN NOT NULL DEFAULT false,
  -- 어디에 보일지. 둘 다 끄면 값은 남지만 화면에서 사라진다 —
  -- 쓰던 칸을 지우기 전에 잠시 숨겨보는 용도다.
  show_form   BOOLEAN NOT NULL DEFAULT true,   -- 편집 화면
  show_list   BOOLEAN NOT NULL DEFAULT false,  -- 목록 열
  sort_order  INT DEFAULT 0,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
-- key 는 target 안에서만 유일하면 된다. TC 의 'owner' 와 요구사항의 'owner' 는
-- 서로 다른 칸일 수 있다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_field ON custom_field(target, key);
CREATE INDEX IF NOT EXISTS idx_custom_field_target ON custom_field(target);
DROP TRIGGER IF EXISTS trg_custom_field_updated ON custom_field;
CREATE TRIGGER trg_custom_field_updated BEFORE UPDATE ON custom_field
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 장비 카탈로그 (제조사 · 제품군 · 모델 · 랩) ────────────────
-- 장비를 등록할 때마다 제조사와 모델을 손으로 치면 '유비쿼스' 와
-- '유비쿼스(주)' 로 갈려 같은 것이 둘로 보인다. 여기에 한 번 등록해 두고
-- 장비 등록에서는 고르기만 한다.
--
-- 종류를 나누지 않고 한 테이블에 담는 이유: 넷 다 '이름 목록' 이라는 같은
-- 모양이고, 나누면 화면과 API 를 네 벌 만들어야 한다.
--
-- 모델에는 기본 인터페이스를 적어둔다(gi1/0/1-48 같은 범위 표기).
-- 장비 등록에서 모델을 고르면 그대로 채워지므로 48포트를 다시 치지 않는다.
CREATE TABLE IF NOT EXISTS device_catalog (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,             -- vendor | family | model | lab
  name        TEXT NOT NULL,
  vendor      TEXT,                      -- kind=model 일 때 제조사
  family      TEXT,                      -- kind=model 일 때 제품군
  interfaces  TEXT,                      -- kind=model 일 때 기본 인터페이스
  note        TEXT,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);
-- 모델군(시리즈). E6000 시리즈 아래 E6100-48X · E6100-24X … 처럼 묶는다.
-- 시험은 보통 모델 하나가 아니라 시리즈 단위로 도므로 이 층이 필요하다.
ALTER TABLE device_catalog ADD COLUMN IF NOT EXISTS model_group TEXT;
-- 사업자 (KT · LGU+ · SKB …) — 모델이 어느 사업자향인지
ALTER TABLE device_catalog ADD COLUMN IF NOT EXISTS operator TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_catalog ON device_catalog(kind, name);
CREATE INDEX IF NOT EXISTS idx_device_catalog_kind ON device_catalog(kind);

-- 이미 등록된 장비에서 쓰던 값을 카탈로그로 끌어올린다. 빈 화면부터
-- 시작하면 아무도 채우지 않는다 — 쓰던 것이 이미 들어 있어야 한다.
INSERT INTO device_catalog (kind, name)
SELECT DISTINCT 'vendor', vendor FROM device WHERE vendor IS NOT NULL AND vendor <> ''
ON CONFLICT (kind, name) DO NOTHING;
INSERT INTO device_catalog (kind, name)
SELECT DISTINCT 'lab', lab FROM device WHERE lab IS NOT NULL AND lab <> ''
ON CONFLICT (kind, name) DO NOTHING;
-- 제품군은 쓰던 값에 더해 기본 목록도 넣는다. 빈 목록으로 두면 장비를
-- 등록하려는 사람이 제품군을 고를 수 없어 카탈로그부터 채워야 한다.
-- sort_order 를 주는 이유: 이름순으로 두면 CPE 가 L2 보다 앞에 온다.
INSERT INTO device_catalog (kind, name, sort_order)
VALUES ('family','L2',1), ('family','L3',2), ('family','OLT',3), ('family','ONT',4),
       ('family','CPE',5), ('family','HGW',6), ('family','계측기',7), ('family','기타',8)
ON CONFLICT (kind, name) DO NOTHING;
INSERT INTO device_catalog (kind, name, sort_order)
SELECT DISTINCT 'family', role, 9 FROM device WHERE role IS NOT NULL AND role <> ''
ON CONFLICT (kind, name) DO NOTHING;
INSERT INTO device_catalog (kind, name, vendor, family)
SELECT DISTINCT 'model', model, max(vendor), max(role) FROM device
WHERE model IS NOT NULL AND model <> '' GROUP BY model
ON CONFLICT (kind, name) DO NOTHING;

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

-- ══════════════════════════════════════════════════════════════════════
-- 사이클 서버 실행 (cycle_run / cycle_run_log)
--
-- 실행을 브라우저가 붙들고 있었다. 64건을 걸어 놓고 탭을 닫으면 거기서
-- 멈췄고, 자리를 뜰 수가 없었다. 실행 서버를 따로 둔 의미도 없었다.
--
-- 그래서 실행을 **일감**으로 만든다. 화면은 줄에 걸어 놓고 손을 떼고,
-- 실행기(runner 컨테이너)가 집어서 돌린다. 진행은 여기에 쌓이므로
-- 브라우저를 닫았다 다시 열어도 처음부터 다 볼 수 있다.
--
-- 로그를 표로 따로 두는 이유: 한 실행에 수천 줄이 쌓이는데 jsonb 배열에
-- 담으면 한 줄 붙일 때마다 통째로 다시 쓴다. seq 로 잘라 읽어야 화면이
-- "내가 본 다음 것부터" 를 물을 수 있다.
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cycle_run (
  id            TEXT PRIMARY KEY,
  cycle_id      TEXT NOT NULL,
  cycle_name    TEXT,
  -- 돌릴 항목의 자리 번호들. 비면 전체
  picked        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- queued | running | done | stopped | failed
  status        TEXT NOT NULL DEFAULT 'queued',
  -- 사람이 멈춤을 눌렀다. 실행기가 보고 스스로 내려온다
  stop_asked    BOOLEAN DEFAULT false,
  started_by    TEXT,
  -- 어느 실행기가 집었나. 여러 대를 둘 때 누가 도는지 안다
  worker        TEXT,
  total         INT DEFAULT 0,
  done          INT DEFAULT 0,
  item_at       INT DEFAULT -1,
  item_name     TEXT,
  step_at       INT DEFAULT -1,
  step_count    INT DEFAULT 0,
  step_name     TEXT,
  -- 지금 도는 항목의 스텝들 (결과가 차오르는 그대로)
  live_steps    JSONB,
  error         TEXT,
  queued_at     TIMESTAMPTZ DEFAULT now(),
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  -- 살아있음 신호. 끊긴 지 오래면 화면에서 '응답 없음' 으로 보여준다
  heartbeat_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cycle_run_cycle  ON cycle_run(cycle_id);
CREATE INDEX IF NOT EXISTS idx_cycle_run_status ON cycle_run(status);
CREATE INDEX IF NOT EXISTS idx_cycle_run_queued ON cycle_run(queued_at DESC);

CREATE TABLE IF NOT EXISTS cycle_run_log (
  run_id        TEXT NOT NULL REFERENCES cycle_run(id) ON DELETE CASCADE,
  seq           BIGINT NOT NULL,
  -- 몇 번째 항목인지. 이게 있어야 로그를 그 항목의 스텝 밑에 붙일 수 있다.
  -- 스텝 번호만으로는 64건짜리 사이클에서 어느 항목의 3번인지 모른다.
  item_at       INT DEFAULT -1,
  -- 몇 번째 스텝인지 (-1 이면 항목 단위 알림)
  i             INT DEFAULT -1,
  -- info | send | recv | pass | fail | warn
  kind          TEXT,
  text          TEXT,
  at            TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (run_id, seq)
);

-- 이미 만들어진 표에도 붙인다. schema.sql 은 기동할 때마다 도는데
-- CREATE TABLE IF NOT EXISTS 는 이미 있는 표의 칸을 늘려 주지 않는다.
ALTER TABLE cycle_run_log ADD COLUMN IF NOT EXISTS item_at INT DEFAULT -1;

-- ══════════════════════════════════════════════════════════════════════
-- 결함 (defect) — UTOP 안에 먼저 쌓고, 나중에 Jira 로 밀지 정한다
--
-- 사이클을 돌리다 시험이 깨지면 그 자리에서 이슈를 건다. 바로 Jira 로
-- 올리지 않는 이유: 64건 돌려 20건 깨지면 그중 열여덟은 같은 원인이거나
-- 시험이 잘못된 것이다. UTOP 에 모아 두고 사람이 추린 뒤에 민다.
--
-- 스텝 내용을 통째로 담는다(steps jsonb) — 「무엇이 어떻게 깨졌나」 를
-- 나중에 Jira 로 밀 때 다시 찾지 않게.
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS defect (
  id            TEXT PRIMARY KEY,
  title         TEXT,
  -- open | pushed | closed
  status        TEXT NOT NULL DEFAULT 'open',
  severity      TEXT,
  -- 어디서 났나
  cycle_id      TEXT,
  cycle_name    TEXT,
  tcid          TEXT,
  tc_name       TEXT,
  model         TEXT,
  version       TEXT,
  -- 깨진 스텝의 자세한 내용 (명령·판정기준·출력·근거·사진…)
  steps         JSONB,
  note          TEXT,
  -- 이슈 등록 칸 — 프로젝트 키·프로젝트명·이슈유형·우선순위·수정버전·구성요소·보고자
  jira_project  TEXT,          -- 프로젝트 키
  project_name  TEXT,          -- 프로젝트명
  issue_type    TEXT,          -- 이슈유형 (Defect/Bug/CR…)
  priority      TEXT,          -- 우선순위
  fix_version   TEXT,          -- 수정버전
  component     TEXT,          -- 구성요소
  reporter      TEXT,          -- 보고자 (Jira 계정)
  -- Jira 로 민 뒤 채워진다
  jira_key      TEXT,
  created_by    TEXT,          -- 등록자
  created_at    TIMESTAMPTZ DEFAULT now(),   -- 등록일
  updated_at    TIMESTAMPTZ DEFAULT now()
);
-- 이미 만들어진 표에도 칸을 보탠다(있으면 지나간다)
ALTER TABLE defect ADD COLUMN IF NOT EXISTS project_name TEXT;
ALTER TABLE defect ADD COLUMN IF NOT EXISTS issue_type   TEXT;
ALTER TABLE defect ADD COLUMN IF NOT EXISTS priority     TEXT;
ALTER TABLE defect ADD COLUMN IF NOT EXISTS fix_version  TEXT;
ALTER TABLE defect ADD COLUMN IF NOT EXISTS component    TEXT;
ALTER TABLE defect ADD COLUMN IF NOT EXISTS reporter     TEXT;
-- 이슈 본문 여섯 판(관련 근거·목적·사전 준비 조건·시험 구성도·시험 절차 및
-- 결과·Kernel Log). 판마다 칸을 만들면 판이 늘 때마다 스키마를 고쳐야 해서
-- 한 칸에 담는다 — 무엇을 담을지는 프로젝트마다 다르다(Jira 패널 설정).
ALTER TABLE defect ADD COLUMN IF NOT EXISTS panels JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_defect_status  ON defect(status);
CREATE INDEX IF NOT EXISTS idx_defect_cycle   ON defect(cycle_id);
CREATE INDEX IF NOT EXISTS idx_defect_tcid    ON defect(tcid);
CREATE INDEX IF NOT EXISTS idx_defect_created ON defect(created_at DESC);

-- 수정 이력 — 누가 무엇을 언제 고쳤나. 알림 종·감사가 읽는다.
CREATE TABLE IF NOT EXISTS audit_log (
  id        BIGSERIAL PRIMARY KEY,
  at        TIMESTAMPTZ DEFAULT now(),
  kind      TEXT NOT NULL,        -- tc | req | cycle | defect | run …
  ref_id    TEXT,                 -- TC-…, REQ-…, cycle-…, DEF-…
  action    TEXT NOT NULL,        -- updated | deleted | run …
  username  TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(id DESC);

-- 시험항목 판(버전) 이력 — 저장으로 덮이기 직전의 판을 통째로 보관한다.
-- 저장·가져오기·되돌리기 어느 경로든 tc_upsert 한 곳에서 찍힌다.
CREATE TABLE IF NOT EXISTS tc_history (
  id        BIGSERIAL PRIMARY KEY,
  tcid      TEXT NOT NULL,
  at        TIMESTAMPTZ DEFAULT now(),
  username  TEXT,                 -- 그 판을 만들었던 사람 (덮이기 전 updated_by)
  data      JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tch_tcid ON tc_history(tcid, id DESC);

-- 실행 타입 백필 — Info 탭은 run_type 으로 저장하는데 meta 추출이 kind 만
-- 봐서 이미 저장된 행들의 kind 가 비어 있다. 기동마다 돌아도 멱등.
UPDATE tc SET kind = data->>'run_type'
 WHERE (kind IS NULL OR kind = '') AND COALESCE(data->>'run_type', '') <> '';
