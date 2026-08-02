# REFACTORING_PLAN.md

> ⚠️ 이 문서는 과거 기록입니다. 더 이상 갱신하지 않습니다.
> 계획 단계의 임시 파일명(`frontend/_port_work/`, `backend/main.req.tc.cycle.py` 등)은 실제로 만들어지지 않았습니다.
> 현재 구조는 [architecture.md](architecture.md) 참조.

> **목적**: NetTest Automation(ubiQuoss-TOP) 프로젝트를 **동작 100% 보존** 전제 하에 구조만 개선한다.
> 버그 수정·기능 변경·UI/문구/라우팅/DB/응답형식 변경은 **하지 않는다.** 발견한 버그는 `BUG_REPORT.md`에 기록만 한다.
>
> **작성 근거**: 15개 영역 병렬 정밀 분석(main.py 전 범위·engine.py·backend/stc_*.py·launcher.py·프론트 JS 13개 모듈·index.html) → 총 **227건 findings + 36건 의심 버그** 수집. 아래는 그 종합이다.

---

## 0. 선행 사실 (리팩토링 안전성에 직접 영향)

| 항목 | 상태 | 함의 |
|---|---|---|
| **git 저장소** | ❌ 없음 | diff/롤백 안전장치 없음 → **작업 전 코드 스냅샷 필수** |
| **테스트 스위트** | ❌ 없음 | 자동 회귀검증 불가 → 수동 검증 체크리스트로 대체(테스트 프레임워크 신규 도입 금지) |
| **린트/빌드/타입체크 설정** | ❌ 없음 (pyproject/eslint/package.json 부재) | `python -m py_compile`(문법)·수동 로드만 가능 |
| **실행 방식** | `start.bat` → `uvicorn main:app --reload` (backend/), 또는 `launcher.py`(Tkinter GUI) | 진입점 = `backend/main.py:app` |
| **프론트 로딩** | `index.html`이 CDN 15개 + `/static/js/01~13.js`를 순서대로 로드, 전역 스코프 공유(모듈 없음) | JS 로드 순서·전역 이름 = **동작 계약**, 변경 금지 |

### 이미 존재하는 백업/폐기물 (코드에서 참조되지 않음 — 삭제 아닌 "기록"만)
- `_backup/20260701_104253/`, `_port_work/`, `frontend/_port_work/` — 작업 폐기물(코드 미참조)
- `backend/main.req.tc.cycle.py` — 구버전(미참조)
- `Ubiquoss/STC_UDP.py` — **주석에서 "검증된 REST 시퀀스 원본"으로 참조됨 → 참조자료로 보존, 건드리지 않음**

---

## 1. 현재 구조 요약

```
c:\utop\
├─ backend\
│  ├─ main.py            6,719줄 / 318KB  ← 최대 문제. FastAPI 라우트 200개·함수 333개 단일 파일
│  ├─ engine.py          1,042줄          ← 실행/판정 엔진 + PPTX + 라우터 혼재
│  ├─ stc_session.py     563줄  ┐
│  ├─ stc_traffic.py     492줄  │
│  ├─ stc_live.py        342줄  ├ Spirent STC REST 연동(6개 모듈, 상호 대량 중복)
│  ├─ stc_meter.py       252줄  │
│  ├─ stc_reserve.py     141줄  │
│  ├─ stc_conncheck.py   114줄  ┘
│  └─ *.tcl              (IXIA N2X Tcl 데몬 — 타이밍 민감, 건드리지 않음)
├─ frontend\
│  ├─ index.html         1,432줄 / 124KB  ← 인라인 CSS 5블록 + 페이지 셸 46개 + 모달 8개
│  └─ static\js\01~13.js 총 ~30,000줄     ← 전역 스코프, 모듈 없음
│     (04-testcase 5,298 · 05-stc-rack 5,282 · 07-report 3,297 · 02-dashboard 3,322 ...)
├─ launcher.py           477줄            ← Tkinter GUI 런처
├─ tools\mib_enums.py    124줄
└─ data\ (JSON 저장소 · 런타임 상태 — 스키마/포맷 변경 절대 금지)
```

### main.py 논리 영역 (섹션 배너로 구분되어 있음)
1~1300 경로/presence/LLM레지스트리/자원/사용자·인증/메일/브랜딩/조직설정 · 1112~1980 절차학습/AI로그/REQ·TC CRUD/휴지통 · 1843~3110 netmiko(telnet/ssh)/SNMP/트랩 · 3110~3735 STC위저드/N2X데몬 · 3735~4490 STC영속세션/각종CRUD/LLM프록시/Dify · 4184~5523 Dify/RAG·임베딩/Confluence · 5523~6719 Confluence/Jira/이슈싱크/게시판

