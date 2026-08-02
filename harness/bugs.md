# Bugs & Debt

문서와 코드 동작이 어긋나거나, 알려진 함정을 관리하는 대장.

- **BUG**: 명세 위반. 언젠가 코드로 고쳐야 함. 재발방지 필드에 회귀 테스트 위치.
- **DEBT**: 코드는 의도된 대로 동작하나 개선 여지가 있는 것. 재발방지는 `manual` (사람 리뷰).
- **REMOVAL**: 제거 결정된 기능. 별도 구획에서 관리.

새 항목 추가 시 `BUG-NNNN` / `DEBT-NNNN` / `REMOVAL-NNNN` 형식으로 번호 순차 부여.

## 규약

- **`@pytest.mark.xfail(strict=True)` 는 "올바른 동작"이 확정된 경우에만 쓴다.** 확정 전이면 현재 동작을 고정하는 일반 테스트 + DEBT 로 남긴다. 잘못된 명세를 xfail 로 박아 넣으면 누군가 "고치면" xpass 로 성공 신호를 내면서 원래 명세를 부순다.
- **REMOVAL 항목은 반드시 `상태` 와 `근거` 필드를 채운다.**
  - `상태: 확정` — 사용자가 직접 제거를 확인한 것만. 이 상태의 항목만 실제 삭제 근거로 쓸 수 있다.
  - `상태: 후보` — 계획 문서·리팩터링 제안·과거 메모·자동 조사로 발견된 것. 확정 승격 전엔 삭제 근거 불가.
  - `근거` — "사용자 확인 (YYYY-MM-DD 대화)", "docs/…의 …절", "커밋 hash" 등 사후 검증 가능한 출처.
- 계획 후보를 확정으로 착각해 삭제하면 살아있는 기능이 사라진다. 이 대장이 유일한 관문.

---

## BUG-0001 — 판정 매칭에 단어 경계 미적용 (심각도: low)

