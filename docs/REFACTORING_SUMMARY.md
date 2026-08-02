# REFACTORING_SUMMARY.md

> ⚠️ 이 문서는 과거 기록입니다. 더 이상 갱신하지 않습니다.
> `backend/stc_session.py` `stc_reserve.py` 는 이후 `backend/stc/` 하위로 이동됐고, `frontend/_port_work/` `backend/main.req.tc.cycle.py` 는 계획 단계 임시명으로 실제 생성되지 않았습니다.
> 현재 구조는 [architecture.md](architecture.md) 참조.

> NetTest Automation(ubiQuoss-TOP) **동작 보존 리팩토링** 최종 보고서
> 작성일: 2026-07-01 · 범위: 사용자 선택 **Tier A + B (최저위험)** · git 부재 → 스냅샷 기반 안전 진행
> 관련 문서: [REFACTORING_PLAN.md](REFACTORING_PLAN.md), [BUG_REPORT.md](BUG_REPORT.md)

---

## 1. 요약

- **정밀 분석**: 15개 영역 병렬 분석 → **227건 findings + 36건 의심 버그** 수집.
- **실제 리팩토링**: 위험도 **저위험·동작 보존 자명**한 것만, **4개 파일 / 6개 변경**.
- **기능·API·DB·UI·문구·라우팅·권한 변경 0건.**
- **버그 수정 0건** (36건 모두 `BUG_REPORT.md`에 기록만).
- 모든 변경 후 **컴파일·모듈 import·라우트 계약 검증 통과.**

---

## 2. 리팩토링한 파일 목록 및 변경 내용

| # | 파일 | 변경 | Tier | 종류 |
|---|---|---|---|---|
| 1 | `backend/engine.py` | 모듈 상수 `_STATUS_LABELS` 추가 후, 동일 리터럴 `{"PASS":"Pass","FAIL":"Fail","N/A":"N/A"}` **5곳**을 상수 참조로 교체 | B1 | 상수 추출(중복 제거) |
| 2 | `backend/main.py` | 모듈 상수 `_SNMP_TYPE_NAMES` 추가 후, 동일한 SNMP 타입명 dict 리터럴 **2곳**을 상수 참조로 교체 | B2 | 상수 추출(중복 제거) |
| 3 | `backend/stc_session.py` | ① 미사용 `import re` 제거 ② 영구 죽은 표현식 `portA = stc.get(...) if False else None` 제거 | A5·A2 | 미사용 import·죽은 코드 |
| 4 | `backend/stc_reserve.py` | 미사용 `import os` 제거 | A5 | 미사용 import |

### 변경 상세(정확한 diff)

**engine.py** — 헬퍼 영역에 상수 추가, 5개 호출부 교체
```python
+ _STATUS_LABELS = {"PASS": "Pass", "FAIL": "Fail", "N/A": "N/A"}
...
- result = {"PASS": "Pass", "FAIL": "Fail", "N/A": "N/A"}.get(result, result)
+ result = _STATUS_LABELS.get(result, result)      # 711, 747, 760, 809, 910
```

**main.py** — SNMP 상수 영역에 추가, snmp_set_api 내 2개 교체
```python
+ _SNMP_TYPE_NAMES = {"i": "Integer", "u": "Unsigned", "c": "Counter32", "g": "Gauge32", "t": "TimeTicks", "s": "String", "a": "IpAddress", "x": "Hex"}
...
- _tnn = {"i": "Integer", ...}.get(tt, tt)
+ _tnn = _SNMP_TYPE_NAMES.get(tt, tt)              # 2921, 2945
```

**stc_session.py**
```python
- import re                                                   # (regex 사용처 0건 확인 후 제거)
- portA = stc.get(devA, "AffiliatedPort-targets") if False else None   # 항상 None·미사용·부작용 없음
```

**stc_reserve.py**
```python
- import os                                                   # (os 사용처 0건 확인 후 제거)
```

---

## 3. 기능 변경이 없음을 확인한 근거

