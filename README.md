# UTOP

유비쿼스 네트워크 장비 시험 자동화 도구.

요구사항 관리 → 테스트케이스 작성 → 사이클 실행 → 결과 리포트까지를 한 곳에서
처리하고, 장비 CLI(SSH/Telnet)와 트래픽 계측기(Spirent STC, IXIA N2X)를 직접
제어해 시험을 자동 실행한다.

---

## 빠른 시작

필요한 것은 **Docker 하나뿐이다.** PostgreSQL 을 따로 설치하지 않는다.
(Windows 는 Docker Desktop, 리눅스는 docker + docker compose)

```bash
git clone https://github.com/kyuchong/utop.git
cd utop
cp .env.example .env
```

`.env` 를 열어 `POSTGRES_PASSWORD` 를 채운 뒤:

```bash
docker compose up -d
```

브라우저에서 **http://localhost:8080** 으로 접속한다.

첫 기동은 이미지 빌드 때문에 몇 분 걸린다. 두 번째부터는 수십 초다.

### 자주 쓰는 명령

```bash
docker compose logs -f api      # 백엔드 로그 보기
docker compose restart api      # 백엔드만 재시작
docker compose down             # 정지 (데이터는 남는다)
docker compose down -v          # 정지 + 데이터까지 삭제
```

---

## 구조

```
utop/
├── docker-compose.yml   PostgreSQL + 백엔드 + 웹
├── .env                 접속 정보 (직접 만든다, 커밋 안 됨)
│
├── backend/             FastAPI — 장비 제어·시험 실행·AI
│   ├── main.py            라우트 대부분, WebSocket
│   ├── engine.py          사이클 실행, PPTX 리포트
│   ├── db.py              PostgreSQL 접근 (asyncpg)
│   ├── stc/               Spirent TestCenter 연동
│   └── n2x/               IXIA N2X Tcl
│
├── web/                 새 UI — React + TypeScript + Vite
├── frontend/            기존 UI — 화면을 web/ 로 옮기는 중
│
├── db/schema.sql        PostgreSQL 스키마 (최초 기동 시 자동 적용)
├── tools/               개발 도구 (백업·검증·문서 생성)
└── docs/                문서
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

백엔드는 도커로 띄워두고, 프론트는 로컬에서 돌리면 저장하는 즉시 반영된다.

```bash
docker compose up -d db api
cd web
npm install
npm run dev          # http://localhost:5173
```

`/api` 요청은 vite 가 백엔드로 넘긴다 (`web/vite.config.ts`).

**백엔드가 5173 이 아닌 8000 을 보고 있어야 한다** — `docker-compose.yml` 의
`api` 서비스에서 `ports: - "8000:8000"` 주석을 풀어라.

### 검사

```bash
python tools/verify.py     # py_compile · 린트 · 테스트 · 문서 드리프트
cd web && npm run typecheck
```

---

## 화면 이관 현황

새 UI(`web/`)로 옮긴 화면만 `localhost:8080` 에 나온다.
아직 안 옮긴 화면은 기존 UI 에 남아 있다.

| 화면 | 상태 |
|---|---|
| Requirements → TC 연결 | 이관 완료 |
| 그 외 | 기존 UI 사용 |

화면을 하나 옮길 때마다 `web/src/pages/` 에 파일을 추가하고
`web/src/components/Layout.tsx` 의 `NAV` 와 `web/src/App.tsx` 분기에 한 줄씩 넣는다.

---

## 환경변수

`.env.example` 에 전체 목록과 설명이 있다. 필수는 `POSTGRES_PASSWORD` 하나다.

AI 기능(TC 자동 생성, 지식 검색)을 쓰려면 `ANTHROPIC_API_KEY` 가 필요하다.