- **명세**: 코드 동작이 곧 명세이나, `contains` 문법이 서브스트링 매치라는 사실이 사용자에게 명시적으로 안내되지 않음.
- **증상**: `contains:UP` 이 `System uptime is 3 days`, `backup completed`, `GROUP 1` 같은 출력에도 매치되어 실제 상태와 무관하게 PASS 될 수 있음. 대소문자 무관 매칭([DEBT-0002](#debt-0002))과 결합되어 오탐 표면적이 커짐.
- **실증 조사** (2026-07-27):
  - `contains:UP` / `contains:OK` 를 쓰는 step 11건 전수 검사.
  - 원본 output → 상태 토큰만 뒤집은 변형본 (`UP` → `DOWN`) → 판정 재실행.
  - 판별력 있음(원본 PASS / 변형 FAIL) 9건, 판별력 없음 0건, 세션 실패로 판정 대상 없음 2건.
  - **실오탐 사례 미발견** — 현재 데이터셋 한정.
- **위험**: 신규 짧은 토큰(예: `contains:GO`, `contains:ON`)이 추가되면 즉시 오탐 발생 가능. 현재는 우연히 안 걸린 상태.
- **재발방지**: `test:tests/test_judgement.py::test_contains_up_rejects_down_interface` (xfail(strict=True) — "올바른 동작=단어 경계 적용" 이 확정된 상태라 규약에 부합. 고쳐지면 xpass 로 마커 제거 신호).
- **고칠 때 방향 후보**: 단어 경계 인식 문법 도입 (`contains_word:` 또는 opt-in), 또는 `contains` 를 기본 단어 경계로 바꾸고 기존 데이터 마이그레이션.

---

## BUG-0002 — 여러 줄 판정기준 폴백 규칙 (심각도: medium)

- **증상**: 여러 줄 판정기준에서 2번째 줄부터 첫 줄의 키를 물려받지 못하고, `:` 없는 줄이면 무조건 `contains` 로 폴백된다. `re.split(r"[\r\n;]+", criteria)` 가 rule 분리자이기 때문.
- **실제 오판정** (2026-07-27 조사): **0건**.
  - 실제 개행 포함 판정기준 26건 전수 확인: `contains_all` 25건 + `contains` 1건.
  - `contains_all` / `contains` 는 폴백 결과가 AND 라 문서화된 rule 간 AND 명세와 일치. LGUPLUS-REQ-L2-E59xxRL-TC-002 (`vlan 1\nvlan 4096`) 포함, 실질적으로 잘못된 판정을 낸 사례 없음.
- **잠재 경로** (실사용 0건, UI 위젯이 input 이라 도달 어려움):
  - `not_contains` → 폴백된 2번째 줄이 **의미 반전** (부정 판정 → 긍정 판정)
  - `regex` → 정규식이 리터럴 문자열로
  - `baseline` → 무관한 contains 판정 추가
- **표면화 조건**: 해당 타입에 textarea UI 도입, 또는 마이그레이션·수동편집으로 여러 줄 데이터가 위 3개 타입으로 유입.
- **재발방지**: `test:tests/test_judgement.py::test_multiline_not_contains_keeps_negation` (xfail(strict=True) — "올바른 동작=매 줄이 첫 줄의 키 유지" 는 명세로 확정 가능, 규약에 부합).
- **고칠 때 방향 후보**: rule 분리 시 첫 줄의 key 를 이어지는 줄에도 전파, 또는 UI 에서 매 줄에 키를 명시하도록 강제.

---

## DEBT-0001 — 오류 패턴 감지의 서브스트링 매치 (재발방지: manual)

- **명세**: [conventions.md](../docs/conventions.md) — 8개 오류 패턴 중 하나라도 포함되면 FAIL.
- **부채**: `syntax error`, `command not found`, `invalid input` 이 정상 출력에 문자열로 포함되면 (예: help 텍스트, 스크립트 로그) 오탐 FAIL 가능.
- **개선 방향**: 줄 시작 앵커(`^`) 추가 검토. 또는 장비 프롬프트 뒤 첫 응답 라인만 대상으로 판정.
- **재발방지**: manual (실오탐 사례 나오면 BUG 승격).

---

## DEBT-0002 — 대소문자 구분 판정 문법 부재 (재발방지: manual)

- **명세**: 판정 매칭은 대소문자 무관 (장비 CLI 출력 케이스 차이 흡수 목적, 의도된 동작).
- **부채**: 대소문자를 반드시 구분해야 하는 판정(예: 특정 필드명 정확 매치)이 필요할 때 문법이 없음. `contains_cs:` 같은 opt-in 문법 검토.
- **재발방지**: manual (필요 사례 나오면 문법 추가).

---

## DEBT-0003 — 블록 매치 경로 (레거시, 재발방지: manual)

- **코드 위치**: [engine.py:335-341](../backend/engine.py#L335) — `contains` 값 안에 리터럴 `\n` (백슬래시+n 두 글자) 이 있으면 여러 줄 블록 완전 일치 모드로 전환.
- **도달 가능성**: UI 로는 우회적으로 가능 (input 위젯에 사용자가 `\`+`n` 두 글자를 직접 타이핑). 실사용 0건.
- **함정**: 실제 개행(0xa) 은 rule 분리자로 소진되어 개별 rule 이 되고, 리터럴 백슬래시+n 만 블록 매치를 발동. 같은 입력처럼 보이는 두 값이 다르게 동작.
- **재발방지**: manual. 문서 상 "레거시. 신규 사용 금지" 로 표시 ([conventions.md](../docs/conventions.md)).

---

## DEBT-0004 — 세미콜론이 rule 분리자에 포함 (재발방지: manual)

- **코드 위치**: [engine.py:322](../backend/engine.py#L322) — `re.split(r"[\r\n;]+", criteria)`.
- **함정**: 사용자가 판정기준 값에 `;` 를 쓰면 rule 로 분리되어 값이 잘림. 예: SNMP 출력 라인, 설정 커맨드에 `;` 가 들어가는 경우.
- **실사용**: 0건. 표면화 사례 없음.
- **재발방지**: manual. 문서에 명시.

---

## DEBT-0005 — `jira-ai-beta` 명칭 정리 (재발방지: manual)

- **위치**: [frontend/index.html:173, 1039](../frontend/index.html#L173) `page-jira-ai-beta`, [_shared/06-nav-misc.js:22, 111](../frontend/static/js/_shared/06-nav-misc.js#L22), [_shared/09-system-init.js:697](../frontend/static/js/_shared/09-system-init.js#L697), [_shared/05-stc-rack.js:4946+](../frontend/static/js/_shared/05-stc-rack.js#L4946) `renderJiraAi`
- **함정**: 이름이 `-beta` 지만 실제로는 유일한 "지식 검색" 페이지. 구 `jira-ai` 는 옛 URL 호환용으로 자동 리다이렉트됨. beta 라는 이름이 오해를 유발 (제거 후보로 보임).
- **개선 방향**: `jira-ai-beta` → `jira-ai` 로 명칭 이관 (또는 `knowledge-search` 같은 의미 명확한 이름). URL 리다이렉트 방향 반대로 조정.
- **재발방지**: manual (실제로 REMOVAL-0002 로 잘못 등록됐던 사례. 명칭 오해 → 제거 시도).

---

## DEBT-0006 — n2x reserve for-loop 를 batch 로 통합 (재발방지: manual)

- **위치**:
  - batch API: [main.py:4797 n2x_reserve_batch](../backend/main.py#L4797) — 사전 헬스체크·포트 상태 조회·다른 세션 점유 시 시도 스킵(hang 방지)
  - 개별 API: [main.py:4878 n2x_reserve](../backend/main.py#L4878) — recovery 로직만 있음, 사전 hang 방지 없음
  - 미이관 호출부: [reports/07-report.js:2472](../frontend/static/js/reports/07-report.js#L2472) `for (i=0; i<_pz.length; i++) { await _post('/api/n2x/reserve', ...) }`
- **함정**: 07-report.js 는 for + await 순차 발사라 batch 주석의 "병렬 파이프 race" 조건에는 안 걸리지만, batch 가 제공하는 사전 hang 방지가 없어 다른 세션이 잡은 포트를 만나면 요청이 hang 될 수 있음.
- **실장애 이력**: 없음 (CHANGELOG 언급 0건).
- **개선 방향**: 07-report.js 의 for-loop 를 `/api/n2x/reserve-batch` 한 번 호출로 통합.
- **재발방지**: manual.

---

# 제거 예정 (REMOVAL)

기능 폐기가 결정된 항목. 코드 잔존물이 완전히 사라질 때까지 이 대장에서 관리한다.
각 항목의 진행 상태와 남은 잔존물 위치를 정확히 기록.

## REMOVAL-0001 · Baseline 기능

- **상태**: 확정
- **근거**: 사용자 확인 (2026-07-28 대화)
- **계획**: [harness/removals/baseline.md](removals/baseline.md)
- **현재 상태**: 백엔드 코드 잔존. 프론트 UI 없음. 실사용 0건.
- **실사용**: 판정기준 `baseline:` 사용 0건 / `data/baselines/` 파일 0개 / 프론트 "Baseline 관리" 페이지 없음
- **남은 잔존물**:
  - `backend/engine.py`
    - `BASELINES_DIR` 상수 ([L24](../backend/engine.py#L24))
    - `BASELINES_DIR` mkdir ([L25](../backend/engine.py#L25))
    - `judge_by_criteria` 안 baseline 분기 ([L453-482](../backend/engine.py#L453), ~30줄)
    - `# ── Baseline ──` 섹션: `DEFAULT_MASKS`, `apply_baseline_masks`, `normalize_for_baseline`, `baseline_file_path`, `load_baseline` ([L553-597](../backend/engine.py#L553), ~44줄)
    - `/api/baselines` 라우트 6개 ([L988-1080+](../backend/engine.py#L988))
  - `tests/test_judgement.py`: `normalize_for_baseline`, `apply_baseline_masks`, `DEFAULT_MASKS` 테스트 10개 ([L190-256](../tests/test_judgement.py#L190))
  - `docs/`: 10개 파일에 언급 (`AGENTS.md`, `api-reference.md` [생성물], `architecture.md`, `CHANGELOG.md` [레거시], `conventions.md`, `CURRENT_TASK.md`, `data-model.md`, `INSTALL.md`, `migration-log.md`, `migration-summary.md`)
- **주의**:
  - **프론트 `c.baseline` 필드는 별개 개념**. 04-testcase.js/07-report.js 의 `c.baseline` 은 스텝의 "diff 기준 캡처" 텍스트 필드(스텝별 저장). 백엔드 `data/baselines/<device>/<key>.json` 파일 시스템과 무관 — 제거 대상 아님.
  - `normalize_for_baseline` / `apply_baseline_masks` / `DEFAULT_MASKS` 는 baseline 분기 외에서 사용 없음(tests/에서만 호출). Baseline 제거 시 tests/test_judgement.py 의 관련 테스트도 함께 삭제 필요.
- **검사**: `check:harness/checks/check_removals.py` (미구현)
- **진행**: 미착수

## REMOVAL-0002 · `explorer3-beta` 프론트 잔재

- **상태**: 후보
- **근거**: 자동 조사 (2026-07-28) — 백엔드 라우트 0건, 프론트 24라인 참조, showPage 진입 없음
- **현재 상태**: 프론트 잔재 24라인. 도달 불가.
- **주의**: 데드코드 조사와 통합 처리 대상. 이 항목만 별도로 삭제 작업 만들지 말 것. 확정 승격 전엔 삭제 근거 불가.
- **진행**: 데드코드 감사 대기

## REMOVAL-0003 · `device-reg-beta` 프론트 잔재

- **상태**: 후보
- **근거**: 자동 조사 (2026-07-28) — 백엔드 라우트 0건, 프론트 12라인 참조, showPage 진입 없음
- **현재 상태**: 프론트 잔재 12라인. 도달 불가.
- **주의**: 데드코드 조사와 통합 처리 대상. 확정 승격 전엔 삭제 근거 불가.
- **진행**: 데드코드 감사 대기
