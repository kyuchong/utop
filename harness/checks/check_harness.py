"""하네스 자기 검사 — bugs.md 무결성 + REMOVAL 규약 + 문서 경로 실존.

검사 대상:
  A. harness/bugs.md 의 BUG/DEBT 항목: 재발방지 필드, 심각도, pytest 노드/check 파일 실존
  B. REMOVAL 항목: 상태·근거·계획 필드, 계획서 규약(줄 번호 참조 금지)
  C. docs/**/*.md + harness/**/*.md 의 백틱 경로 실존

verify.py 에서 subprocess 로 호출된다. sys.exit 0 = 통과, 1 = 실패.

빈 입력에 조용히 통과하지 않도록 카운트가 모두 0이면 실패로 취급.
"""
from __future__ import annotations
import re
import subprocess
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent.parent
BUGS_MD = ROOT / "harness" / "bugs.md"

SEVERITIES = {"high", "medium", "low"}
REMOVAL_STATES = {"확정", "후보"}
CMD_STARTS = (
    "python", "npx", "git", "pip", "node", "powershell", "sh", "bash",
    "psql", "createdb", "dropdb", "pg_dump", "pg_restore",
    "ruff", "pytest", "cd", "ls", "grep", "find",
    "curl", "docker", "kubectl", "make",
)
STALE_BANNER_RE = re.compile(r"⚠️\s*이 문서는 과거 기록입니다")
SCHEME_RE = re.compile(r"^[a-z][a-z0-9]*:")  # test:, check:, http:, https:, data: 등

errors: list[str] = []
warnings: list[str] = []
# 통계
_skipped_banner_docs: list[Path] = []
_gitignore_exempt_paths: list[str] = []


def _is_gitignored(path_str: str) -> bool:
    """git check-ignore 로 gitignore 대상인지 확인. 대상이면 True."""
    r = subprocess.run(
        ["git", "-C", str(ROOT), "check-ignore", "-q", path_str],
        capture_output=True, text=True,
    )
    return r.returncode == 0


def add_err(msg: str) -> None:
    errors.append(msg)


def strip_fenced(text: str) -> str:
    """fenced code block 안 내용 제거. 인라인 백틱은 유지."""
    out = []
    in_fence = False
    for ln in text.split("\n"):
        if ln.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence:
            out.append(ln)
    return "\n".join(out)


def parse_sections(text: str, header_re: re.Pattern) -> list[tuple[str, str]]:
    """## 헤더로 섹션 분리. header_re 매치되는 헤더의 (헤더텍스트, 본문) 리스트."""
    lines = text.split("\n")
    sections: list[tuple[str, str]] = []
    cur_header: str | None = None
    cur_body: list[str] = []
    for ln in lines:
        m = re.match(r"^##\s+(.+)$", ln)
        if m:
            if cur_header is not None and header_re.search(cur_header):
                sections.append((cur_header, "\n".join(cur_body)))
            cur_header = m.group(1).strip()
            cur_body = []
        elif cur_header is not None:
            cur_body.append(ln)
    if cur_header is not None and header_re.search(cur_header):
        sections.append((cur_header, "\n".join(cur_body)))
    return sections


def parse_fields(body: str) -> dict[str, str]:
    """`- **필드**: 값` 형태의 필드 파싱. 필드명 → 값."""
    fields: dict[str, str] = {}
    for m in re.finditer(r"^-\s*\*\*([^*]+)\*\*:\s*(.*)$", body, re.M):
        fields[m.group(1).strip()] = m.group(2).strip()
    return fields


def _extract_first(field_value: str) -> str:
    """필드 값에서 첫 토큰 추출 (백틱 안 값 우선, 없으면 첫 단어)."""
    m = re.search(r"`([^`]+)`", field_value)
    if m:
        return m.group(1).strip()
    return field_value.split()[0].strip().rstrip(".") if field_value.strip() else ""


# ══════════════════════════════════════════════════════════════
# A. BUG / DEBT
# ══════════════════════════════════════════════════════════════
def collect_pytest_nodes() -> set[str]:
    # -q 는 요약만 뱉으니 안 씀. pyproject.toml 의 addopts(-q) 를 override 하려면
    # 별도 방법이 없어 그냥 --collect-only 만 넣고 잡음을 필터링한다.
    r = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "--no-header"],
        cwd=ROOT, capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )
    nodes: set[str] = set()
    for ln in r.stdout.split("\n"):
        s = ln.strip()
        if "::" in s and not s.startswith("=") and not s.startswith("-") and not s.startswith("<"):
            # 파라미터화 노드 (name[param]) 에서 파라미터 제거 — 재발방지 참조는 함수명만
            core = s.split("[", 1)[0] if "[" in s else s
            nodes.add(s)
            nodes.add(core)
    return nodes