---

## 2. findings 집계

| 종류 | 건수 | 위험도 | 건수 |
|---|---:|---|---:|
| duplication (중복) | 100 | low (저위험) | 105 |
| oversized_function | 27 | medium | 95 |
| extractable_util | 19 | high | 27 |
| magic_constant | 16 | | |
| mixed_responsibility | 16 | **의심 버그(수정금지)** | **36** |
| complex_conditional | 14 | | |
| dead_code | 11 | | |
| naming | 9 | | |
| unused_import | 4 | | |
| oversized_file | 4 | | |

**코드로 실측 확인된 규모**
- main.py: 함수 내부 지역 `import` **71건** 산재 (`import re as _re/_ri/_rs/...`, `import httpx`, `import json as _json` 등)
- main.py: `except Exception: pass` / bare except **169건** ← 대부분 의도적 fire-and-forget. **동작이므로 절대 제거/변경 금지**
- 프론트: HTML escape 헬퍼가 13개 파일에 **~135회 재선언** (04-testcase 56 · 09-system-init 23 · 05-stc-rack 19 ...)

---

## 3. ⚠️ 변경하지 않을 영역 (금지 리스트)

> 아래는 "중복·거대함수처럼 보여도" 통합/분리 시 **동작이 바뀌므로 손대지 않는다.**

1. **`except Exception: pass` 169건** — 예외 삼킴은 그 자체가 동작. 로깅 추가·재raise·구조 변경 금지.
2. **프론트 `esc` 헬퍼 통합 금지 (중대)** — 겉보기 중복이나 **각기 이스케이프 문자셋이 다름**:
   - `01-core:996` = `&` `"` / `01-core:1625` = `&` `<` `>` / `09-system-init:1315` = `"`만 / `09-system-init:1594` = `<`만 ...
   - → 하나로 합치면 **각 호출처의 출력 HTML이 달라짐 = 동작 변경.** 통합하지 않는다.
3. **`load_json`/`save_json` main.py vs engine.py 통합 금지** — engine 버전은 `path.parent.mkdir(...)` 부작용이 있고 main 버전은 없음. 합치면 디렉터리 생성 동작이 달라짐.
4. **STC/N2X Tcl 연동·타이밍 코드** — subprocess 스트리밍, `sleep`, 409 재시도 루프, 포트 예약 레지스트리 back-fill 등. 타이밍/순서 의존. 위험도 high.
5. **netmiko 세션 캐시 + import-time monkeypatch(main.py:2056-2100)** — 접속 상태 전역 캐시와 netmiko 내부 패치. 순서·부작용 의존.
6. **SNMP GET/SET 재시도·타입후보 루프** — 동작 로직.
7. **인증/권한 로직** (`_user_from_token`/`_require_admin`/세션 TTL/pbkdf2 iterations/salt) — 값·흐름 불변.
8. **임베딩 캐시 포맷(.npy), RAG 하이브리드 스코어 상수(20 vs 24 등)** — 검색 결과 순위가 바뀔 수 있음.
9. **메일 템플릿 문자열·placeholder 치환** — 발송 문구 = 사용자 노출. 문구 변경 금지.
10. **모든 on-disk JSON 포맷**(`ensure_ascii=False, indent=2`, 키 이름, id 생성식) — 응답/DB 계약.
11. **프론트 JS 전역 이름·로드 순서·`window._*` 플래그** — 파일 간 계약.
12. **02-dashboard.js의 topo 에디터 "이중 정의"**(draw.io판이 Fabric.js판에 의해 덮어써짐) — 겉보기 dead code지만, 이는 **호이스팅/재정의 순서에 의존하는 현재 동작.** 죽은 앞쪽 정의를 지우면 안전할 것 같지만 위험도 high로 분류 → **1차 범위 제외, 보고서 기록.**

---

## 4. 리팩토링 대상·방향 (허용 작업만)

> 전략: **저위험·국소(single-file, in-place)부터.** 파일 분리(모듈화)는 위험도가 높아 후순위 또는 사용자 승인 후.

