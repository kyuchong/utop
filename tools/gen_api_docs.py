"""backend/main.py 의 FastAPI app 에서 라우트를 추출해 docs/api-reference.md 를 생성한다.

방식: 동적 import (서버 기동 없이 app 객체만 로드).
main.py 의 top-level 부작용은 dotenv 로드와 SNMP enum 파일 읽기(~2.5s) 뿐이라 안전.

사용법:
  python tools/gen_api_docs.py           # docs/api-reference.md 생성/갱신
  python tools/gen_api_docs.py --check   # 현재 docs/api-reference.md 와 대조. 다르면 exit 1
"""
from __future__ import annotations
import argparse
import inspect
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
OUT = ROOT / "docs" / "api-reference.md"

# UTF-8 콘솔 (Windows cp949 회피)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, str(BACKEND))
import main  # type: ignore

APP = main.app
# engine.router 는 main.py 에서 include_router 되므로 APP.routes 에 이미 포함됨.
# 그래도 누락 방지 차 별도 순회는 하지 않는다.

AUTH_MARKERS = ("_require_auth", "_require_admin", "require_auth", "require_admin")


def endpoint_auth(endpoint) -> str:
    """endpoint 함수 시그니처에서 인증 의존성 이름을 찾는다. best-effort."""
    try:
        sig = inspect.signature(endpoint)
    except (TypeError, ValueError):
        return ""
    hits = []
    for p in sig.parameters.values():
        default = p.default
        # Depends(...) 의 경우 default 는 fastapi.params.Depends 인스턴스
        dep = getattr(default, "dependency", None)
        if dep is not None:
            nm = getattr(dep, "__name__", str(dep))
            if any(m in nm for m in AUTH_MARKERS):
                hits.append(nm)
        # 파라미터 이름 자체가 token/authorization 인 경우도 신호
        if p.name in ("token",) and hits == []:
            hits.append("token param")
    return ", ".join(hits)


def summary_of(route) -> str:
    s = (getattr(route, "summary", None) or "").strip()
    if s:
        return s
    ep = getattr(route, "endpoint", None)
    if ep is not None:
        doc = inspect.getdoc(ep) or ""
        first = doc.split("\n", 1)[0].strip() if doc else ""
        return first
    return ""


def path_group(path: str) -> str:
    parts = path.strip("/").split("/")
    if len(parts) >= 2 and parts[0] == "api":
        return f"/api/{parts[1]}"
    if parts and parts[0] == "api":
        return "/api"
    if not parts or parts == [""]:
        return "/"
    return "/" + parts[0]


def collect():
    from fastapi.routing import APIRoute, APIWebSocketRoute
    entries = []
    for r in APP.routes:
        if isinstance(r, APIRoute):
            methods = sorted(m for m in r.methods if m != "HEAD")
            for m in methods:
                entries.append({
                    "method": m,
                    "path": r.path,
                    "summary": summary_of(r),
                    "auth": endpoint_auth(r.endpoint),
                    "group": path_group(r.path),
                })
        elif isinstance(r, APIWebSocketRoute):
            entries.append({
                "method": "WS",
                "path": r.path,
                "summary": summary_of(r),
                "auth": endpoint_auth(r.endpoint),
                "group": path_group(r.path),
            })
    return entries


def render(entries) -> str:
    by_group = defaultdict(list)
    for e in entries:
        by_group[e["group"]].append(e)

    lines = []
    lines.append("<!-- 이 파일은 tools/gen_api_docs.py 가 생성합니다. 직접 수정하지 마세요. -->")
    lines.append("<!-- 갱신: python tools/gen_api_docs.py -->")
    lines.append("")
    lines.append("# API Reference")
    lines.append("")
    lines.append(f"총 라우트 수: **{len(entries)}** (그룹 {len(by_group)}개)")
    lines.append("")
    lines.append("`auth` 컬럼은 endpoint 시그니처에서 감지한 인증/권한 의존성 이름 (best-effort).")
    lines.append("")

    for group in sorted(by_group):
        items = sorted(by_group[group], key=lambda x: (x["path"], x["method"]))
        lines.append(f"## `{group}` ({len(items)}개)")
        lines.append("")
        lines.append("| method | path | summary | auth |")
        lines.append("|---|---|---|---|")
        for e in items:
            summary = (e["summary"] or "").replace("|", "\\|").replace("\n", " ")
            if len(summary) > 80:
                summary = summary[:77] + "..."
            auth = (e["auth"] or "").replace("|", "\\|")
            lines.append(f"| {e['method']} | `{e['path']}` | {summary} | {auth} |")
        lines.append("")

    return "\n".join(lines) + "\n"


def _route_keys(entries) -> set[str]:
    """드리프트 리포트용: method+path 만으로 라우트 셋 계산."""
    return {f"{e['method']} {e['path']}" for e in entries}


def check_mode(entries, current: str) -> int:
    """현재 docs/api-reference.md 와 지금 추출한 라우트를 비교. 다르면 안내 출력 후 exit 1."""
    generated = render(entries)
    if generated == current:
        print(f"OK: docs/api-reference.md 최신 ({len(entries)} routes)")
        return 0

    print("FAIL: API 라우트가 문서와 다릅니다. python tools/gen_api_docs.py 를 실행하세요.")
    # 라우트 셋 diff (최대 10개씩)
    now_keys = _route_keys(entries)
    # 현재 문서에서 라우트 키 추출 — `| METHOD | \`/path\` |` 패턴
    import re
    doc_keys: set[str] = set()
    for m in re.finditer(r"^\|\s*(GET|POST|PUT|DELETE|PATCH|WS)\s*\|\s*`([^`]+)`\s*\|", current, re.M):
        doc_keys.add(f"{m.group(1)} {m.group(2)}")
    added = sorted(now_keys - doc_keys)
    removed = sorted(doc_keys - now_keys)
    if added:
        print(f"\n추가된 라우트 ({len(added)}):")
        for k in added[:10]:
            print(f"  + {k}")
        if len(added) > 10:
            print(f"  ... 외 {len(added)-10}개")
    if removed:
        print(f"\n사라진 라우트 ({len(removed)}):")
        for k in removed[:10]:
            print(f"  - {k}")
        if len(removed) > 10:
            print(f"  ... 외 {len(removed)-10}개")
    if not added and not removed:
        print("(라우트 셋은 동일하지만 summary/auth 등 세부가 다릅니다.)")
    return 1


def main_cli() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="파일 쓰지 않고 docs/api-reference.md 와 대조만. 다르면 exit 1")
    args = ap.parse_args()

    entries = collect()
    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        return check_mode(entries, current)

    text = render(entries)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}  ({len(entries)} routes)")
    return 0


if __name__ == "__main__":
    sys.exit(main_cli())
