# UTOP

유비쿼스 네트워크 장비 시험 자동화 도구.

요구사항 관리 → 테스트케이스 작성 → 사이클 실행 → 결과 리포트까지를 한 곳에서
처리하고, 장비 CLI(SSH/Telnet)와 트래픽 계측기(Spirent STC, IXIA N2X)를 직접
제어해 시험을 자동 실행한다.

---

## 빠른 시작

필요한 것은 **Docker 하나뿐이다.** PostgreSQL 을 따로 설치하지 않는다.
(Windows 는 Docker Desktop, 리눅스는 docker + docker compose)

### Windows

PowerShell 에 그대로 붙여넣으면 된다.

```powershell
git clone https://github.com/kyuchong/utop.git C:\utop; cd C:\utop; .\start.ps1
```

### 리눅스 / macOS

```bash
git clone https://github.com/kyuchong/utop.git ~/utop && cd ~/utop && ./start.sh
```

`start` 스크립트가 알아서 한다 — 최신 소스 받기 → `.env` 생성(DB 비밀번호 자동 생성)
→ 이미지 빌드 → 기동 → 뜰 때까지 대기 → 브라우저 열기.

첫 실행은 이미지 빌드 때문에 몇 분 걸린다. 두 번째부터는 수십 초다.

접속 주소는 **http://localhost:9000** 이다.

### 두 번째부터 (업데이트)

같은 스크립트를 다시 실행하면 최신 소스를 받아 다시 띄운다.
**데이터는 도커 볼륨에 있으므로 지워지지 않는다.**

```powershell
cd C:\utop; .\start.ps1
```

### 오프라인 갱신 (인터넷이 안 되는 PC)

시험망만 붙은 서버는 `./update.sh` 가 소스도 바탕 이미지도 못 받는다. 그때는 인터넷이 되는 서버에서
꾸러미를 만들어 옮긴다.

```bash
# 인터넷이 되는 서버(예: 213)에서 — 이미지 셋 + 소스를 한 파일로
tools/offline_pack.sh            # ~/utop-offline-<커밋>.tgz (api 가 커서 1GB 안팎)
scp ~/utop-offline-*.tgz utop@220.1.1.252:~/

# 인터넷이 안 되는 PC에서 — 소스 맞추고 이미지 싣고 빌드 없이 기동
cd ~/utop && tools/offline_apply.sh ~/utop-offline-<커밋>.tgz
```

`.env` 와 DB 볼륨은 건드리지 않는다. 인터넷이 없을 때 `./update.sh` 를 돌리면 빌드를 건너뛰고
있는 이미지로만 다시 띄운다(소스는 안 바뀜).

### 자주 쓰는 명령

```bash
docker compose logs -f api      # 백엔드 로그 보기
docker compose restart api      # 백엔드만 재시작
docker compose down             # 정지 (데이터는 남는다)
docker compose down -v          # 정지 + 데이터까지 삭제
```

### 포트를 바꾸려면

`.env` 의 `WEB_PORT` 를 고치고 `docker compose up -d` 를 다시 실행한다.

```
WEB_PORT=9000
```

같은 PC 에서 두 벌을 동시에 띄우려면 각각 다른 포트를 주면 된다.

---

## 구조

```
utop/
├── docker-compose.yml   PostgreSQL + 백엔드 + 웹
├── .env                 접속 정보 (직접 만든다, 커밋 안 됨)
│
├── backend/             FastAPI — 장비 제어·시험 실행·AI
│   ├── main.py            앱 조립·인증·사용자·조직·설정·게시판·알림·WebSocket — 기능 라우트는 routes/ 에
│   ├── core.py            나뉜 라우트 파일이 쓰는 공용 고리(broadcast·세션) — main 이 bind 로 채운다
│   ├── routes/            기능별 라우트 묶음 (APIRouter)
│   │   ├── wiki.py          문서·Yjs 중계·문서 안의 표
│   │   ├── jira.py          Jira·결함·릴리즈 요약
│   │   ├── devices.py       장비·카탈로그·랙·STC·N2X
│   │   ├── ai.py            LLM 설정·프롬프트·RAG·Confluence·Knowledge AI·Coverage AI·TC 생성
│   │   ├── nl_test.py       자연어 시험(AI Assistant)
│   │   ├── cycle.py         사이클·플랜 실행·runner 대기줄·CLI 세션·SNMP·자원 잠금
│   │   └── tc_req.py        시험 항목·요구사항·분류 폴더·코드표·사용자 정의 필드·휴지통
│   ├── engine.py          사이클 실행, PPTX 리포트
│   ├── db.py              PostgreSQL 접근 (asyncpg)
│   ├── stc/               Spirent TestCenter 연동
│   └── n2x/               IXIA N2X Tcl
│
├── web/                 UI — React + TypeScript + Vite (nginx 가 제공, /api·/ws 는 api 로)
├── runner/              사이클 실행기 — web 의 runner.ts·judge.ts 를 Node 로 묶음
├── frontend/            옛 UI — 게시판·할일·도움말·리소스만 남았다
│
├── db/schema.sql        PostgreSQL 스키마 (최초 기동 시 자동 적용)
├── tests/               파이썬 테스트(옛 판정기) · smoke/ 기능별 동작 확인 대본
├── tools/               개발 도구 — verify.sh(회귀 검사) · smoke.sh(기능별 동작 확인) · 백업·문서 생성
└── docs/                문서 — docs/README.md 가 목록, docs/features/ 가 기능별 도움말
```

