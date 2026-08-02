# Architecture

## 시스템 구조

```text
launcher.bat → scripts/launcher.py (Tkinter)
  └─ .venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
      └─ backend/main.py                       # FastAPI 앱, 라우팅 대다수, WebSocket /ws
          ├─ backend/engine.py                 # Cycle 실행, Baseline, PPTX, /api/baselines 등
          ├─ backend/db.py                     # asyncpg 커넥션 풀, tc/req/cycle/manuals/kv/sessions 접근
          ├─ backend/stc/                      # Spirent TestCenter 연동 (stc_live 는 import, 나머지는 subprocess)
          └─ backend/n2x/n2x_daemon.tcl        # IXIA N2X Tcl 데몬 (트래픽 시험)

PostgreSQL 17 (localhost:5433, DB=utop, USER=utop)
  ├─ tc / req / cycle / manuals                # A 그룹 리소스
  ├─ app_kv                                    # B 그룹 컨테이너 (board·folders 등)
  ├─ sessions                                  # 로그인 세션
  └─ rag_embed                                 # RAG 임베딩 (사용 준비 중)

frontend/index.html
  ├─ static/css/app.css
  └─ static/js/<탑메뉴>/*.js                    # 탑메뉴 폴더별 분할, index.html 이 <script> 로 로드
```

## 디렉토리 구조

```text
utop/
├── launcher.bat / start.bat        # 사용자 진입점 (더블클릭)
├── requirements.txt
├── package.json / eslint.config.js # 도구가 루트에서 찾는 설정
├── eslint-suppressions.json
├── pyproject.toml
├── .env                            # PG 접속 정보 (gitignore)
├── .gitignore
├── backend/
│   ├── main.py                     # FastAPI 앱, 200+ 라우트, WebSocket
│   ├── engine.py                   # Cycle 실행, Baseline, PPTX
│   ├── db.py                       # PostgreSQL 접근 (asyncpg)
│   ├── stc/                        # Spirent TestCenter 연동
│   │   ├── stc_live.py             #   main.py 가 import (from stc.stc_live import StcLive)
│   │   ├── stc_traffic.py 외 4     #   subprocess 로 독립 실행 (__main__ 있음)
│   │   ├── _stc_*_cfg.json         #   위저드가 쓰는 설정
│   │   └── stc_resv_registry.json  #   포트 예약 레지스트리 (모듈이 __file__ 기준으로 찾음)
│   └── n2x/                        # IXIA N2X Tcl
│       ├── n2x_daemon.tcl          #   main.py 의 N2X_DAEMON — 유일하게 코드가 부르는 것
│       └── n2x_*.tcl 6개           #   수동 실행용 (코드 참조 없음)
├── frontend/                       # 앱을 이루는 것만. 도구 메타데이터는 tools/ 로
│   ├── index.html
│   └── static/
│       ├── css/app.css
│       └── js/<탑메뉴>/            # _shared, dashboard, tests, reports, cycles,
│                                   # resources, system, board, todo
├── scripts/                        # 사람이 실행하는 스크립트
│   ├── launcher.py                 # Tkinter 런처 (launcher.bat 이 호출)
│   ├── restart-server.ps1          # 백그라운드 재기동 스크립트
│   └── setup-on-new-pc.ps1         # PG 셋업 (env var / 프롬프트로 비번 입력)
├── db/
│   ├── schema.sql                  # PostgreSQL 스키마 (커밋됨)
│   ├── SCHEMA.md                   # 스키마 문서
│   └── utop-seed.dump              # DB 덤프 (gitignore)
├── tools/                          # 개발 도구 (앱이 참조 안 함)
│   ├── verify.py                   # 회귀 검사 진입점 (py_compile 등)
│   ├── migrate_json_to_pg.py       # 파일 → PG 일회성 마이그레이션
│   ├── mib_enums.py                # data/MIB → data/snmp/ 추출
│   ├── gen_api_docs.py / gen_eslint_globals.py
│   └── eslint/globals.json         # 린트 도구만 읽는 생성물
├── docs/                           # 프로젝트 문서
│   ├── design/<메뉴>/              # 화면 시안·미리보기 (앱이 참조 안 함)
│   └── reference/Ubiquoss/         # 외부 반입 참조자료 (STC_UDP.py, pcap) — 실행·import 안 함
├── _archive/                       # 과거 포팅 작업 폐기물 (gitignore, 코드 미참조)
└── data/
    ├── MIB/                        # 벤더 MIB 정의 (mib_enums.py 입력)
    ├── config/                     # 화면에서 바꾸는 설정 (branding·permissions·prompts·help…)
    ├── integrations/               # 외부 연동 (jira·llms·mail·dify) — 자격증명은 gitignore
    ├── state/                      # 런타임 상태·PG 폴백 (board·folders·notifications·req…)
    ├── snmp/                       # MIB 추출 생성물 (snmp_enums·snmp_names)
    ├── _unused/                    # 코드 참조 0건 — 삭제 후보 (지우지 않고 격리)
    ├── devices/devices.json        # 장비 목록 (파일 정본, 실제 IP·비번 포함)
    ├── baselines/<device>/<key>.json  # Baseline 저장
    ├── legacy/                     # PG 이관 후 파일 백업 (gitignore)
    ├── backups/                    # 자동 백업 (gitignore)
    ├── trash/                      # 소프트 삭제된 REQ/TC (gitignore)
    ├── artifacts/ pptx/            # Cycle 산출물 (gitignore)
    ├── tc_snapshots/ tc_run_history/  # TC 편집/실행 이력 (gitignore)
    ├── board_files/                # 게시판 첨부 (gitignore)
    └── state/rag_embed.npy 외      # RAG 인덱스 (gitignore, 재생성 가능)
```