1. **상수 추출(engine/main)** — 추출한 dict가 원본 리터럴과 **바이트 단위 동일**함을 런타임으로 검증했고(`eval(추출값)==원본`), `.get(x, x)`의 결과가 **정의역 안/밖 모든 키에서 동일**함을 확인. → 수학적으로 동일한 동작.
2. **미사용 import 제거(stc_session `re`, stc_reserve `os`)** — 각 모듈에서 `re.`/`os.` 사용처가 **0건**임을 grep로 확증. import 제거는 네임스페이스에서 미참조 이름만 제거하므로 동작 무관.
3. **죽은 표현식 제거(stc_session `portA`)** — `if False`로 `stc.get(...)`이 **절대 실행되지 않아** 부작용 없음. `portA`는 항상 `None`이며 이후 **어디서도 읽히지 않음**(grep 확인). → 제거해도 값·부작용 불변.
4. **공개 계약 불변** — FastAPI 라우트를 경로+메서드 기준으로 before/after 비교: **200개 전부 동일**(라인번호만 시프트). engine.py 라우터 9개도 동일.
5. **on-disk JSON 포맷·응답 구조·전역 상태·로드 순서** — 손대지 않음.

---

## 4. 실행한 검증 명령어 및 결과

> 런타임: `.venv\Scripts\python.exe` (Python 3.13). `py -3.11`은 현재 셸에서 미해결이라 venv 사용.

| 검증 | 명령 | 결과 |
|---|---|---|
| 문법(전체) | `python -m py_compile backend/*.py launcher.py tools/mib_enums.py` | ✅ ALL COMPILE OK |
| 모듈 로드 | `cd backend && python -c "import main, engine"` | ✅ import OK (부작용 SNMP MIB 로드까지 정상) |
| 앱 라우트 | `len(main.app.routes)` | ✅ **214** (200 API + 프레임워크 기본), 변경 전후 동일 |
| 라우트 계약 | 경로+메서드 정렬 후 `diff` (스냅샷 vs 현재) | ✅ **100% 동일** (main 200, engine 9) |
| 상수 동치 | 추출 상수 == 원본 리터럴, `.get(x,x)` 동작 동일 | ✅ True |
| 목적외 변경 | 스냅샷 대비 전체 `diff` | ✅ 계획한 6개 변경 외 **0건** |

### 수동 스모크(권장 — 미실행)
자동 테스트 스위트가 없어 아래는 **사용자가 실행 권장**하는 육안 확인 항목입니다(코드가 이미 로드·컴파일됨을 확인했으므로 회귀 가능성은 낮음):
- `start.bat` 기동 → `http://localhost:8000` 로드, 콘솔 에러 0
- 로그인 → 대시보드 → REQ/TC 목록·상세 → 리포트/사이클 → 게시판
- TC 실행 시 P/F 라벨 표시(=engine 판정 경로) 정상
- SNMP SET 시 타입명 표시(=main `_SNMP_TYPE_NAMES` 경로) 정상

---

## 5. 발견했지만 수정하지 않은 버그

**총 36건 — 전부 [BUG_REPORT.md](BUG_REPORT.md)에 기록, 하나도 수정하지 않음.**
주요 항목:
- 🔴 `main.py:1559` `return tid` 뒤 **도달 불가** REQ 마이그레이션 블록(죽은 코드이나 "실종된 마이그레이션"일 수 있어 삭제 보류)
- 🔴 `main.py:3415` N2X 데몬 동시 스폰 **경합**(락 범위 밖 stdin/stdout)
- 🔴 `main.py:1950` 주인 없는 chat 세션을 비관리자도 삭제 가능(권한 갭 가능성)
- 🔴 `stc_session.py:23` 세션 격리 주석 vs 실제 공유 세션 불일치, `stc_live.py:289` chassis 폴백으로 엉뚱한 포트 보고
- 🟡 engine 판정 조기반환 비대칭(regex re.error, OR 그룹 None), 프론트 상태값 한/영 혼재 카운트 불일치 등

---

## 6. 추가로 리팩토링하면 좋은 부분 (미수행 — 위험/승인 필요)

계획서의 **Tier C/D**에 해당하며 이번 범위(A+B) 밖입니다. 가치는 크나 동작 보존 검증 부담이 커서 **사용자 승인 후 단위별** 진행을 권장합니다.

### 높은 가치·중위험 (Tier C — 함수 내부 분해, 전역/라우트 불변)
- `engine.py:279` **judge_by_criteria (200줄)** → 판정 key별 내부 헬퍼 분할(elif 순서·`value 미지정 시 key 재해석` 기본규칙 보존 필수).
- `main.py:2161` **run_cli (147줄)**, `2455` **session_open (fast/slow 이중 구현)** → 내부 헬퍼 추출(스트리밍·프롬프트 순서 보존 검증 필수).
- `04-testcase.js` **tcCheckRun (333줄)** / **tcTabProcedure (366줄)**, `07-report.js:504` **cycleRenderExecTable (150줄)** → 파일 내 지역 함수 분해.
- `launcher.py` `_build_ui`(115줄)/`_apply_theme`(70줄) → 위젯그룹별 메서드 분할.

