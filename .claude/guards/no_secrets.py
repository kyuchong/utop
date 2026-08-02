"""PreToolUse hook: Write/Edit 로 시크릿이 커밋되는 것을 사전 차단.

입력: stdin JSON  { "tool_input": { "file_path": "...", "content": "..." , ... } }
  - Write:  tool_input.content
  - Edit:   tool_input.new_string  (또는 content)
  - MultiEdit: tool_input.edits[i].new_string  (있으면)

차단 조건:
  1. 파일 내용에 API 키 프리픽스 (sk-ant-, sk-proj-, sk-, ghp_, glpat-) 가 등장
  2. JSON 형태의 "password"/"token"/"apikey" 키에 빈 문자열이 아닌 값

예외:
  - 파일 경로가 .sample 로 끝나면 통과
  - docs/ 하위 문서(md/txt/pptx 등)는 통과
  - 이 훅 자체(.claude/guards/) 는 통과 — 문서화 목적으로 프리픽스 문자열이 등장할 수 있음
  - .claude/settings.json 등 harness 파일은 통과 (설정에 힌트 예시 나올 수 있음)
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

# UTF-8 강제 (Windows cp949 회피)
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


API_KEY_PREFIXES = (
    "sk-ant-api",
    "sk-ant-",
    "sk-proj-",
    "ghp_",
    "glpat-",
    # 'sk-' 은 너무 광범위 → API 키 오탐 방지 위해 sk-openai 계열은 아래 별도 정규식
)
GENERIC_SK_RE = re.compile(r"\bsk-[a-zA-Z0-9]{20,}\b")

# JSON 시크릿 키: "password": "abc..." / "token": "..." / "apikey": "..."
JSON_SECRET_RE = re.compile(
    r'"(?P<key>password|token|apikey|api_key|secret|stream_mode_auth)"\s*:\s*"(?P<val>[^"]+)"',
    re.IGNORECASE,
)


def _is_exempt(file_path: str) -> bool:
    if not file_path:
        return False
    p = file_path.replace("\\", "/").lower()
    if p.endswith(".sample"):
        return True
    if "/docs/" in p or p.startswith("docs/"):
        return True
    if "/.claude/guards/" in p or p.startswith(".claude/guards/"):
        return True
    if p.endswith(".claude/settings.json") or p.endswith(".claude/settings.local.json"):
        return True
    return False


def _scan_text(text: str) -> list[str]:
    hits: list[str] = []
    for prefix in API_KEY_PREFIXES:
        if prefix in text:
            hits.append(f"API 키 프리픽스 '{prefix}' 발견")
    m = GENERIC_SK_RE.search(text)
    if m:
        hits.append(f"'sk-*' 형태 시크릿 후보 (길이 {len(m.group())}) 발견")
    for m in JSON_SECRET_RE.finditer(text):
        key = m.group("key")
        val = m.group("val")
        if val and val.strip() and val not in ("REPLACE_ME", "***"):
            hits.append(f'JSON 필드 "{key}" 에 값 (len={len(val)}) — .env 로 분리 필요')
    return hits


def _extract_contents(tool_input: dict) -> list[str]:
    parts: list[str] = []
    # Write
    c = tool_input.get("content")
    if isinstance(c, str):
        parts.append(c)
    # Edit
    ns = tool_input.get("new_string")
    if isinstance(ns, str):
        parts.append(ns)
    # MultiEdit
    edits = tool_input.get("edits")
    if isinstance(edits, list):
        for e in edits:
            if isinstance(e, dict):
                v = e.get("new_string")
                if isinstance(v, str):
                    parts.append(v)
    return parts


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception as e:
        print(f"[no_secrets] stdin JSON 파싱 실패: {e}", file=sys.stderr)
        return 0  # 훅 자체 실패로 작업 차단하진 않음
    tool_input = payload.get("tool_input") or {}
    file_path = tool_input.get("file_path") or ""

    if _is_exempt(file_path):
        return 0

    contents = _extract_contents(tool_input)
    all_hits: list[str] = []
    for c in contents:
        all_hits.extend(_scan_text(c))
    # 파일명 자체가 sk-ant-* 등인 경우도 차단
    fn_hits = _scan_text(Path(file_path).name)
    all_hits.extend(fn_hits)

    if all_hits:
        print(f"[no_secrets] 시크릿 차단: {file_path}", file=sys.stderr)
        for h in all_hits[:5]:
            print(f"  - {h}", file=sys.stderr)
        print("  → 자격증명은 .env 로 분리하고 파일에는 예시만 두세요 (예: data/integrations/llms.json.sample).",
              file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