### Tier A — 최저위험 / 국소 / 즉시 가능 (파일 내부, 동작 불변 자명)
| # | 대상 | 작업 | 근거 |
|---|---|---|---|
| A1 | `engine.py:12` & `:173` | 중복된 `from netmiko import ConnectHandler` 정리(함수 내 재import가 실사용 → 최상단 미사용분 판단 후 정리, **단 실행경로 동일 확인**) | unused_import |
| A2 | `stc_session.py:357` | `portA = ... if False else None` **영구 죽은 표현식** 제거(항상 None) | dead_code, 결과 불변 |
| A3 | `05-stc-rack.js:1713` `_renderModelReg_OLD_unused` | 자기명시 unused·호출처 없음 → **보고서 기록**(삭제는 승인 후) | dead_code |
| A4 | `main.py` 함수 내 **모듈 최상단에 이미 있는** 지역 import(`import json as _json` 등 중복) 정리 | 최상단에 존재함이 확인된 것만, 별칭 사용처 없는 것만 | unused/dup import |
| A5 | 각 파일 **명백한 unused import**(stc_session의 `re`, stc_reserve의 `os` 등, grep로 무사용 확증된 것만) | 제거 | unused_import |
| A6 | `launcher.py` `_c()` 헬퍼(호출처 없음) | 보고서 기록(삭제 승인 후) | dead_code |

### Tier B — 저위험 / 상수·매핑 추출 (동작 동일, 가독성↑)
| # | 대상 | 작업 |
|---|---|---|
| B1 | `engine.py` 상태라벨 정규화 `{"PASS":"Pass","FAIL":"Fail","N/A":"N/A"}.get(x,x)` ×5 | 모듈 상단 상수 `_STATUS_LABELS` 1개로, 값·동작 완전 동일 |
| B2 | `main.py` SNMP 타입명 표시맵(2919/2943 동일 dict) | 함수 밖 상수 1개 |
| B3 | STC 모듈들의 기본 상수(chassis `192.168.5.100`, rest_port `8888`, `set_timeout(90)`) | **각 모듈 파일 상단 상수화(파일 내부만)** — 모듈 간 공유는 하지 않음(import 의존 신설 위험 회피) |
| B4 | 프론트 상태→색 매핑(`{'Pass':...,'Fail':...}`) 파일 내 중복 | **같은 파일 내에서만** 상단 const로. 파일 간 통합은 안 함(로드순서 위험) |
| B5 | `05-stc-rack.js` SNMP OID 대형 리터럴 배열(≈280줄) | 동작 아닌 순수 데이터 → 같은 파일 상단(혹은 별도 데이터 파일)로 이동은 **승인 후**(로드 계약 영향 검토 필요) |

### Tier C — 중위험 / 함수 내부 분해 (파일·전역 불변, 내부만)
| # | 대상 | 작업 |
|---|---|---|
| C1 | `engine.py:279-478 judge_by_criteria`(200줄) | 판정 key별 **내부 헬퍼로 분할**하되 elif 체인 순서·기본규칙(`value 비고 시 key 재해석`) **완전 보존**. 각 분기 결과 동일 검증 |
| C2 | `main.py:2161 run_cli`(147줄), `:2455 session_open`(fast/slow) | 내부 블록을 **모듈 내 private 헬퍼**로 추출, 전역/라우트 시그니처 불변. **동작·스트리밍 순서 보존 확인 필수** → 위험, 승인 후 |
| C3 | `04-testcase.js` `tcCheckRun`(333줄)·`tcTabProcedure`(366줄) | 파일 내부 지역 함수로 분해, 전역 이름·onclick 계약 불변 → 위험, 승인 후 |
| C4 | `launcher.py` `_build_ui`(115줄)/`_apply_theme`(70줄) | 위젯그룹별 내부 메서드로 분할, GUI 동작 동일 |

### Tier D — 고위험 / 파일 분리·모듈화 (기본 범위 제외, 별도 승인 필수)
- **main.py(6,719줄) 도메인별 라우터 파일 분리** — 가장 큰 구조 문제이나 FastAPI 앱/전역상태/락/캐시가 얽혀 있어 최고 위험. **1차 리팩토링에서 제외.** 사용자가 원하면 별도 단계로, 파일당 1개씩 극소 단위 이관 + 회귀 검증.
- **stc_*.py 6모듈의 공통 로직 공유 모듈 추출** — 중복은 크나(세션획득/포트파싱/포트상태스캔) 각 모듈이 subprocess 독립 실행이라 공유모듈 도입이 import·동작에 영향. **제외/승인 후.**
- **frontend JS 모듈 세분화·index.html 인라인 CSS 외부화** — 로드 계약 변경 위험. **제외/승인 후.**

---

## 5. 기능 변경이 발생하지 않도록 지킬 기준 (불변식)