def check_bugs_debt() -> tuple[int, int, int]:
    if not BUGS_MD.exists():
        add_err(f"[A] bugs.md 없음: {BUGS_MD}")
        return 0, 0, 0
    text = strip_fenced(BUGS_MD.read_text(encoding="utf-8"))
    bug_secs = parse_sections(text, re.compile(r"^BUG-\d+"))
    debt_secs = parse_sections(text, re.compile(r"^DEBT-\d+"))
    pytest_nodes = collect_pytest_nodes()
    manual_count = 0
    for header, body in bug_secs + debt_secs:
        item_id = re.split(r"[—·]", header, maxsplit=1)[0].strip()
        fields = parse_fields(body)
        prev = fields.get("재발방지", "")
        if not prev:
            add_err(f"[A] {item_id}: 재발방지 필드 없음")
            continue
        first = _extract_first(prev)
        if first.startswith("test:"):
            node = first[len("test:"):].strip()
            if node not in pytest_nodes:
                add_err(f"[A] {item_id}: 재발방지 pytest 노드 없음: {node}")
        elif first.startswith("check:"):
            path = first[len("check:"):].strip()
            if not (ROOT / path).exists():
                add_err(f"[A] {item_id}: 재발방지 check 파일 없음: {path}")
        elif first.startswith("manual"):
            manual_count += 1
        else:
            add_err(f"[A] {item_id}: 재발방지 형식 이상 (test:/check:/manual): {first!r}")
        # 심각도는 BUG 만 헤더에 (심각도: X)
        if item_id.startswith("BUG-"):
            sm = re.search(r"\(심각도:\s*([a-zA-Z]+)\)", header)
            if not sm:
                add_err(f"[A] {item_id}: 심각도 표기 없음")
            elif sm.group(1) not in SEVERITIES:
                add_err(f"[A] {item_id}: 심각도 값 이상: {sm.group(1)!r} (high|medium|low)")
    if manual_count > 6:
        warnings.append(f"[A] manual 재발방지 항목 {manual_count}개 (>6) — 자동화 검토 권장")
    return len(bug_secs), len(debt_secs), manual_count


# ══════════════════════════════════════════════════════════════
# B. REMOVAL
# ══════════════════════════════════════════════════════════════
def _extract_link_or_backtick_path(field_value: str) -> str:
    """마크다운 링크 [text](path) 우선, 없으면 백틱 안 값."""
    lm = re.search(r"\[[^\]]*\]\(([^)]+)\)", field_value)
    if lm:
        return lm.group(1).strip()
    bm = re.search(r"`([^`]+)`", field_value)
    if bm:
        return bm.group(1).strip()
    return field_value.split()[0].strip() if field_value.strip() else ""


def check_removal() -> int:
    if not BUGS_MD.exists():
        return 0
    text = strip_fenced(BUGS_MD.read_text(encoding="utf-8"))
    secs = parse_sections(text, re.compile(r"^REMOVAL-\d+"))
    for header, body in secs:
        item_id = re.split(r"[—·]", header, maxsplit=1)[0].strip()
        fields = parse_fields(body)
        state = fields.get("상태", "").strip()
        if state not in REMOVAL_STATES:
            add_err(f"[B] {item_id}: 상태 값 이상: {state!r} (확정|후보)")
            continue
        if state == "확정":
            if not fields.get("근거", "").strip():
                add_err(f"[B] {item_id}: 확정 항목인데 근거 필드 비어있음")
            plan = fields.get("계획", "").strip()
            if not plan:
                add_err(f"[B] {item_id}: 확정 항목인데 계획 필드 없음")
            else:
                plan_path = _extract_link_or_backtick_path(plan)
                # 계획 필드는 bugs.md 기준 상대 경로
                resolved = (BUGS_MD.parent / plan_path).resolve()
                if not resolved.exists():
                    add_err(f"[B] {item_id}: 계획 파일 없음: {plan_path}")
                else:
                    # 계획서 안 "L숫자" 참조 검사 (코드블록 밖)
                    plan_text = strip_fenced(resolved.read_text(encoding="utf-8"))
                    line_refs = re.findall(r"\bL\d+\b", plan_text)
                    if line_refs:
                        uniq = sorted(set(line_refs))
                        add_err(f"[B] {item_id}: 계획서에 줄 번호 참조 {len(line_refs)}건 발견: "
                                f"{uniq[:5]}{'...' if len(uniq) > 5 else ''}")
    return len(secs)


# ══════════════════════════════════════════════════════════════
# C. 문서 경로 실존
# ══════════════════════════════════════════════════════════════
def _is_command(v: str) -> bool:
    tokens = v.strip().split()
    if not tokens:
        return False
    return tokens[0].lower() in CMD_STARTS


