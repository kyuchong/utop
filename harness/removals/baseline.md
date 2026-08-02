# Baseline 기능 제거 계획

[REMOVAL-0001](../bugs.md#removal-0001-baseline-기능) 실행 계획서.

**중요:** 이 문서는 **줄 번호를 쓰지 않는다.** 실제 삭제는 나중이라 줄 번호는 이미 틀어져 있다. 심볼명과 앵커 문자열로 지정한다.

---

## ⚠️ 최상단 경고 — 이름 충돌

**지우면 안 되는 것 (살아 있는 별개 기능):**

- `frontend/static/js/tests/04-testcase.js`: `c.baseline` 필드, `tcStepCapture`, `tcStepClearBaseline`, `type='diff'`
- `frontend/static/js/reports/07-report.js`: `_judgeDiff(output, baseline, ...)`
- → 스텝 안에 diff 기준을 저장하는 살아 있는 별개 기능. 백엔드 `data/baselines/` 파일 시스템과 무관.
- `ctx.textBaseline` 은 Canvas API. 완전 동음이의.

**검색으로 일괄 삭제 절대 금지.** 심볼 단위로 하나씩 확인할 것.

---

## 삭제 대상 (백엔드만)

### `backend/engine.py` — 순서대로

1. **`judge_by_criteria` 함수 안의 `baseline` / `bl` 분기**
   - 앵커: `elif key in ("baseline", "bl"):` 로 시작하는 elif 블록 전체
   - 블록 안에서 호출되는 심볼: `load_baseline`, `apply_baseline_masks`, `normalize_for_baseline` — 이 블록을 지우면 이 세 함수의 유일한 실행 경로가 사라진다
   - 지운 뒤 함수는 다른 elif 로 이어져 정상 동작해야 함 (contains, contains_all, not_contains, regex, interface_connected 는 그대로)

2. **`/api/baselines` 라우트 6개 (모두 `router` 데코레이터)**
   - `list_all_baselines` — `@router.get("/api/baselines")`
   - `list_device_baselines` — `@router.get("/api/baselines/{device_id}")`
   - `get_baseline` — `@router.get("/api/baselines/{device_id}/{key}")`
   - `save_baseline` — `@router.post("/api/baselines/{device_id}/{key}")`
   - `delete_baseline` — `@router.delete("/api/baselines/{device_id}/{key}")`
   - `capture_baseline` — `@router.post("/api/baselines/{device_id}/{key}/capture")`
   - 앵커: `# ── Baseline API ──` 섹션 헤더 이후 첫 라우트부터 이 6개 함수의 마지막 return 까지

3. **`# ── Baseline ──` 섹션 함수 5개**
   - 섹션 앵커: `# ───────────────────────── Baseline ─────────────────────────`
   - `DEFAULT_MASKS` (모듈 최상위 리스트)
   - `apply_baseline_masks(text, extra_masks)`
   - `normalize_for_baseline(text)`
   - `baseline_file_path(device_id, key)`
   - `load_baseline(device_id, key)`
   - 다음 섹션 헤더(`# ───────────────────────── PPTX ─────────────────────────`) 직전까지

4. **`BASELINES_DIR` 상수 + mkdir 루프에서 제외**
   - 앵커: `BASELINES_DIR = DATA_DIR / "baselines"` 라인 삭제
   - `for _d in (PPTX_DIR, ARTIFACTS_DIR, BASELINES_DIR):` — 튜플에서 `BASELINES_DIR` 제거 (튜플이 두 원소가 되어야 함)
   - `data/baselines/` 디스크 폴더는 앱이 더 이상 생성하지 않게 됨. 기존 폴더가 남아 있어도 무해 (파일 0개 상태).

5. **주석 언급 정리**
   - 파일 헤더 첫 줄 근처의 `... · Baseline · ...` 부분 제거
   - `ssh_exec` 함수 위 docstring/주석에서 `Baseline 캡처`, `Baseline 비교 정확`, `Baseline 정합성` 언급 제거 또는 재문구화 (기능 자체는 살아있어야 함)
   - `netmiko_exec` 함수 docstring의 `Baseline 정합성` 언급 제거

### `tests/test_judgement.py` — 삭제 대상 11개 테스트

`normalize_for_baseline` / `apply_baseline_masks` / `DEFAULT_MASKS` import 도 함께 제거.

- `test_normalize_strips_leading_trailing_ws_per_line`
- `test_normalize_collapses_internal_ws`
- `test_normalize_removes_empty_lines`
- `test_normalize_all_together`
- `test_normalize_empty_input`
- `test_default_mask_uptime_wd_format`
- `test_default_mask_uptime_hms`
- `test_default_mask_counters`
- `test_default_mask_speeds`
- `test_extra_mask_applied_after_default`
- `test_invalid_extra_mask_ignored`

앵커: `# normalize_for_baseline` 섹션 헤더부터 `# safe_name` 섹션 헤더 직전까지 (그 사이 `apply_baseline_masks / DEFAULT_MASKS` 섹션 포함).

---

## 보존할 지식 — DEFAULT_MASKS 9개 정규식

코드는 지우되 이 패턴들은 이 계획서에 남긴다. 장비 CLI 출력에서 uptime·카운터·속도·타임스탬프를 걸러내는 도메인 지식이라 재도출이 번거롭다. 향후 다른 용도(예: 일반 CLI diff 뷰어)에서 재활용 가능.

```python
DEFAULT_MASKS = [
    (r"\b\d+w\d+d\b", "**"),
    (r"\b\d+h\d+m\b", "**"),
    (r"\b\d{1,3}:\d{2}:\d{2}\b", "**"),
    (r"\b\d+ days?,\s*\d{1,2}:\d{2}:\d{2}\b", "**"),
    (r"\b\d[\d,]*\s+(packets|bytes|errors|dropped|frames|resets|collisions|overruns|ignored|watchdog)\b", r"** \1"),
    (r"\b\d+(?:\.\d+)?\s+(Kbps|Mbps|Gbps|bps|Kbit/s|Mbit/s|Gbit/s)\b", r"** \1"),
    (r"\b\d+ bits/sec\b", "** bits/sec"),
    (r"\b\d+ packets/sec\b", "** packets/sec"),
    (r"(Last input|Last output|Last clearing of)\s+\S+", r"\1 **"),
]
```

각 패턴의 의도:
1. `3w4d` — 주+일 uptime 표기 (`\bNwNd\b`)
2. `2h30m` — 시+분 uptime 표기
3. `01:23:45` — HH:MM:SS 시간 (기간 또는 시각)
4. `5 days, 01:23:45` — 확장 uptime 표기 ("N days, HH:MM:SS")
5. `12345 packets` / `... bytes/errors/dropped/frames/resets/collisions/overruns/ignored/watchdog` — 카운터. 콤마 자리수 구분(`\d[\d,]*`)도 인식. 유닛만 남김 (`** packets` 처럼).
6. `100 Mbps` / `1.5 Gbps` 등 — 속도. 유닛만 남김 (`Kbps|Mbps|Gbps|bps|Kbit/s|Mbit/s|Gbit/s`).
7. `1500 bits/sec` — 초당 비트
8. `2000 packets/sec` — 초당 패킷
9. `Last input never` / `Last output 00:00:12` / `Last clearing of counters 3w2d` — 마지막 이벤트 시각. 값 부분만 마스킹.

`re.I | re.M` 플래그로 적용된다는 점, 실패한 패턴은 조용히 스킵한다는 점, 사용자 정의 `extra_masks` 는 이 리스트 뒤에 순차 적용된다는 점도 재구현 시 유의.

---

## 삭제 후 검증

기대값을 명시적으로 적어둔다. "줄었다" 로 표현하면 수집 0건이 통과로 보일 수 있다.

- **`python tools/verify.py`** → 9/9 통과, exit 0. 소요 시간 8~10초 대.
- **`pytest`** → 수집 **37건** (현재 48 - 삭제 11 = 37). 실행 결과 `35 passed, 2 xfailed` 예상. 다른 숫자면 스캔 실패 또는 추가 회귀.
- **`docs/api-reference.md`** — 생성물이라 `python tools/gen_api_docs.py` 로 자동 갱신. 라우트 총계가 정확히 6 감소해야 한다 (`/api/baselines` 라우트 6개 제거분).
- **`ruff check .`** → 0건. Baseline 관련 삭제로 unused import 가 생기면 함께 정리.
- **`docs/architecture.md`, `docs/INSTALL.md`** — `data/baselines/` 언급 라인 제거.
- **프론트 존치 확인** — 다음 심볼이 그대로 살아 있어야 함:
  - `c.baseline` (04-testcase.js)
  - `tcStepCapture` (04-testcase.js)
  - `tcStepClearBaseline` (04-testcase.js)
  - `_judgeDiff` (07-report.js)
  - `ctx.textBaseline` (07-report.js, Canvas API 동음이의)
- **스모크** — TC 편집에서 `type='diff'` 스텝을 만들어 `[기준 캡처]` 로 baseline을 잡고 재실행 시 diff 판정이 정상 동작하는지. 이 기능은 백엔드 `data/baselines/` 와 무관하며 스텝 안 `c.baseline` 필드로만 동작함.

---

## 되돌리기

삭제 커밋 해시를 실행 후 이 자리에 기입한다.

```
삭제 커밋: __________ (미실행)
```

`git show <해시>^:backend/engine.py > /tmp/engine_before.py` 로 삭제 직전 원본을 복구할 수 있다. tests/test_judgement.py 도 동일. 부분 복구는 `git checkout <해시>^ -- backend/engine.py` (전체 되돌림 주의).

계획서만 이 파일에 있고 실제 삭제는 별도 세션에서 진행. 진행 시 이 문서의 앵커 문자열을 grep 으로 찾아 확인 후 작업할 것.
