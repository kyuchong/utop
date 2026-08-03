# Conventions

## 판정기준 문법

- 판정기준이 있으면 기대결과보다 우선한다.
- 판정기준은 문자열 또는 배열을 지원한다.
- `1.0.0` 처럼 접두사 없이 입력한 판정기준은 `contains:1.0.0` 처럼 처리한다.
- 여러 판정기준은 모두 검사하며 하나라도 실패하면 FAIL 이다.
- OR 조건은 한 줄에서 콤마로 작성한다. 예: `contains:1.0.0,1.0.1`

### 층위 — AND 와 OR 이 섞이는 두 지점

혼동을 피하기 위해 두 층을 나란히 둔다.

| 층 | 분리자 | 의미 |
|---|---|---|
| **rule 간** | 줄바꿈(`\n`, `\r`) 또는 세미콜론(`;`) | **AND** — 모든 rule 이 PASS 여야 최종 PASS ([AGENTS.md](AGENTS.md) 명세). 하나라도 FAIL 이면 FAIL. |
| **값 내부** (`contains:` 뒤) | 콤마(`,`) | **OR** — 토큰 중 하나라도 매치되면 그 rule PASS. |

예: `contains:vlan 1,vlan 4096`  → rule 하나, OR 시맨틱 (둘 중 하나만 있어도 PASS)
예: `contains:vlan 1\ncontains:vlan 4096` → rule 두 개, AND (둘 다 있어야 PASS)

