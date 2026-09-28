# Architecture

2026-09-29 기준. 도커 compose 로 뜨는 다섯 서비스와 그 안의 코드 구조를 적는다.
도커 이전(Tkinter 런처·venv·PostgreSQL 5433) 그림은 이 문서에서 걷어 냈다 —
그 시절 기록은 [migration-log.md](migration-log.md) 와 [SESSION_SUMMARY.md](SESSION_SUMMARY.md) 에 남아 있다.

## 시스템 구조

```text
사용자 브라우저 ──▶ web (nginx :9000)  ──/api·/ws──▶ api (FastAPI :8000, 호스트에 안 연다)
                    React 정적 파일                     │
                                                        ├──▶ db (PostgreSQL 17)  표 32개 + app_kv
runner (Node) ─────POST /api/runner/*──────────────────┤       볼륨 db-data
  화면과 같은 runner.ts·judge.ts 를 esbuild 로 묶음      ├──▶ 장비 (SSH·Telnet·SNMP) · 계측기 (Spirent STC REST · IXIA N2X Tcl 중계)
                                                        └──▶ 외부 (Jira · Confluence · LLM: Anthropic·OpenAI 호환·Dify)
adminer (:8081)  DB 를 웹으로 보는 창
```

- **화면과 실행기가 판정기를 공유한다.** `web/src/components/tc/judge.ts` 한 벌을 브라우저와 runner 가 그대로 쓴다.
  runner 는 [runner/build.mjs](../runner/build.mjs) 가 `@/api/client` 하나만 shim 으로 바꿔 끼워 묶는다.
- **인증은 미들웨어 한 곳**(`backend/main.py` 의 `_require_login`). `/api/*` 는 로그인 세션이 없으면 401 이고,
  공개 경로(`_AUTH_PUBLIC`: login·health·runner·n2x 중계 등)만 예외다. runner·N2X 중계는 세션 대신 열쇠(RUNNER_KEY·N2X_RELAY_KEY)로 확인한다.
- **데이터는 볼륨에만.** 소스 트리에 운영 데이터가 없다. `db-data`(PostgreSQL)·`app-data`(첨부·리포트·캐시).

## 디렉터리 구조

```text
utop/
├── docker-compose.yml           db · adminer · api · web · runner
├── .env                         비밀 (커밋 안 됨) — .env.example 참조
├── start.sh / start.ps1         받기 → .env → 빌드 → 기동 (사용자 진입점)
├── update.sh                    이미 뜬 곳에서 최신 소스로 다시 띄우기
│
├── backend/                     FastAPI
│   ├── main.py                  앱 조립·미들웨어(인증·gzip·캐시)·로그인/세션·사용자·조직·설정(브랜딩·메일·공유·권한)·
│   │                            게시판·알림·WebSocket(/ws)·기동 훅 — 라우트 80개. 기능 라우트는 아래 routes/ 로 갔다
│   ├── core.py                  나뉜 라우트 파일이 쓰는 공용 고리(broadcast·세션·KV·경로 …). main 이 core.bind 로 채운다
│   ├── routes/                  기능별 APIRouter — main 을 거꾸로 부르지 않는다
│   │   ├── wiki.py              문서·Yjs 중계(/ws/yjs)·문서 안의 표
│   │   ├── jira.py              Jira·결함·릴리즈 요약
│   │   ├── devices.py           장비(PG)·카탈로그·랙·랙뷰·STC·N2X·옛 장비
│   │   ├── ai.py                LLM 등록·프롬프트·RAG·Confluence·Knowledge AI·Coverage AI·TC 생성
│   │   ├── nl_test.py           자연어 시험(AI Assistant)
│   │   ├── cycle.py             사이클·플랜 실행·runner 대기줄·CLI 실행·셀 세션·ping·SNMP·자원 잠금·집계
│   │   └── tc_req.py            시험 항목·요구사항·분류 폴더·코드표·사용자 정의 필드·휴지통
│   ├── engine.py                옛 실행 엔진(netmiko 실행·옛 판정기·PPTX). APIRouter 로 붙는다
│   ├── db.py                    asyncpg 풀 + CRUD 헬퍼 (tc·req·cycle·plan_run·defect·wiki 표 …)
│   ├── id_migrate.py            옛 ID → 모델그룹 기준 ID
│   ├── pptx_tpl.py              결과서 PPTX 양식
│   ├── stc/                     Spirent — stc_live 는 import, 나머지는 subprocess (같이 움직여야 한다)
│   ├── n2x/n2x_daemon.tcl       IXIA N2X Tcl 데몬 (코드가 부르는 유일한 tcl)
│   ├── seed/                    조직도·역할 씨앗
│   └── Dockerfile               python:3.12-slim + 크로미움(PDF) + 한글 글꼴
│
├── web/                         새 UI — React 19 + TypeScript + Vite, nginx 가 제공
│   ├── src/pages/               화면 14개 (Dashboard·Wiki·ReqTc·Cycles·Devices·Instruments·RackView·
│   │                            Defects·JiraIssues·Releases·AiTc·AiKb·Settings …)
│   ├── src/components/          tc(스텝·판정기 judge.ts·실행기 runner.ts)·cycle·run·devices·jira·ntable·info·settings
│   ├── src/api/                 client(토큰·fetch)·goto(화면 간 이동)·wsBus(탭당 소켓 하나)
│   ├── src/lib/prefs.ts         보기 설정 — 서버·계정별, localStorage 직접 쓰지 않는다
│   ├── src/components/tc/judge.test.ts   판정기 정답표(vitest) — Dockerfile 이 빌드 전에 돈다
│   ├── nginx.conf               index.html 은 no-store, /assets 는 1년, /api·/ws 는 api 로
│   └── Dockerfile               npm test → npm run build → nginx
│
├── runner/                      실행기 — web/src 의 runner.ts·judge.ts 를 Node 로 묶음 (esbuild)
├── frontend/                    옛 UI (Vanilla JS). api 가 /static 과 / 로 아직 마운트한다.
│                                새 UI 에 없는 화면: 게시판·할일·도움말·리소스(인력·프로젝트). 옮기면 마운트와 Dockerfile 의 COPY 를 함께 지운다
├── db/schema.sql                PostgreSQL 스키마 — 최초 기동 시 1회 적용 (표 32개)
├── tools/                       verify.py(회귀 검사)·verify.sh(도커 안에서 verify)·gen_api_docs.py·backup.py·restore.py·n2x_relay.py
├── tests/                       파이썬 테스트 (옛 판정기 engine.py)
├── harness/bugs.md              알려진 결함·부채 대장
└── docs/                        문서 — 목록은 docs/README.md
```