### 데이터는 소스 트리에 쌓이지 않는다

이 저장소에는 **운영 데이터가 하나도 없다.** 전부 도커 볼륨에 있다.

| 볼륨 | 내용 |
|---|---|
| `db-data` | PostgreSQL — 요구사항·TC·사이클·게시판·세션 |
| `app-data` | 첨부파일, 생성된 리포트, 캐시 |

그래서 저장소를 clone 해도 남의 시험 데이터나 장비 비밀번호가 따라오지 않고,
백업은 이 볼륨 두 개만 챙기면 된다.

---

## 개발

### 프론트만 고칠 때

도커 스택을 그대로 띄워둔 채, 프론트만 로컬에서 돌리면 저장하는 즉시 반영된다.
같은 백엔드·같은 DB 를 보므로 데이터가 갈리지 않는다.

```bash
docker compose up -d          # 백엔드는 127.0.0.1:8000 에 열린다
cd web
npm install
npm run dev                   # http://localhost:5173
```

| 주소 | 무엇 |
|---|---|
| http://localhost:9000 | 도커가 빌드한 화면 (운영과 같은 것) |
| http://localhost:5173 | 개발 서버 — 고치면 즉시 반영 |

둘 다 같은 백엔드(127.0.0.1:8000)를 본다. `/api` 와 `/ws` 는 vite 가 넘긴다
(`web/vite.config.ts`).

API 를 직접 찔러볼 때는 http://localhost:8000/docs 를 쓴다.

> 백엔드 포트는 기본으로 호스트에 열지 않는다(compose 의 api.ports 주석). `/api/*` 는 로그인 세션이 없으면 401 이지만,
> /docs 와 공개 경로가 그대로 드러나므로 디버깅할 때만 잠깐 127.0.0.1 로 열고 다시 닫는다.

### 검사

```bash
./tools/verify.sh          # api 이미지 안에서 py_compile · 린트 · 테스트 · 문서 드리프트 (이 PC 에 파이썬 의존성 불필요)
cd web && npm run typecheck
cd web && npm test         # 판정기 정답표 (judge.test.ts) — 도커 빌드도 이걸 먼저 돈다
./tools/smoke.sh           # 빈 DB 위에 새 api 를 띄워 기능별 길을 실제로 부른다 (약 5분, 운영 DB 안 건드림)
```

판정기(`web/src/components/tc/judge.ts`)는 화면과 runner 가 함께 쓰는 **한 벌**이다. 규칙을 고치면
`judge.test.ts` 의 명세 사례와 `__fixtures__/judge-cases.json` 의 실제 실행 기록이 그대로 통과해야 한다.
기록의 판정이 바뀌어야 맞다면 그 사례를 눈으로 보고 정답표를 고친다.

---

## 화면 이관 현황

새 UI(`web/`)가 거의 전부다. 옛 UI(`frontend/`, Vanilla JS)에 남은 화면만 적는다.

| 어디 | 화면 |
|---|---|
| 새 UI (web/) | Dashboard · WIKI · REQ-Coverage(요구사항·시험 항목) · Cycles(실행·판정·결과 메일·결과서) · Devices · Traffic Gen · Rack View · Defects · Jira Issue · Releases · Test AI · Knowledge AI · Settings |
| 옛 UI (frontend/) | 게시판 · 할일 · 도움말 · 리소스(인력·프로젝트) — api 컨테이너가 `/` 로 아직 제공한다 |

화면을 하나 옮길 때마다 `web/src/pages/` 에 파일을 추가하고
`web/src/components/Layout.tsx` 의 `NAV` 와 `web/src/App.tsx` 분기에 한 줄씩 넣는다.
옛 UI 의 마지막 화면을 옮기면 `backend/main.py` 의 `/static`·`/` 마운트와 `backend/Dockerfile` 의 `COPY frontend/` 를 함께 지운다.

---|---|
| Requirements → TC 연결 · 분류(2단) · 생성/편집/삭제 | 이관 완료 |
| Test Cases 목록 · 생성/편집/삭제 | 이관 완료 (스텝 편집은 아직) |
| 그 외 | 기존 UI 사용 |

화면을 하나 옮길 때마다 `web/src/pages/` 에 파일을 추가하고
`web/src/components/Layout.tsx` 의 `NAV` 와 `web/src/App.tsx` 분기에 한 줄씩 넣는다.

---

## 환경변수

`.env.example` 에 전체 목록과 설명이 있다. 필수는 `POSTGRES_PASSWORD` 하나다.

AI 기능(TC 자동 생성, 지식 검색)을 쓰려면 `ANTHROPIC_API_KEY` 가 필요하다.
