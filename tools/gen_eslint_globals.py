"""frontend/static/js/**/*.js 의 최상위 선언을 추출해 tools/eslint/globals.json 을 생성한다.

JS 는 탑메뉴별 서브폴더(_shared/, tests/, reports/ 등)로 나뉘어 있으므로 rglob 으로
재귀 수집한다. 비재귀 glob 으로 되돌리면 서브폴더 심볼이 전부 누락되어 no-undef 가
대량 오탐한다.

eslint.config.js 가 이 파일을 로드해 no-undef 검사의 globals 로 사용한다.
파일 간 전역 참조가 많은 프로젝트 특성상, 손으로 관리하면 반드시 낡음 → 자동 생성.

수동 추가할 심볼(외부 CDN 라이브러리 등)은 tools/eslint/globals.extra.json 에 둔다.
이 스크립트가 두 파일을 합쳐 최종 tools/eslint/globals.json 을 출력.

앱 자산이 아니라 린트 도구만 읽는 메타데이터라 frontend/ 가 아니라 tools/ 에 둔다.

사용법:
  python tools/gen_eslint_globals.py           # 재생성
  python tools/gen_eslint_globals.py --check   # 대조만. 다르면 exit 1

주의: 정규식 기반 얕은 파서이므로 다음 세 가지를 처리한다.
  1) BOM(U+FEFF) 로 시작하는 파일
  2) 한 줄에 여러 문을 세미콜론으로 붙인 경우 (`let A; let B; let C;`)
  3) 다중 선언 (`let a=1, b=2, c;`)
문자열/템플릿 리터럴 안의 comma 는 대략적으로만 걸러내므로 100% 정확하진 않다.
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS_DIR = ROOT / "frontend" / "static" / "js"
OUT = ROOT / "tools" / "eslint" / "globals.json"
EXTRA = ROOT / "tools" / "eslint" / "globals.extra.json"

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


_DECL_KW = re.compile(r'^(?:async\s+)?(function|class|var|let|const)\s+(.+)$')
_NAME = re.compile(r'^\s*([A-Za-z_$][\w$]*)')


def _strip_bom(s: str) -> str:
    return s.lstrip("﻿")


def _strip_literals(line: str) -> str:
    """문자열/템플릿 리터럴을 빈 리터럴로 치환. comma 분리 시 방해되지 않도록."""
    line = re.sub(r'"[^"]*"', '""', line)
    line = re.sub(r"'[^']*'", "''", line)
    line = re.sub(r'`[^`]*`', '``', line)
    return line


def _extract_from_file(path: Path) -> set[str]:
    src = _strip_bom(path.read_text(encoding="utf-8", errors="replace"))
    syms: set[str] = set()
    for raw in src.split("\n"):
        # 최상위 = 들여쓰기 없음
        if not raw or raw[0] in (" ", "\t"):
            continue
        line = _strip_literals(raw)
        # 한 줄에 여러 문: 세미콜론으로 분리
        for stmt in line.split(";"):
            stmt = stmt.strip()
            if not stmt:
                continue
            m = _DECL_KW.match(stmt)
            if not m:
                continue
            kind, rest = m.group(1), m.group(2)
            if kind in ("function", "class"):
                nm = _NAME.match(rest)
                if nm:
                    syms.add(nm.group(1))
                continue
            # var/let/const: 최상위 comma 로 분리
            depth = 0
            cur: list[str] = []
            parts: list[str] = []
            for ch in rest:
                if ch in "([{":
                    depth += 1
                    cur.append(ch)
                elif ch in ")]}":
                    depth -= 1
                    cur.append(ch)
                elif ch == "," and depth == 0:
                    parts.append("".join(cur))
                    cur = []
                else:
                    cur.append(ch)
            if cur:
                parts.append("".join(cur))
            for p in parts:
                head = p.split("=", 1)[0].strip()
                nm = _NAME.match(head)
                if nm:
                    syms.add(nm.group(1))
    return syms


def collect() -> list[str]:
    syms: set[str] = set()
    for f in sorted(JS_DIR.rglob("*.js")):
        syms |= _extract_from_file(f)
    # 수동 추가 (CDN 라이브러리, window.X = ..., 함수 안에 정의된 파일 간 참조 심볼 등)
    if EXTRA.exists():
        extra = json.loads(EXTRA.read_text(encoding="utf-8"))
        if isinstance(extra, list):
            syms |= {str(x) for x in extra}
    return sorted(syms)


def render(symbols: list[str]) -> str:
    return json.dumps(symbols, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="파일 쓰지 않고 현재 tools/eslint/globals.json 과 대조. 다르면 exit 1")
    args = ap.parse_args()

    symbols = collect()
    text = render(symbols)

    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if text == current:
            print(f"OK: tools/eslint/globals.json 최신 ({len(symbols)} symbols)")
            return 0
        print("FAIL: tools/eslint/globals.json 이 실제 소스와 다릅니다. python tools/gen_eslint_globals.py 를 실행하세요.")
        return 1

    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}  ({len(symbols)} symbols)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