## main.py 와 routes/ 의 관계

- `main.py` 는 `app` 을 만들고 미들웨어·인증·세션을 세운 뒤 **접합부 여섯 곳**에서 `core.bind(...)` 로 자기 것을 core 에 매고
  `app.include_router(...)` 로 routes 파일을 붙인다. 접합부는 「필요한 이름이 다 정의된 뒤, 옮긴 이름을 처음 쓰기 전」 자리에 있다.
- routes 파일은 `import core` 뒤 `core.broadcast(...)` 처럼 **부를 때** 찾는다. `from core import x` 나 `from main import x` 는 쓰지 않는다 —
  앞 것은 빈 자리를 쥐고, 뒤 것은 두 파일이 서로를 부르는 꼴이 된다(옛 nl_test 가 그랬다).
- 기동 때 다시 대입되는 값(`SESSIONS`, `_MAIN_LOOP`)은 그 자리에서 `core.bind` 를 다시 부른다. 안 그러면 core 가 옛 값을 쥔다.
- routes 끼리 필요한 것은 `from routes import jira` 처럼 그 파일을 직접 본다(cycle → jira·ai·devices, ai → jira, nl_test → ai).
- 새 라우트는 해당 routes 파일에 `@router.get(...)` 으로 더한다. 주소 규칙은 그대로 `/api/<묶음>/...`.

## 데이터 흐름

- **PostgreSQL 이 정본.** tc·req·cycle·plan_run·defect·device·wiki_page 등은 표에, 게시판·도움말·UI 옵션·조직도 같은 컨테이너 자료는 `app_kv` 에 있다.
  `db.py` 헬퍼로만 접근한다.
- **KV 캐시.** `_kv_load_sync/_kv_save_sync`(main, core 로도 매임)가 기동 때 채운 캐시를 본다. 새 KV 키는 `_KV_MIGRATIONS` 에 등록해야
  재시작마다 데이터가 날아가지 않는다.
- **파일.** 첨부·그림(`data/req_images`)·리포트·백업만 `app-data` 볼륨에 둔다. `data/` 루트에 파일을 새로 만들지 않는다.
- **실시간.** 서버가 바꾼 것은 `broadcast()` 로 `/ws` 접속자 전부에 뿌린다. 화면은 wsBus 하나로 받는다.
- **실행.** 화면이 `/api/runs` 에 일감을 걸면 runner 컨테이너가 `/api/runner/claim` 으로 집어 `runSteps`(runner.ts)로 돌리고 진행을
  `/api/runner/{id}/progress` 로 올린다. 판정은 runner 안의 judge.ts 가 한다. 자세한 것은 [RUN_SERVER.md](RUN_SERVER.md).

## 기술 스택

`requirements.txt` · `web/package.json` · `runner/package.json` 참조.
Python 3.12(도커) · FastAPI · asyncpg · netmiko/paramiko · pysnmp · python-pptx · playwright(PDF) · anthropic ·
React 19 · TypeScript 5 · Vite 6 · vitest · BlockNote(위키 편집기) · Yjs · Node 22(runner).