세미콜론(`;`) 이 rule 분리자에 포함된다는 사실은 문서화되지 않았다면 값에 `;` 를 쓸 때 잘림 오탐이 날 수 있다 — [DEBT-0004](../harness/bugs.md#debt-0004) 참조.

### ⚠️ 폴백 규칙 (여러 줄 판정기준 작성 시 주의)

`re.split(r"[\r\n;]+", criteria)` 는 rule 분리자이므로, **여러 줄 판정기준의 2번째 줄부터는 앞 줄의 키를 물려받지 않는다.** `:` 가 없는 rule 은 `contains` 로 폴백된다.

각 키별 영향:

| 키 | 폴백 후 결과 | 위험도 |
|---|---|---|
| `contains` (첫 줄) → contains (2번째 줄 폴백) | 우연히 AND 유지 (원래 rule 간 AND 명세와 일치) | 낮음 (오탐 없음, 다만 OR 의도라면 착각 가능) |
| `contains_all` (첫 줄) → contains (2번째 줄 폴백) | 우연히 AND 유지 (contains_all 시맨틱과 결과 동일) | 낮음 (결과 동일) |
| `not_contains` (첫 줄) → contains (2번째 줄 폴백) | **의미 반전** (부정 → 긍정) | 🔴 높음 — [BUG-0002](../harness/bugs.md#bug-0002) |
| `regex` (첫 줄) → contains (2번째 줄 폴백) | 정규식이 리터럴 문자열 매치로 | 🔴 높음 |
| `baseline` (첫 줄) → contains (2번째 줄 폴백) | 무관한 contains 판정이 추가됨 (다만 baseline 자체가 [제거 예정](../harness/bugs.md#removal-0001)) | 🔴 높음 |

**작성 규칙:** 여러 줄 판정기준을 쓸 때는 **매 줄에 키를 명시**한다. 예:
```
not_contains:error
not_contains:timeout
```
`not_contains:error\ntimeout` 은 두 번째 줄이 `contains:timeout` 으로 폴백되어 의미가 반전된다.

### 지원 판정기준

- `contains:value1,value2` — 한 줄이면 콤마 구분 OR. 값 안에 리터럴 백슬래시+n(`\n` 두 글자)이 있으면 여러 줄 블록 완전 일치 모드로 전환 — [DEBT-0003](../harness/bugs.md#debt-0003) 참조. **실제 개행(0xa)이 있으면 rule 분리자로 소진되어 개별 rule이 된다** (블록 매치 아님).
- `contains_all:value1,value2` — 모든 토큰이 매치되어야 PASS. 값 안에 콤마 또는 개행이 있으면 각각 토큰으로 분리 (`contains_all` 만 값 내부에서도 개행을 토큰 분리자로 인정 — 결과는 rule 간 AND 와 동일해 실질 차이 없음, 다만 파싱 경로는 이원화되어 있음).
- `not_contains:value1,value2` — 하나라도 매치되면 FAIL
- `regex:pattern`
- `interface_connected`

### 🚫 제거 예정 (신규 사용 금지)

- **`baseline:key` / `baseline:device_id/key`** — 제거 결정됨. 실사용 0건, UI 미구현 상태로 백엔드 코드만 잔존. [REMOVAL-0001](../harness/bugs.md#removal-0001) 참조.

레거시 문법(`||`, `line_include/line_exclude`)은 옛 데이터 호환을 위해 코드가 유지되지만, `baseline` 은 **완전 제거 대기 중**이라는 점이 다르다.

**매칭 특성:**
- 판정 매칭은 **대소문자를 구분하지 않는다** (장비/펌웨어별 CLI 출력 케이스 차이 흡수 목적). 대소문자 정확 매치가 필요한 문법(`contains_cs:` 등)은 없음 — [bugs.md](../harness/bugs.md) 부채 참조.
- 부분문자열 매치 (단어 경계 미적용). `contains:UP` 이 `uptime`/`SUPPORT` 에도 매치될 수 있음 — [bugs.md](../harness/bugs.md) BUG-0001 참조.

신규 Test Procedure UI 는 사용 편의성을 위해 `regex` 와 `interface_connected` 메뉴를 숨긴다. 기존 저장 데이터 호환을 위해 내부 판정 로직은 이 두 문법도 계속 해석한다.

**레거시 문법 (신규 사용 금지, 옛 데이터 호환용):**
- `||` 단독 줄로 나누는 OR 그룹 — UI 미노출, 실사용 0건.
- `line_include:` / `line_exclude:` — UI 미노출, 실사용 0건.

(과거 명세) Baseline 기준을 클릭하면 기존 `device_id/key` 선택이 유지된 상태로 picker 가 열려야 한다. Baseline picker 는 선택한 Baseline 의 raw 출력 미리보기와 편집 진입을 제공해야 한다. → **[REMOVAL-0001](../harness/bugs.md#removal-0001)** 대상.

장비 출력에 다음 오류 패턴 중 하나라도 포함되면 FAIL (대소문자 무관, 서브스트링): `[오류]`, `% invalid input`, `invalid input`, `unknown command`, `command not found`, `syntax error`, `permission denied`, `authentication failed`. 정상 출력에 `syntax error` 등이 포함되면 오탐 위험 — [bugs.md](../harness/bugs.md) 부채 참조.

Cycle 결과의 step 에는 `result`, `reason`, `output`, `pass_criteria` 를 남긴다.

## 개발 규칙

- Python 인터프리터는 `sys.executable` 을 사용한다. `py -3.11` 처럼 버전 하드코딩 금지 (venv 는 3.13, 앞으로 바뀔 수 있음).
- 데이터 접근:
  - A 그룹 리소스 (`tc`/`req`/`cycle`/`manuals`) 는 반드시 `backend/db.py` 헬퍼를 사용한다. 파일 접근 금지.
  - 컨테이너 파일은 `_kv_load_sync/_kv_save_sync` (sync) 또는 `db.kv_get/kv_set` (async) 을 사용한다.
  - 아직 파일 정본인 컨테이너는 `load_json/save_json` 을 유지한다.
- 프론트엔드 신규 페이지는 `frontend/static/js/NN-<name>.js` 로 추가한다. `index.html` 에 `<script>` 태그 + 페이지 `<div>` + `06-nav-misc.js` 라우팅 세 곳을 함께 갱신한다.
- WebSocket 이벤트를 추가할 때는 프론트의 `handleCycleWS` 등 수신부도 함께 갱신한다.
- 실행 중 Dashboard 는 WebSocket 이벤트에 의존한다. 폴링으로 실행 중 상태를 무리하게 대체하지 않는다.
- 실행한 시험 목록은 서버 부담을 고려해 5초 이상 주기로 유지한다.
- UI 변경 시 기존 색상 변수와 인라인 스타일 패턴을 우선 사용한다.
- TC/REQ/Cycle ID 는 URL 에 쓰이므로 `encodeURIComponent` 처리를 주의한다.

## 수정 시 주의사항

- `device` / `device_access` 테이블에는 실제 IP, username, password, enable password 가 평문으로 들어간다(2026-08-02 결정). DB 덤프를 외부로 공유하거나 커밋하지 않는다. 장비 CSV 내보내기는 기본적으로 비밀번호를 뺀다.
- `backend/main.py` 의 `ssh_exec` 이름은 남아 있지만 내부 구현은 Netmiko 이다. 호출부 호환성을 위해 이름을 쉽게 바꾸지 않는다.
- Netmiko 는 내부적으로 Paramiko 를 사용하므로 warning 에 Paramiko 가 보일 수 있다. 앱 코드에서 직접 Paramiko 를 쓰는 것은 피한다.
- `scripts/launcher.py` 는 서버 프로세스 종료 처리와 연관되어 있다. Ctrl+C, 창 닫기, 서버 중지 동작을 깨뜨리지 않도록 주의한다.
- `data/baselines/` 는 [제거 예정](../harness/bugs.md#removal-0001). 실제 저장 파일 0개. 새 파일 생성 금지.
- Baseline 관련 API (`/api/baselines/...`) 는 [제거 예정](../harness/bugs.md#removal-0001). 신규 참조 금지.
- 예외를 삼키지 않는다. `except Exception: pass` 대신 최소한 `print(f"[모듈.함수] 실패: {e}", flush=True)` 로 로그를 남긴다. device_catalog 회귀가 이 패턴으로 은폐된 사례가 있다.
- `frontend/index.html` 은 여러 script 를 로드하는 진입점이다. 개별 로직 수정은 해당 `static/js/<탑메뉴>/*.js` 에서 한다.
- **JS 는 탑메뉴(topnav) 기준 폴더**에 둔다 — `_shared/` `dashboard/` `tests/` `reports/` `cycles/` `resources/` `system/` `board/` `todo/`. 폴더가 곧 담당 메뉴다. 파일을 옮기면 `index.html` 의 `<script src>` 와 `eslint-suppressions.json` 키를 같이 고친다.
- **`data/` 루트에 파일을 새로 만들지 않는다.** 설정은 `data/config/`, 외부 연동은 `data/integrations/`, 런타임 상태는 `data/state/`, MIB 추출물은 `data/snmp/`. `data/` 구조를 바꾸면 `.gitignore` 의 경로도 반드시 같이 고친다 — 경로가 어긋나면 토큰이 든 파일이 조용히 추적 대상이 된다.
- **`backend/stc/*.py` 는 대부분 subprocess 로 독립 실행**된다(`__main__` 있음). 실행 시 `sys.path[0]` 이 `backend/stc` 라 형제 import(`from stc_traffic import ...`)가 동작한다. 파일을 흩으면 깨지므로 같이 움직여야 한다. `stc_live.py` 만 main.py 가 `from stc.stc_live import StcLive` 로 import 하고, 그래서 `stc/__init__.py` 가 있다. `stc_resv_registry.json` 은 모듈이 `os.path.dirname(__file__)` 로 찾으므로 .py 와 같은 폴더에 있어야 한다.
- **`.tcl` 중 코드가 부르는 것은 `n2x/n2x_daemon.tcl` 하나**뿐이다(`main.py` 의 `N2X_DAEMON`). 나머지 6개는 수동 실행용이라 참조가 없다.
- **저장소 루트에는** 도구가 루트에서 찾는 설정 파일과 사용자 진입점(`launcher.bat`, `start.bat`)만 둔다. 그 외는 담당 폴더로 (`scripts/` `tools/` `backend/` `data/` `docs/`).
- **절대경로 하드코딩 금지.** `C:\utop` 같은 경로 대신 `Path(__file__).resolve().parent…` / `Split-Path -Parent $PSScriptRoot` 로 저장소 루트를 구한다.

## 기술 부채 — 프론트엔드 예외 처리

`frontend/static/js/` 전반에 빈 catch 블록이 대략 1,400건 존재한다. 신규 코드에서는 다음 규칙을 지키고, 기존 파일을 만질 때 눈에 띄면 함께 정리한다:

- `except Exception: pass` 금지 규칙(백엔드)과 동일 취지: 최소한 콘솔 로그를 남긴다. `catch (e) { console.warn('[모듈.함수] 실패:', e); }` 정도.
- ESLint 의 `no-empty` 는 현재 `off` — 이 부채를 한꺼번에 잡으려 규칙을 켜면 CI 가 즉시 실패한다. 새 파일에는 개별적으로 `/* eslint no-empty: error */` 파일 상단 지시자를 사용해도 좋다.
- 대략 유형: 빈 catch ~1,432건, 그 외 빈 try/if/else 블록 ~258건 (자동 집계, 오차 있음).

## 시크릿 취급

- `sk-ant-`, `sk-`, 토큰, 비밀번호가 포함된 파일을 절대 커밋하지 않는다.
- 자격증명이 있는 파일은 `.gitignore` + `.sample` 템플릿 (예: `data/integrations/llms.json` / `.sample`).
- 답변에 API 키나 장비 비밀번호를 그대로 출력하지 않는다. 시크릿 필드 검증 시 프리픽스 12자, 길이, 형태만 노출한다.
- 이미 트래킹된 파일에서 시크릿이 발견되면: (1) 해당 시크릿을 rotate, (2) 파일을 `git rm --cached` + `.gitignore`, (3) 필요 시 히스토리 정리는 사용자 결정.

## 커밋 규칙

- 기능 단위로 즉시 커밋한다. 워킹트리에 여러 작업을 쌓아두지 않는다.
- `git add -A` / `git commit -a` 금지. 경로를 명시한다.
- 커밋 전 `git status --short` 로 스테이지 내용을 사용자에게 보고한다.
- 하나의 커밋이 1,000줄을 넘으면 분리 가능한지 먼저 검토한다.
- 파일 이동은 별도 커밋 (`git rename` 감지가 되면 그대로 유지). 이동과 내용 수정을 섞지 않는다.