### 구조적 최대 가치·고위험 (Tier D — 파일 분리·모듈화, 별도 세션 권장)
- **`main.py` 6,719줄 → 도메인별 라우터 파일 분리**(사용자·STC·N2X·Dify/RAG·Jira·게시판 등). 최대 구조 문제이나 전역 상태/락/캐시가 얽혀 최고 위험. 파일당 1개씩 극소 단위 이관 + 매 단계 회귀 검증 필요.
- **`backend/stc_*.py` 6모듈 공통 로직 공유 모듈 추출** — 세션획득/포트파싱/포트상태스캔이 대량 중복(21건)이나 각 모듈이 독립 subprocess라 공유 모듈 도입이 import·실행 계약에 영향.
- **프론트 escape/포맷/트리 헬퍼 공통화, index.html 인라인 CSS 외부화** — 전역 이름·로드 순서 계약 변경 위험.

### 정리 후보(삭제 아닌 "기록" — 승인 시 별도 처리)
- 코드 미참조 폐기물: `_backup/`, `_port_work/`, `frontend/_port_work/`, `backend/main.req.tc.cycle.py`
- 자기명시 미사용 JS 함수: `05-stc-rack.js:1713 _renderModelReg_OLD_unused`, `05-stc-rack.js:765/793 stcGenPortMap` 이중 정의(뒤가 승리), `02-dashboard.js` topo 에디터 이중 정의(호이스팅 의존)
- `launcher.py:126 _c()` 미사용 헬퍼
- (삭제는 이번 "동작 보존" 범위 밖으로 판단해 미수행)

---

## 7. 위험하거나 의도적으로 건드리지 않은 부분

계획서 §3(금지 리스트)대로 아래는 **손대지 않았습니다**:
1. `except Exception: pass` **169건** — 예외 삼킴 자체가 동작.
2. **프론트 `esc` 헬퍼 통합(~135회)** — ⚠️ **겉보기 중복이나 이스케이프 문자셋이 제각각 다름**(예: `&"`만 vs `&<>` vs `<`만). 통합 시 출력 HTML이 바뀌어 **동작 변경** → 통합 금지.
3. **`load_json`/`save_json` main vs engine 통합** — engine 버전만 `path.parent.mkdir()` 부작용 있음. 통합 시 디렉터리 생성 동작 변화.
4. **STC/N2X Tcl·타이밍 코드**(subprocess 스트리밍, sleep, 409 재시도, 포트 예약 레지스트리 back-fill).
5. **netmiko 세션 캐시 + import-time monkeypatch**(main.py:2056-2100).
6. **SNMP GET/SET 재시도·타입후보 루프**, **인증/권한**(토큰·세션TTL·pbkdf2), **임베딩 캐시 포맷·RAG 스코어 상수**, **메일 템플릿 문구**, **모든 JSON 포맷**, **JS 전역 이름·로드 순서**.
7. `engine.py`의 **중복 netmiko import**(최상단 12줄 vs 함수내 173줄) — 제거 시 **모듈 로드 실패 조건이 바뀔 수** 있어(netmiko 미설치 시 import 실패 타이밍) 보류.
8. 함수내 지역 `import json`(예: main.py:4165) — Python 지역/전역 **스코프 결정이 바뀌는** 변경이라 "자명" 기준 미달로 보류.

---

## 8. 안전망 (롤백 방법)

git이 없어 작업 전 **코드 스냅샷**을 확보했습니다:
```
_refactor_snapshot/20260701_143000/   (4.6MB — backend, frontend/static, index.html, launcher.py, tools)
```
문제 발생 시 해당 스냅샷에서 파일 복원으로 즉시 롤백 가능. (데이터/벤더/대용량은 스냅샷 제외 — 변경 대상이 아님.)

> **참고**: 근본적 안전을 위해 이 프로젝트를 **git 저장소로 초기화**할 것을 권장합니다(리팩토링 범위 밖이라 미실행). 원하시면 `git init` + 초기 커밋을 도와드리겠습니다.