1. **공개 계약 불변**: FastAPI 라우트 경로·메서드·요청/응답 JSON 키·상태코드, 프론트 전역 함수명·`onclick` 이름, on-disk JSON 포맷.
2. **"보이는 중복"이라도 바이트 단위로 동일함을 확인하기 전엔 통합 금지.** (esc/ load_json 사례 참조)
3. **예외 처리 블록의 삼킴/재raise/로깅은 손대지 않는다.**
4. **타이밍·순서 의존 코드**(sleep, 재시도, 스트리밍 pump, 세션 캐시)는 리팩토링하지 않는다.
5. **상수 추출은 값이 완전히 동일할 때만**, 별칭·타입·정밀도 변화 없이.
6. **한 커밋(=한 단위)에 한 가지 변경.** 각 단위마다 검증 후 진행.
7. **애매하면 하지 않는다 → 보고서에 기록.**

---

## 6. 리팩토링 순서 (안전 → 위험)

```
0) 안전망 스냅샷 확보 (§8)         ← 필수 선행
1) Tier A (죽은 표현식·명백한 unused import) — 파일 내부, 결과 자명
2) 각 단위 검증 (py_compile / JS 문법 / 수동 로드)
3) Tier B (완전 동일 상수·매핑 추출)
4) 각 단위 검증
5) Tier C (함수 내부 분해) — 사용자 승인 후, 단위별로
6) Tier D (파일 분리) — 별도 승인·별도 세션 권장
```

각 Tier 종료 시 서버 기동 + 주요 화면 스모크 확인.

---

## 7. 검증 방법 (테스트 스위트 신규 도입 금지)

**정적**
- `py -3.11 -m py_compile backend\main.py backend\engine.py backend\stc_*.py launcher.py` (문법 무결)
- 변경 함수의 시그니처·라우트 데코레이터 **before/after diff = 0** 확인 (grep로 라우트 목록 스냅샷 비교)
- JS: 브라우저 콘솔 에러 0 확인(문법). 전역 함수 목록 before/after 동일 확인.

**동적(수동 스모크)**
- `start.bat`로 서버 기동 → `http://localhost:8000` 로드, 콘솔 에러 없음
- 대표 경로: 로그인 → 대시보드 → REQ/TC 목록·상세 → 리포트/사이클 → 게시판 → (가능 시) 장비 CLI 접속 1회
- 변경한 영역 위주 육안 확인(예: engine 판정 변경 시 TC 실행 P/F 동일)

**동작 동일성 근거 확보**
- 각 변경 단위마다: "무엇을/왜/동작보존 근거"를 `REFACTORING_SUMMARY.md`에 기록
- Tier A/B는 결과가 수학적으로 동일(상수·죽은코드) → 근거 자명
- Tier C는 입력→출력 동일성을 대표 케이스로 확인

---

## 8. 안전망 (git 부재 → 필수)

작업 착수 직전, **코드 디렉터리만** 스크래치 위치로 스냅샷(데이터/벤더 제외 시 ≈4.6MB로 저렴):
```
backend\  frontend\  launcher.py  tools\
```
- 방식: 스냅샷 폴더 복사(예: `_refactor_snapshot/<timestamp>/`) + 변경 파일별 `.bak`.
- data\, MIB\, .venv\, _n2x_api.txt(5.5MB) 등 대용량·런타임 상태는 제외.
- 롤백: 문제 시 스냅샷에서 해당 파일만 복원.
- (신규 툴/의존성 추가 아님 — 단순 파일 복사.)

---

## 9. 발견했지만 수정하지 않은 항목 (요약 — 상세는 BUG_REPORT.md 예정)

- 의심 버그 **36건** 수집됨(예: `main.py:1559` `return tid` 뒤의 도달 불가 REQ 마이그레이션 블록, poller 플래그를 태스크 생성 전에 True로 세팅 등) → **수정 금지, BUG_REPORT.md에 기록.**
- 보안 관찰: 루트에 **API 키 형태 파일명**(`sk-ant-...txt`, 0바이트)·`.env` 노출 → 보고서 기록(리팩토링 범위 밖).

---

## 10. 다음 단계

이 계획대로라면 **§8 스냅샷 → Tier A → Tier B**까지는 동작 보존이 자명하여 바로 진행 가능합니다.
**Tier C/D(함수 분해·파일 분리)는 위험도가 있어 사용자 승인 후 단위별로** 진행하겠습니다.

> 진행 승인 신호("작업해")를 주시면 §8 스냅샷부터 시작합니다.
> Tier 범위(어디까지 이번에 할지)에 대한 선호가 있으면 알려주세요.
