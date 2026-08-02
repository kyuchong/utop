# Test Cycle 서버 실행 이관 — 단계별 설계서

> **목표**: 실행 중인 TC가 **브라우저 새로고침·페이지 이동과 무관하게 멈추지 않고 계속 진행**되도록, 시험 실행 주체를 브라우저 → 서버로 이관한다.
> **방식**: 설계 우선 · 단계별(각 단계 독립 출시/검증, 미이관 케이스는 기존 브라우저 러너로 그대로 동작).
> 작성일: 2026-07-01 · 근거: 4-에이전트 정밀 분석 + 단계 설계 워크플로우.

---

## 0. 왜 서버 이관이 유일한 해법인가 (확정 사실)

- Test Cycle 실행은 **100% 브라우저 JS**(`_cbAutoRunGo`, [07-report.js:2170](frontend/static/js/07-report.js#L2170))에서 돈다. **새로고침하면 그 루프가 물리적으로 죽는다.** 코드로 막을 수 없다(브라우저 동작).
- 재개(브라우저에서 이어 실행)는 **상태 변경 스텝 재실행으로 FAIL**을 유발한다:
  - N2X `Traffic Start`: 트래픽 구동 중 StreamGroup 리스트 잠김 → `Cannot add an item to a locked list` (계측기 오류)
  - SNMP SET / 설정 CLI: 이미 적용된 상태 재투입 → 중복 에러
- 시험 변수(`_procVars`)는 **메모리 전용** → 새로고침 시 소멸, 중간 스텝 재개 불가.
- **결론: "브라우저 실행 + 새로고침에도 안 멈춤"은 동시 불가.** 서버에서 실행해야 브라우저와 무관하게 계속 진행된다.

---

## 1. 목표 아키텍처

```
[Browser]                          [Server (FastAPI)]                    [Files]
  cbAutoRun ──POST /api/cycle/{id}/run──► run_cycle_bg()
    │  (선택 keys)                          │ asyncio.create_task (백그라운드, 브라우저와 무관)
    │                                       │ for tcid: for step:
    │  handleWS(cycle_*) ◄──WS──            │   실행(CLI/SNMP/meter) + 판정 + 변수
    │  진행률/스텝 렌더                        │   step 결과 in-place 갱신
    │                                       │   broadcast(cycle_step_done) ──WS──►
    │                                       │   save_json(cycle_file) ──► cycles/{id}.json (스텝별)
    │                                       │   write run_state ────────► run_state/{id}.json (live 위치)
    │                                       └── broadcast(cycle_run_done)
  [새로고침/이동]
    initWS → ws.onopen ──GET /api/cycle/{id}/run-state──► run_state 읽어 반환
    └─ run-state로 live 배너/강조 복원 → 이후 WS로 계속 갱신
```

**핵심 3요소**
1. **background task** — `run_cycle`을 요청-응답 수명에서 분리(`asyncio.create_task`, 선례 [main.py:3803](backend/main.py#L3803) STC 폴러). 브라우저가 죽어도 루프 생존.
2. **per-step 영속화 2군데** — (a) `cycles/{id}.json` 스텝 결과 in-place(현재 [engine.py:943](backend/engine.py#L943)의 루프 끝 1회 저장 → 스텝별로), (b) `run_state/{id}.json` 라이브 포인터.
3. **reconnect restore** — WS는 replay 없음 → 재접속 시 `GET run-state`로 **pull**(스냅샷 1회) 후 WS **push**로 이어받음.

---

## 2. GAP 테이블 (스텝 타입별 서버 이관 비용)

| Step type | engine.py 현재 | 이관 작업 | 노력 |
|---|---|---|---|
| **CLI (SSH/TELNET)** | ✅ `run_tc_step`(518)·`judge_cli_result`(485) | 없음 | **S** |
| **판정 criteria** (contains/line/range/equals/regex/baseline/OR그룹) | ✅ `judge_by_criteria`(283) | 없음 | **S** |
| **대기(Wait)** | ✅ `_execute_cycle_item`(791) `asyncio.sleep`(30s cap) | cap/파싱 프론트 일치 | **S** |
| **SNMP GET** | ❌ 미지원(N/A) | main.py `snmp_get_api`(2765) 재사용 | **M** |
| **SNMP SET** | ❌ 미지원 | `snmp_set_api`(2855)+set-enum(2723) 재사용 | **M** |
| **N2X/STC meter** | ❌ 미지원 | `_cbRunMeterStep`(07:2113) 액션→엔드포인트 매핑·통계·상태 이식 | **L** |
| **Ping** | ❌ 미지원 | 서버 ping 실행기 신규 | **M** |
| **호출(sub-TC)** | ❌ 미지원 | 대상 TC 로드해 재귀 실행 | **M** |
| **loop/IF/switch** | ❌ 없음 | `_checksToSteps.expand()`(07:726) 언롤 + `_evalCond`(04:2247) | **L** |
| **expr 판정** | ❌ 없음 | `_evalCond/_evalOneCmp/_calcExpr`(04:2247/2233/2257) | **L** |
| **table 판정** | ❌ 없음 | `_judgeTable`+파서군 `_tableCols/_extractTableCell`(04:2496~2561) | **L** |
| **diff 판정** | 부분(baseline만) | `_judgeDiff` excludeLines 이식 | **M** |
| **변수 치환** `_subVars`(`${x}`,`colN('row')`,`#N.colM`,산술) (04:2459) | ❌ 전무 | 파이썬 포팅 | **L** |
| **변수 추출** `_extractVar/_stepExtracts/_varSetAuto` (04:1590~2588) | ❌ 전무 | 파이썬 포팅 + per-TC 변수 스토어 | **L** |

**솔직한 결론:** CLI+기본 criteria+대기는 서버가 **이미 됨**(Stage 1 즉시 가능). **고급 판정(expr/table/diff)과 변수(치환/추출)가 진짜 큰 포팅**이고, **pass/fail 결과가 조용히 바뀔 수 있는 최대 리스크**(Stage 3).

---

## 3. 단계 (각 단계 독립 출시·검증, 미이관은 브라우저 폴백)

### Stage 0 — Run-state 인프라 + WS 재접속 복원 (실행 이관 없음)
- `engine.py`: `RUN_STATE_DIR` + `write_run_state/read_run_state/clear_run_state`
- `main.py`: `GET /api/cycle/{id}/run-state` 신규(3866 근처)
- `01-core.js handleWS`(24): `cycle_run_start/tc_start/step_start/step_done/tc_done/run_done` → `cbOnCycleWS(msg)` 위임
- `01-core.js ws.onopen`(13): 재접속 시 현재 사이클 `GET run-state` → `cbRestoreFromRunState()`
- **주의:** Stage 0 단독으로는 "새로고침한 그 브라우저의 실행 지속"은 **해결 안 됨**(실행이 브라우저에 있는 한). 관찰(read) 인프라 + Stage 1 전제. → **Stage 1과 같은 스프린트로 함께 출시 권장.**

### Stage 1 — CLI-only 사이클 서버 실행 (⭐ refresh-proof 최초 달성)
- `engine.py run_cycle`(888): 루프를 `_run_cycle_bg`로 분리 + `asyncio.create_task`(즉시 `{started}` 반환). run_state·cycle 파일 **스텝마다 저장**.
- `engine.py`: `_cycle_all_server_executable(cycle, keys)` 게이팅 — 전 스텝이 CLI/대기이고 고급판정·변수 없을 때만 True. 아니면 `{unsupported:true}` → 프론트 브라우저 폴백.
- `07-report.js cbAutoRun`(2165): 선택 keys가 **CLI-only이면** `POST /api/cycle/{id}/run` 후 **WS 렌더만**(로컬 루프 스킵). 하나라도 미지원이면 **기존 `_cbAutoRunGo` 그대로**.
- **CLI-only 사이클은 이 단계부터 새로고침/이동에도 서버가 계속 실행.**

### Stage 2 — SNMP GET/SET 서버 이관
- `_execute_cycle_item` SNMP 분기(796)를 실제 실행으로. `snmp_get_api`/`snmp_set_api` 내부 재사용. 단순 값 비교만 Stage 2(table형은 Stage 3).

### Stage 3 — 변수 + 고급 판정 파이썬 포팅 **[최대 리스크]**
- `_subVars/_extractVar/_judgeCheck/_judgeTable/_judgeDiff/_evalCond` + 테이블 파서군 JS→Python 1:1 포팅.
- **판정을 재구현하므로 pass/fail이 조용히 바뀌면 시험 신뢰성 붕괴.** → §4 패리티 하니스로 **0 불일치 확인 전엔 서버 게이팅에 넣지 않음**(계속 폴백).

### Stage 4 — meter/N2X/STC + loop/IF/switch + 대기(정밀)
- 계측기 액션 매핑·상태(`_tStart/_tStop`) 서버 보관, loop 언롤/IF 분기 이식. 완료 시 **전 스텝 서버 실행 가능**, 브라우저 러너는 폴백/오프라인용으로만 잔존.

**공통 규칙:** 게이팅 판정기에 지원 타입을 **하나씩 추가**. 미지원 타입이 하나라도 있으면 그 사이클은 **통째로 브라우저 폴백**(부분 서버/부분 브라우저 혼합 금지 — 변수 스코프·상태 꼬임 방지).

---

## 4. "PASS/FAIL 안 바뀜" 전략 — 패리티 하니스

서버 판정/변수 = 브라우저 판정/변수 **동일**을 기계로 증명한 뒤에만 서버 게이팅 편입.
- **판정 골든 엔드포인트(dev)** `POST /api/debug/judge`: `{output,criteria,type,query,excludeLines,baseline,vars}` → `{result,reason}`.
- **브라우저 골든 export**: 동일 입력으로 `_cbJudgeStep`/`_judge*` 돌려 `{input, jsResult}` JSON 덤프(실측 사이클 step 대량).
- **패리티 스크립트(파이썬, scratchpad)**: 각 케이스를 `/api/debug/judge`에 던져 `pyResult` vs `jsResult` diff → **0 불일치 목표.**
- **변수도 동일**: `_subVars/_extractVar` 골든 케이스 diff.
- **E2E 이중 실행**: 대표 사이클을 브라우저/서버 각각 `--dry`(output 고정 주입)로 실행 → step `result` diff = 0.
- **게이트**: 그 타입 골든셋 패리티 0 불일치일 때만 게이팅에 추가.

---

## 5. 리스크 & 롤백

| Stage | 리스크 | 롤백 |
|---|---|---|
| 0 | run-state 오류로 배너 오표시 | 순수 추가물 — 제거하면 원복 |
| 1 | 스텝별 I/O 부하; cycle 파일 **동시쓰기 충돌**(브라우저 saveCycle vs 서버); 게이팅 오판 | 게이팅 보수적; 서버 실행 중 사이클은 브라우저 saveCycle **skip**; `POST /run` 라인 제거로 전면 브라우저 복귀 |
| 2 | pysnmp 블로킹으로 루프 정지 | `asyncio.to_thread` 격리+timeout; SNMP 게이팅 제외 |
| 3 | **판정/변수 불일치로 pass/fail 오변경** | 패리티 미통과 타입은 게이팅에 애초에 안 넣음 → 자동 브라우저 유지 |
| 4 | 계측기 상태 누락/중복 트래픽; loop 언롤 불일치 | meter 게이팅 제거로 폴백 |

**공통 킬스위치:** `cycle_server_run_enabled` 설정 플래그 — 문제 시 즉시 전면 브라우저 복귀.

---

## 6. 검증 (테스트 프레임워크 없음 → 수동 + 소형 패리티 스크립트)

- **Stage 0:** 실행 시작 → 다른 탭에서 같은 사이클 열기 → WS 진행 보이는지. `curl GET run-state`로 running/tcid/seq 확인.
- **Stage 1:** CLI-only 사이클 실행 → **실행 중 F5** → 서버 계속 진행, 재접속 후 남은 스텝 채워지는지. **탭 닫고 다른 PC에서 열어도** 결과 쌓이는지. SNMP/meter 섞인 사이클은 여전히 브라우저로.
- **Stage 2:** SNMP 스텝 output/result가 브라우저 실행 때와 동일한지 대조.
- **Stage 3:** **패리티 스크립트** 실측 케이스 전량 0 불일치.
- **Stage 4:** meter 이중 실행 diff; loop/IF 전개 diff.
- **회귀 공통:** 대표 사이클 5종 브라우저/서버 이중 실행 step result diff=0.

---

## 7. 지금 구현할 최소 안전 슬라이스 (First Concrete Step)

**"CLI-only 사이클이 새로고침을 견딘다"를 실증** = Stage 0 복원 인프라 + Stage 1 서버 실행/게이팅을 CLI-only에 한정해 함께.

작은 순서:
1. `engine.py`: `write/read/clear_run_state` + `_execute_cycle_item`(810 루프) 스텝마다 run_state write & `save_json(cycle_path)`(TC 단위 최소). `run_cycle`(888) → `asyncio.create_task(_run_cycle_bg)` 비동기화(즉시 `{started}`).
2. `engine.py`: `_cycle_all_server_executable(cycle, keys)` — 전 스텝 CLI/대기 + 고급판정/변수 미포함일 때만 True. False면 `{unsupported:true}`.
3. `main.py`: `GET /api/cycle/{id}/run-state`(3866 근처).
4. `01-core.js handleWS`(24): `cycle_step_done/tc_done/run_done` → `cbOnCycleWS`. `ws.onopen`(13): 현재 사이클 run-state pull → 복원.
5. `07-report.js cbAutoRun`(2165): CLI-only면 `POST /api/cycle/{id}/run`만 + WS 렌더, 아니면 기존 `_cbAutoRunGo`. `cbOnCycleWS`/`cbRestoreFromRunState` 신규(기존 `cbItemsHtml`/`cbCycleProgressHtml` 재사용).

→ 이 슬라이스만으로 **CLI-only 사이클은 새로고침·페이지이동에도 서버가 계속 실행**, 브라우저는 재접속해 이어서 본다. 그 외 사이클은 **손대지 않은 브라우저 러너로 100% 동일 동작**.

**⚠️ 필수 주의:** 스텝별 `save_json`과 브라우저 `saveCycle`([06-nav-misc.js:1392](frontend/static/js/06-nav-misc.js#L1392))이 **같은 `cycles/{id}.json`에 동시 쓰기** 가능. 첫 슬라이스에서 반드시 처리 — **서버 실행 중인 사이클은 브라우저 `saveCycle`을 skip**(실행 오너십을 서버로).

---

## 현재 상태

### ⛔ Stage 1 되돌림 (2026-07-01) — 판정 불일치 위험으로 롤백

**되돌린 이유:** 서버 실행/브라우저 실행의 판정 코드가 **완전히 별개로 재구현**되어 있어(서버 `judge_by_criteria` vs 브라우저 `_judgeCheck`), 같은 CLI 스텝인데 **Pass/Fail이 갈릴 수 있는 케이스**가 확인됨. 게이팅으로 못 막는 실제 갈림:
- **장비 선택 방식 상이**: 브라우저=항목별·모델별·랩 3단계, 서버=사이클당 1개(SSH 우선) → 다른 장비 → 다른 출력 → 다른 결과
- **CLI 트랜스포트 상이**: 브라우저=`/api/run-cli`(netmiko), 서버=paramiko `exec_command` → 출력 텍스트 자체가 다름
- **`contains` 콤마 처리**: 브라우저=리터럴, 서버=토큰 분해(정반대)
- **대소문자**: 브라우저 구분, 서버 무시
- **출력 오류문구 강제 FAIL**(서버만), **빈 criteria 기본값 상이**, **excludeLines 무시**(서버)

시험 합불 판정이라 이 불일치는 허용 불가 → **전면 롤백.** 현재는 **기존 브라우저 실행(판정 100% 동일)**으로 복귀.

**롤백 내용:** engine.py의 Stage 1 블록(run-server/run-state/게이팅/백그라운드) 제거, 01-core.js·07-report.js·08-milestone-cycle.js의 추가분 제거. 라우트 수 214로 복귀. 기존 `run_cycle`/`_execute_cycle_item` 등은 원래부터 미변경.

> **재추진 조건(향후):** 서버 실행을 다시 하려면 §4 **패리티 하니스로 브라우저=서버 판정 0 불일치를 먼저 증명**하고, **장비 선택·트랜스포트·contains/대소문자/빈criteria/excludeLines를 브라우저와 완전히 일치**시킨 뒤에만. 그 전엔 서버 실행 금지.

---

### (참고) 이전에 구현했던 Stage 1 내용 — 롤백됨
사용자 선택: 판정 재구현 없는 **Stage 1만** (동작·판정 차이 없음 보장).

**구현 내용**
- **engine.py** (라우터 정의 뒤, 기존 `run_cycle`은 미변경·격리):
  - `RUN_STATE_DIR` + `write/read/clear_run_state` — 서버 실행 상태 파일(`data/run_state/{id}.json`)
  - `_step_server_safe(st)` — 스텝이 서버 실행 안전한지(대기 또는 CLI+단순판정+변수無). SNMP·계측기·변수·expr/table/diff는 False
  - `_cycle_server_runnable(cycle, keys)` — 선택 keys 전부 안전할 때만 True
  - `_run_cycle_server_bg` — 백그라운드(`asyncio.create_task`) 실행, **기존 `_execute_cycle_item` 재사용(판정 동일성 보장)**, TC마다 사이클 파일 + run-state 저장, WS 브로드캐스트
  - `POST /api/cycle/{id}/run-server` — CLI-only면 백그라운드 시작, 아니면 `{unsupported}`
  - `GET /api/cycle/{id}/run-state` — 재접속 복원용 스냅샷
- **01-core.js**: `handleWS`에 `cycle_*` 이벤트 → `cbOnCycleWS` 위임; `ws.onopen`에 `cbRestoreFromRunState()`
- **07-report.js**: `_cbAutoRunGo` 진입 시 단일사이클+CLI-only면 `POST /run-server` 시도 → 성공 시 브라우저 루프 skip(WS 렌더만), `{unsupported}`면 **기존 브라우저 루프 폴백**. `cbOnCycleWS`(진행 반영), `cbRestoreFromRunState`(재접속 복원) 추가
- **08-milestone-cycle.js**: `initCyclePage`에 `cbRestoreFromRunState()` 호출
- **index.html**: 01 `20260701a`, 07 `t`, 08 `e` 캐시버스터

**동작**
- CLI 스텝만 있는 사이클 → 서버 백그라운드 실행 → **새로고침·페이지이동에도 서버가 계속 진행**, 재접속 시 run-state+WS로 복원
- SNMP·계측기·변수·고급판정 포함 사이클 → **기존 브라우저 러너로 100% 동일 동작**(폴백)
- 판정은 서버가 기존 `judge_cli_result`/`judge_by_criteria` 사용 → **브라우저와 동일**

**⏳ 남은 것: 백엔드 재시작** (현재 `--reload` 없음 → engine.py 새 라우트 미반영).
`powershell -ExecutionPolicy Bypass -File <저장소>\scripts\restart-server.ps1` 실행 후 활성화됨.
프론트엔드(JS)는 이미 서빙 중이라 재시작 불필요.

**검증(재시작 후 필요)**
- CLI-only 사이클 실행 → 실행 중 F5 → 서버 계속 진행, 재접속 후 남은 스텝 채워지는지
- SNMP/계측기 섞인 사이클 → 여전히 브라우저로 도는지(폴백)
- `curl GET /api/cycle/{id}/run-state`로 running/tcid/seq 확인

### 다음 단계 (원할 때)
Stage 2(SNMP) → 3(변수+고급판정, 패리티 검증 필수) → 4(계측기/루프). 각 단계 §3 참조.