# 프로젝트 최상위 폴더 접두사. 이걸로 시작하는 상대경로만 실제 파일 참조로 간주.
# API 경로(/api/...), 함수 시그니처(foo/bar/baz), 단일 파일명(index.html) 등 오탐 회피.
PROJECT_PREFIXES = (
    "backend/", "frontend/", "tests/", "docs/", "harness/",
    "tools/", "data/", "scripts/", "db/", ".claude/",
    "../",  # 문서 상대경로 (docs/foo.md 에서 ../harness/bar.md 참조)
)


def _is_path_like(v: str) -> bool:
    if SCHEME_RE.match(v):
        return False  # test:, check:, http:, https: 등
    if v.startswith("/"):
        return False  # API 경로 (/api/...) 등 — 파일 시스템 절대경로가 문서에 올 리 없음
    return v.startswith(PROJECT_PREFIXES)


def _skip_doc(path: Path) -> bool:
    """비갱신 배너가 붙은 문서만 스킵. 파일명 규칙(날짜 등)으로 통째 제외하지 않는다.
    스킵된 문서는 _skipped_banner_docs 에 집계되어 출력에 명시된다."""
    try:
        head = "\n".join(path.read_text(encoding="utf-8").split("\n")[:15])
    except Exception:
        return False
    if STALE_BANNER_RE.search(head):
        _skipped_banner_docs.append(path)
        return True
    return False


def check_doc_paths() -> int:
    checked = 0
    doc_files: list[Path] = []
    for base in [ROOT / "docs", ROOT / "harness"]:
        if base.exists():
            doc_files.extend(base.rglob("*.md"))
    for f in sorted(doc_files):
        if _skip_doc(f):
            continue
        try:
            raw = f.read_text(encoding="utf-8")
        except Exception:
            continue
        scanned = strip_fenced(raw)
        for m in re.finditer(r"`([^`\n]+)`", scanned):
            v = m.group(1).strip()
            if not v:
                continue
            if "*" in v or ("<" in v and ">" in v):
                continue
            # 파라미터 플레이스홀더: {id}, {device_id}, {key} 등 — URL/템플릿 표기
            if "{" in v and "}" in v:
                continue
            if _is_command(v):
                continue
            if not _is_path_like(v):
                continue
            if len(v) >= 2 and v[1] == ":":  # Windows 절대경로
                continue
            # 파일 뒤 `:이름` (uvicorn 모듈:앱, entrypoint 등)
            if re.search(r"\.(py|js|ts|json):[A-Za-z_]", v):
                continue
            # 파일 뒤 `:숫자` (파일:라인 표기, 라인범위/여러 라인 포함): main.py:107, main.py:107-118, main.py:2730/2742
            if re.search(r"\.(py|js|ts|json|md|sql|html|ps1|txt):\d", v):
                continue
            path_only = v.split("#", 1)[0].split("?", 1)[0]
            if not path_only:
                continue
            candidates = [
                (f.parent / path_only),
                (ROOT / path_only),
            ]
            checked += 1
            exists = False
            for c in candidates:
                try:
                    if c.exists():
                        exists = True
                        break
                except OSError:
                    continue
            if not exists:
                # gitignore 대상이면 실패가 아니라 "제외"로 분류.
                # data/legacy/, data/backups/, db/utop-seed.dump 등 재생성 대상 파일 참조를 인정.
                if _is_gitignored(path_only):
                    _gitignore_exempt_paths.append(f"{f.relative_to(ROOT)}: {v}")
                    continue
                ln_no = raw[: m.start()].count("\n") + 1
                add_err(f"[C] {f.relative_to(ROOT)}:{ln_no}: 경로 실존 안 함: {v!r}")
    return checked


# ══════════════════════════════════════════════════════════════
def main() -> int:
    bug_n, debt_n, _manual_n = check_bugs_debt()
    rem_n = check_removal()
    doc_n = check_doc_paths()

    print(f"BUG {bug_n} / DEBT {debt_n} / REMOVAL {rem_n} / 문서 경로 {doc_n}개 확인")
    if _skipped_banner_docs:
        print(f"비갱신 배너로 제외 {len(_skipped_banner_docs)}건:")
        for p in _skipped_banner_docs:
            print(f"  · {p.relative_to(ROOT)}")
    if _gitignore_exempt_paths:
        print(f"gitignore 대상 {len(_gitignore_exempt_paths)}건 제외:")
        for line in _gitignore_exempt_paths[:10]:
            print(f"  · {line}")
        if len(_gitignore_exempt_paths) > 10:
            print(f"  ... 외 {len(_gitignore_exempt_paths) - 10}건")

    # 빈 입력 방지
    if bug_n == 0 and debt_n == 0 and rem_n == 0 and doc_n == 0:
        print("FAIL: 검사 대상이 하나도 없음 — bugs.md / docs 파싱 오류 가능성", file=sys.stderr)
        return 1

    for w in warnings:
        print(w, file=sys.stderr)
    for e in errors:
        print(e, file=sys.stderr)

    if errors:
        print(f"FAIL: {len(errors)}건 오류", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