## 데이터 흐름

**A 그룹 (tc/req/cycle/manuals):**
- 저장: `db.tc_upsert(tcid, data)` 등 — PG 정본.
- 읽기: `db.tc_get(tcid)` / `db.tc_list_full()` / `db.tc_list_meta()`.
- 파일 저장 지점 없음. `data/tc/` 등 디렉토리는 삭제됨.

**B 그룹 (컨테이너 파일 — board, folders, jira, llms 등):**
- 저장: `_kv_save_sync(key, data)` → `db.kv_set(key, data)` fire-and-forget + 캐시 갱신.
- 읽기: `_kv_load_sync(key, default)` — startup 훅이 채운 캐시에서 반환. 캐시 없으면 fallback 파일에서 로드.
- startup 시 `_KV_MIGRATIONS` 목록의 파일을 `_kv_init_async` 로 DB 이전 (`chat_sessions`, `ai_usage`, `ai_feedback`, `learned_procedures`, `release_summary`, `manpower`, `device_catalog`, `racks`). 이 목록 밖의 컨테이너 파일은 아직 파일 정본이며 코드가 `load_json`/`save_json` 으로 직접 접근.

**세션:**
- PG `sessions` 테이블 ([db/schema.sql](../db/schema.sql)). 파일 저장 없음. 옛 sessions.json 은 이관 완료되어 legacy 백업만 남음.

**Baseline:**
- 제거 예정. 코드 잔존 중. [REMOVAL-0001](../harness/bugs.md#removal-0001) 참조.

## 기술 스택

`requirements.txt` 참조. 주요:
- Python 3.13 (venv)
- FastAPI, Uvicorn, WebSocket
- asyncpg (PostgreSQL 드라이버)
- Netmiko / paramiko (장비 CLI)
- python-pptx, Pillow (PPTX 생성)
- anthropic (Claude API)
- stcrestclient (Spirent STC REST)

## 프론트 모듈 분할

- 파일은 **탑메뉴(topnav) 기준 폴더**에 둔다. 폴더가 곧 담당 메뉴다.
  - `_shared/` — `01-core`, `05-stc-rack`, `06-nav-misc`, `09-system-init` (여러 메뉴가 함께 씀)
  - `dashboard/` — `02-dashboard`
  - `tests/` — `03-requirements`, `04-testcase`, `07-global-params`, `pages-requirements-v2`
  - `reports/` — `07-report`, `10-myreport`
  - `cycles/` — `08-milestone-cycle`
  - `resources/` — `13-resource`
  - `system/` — `12-help`
  - `board/` — `11-board`
  - `todo/` — `14-todo`
- 파일 내용은 이동 전과 같다(경로만 변경). `index.html` 의 `<script src>` 와
  `eslint-suppressions.json` 키가 이 경로를 따라간다 — 폴더를 옮기면 둘 다 같이 고칠 것.
- 라우팅은 `06-nav-misc.js` 의 `showPage(name)` 에서 분기. 새 페이지 추가 시 `index.html` 에 `<script>` 태그 + 페이지 `<div>` + `06-nav-misc.js` 라우팅 세 곳을 함께 갱신한다.
