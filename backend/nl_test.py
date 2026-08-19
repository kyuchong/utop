# -*- coding: utf-8 -*-
"""자연어 시험(AI Assistant) — 서버 쪽 한 벌.

다른 UTOP 서버(원본 앱)에서 **돌고 있던** 조각을 옮겨 왔다 (2026-08-18 뽑음).
원본은 main.py 한 파일 안에 있었지만, 여기 main.py 는 이미 커서 모듈로 나눈다 —
main.py 맨 끝에서 `import nl_test` 하면 아래 길 9개가 붙는다.

**main.py 가 다 뜬 뒤에 import 되어야 한다** (여기서 main 의 이름을 받아 오므로).

이 파일이 대는 길:
  GET  /api/ai/nl-chats · /api/ai/nl-chats/{cid} · POST /api/ai/nl-chats   시험 기록
  POST /api/ai/nl-criteria   응답을 보고 판정 기준 뽑기 (조회 명령을 미리 보낸다)
  GET  /api/ai/nl-tc-like · POST /api/ai/nl-tc-adopt   비슷한 TC 찾기·가져오기
  POST /api/ai/nl-plan       자연어 → 시험 절차 (LLM)
  GET/POST /api/ai/examples  첫 화면 질문 보기

담는 자리(KV): ai_examples · learned_procedures · device_catalog · nl_chats_<사용자>
  ★ ai_examples 는 main.py 의 _KV_MIGRATIONS 에 등록해 두었다 — 안 하면 재시작 때
    빈 값이 캐시에 박혀 다음 저장이 DB 를 덮어쓴다(원본에서 실제로 겪은 덫).
"""

import asyncio  # noqa: F401  (절차 만들 때 씀)
import json
import re
from datetime import datetime  # noqa: F401

from fastapi import HTTPException

import db
from main import (
    DATA_DIR,  # noqa: F401
    _ai_chat,
    _kv_load_sync,
    _kv_save_sync,
    _load_learned,
    _require_admin,
    _user_from_token,
    app,
    broadcast,
    run_cli,
)

#: 줄바꿈 — 원본이 쓰던 이름 그대로
_LF = "\n"

# ══ 값 ══════════════════════════════════════════

_NL_DANGER = ("erase", "format", "factory", "upgrade", "firmware",
              "write ", "copy ", "delete", "remove", "clear config", "rmdir", "halt")

_NL_CONFIG = ("shutdown", "reload", "reboot", "no ", "config", "interface", "vlan")

_NL_TRAFFIC_RE = re.compile(
    r"rate\s*limit|레이트\s*리밋|대역\s*제한|폴리(서|싱)|policer"
    r"|qos|우선\s*순위|shaping|셰이핑|storm|스톰|브로드캐스트\s*제한"
    r"|acl|접근\s*제어|차단\s*규칙"
    r"|손실|유실|처리량|throughput|대역폭|지연|레이턴시|latency|jitter|rfc\s*2544"
    r"|트래픽|스트림|부하|[0-9.]+\s*[gmk]?bps|pps", re.I)

_NL_INSPECT_RE = re.compile(
    r"설정\s*(상태|값)?\s*만?\s*(확인|조회|보여|보기)|조회만|상태만|running-config", re.I)

_NL_RATE_RE = re.compile(r"^([0-9.]+)\s*([GgMmKk])(bps)?$")

_NL_DUR_RE = re.compile(r"(\d+)\s*(초|분|sec|secs|seconds|min|mins|minutes)")

_NL_FRAME_RE = re.compile(r"(\d{2,5})\s*(?:바이트|bytes|byte)|프레임\s*(?:크기|길이)?\s*(\d{2,5})",
                          re.I)

_NL_RATE_SAY = re.compile(
    r"(?<![0-9A-Za-z])\d+(?:\.\d+)?\s*"
    r"(?:%|퍼센트|Gbps|Mbps|Kbps|기가|메가|fps|pps|프레임/?초|[GMK](?:bps)?(?![A-Za-z0-9]))",
    re.I)

_NL_INST_ACTIONS = {
    "reserve": "계측기 포트를 예약한다",
    "config": "스트림을 만든다",
    "start": "트래픽을 인가한다",          # 멈출 때까지 흐른다 — 시간은 wait 스텝이 잰다
    "stat": "송수신량을 읽어 손실을 본다",
    "stop": "트래픽을 멈춘다",
    "release": "계측기 포트를 반납한다",
}

_NOT_CLI_STEP = re.compile(
    r"^(📝|🖐|↪|IF\s|ELIF|For\s|While\s|Switch\s|반복\s|대기\s|Traffic\s|"
    r"Telnet/SSH|세션 종료)", re.U)

_NL_CHAT_MAX = 60          # 사용자당 보관할 대화 수. 넘으면 오래된 것부터 지운다.

_CFG_STEP = re.compile(r"^\s*(conf(ig(ure)?)?\s+t|vlan\s+database|interface\b|no\s+\S)", re.I | re.M)

_TC_STOP = {"시험", "확인", "조회", "해줘", "하기", "장비", "명령", "상태", "테스트",
            "인터페이스", "포트", "설정", "기가", "번", "대해", "관련", "진행", "부탁",
            # ★ 실제 TC 135건에 대 보니 이 말들이 아무 데나 걸린다 (2026-08-14).
            #   `동작 확인` 은 SNMP TC 수십 건의 제목이라, `동작` 하나로 1등이 정해졌다.
            "동작", "여부", "지원", "정상", "기능", "각각", "사용", "수행", "이상",
            "show", "test", "check", "interface", "port"}

_TC_SYN_GROUPS = (("시스템", "system"), ("메모리", "memory"), ("버전", "version"),
                  ("온도", "temperature"), ("전원", "power"), ("팬", "fan"),
                  ("로그", "log"), ("시간", "time", "clock"), ("사용자", "user"),
                  ("계정", "account"), ("속도", "speed"), ("트래픽", "traffic"),
                  ("부팅", "boot"), ("재부팅", "reload", "reboot"), ("저장", "save"),
                  ("백업", "backup"), ("주소", "address"), ("이름", "name"),
                  ("링크", "link"), ("통계", "counter", "statistics"),
                  ("대역", "bandwidth"), ("제한", "limit"), ("정책", "policy"),
                  ("우선순위", "priority"), ("차단", "block"), ("인증", "auth"))

_TC_SYN = {w: [x for x in g if x != w] for g in _TC_SYN_GROUPS for w in g}

_TC_MODEL_RE = re.compile(r"^[a-z]{1,3}[0-9]{3,5}[a-z0-9-]*$", re.I)

_TC_MIN_SCORE = 5      # 제목 한 번(3점)만으로는 모자라다 — 둘은 걸려야 한다

_TC_IF_RE = re.compile(
    r"\b(TenGigabitEthernet|GigabitEthernet|FastEthernet|Management|Ethernet|Tpon|"
    r"Xe|Te|Gi|Ge|Fa|Tp|Mgmt|Eth)\s*(\d+|\$\{[^}]+\})(?:/(\d+|\$\{[^}]+\}))?(?!\w)", re.I)

_TC_IF_KIND = (("tengi", ("tengigabitethernet", "te", "xe")),
               ("giga", ("gigabitethernet", "gi", "ge")),
               ("tpon", ("tpon", "tp")),
               ("mgmt", ("management", "mgmt")),
               ("fast", ("fastethernet", "fa")),
               ("eth", ("ethernet", "eth")))

_TC_VAL_RE = re.compile(r"[\s:=]+[-+]?\d[\d.,]*\s*[A-Za-z%/]{0,8}\s*$")

_TC_VAL_TOK = re.compile(
    r"^(?:"
    r"[0-9][0-9.,]*(?:\s*[A-Za-z%/]{1,8})?"                 # 512 MB · 1.0.1 · 64
    r"|[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}"             # MAC 주소
    r"|(?=(?:[^0-9]*[0-9]){6,})[A-Z0-9]{10,}"               # 일련번호 (숫자가 예닐곱 개는 된다)
    r")$")

_TC_KIND_SKIP = {"group": "단계 묶음", "call": "다른 TC 부르기", "manual": "손으로 하는 절차",
                 "connect": "세션 열기", "disconnect": "세션 닫기",
                 "if": "갈림길(합격·불합격을 가르는 것)", "else": "갈림길", "elif": "갈림길",
                 "switch": "갈림길", "variable": "변수", "model": "모델 가름"}

_AI_EX_KEY = "ai_examples"

_AI_EX_DEFAULT = [
    {"q": "E6100 rate limit 시험해줘",
     "d": "설정값을 넘기는 트래픽을 흘려 초과분이 버려지는지 봅니다"},
    {"q": "E5924RL 시스템 조회 시험 진행해줘",
     "d": "판·메모리·시간 같은 시스템 값을 읽어 확인합니다"},
    {"q": "E6100 두 대 사이 10G 포트로 1Gbps 흘려서 손실 확인해줘",
     "d": "계측기로 트래픽을 흘려 손실·처리량을 잽니다"},
]


# ══ 도우미 ══════════════════════════════════════

def _nl_wants_config(text):
    """이 요청이 **설정을 바꾸는 시험**인가 — 요청한 말에서 알아낸다.

    ★ 예전에는 '설정 시험 허용' 스위치로 알았다. 그 스위치를 없앴으므로(2026-08-11)
    말에서 읽어야 한다. 이 값은 두 곳에 쓴다:
      · 프롬프트에 '설정 시험의 모양'(설정→확인→원복)을 넣을지
      · 학습 예시를 넣을지 — 학습 절차가 조회 위주라 설정 시험에 넣으면
        **그 모양을 따라 조회 한 줄로 줄어든다** (실제로 그랬다)
    """
    t = str(text or "").lower()
    kw = (
        # 상태를 바꾸는 말
        "shutdown", "셧다운", "셧 다운", "내렸", "내리", "올리", "재부팅", "리부팅",
        "reload", "reboot", "설정", "바꾸", "변경", "적용", "config",
        "링크 다운", "link down", "포트 다운", "활성", "비활성", "enable", "disable", "no shut",
        # ★ 무엇을 **만들거나 없애는** 말. 이게 빠져서 "vlan 3 생성 시험" 이
        #   조회 시험으로 잡혔고, 절차가 `show vlan` 한 줄로 나왔다 (2026-08-11).
        "생성", "만들", "만드", "추가", "등록", "할당", "부여", "지정",
        "삭제", "제거", "지우", "해제", "초기화",
        "create", "add", "assign", "delete", "remove",
        # 흔한 설정 대상 — 이 말이 나오면 조회만 하는 시험일 리가 적다
        "vlan", "trunk", "access port", "ip 주소", "ip address", "게이트웨이", "gateway",
        "라우팅", "routing", "acl", "lacp", "포트채널", "port-channel", "aggregation",
    )
    return any(k in t for k in kw)


def _nl_cmd_danger(cmd):
    """이 명령이 되돌리기 어려운 것인가 — 막는 게 아니라 **묻기 위해** 본다."""
    c = str(cmd or "").strip().lower()
    return any(b in c for b in _NL_DANGER) if c else False


def _nl_plan_cmd_ok(cmd, allow_config=True):
    """생성된 CLI 필터.

    ★ 이제 **거의 막지 않는다**(사용자 결정 2026-08-11 — *"설정 시험 허용 없애고 그냥
    되도록 해줘. 사용자가 실행 해야만 cli 입력되니까"*). 절차를 만드는 것만으로는
    장비에 아무것도 안 나가고, 사람이 [이대로 돌리기] 를 눌러야 실행된다.
    위험한 명령은 **돌리기 직전에 한 번 묻는 것**으로 다룬다(화면 쪽 _nlRun).

    allow_config=False 로 부르는 곳(nl-exec — 만들자마자 바로 실행)에서만 예전처럼
    조회 명령으로 좁힌다. 거긴 사람이 보고 고칠 틈이 없다.
    """
    c = str(cmd or "").strip().lower()
    if not c:
        return False
    if allow_config:
        return True
    for b in _NL_DANGER + ("shutdown", "reload", "reboot"):
        if b in c:
            return False
    head = c.split()[0]
    return head in ("show", "display", "ping", "traceroute", "dir", "more", "cat", "get", "status", "monitor")


def _nl_json_any(content):
    """LLM 응답에서 JSON 을 뽑는다 — **배열도** 받는다.

    _ai_json 은 `{.*}` 만 찾아서 `[{...}]` 로 온 응답을 통째로 놓친다.
    제마가 실제로 그렇게 답하므로(스키마를 줘도) 여기서는 배열도 읽는다.
    _ai_json 은 다른 기능이 함께 쓰므로 건드리지 않는다.
    """
    import re as _re
    s = str(content or "").strip()
    if not s:
        return None
    s = _re.sub(r"^```(?:json)?\s*|\s*```$", "", s)      # ```json ... ``` 벗기기
    try:
        return json.loads(s)
    except Exception:
        pass
    for pat in (r"\[.*\]", r"\{.*\}"):                  # 배열을 먼저 본다
        m = _re.search(pat, s, _re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                continue
    return None


def _nl_reload_yn(lines, changed_cfg):
    """`reload` 뒤에 장비가 묻는 y/n 응답을 채워 준다.

    장비는 reload 를 받으면 되묻는다. 설정을 바꾼 뒤라면 **두 번** 묻는다:
        System configuration has been modified. Save? [y/n]:   ← 바꾼 게 있을 때만
        continue to reboot ? [y/n]:
    응답을 안 보내면 장비가 계속 기다려 30초 타임아웃이 난다.

    ★ 저장 여부는 **n** 이 기본이다. 시험 중에 바꾼 설정을 startup-config 에
      남기면 다음 시험이 깨끗한 상태에서 시작하지 못한다. 되돌리기도 어렵다.
      정말 저장해야 하면 사용자가 화면에서 그 줄을 y 로 고치면 된다.

    이미 응답이 붙어 있으면 건드리지 않는다 (사람이 손으로 넣었을 수 있다).
    """
    out = []
    for i, ln in enumerate(lines):
        out.append(ln)
        if not re.match(r"^\s*(do\s+)?(reload|reboot)\b", ln, re.I):
            continue
        nxt = [x.strip().lower() for x in lines[i + 1:i + 3]]
        if nxt and nxt[0] in ("y", "n", "yes", "no"):
            continue                     # 이미 사람이 넣어 뒀다
        if changed_cfg:
            out.append("n")              # 설정 저장? → 안 한다
        out.append("y")                  # 정말 재부팅? → 한다
    return out


def _nl_split_cli(cli):
    """세미콜론으로 이어 붙인 명령을 줄로 편다.

    제마가 `configure terminal; interface gi0/5; shutdown; end` 처럼 한 줄로 답한다.
    **장비는 그걸 한 명령으로 받아 거부한다** — 화면의 다른 스텝처럼 줄바꿈이어야 한다.
    (안전 검사는 부분 문자열로 보므로 세미콜론 줄에서도 위험 명령을 잡는다.
     여기서 쪼개는 건 안전 때문이 아니라 **장비가 받게 하려고** 다.)
    """
    out = []
    for ln in str(cli or "").split("\n"):
        for part in ln.split(";"):
            part = part.strip()
            if part:
                out.append(part)
    return "\n".join(out)


def _nl_wants_traffic(text):
    t = str(text or "")
    if _NL_INSPECT_RE.search(t):
        return False
    return bool(_NL_TRAFFIC_RE.search(t))


def _nl_rate_plain(txt, unit):
    """`1G` → `1000` (Mbps 칸) — 값과 단위를 두 번 읽지 않게 편다."""
    m = _NL_RATE_RE.match(str(txt or "").strip())
    if not m:
        return str(txt or "").strip()
    n = float(m.group(1))
    suf = m.group(2).lower()
    u = str(unit or "Mbps")
    if u == "Mbps":
        n = n * 1000 if suf == "g" else (n / 1000 if suf == "k" else n)
    elif u in ("bps", "Frames/sec(fps)"):
        n = n * (1000000000 if suf == "g" else (1000000 if suf == "m" else 1000))
    return str(int(n)) if float(n).is_integer() else str(n)


def _nl_inst_step(action, **kw):
    row = {"kind": "inst", "action": action, "desc": _NL_INST_ACTIONS[action],
           "cli": "", "type": "", "criteria": "", "indent": 0,
           "ports": "", "rate": "10", "frame": 128, "sec": 30,
           "name": "", "smac": "", "dmac": "", "sip": "", "dip": "", "gw": "", "vlan": "", "prio": "",
           "cnt": "1", "runit": "Percent(%)", "framem": "Fixed",
           "smacm": "Fixed", "dmacm": "Fixed", "vlanm": "Fixed",
           "sipm": "Fixed", "dipm": "Fixed",
           "dscp": "0", "ttl": "64", "frag": "없음", "sip6": "", "dip6": ""}
    row.update(kw)
    return row


def _nl_add_inst(steps):
    """장비 스텝 앞뒤에 계측기 발판을 덧댄다 (LLM 이 안 만들었을 때만 부른다).

    ★ 첫 스텝은 대개 '지금 설정값을 읽는' show 다. 기준값을 알아야 얼마를 흘릴지
      정하므로 그 뒤에 트래픽을 붙인다. 나머지 장비 확인 스텝은 트래픽이 흐르는
      동안 돌아야 한다 — 그래서 stat 앞에 둔다.
    ★★ **인가는 시간을 안 받는다.** 계측기는 멈추라고 할 때까지 흘린다 —
      start · stop 이 짝이고, 얼마나 흘릴지는 그 사이 **대기 스텝**이 잰다
      (사용자 지적 2026-08-13).
    ★ rate 는 **비워 둔다.** 설정값을 모르는 채로 숫자를 지어내면 시험이 거짓이 된다.
      화면에서 사람이 정한다.
    """
    head = steps[:1]
    rest = steps[1:]
    wait = {"kind": "wait", "desc": "트래픽이 흐르는 동안 기다린다", "cli": "",
            "type": "", "criteria": "", "indent": 0, "sec": 30}
    return (head
            + [_nl_inst_step("reserve"), _nl_inst_step("config"), _nl_inst_step("start"), wait]
            + rest
            + [_nl_inst_step("stat"), _nl_inst_step("stop"), _nl_inst_step("release")])


def _nl_wait_sec(text, start_row):
    """얼마나 흘릴지 — 지시문의 시간을 먼저 보고, 없으면 start 스텝이 든 값."""
    m = _NL_DUR_RE.search(str(text or ""))
    if m:
        n = int(m.group(1))
        if m.group(2) in ("분", "min", "mins", "minutes"):
            n *= 60
        return max(1, min(600, n))
    try:
        return max(1, min(600, int((start_row or {}).get("sec") or 30)))
    except (TypeError, ValueError):
        return 30


def _nl_fix_rate(steps, text):
    """★★ 부하는 **사람이 말했을 때만** 그 값을 쓴다 (사용자 요청 2026-08-14).

    LLM 은 묻지도 않았는데 `1100 Mbps` 같은 값을 적어 낸다. 회선이 100M 인지 10G 인지
    모르는 채 Mbps 로 적으면 넘치거나 시늉만 하게 된다. 지시문에 부하가 없으면
    **회선의 10%** 로 되돌린다 — 어느 회선에서도 말이 되는 양이다.
    """
    if _NL_RATE_SAY.search(str(text or "")):
        return steps
    for s in steps:
        if s.get("kind") != "inst":
            continue
        s["rate"] = "10"
        s["runit"] = "Percent(%)"
        for one in (s.get("streams") or []):
            if isinstance(one, dict):
                one["rate"] = "10"
                one["runit"] = "Percent(%)"
    return steps


def _nl_fix_frame(steps, text):
    """★★ 프레임 크기는 **사람이 말했을 때만** 그 값을 쓴다 (사용자 요청 2026-08-13).

    LLM 은 묻지도 않았는데 1518 을 적어 낸다. 트래픽 시험의 기본은 **128바이트**다
    (사용자 요청 2026-08-14). 지시문에 크기가 없으면 지어낸 값을 지우고 128 로
    되돌린다. 64 는 이더넷 최소값이라 **넣을 수는 있다** — 기본이 아닐 뿐이다.
    """
    m = _NL_FRAME_RE.search(str(text or ""))
    want = 0
    if m:
        try:
            want = int(m.group(1) or m.group(2) or 0)
        except (TypeError, ValueError):
            want = 0
    if want and not (64 <= want <= 9600):
        want = 0
    for s in steps:
        if s.get("kind") != "inst":
            continue
        s["frame"] = want or 128
        for one in (s.get("streams") or []):
            if isinstance(one, dict):
                one["frame"] = want or 128
    return steps


def _nl_fix_wait(steps, text):
    """★★ 인가와 멈춤 사이에 **대기 스텝**이 없으면 넣는다 (사용자 신고 2026-08-13).

    계측기는 멈추라고 할 때까지 흘린다 — start 는 시간을 안 받는다. 그래서
    '30초간 인가한다' 라고만 적혀 있으면 **아무도 30초를 재지 않는다.** 인가하자마자
    다음 스텝이 돌고 곧바로 멈춤으로 넘어가, 30초 시험이 0초 시험이 된다.
    발판을 덧댈 때(_nl_add_inst)는 넣고 있었지만 LLM 이 스스로 계측기 스텝을
    지었을 때는 빠져 있었다.
    ★ 이미 그 사이에 대기가 있으면 건드리지 않는다 — 두 번 기다릴 일은 없다.
    """
    def _act(s, a):
        return s.get("kind") == "inst" and s.get("action") == a

    i = next((k for k, s in enumerate(steps) if _act(s, "start")), -1)
    if i < 0:
        return steps
    j = next((k for k in range(i + 1, len(steps)) if _act(steps[k], "stop")), len(steps))
    if any(s.get("kind") == "wait" for s in steps[i + 1:j]):
        return steps
    sec = _nl_wait_sec(text, steps[i])
    # 시간은 대기 스텝이 잰다 — 인가 스텝 이름에 남은 '30초간' 은 거짓말이 된다
    steps[i]["desc"] = _NL_DUR_RE.sub("", str(steps[i].get("desc") or "")).replace("간 ", " ")
    steps[i]["desc"] = " ".join(steps[i]["desc"].split()) or _NL_INST_ACTIONS["start"]
    steps.insert(i + 1, {"kind": "wait", "desc": "트래픽이 흐르는 동안 기다린다", "cli": "",
                         "type": "", "criteria": "", "indent": steps[i].get("indent", 0),
                         "sec": sec})
    return steps


def _nl_steps_from(obj):
    """제마 응답에서 스텝 목록을 뽑는다.

    ★ 제마는 스키마를 자주 어긴다. guided_json 을 줘도 이렇게 답한 적이 있다:
        [ {"command": "show version", "purpose": "...", "criteria": "..."} ]
    객체 대신 배열, `commands` 대신 `command` 단수. 그래서 형태를 가리지 않고 받는다.

    ★★ few-shot 을 넣은 뒤로는 **예시 구조를 통째로 흉내 낸다**:
        [ {"title": "...", "models": [...], "steps": [ {...}, {...} ]} ]
    스텝이 한 겹 더 들어가 있어, 겉만 보면 `cli` 가 없어 전부 버려진다.
    그래서 원소가 `steps` 를 들고 있으면 **그 안을 펴서** 쓴다.
    """
    if isinstance(obj, list):
        rows = []
        for r in obj:                                # 예시를 흉내 낸 중첩 풀기
            if isinstance(r, dict) and isinstance(r.get("steps"), list):
                # ★ for·if 는 **껍데기가 곧 스텝**이다. 그것까지 버리면
                #   "5번 반복" 이 반복 없이 명령 하나로 납작해진다.
                #   껍데기를 먼저 넣고 안쪽을 뒤에 잇는다 (반복 블록 → 본문 순서).
                if str(r.get("kind") or "").strip().lower() in ("for", "if"):
                    rows.append({k: v for k, v in r.items() if k != "steps"})
                rows.extend(r["steps"])
            else:
                rows.append(r)
    elif isinstance(obj, dict):
        rows = obj.get("steps") or obj.get("commands") or obj.get("items") or []
        if not isinstance(rows, list):
            rows = [rows]
        if not rows and (obj.get("command") or obj.get("cli")):
            rows = [obj]
        # {"items":[{"title":…,"steps":[…]}]} 처럼 한 겹 더 싸인 경우도 편다
        if rows and all(isinstance(r, dict) and isinstance(r.get("steps"), list) for r in rows):
            rows = [s for r in rows for s in r["steps"]]
    else:
        return []

    out = []
    for r in rows:
        if isinstance(r, str):                       # ["show version", ...]
            if r.strip():
                out.append({"desc": "", "cli": r.strip(), "type": "", "criteria": ""})
            continue
        if not isinstance(r, dict):
            continue
        cli = str(r.get("cli") or r.get("command") or "").strip()
        if isinstance(r.get("commands"), list):      # 한 스텝에 명령이 여러 개
            cli = "\n".join(str(x).strip() for x in r["commands"] if str(x or "").strip())
        elif not cli and r.get("commands"):
            cli = str(r.get("commands")).strip()

        kind = str(r.get("kind") or "").strip().lower()
        if kind in ("inst", "instrument", "계측기", "traffic"):
            kind = "inst"
        if kind not in ("if", "for", "wait", "inst"):
            kind = "cli"
        # ★ 제어 스텝(if·for·wait)과 계측기 스텝은 cli 가 없다. 예전엔 여기서
        #   통째로 버려서 LLM 이 조건문을 만들어도 결과에 안 남았다.
        if kind == "cli" and not cli:
            continue

        # 들여쓰기 = 반복 블록의 경계. 들여쓴 스텝까지가 그 반복 안이다.
        # (화면·저장되는 TC 모두 같은 규칙을 쓴다 — Tests 엔진의 bodyEnd 와 같다)
        try:
            indent = max(0, min(5, int(r.get("indent") or 0)))
        except (TypeError, ValueError):
            indent = 0

        row = {
            "kind": kind,
            "desc": str(r.get("desc") or r.get("purpose") or r.get("title") or "").strip(),
            "cli": cli,
            "type": str(r.get("type") or "").strip(),
            "criteria": str(r.get("criteria") or r.get("expect") or "").strip(),
            "indent": indent,
        }
        if kind == "if":
            row["condition"] = str(r.get("condition") or "").strip()
            row["then"] = str(r.get("then") or "").strip()
            row["otherwise"] = str(r.get("otherwise") or r.get("else") or "").strip()
            if not (row["condition"] and row["then"]):
                continue                             # 조건이나 참일 때 할 일이 없으면 쓸모없다
        elif kind == "for":
            row["var"] = str(r.get("var") or "i").strip() or "i"
            try:
                row["from"] = int(r.get("from") if r.get("from") is not None else 1)
                row["to"] = int(r.get("to") if r.get("to") is not None else 1)
            except (TypeError, ValueError):
                continue
            if row["to"] < row["from"]:
                continue
        elif kind in ("manual", "model", "group"):
            # 실행기가 이미 도는 것들이다 — manual 은 「사람이 할 일」 로 남기고
            # 지나가고, model·group 은 읽는 사람을 위한 제목 줄이다.
            # 「일반」 갈래는 **있는 시험을 그대로** 도는 것이라 빠지면 안 된다(지시).
            txt = str(c.get("step") or c.get("desc") or c.get("data") or c.get("text") or "").strip()
            txt, _sg = _tc_swap_model(txt, src_models, dst_model)
            if _sg:
                swapped += 1
            if kind == "manual":
                steps.append({"kind": "manual", "indent": depth,
                              "desc": txt or "사람이 확인", "text": txt})
            else:
                if not txt:
                    continue
                steps.append({"kind": "comment", "indent": depth, "desc": txt, "text": txt})
        elif kind == "diff":
            # 값 견주기 — 장비로는 아무것도 안 나간다. 실행기(runner.ts)가
            # 이미 그대로 돈다. 여기서만 버려서 「일반」 갈래로 기존 시험을
            # 돌릴 때 스텝이 통째로 빠졌다(지적) — 있는 그대로 옮긴다.
            desc2, _sd2 = _tc_swap_model(str(c.get("desc") or "").strip(), src_models, dst_model)
            left, _sl = _tc_swap_model(str(c.get("cmpLeft") or ""), src_models, dst_model)
            right, _sr = _tc_swap_model(str(c.get("cmpRight") or ""), src_models, dst_model)
            if _sd2 or _sl or _sr:
                swapped += 1
            st = {"kind": "diff", "indent": depth, "desc": desc2,
                  "cmpLeft": left, "cmpRight": right,
                  "cmpOp": str(c.get("cmpOp") or "==")}
            if c.get("excludeLines"):
                st["excludeLines"] = c.get("excludeLines")
            steps.append(st)
        elif kind == "wait":
            try:
                row["sec"] = max(1, min(600, int(r.get("sec") or 5)))
            except (TypeError, ValueError):
                row["sec"] = 5
        elif kind == "inst":
            # ★ 계측기 스텝은 **장비 CLI 가 아니다.** 화면이 이 값을 보고
            #   /api/n2x/* · /api/stc/* 로 보낸다. 그래서 하는 일(action)을
            #   닫힌 목록으로 받는다 — 지어낸 말이 오면 그 스텝은 버린다.
            act = str(r.get("action") or "").strip().lower()
            if act not in _NL_INST_ACTIONS:
                continue
            row["action"] = act
            row["cli"] = ""
            # 어느 포트를 잡는지 — 화면에서 보고 고칠 수 있어야 한다
            row["ports"] = str(r.get("ports") or "").strip()[:64]
            # 스트림 값 — Tests 의 Traffic 탭과 같은 것들이다 (사용자 시안 2026-08-13).
            # LLM 이 안 채우는 것이 보통이고, 사람이 화면에서 채운다.
            # ★★ 스트림은 **여러 개**일 수 있다 (사용자 지적 2026-08-13) —
            #   두 방향을 함께 흘리거나 포트 짝을 여럿 쓰면 하나로는 안 된다.
            #   화면이 담아 보내는 목록을 그대로 지킨다(값은 화면이 정한다).
            _st = r.get("streams")
            if isinstance(_st, list):
                row["streams"] = [x for x in _st if isinstance(x, dict)][:32]
            for _k in ("name", "smac", "dmac", "sip", "dip", "gw", "vlan", "prio", "cnt",
                       # 부하 단위 · 값이 어떻게 변하는지(고정·증가·감소·무작위)
                       "runit", "framem", "smacm", "dmacm", "vlanm", "sipm", "dipm",
                       # L3 — 시험 화면의 [L3 IP] 탭에 있는 것들
                       "dscp", "ttl", "frag", "sip6", "dip6"):
                row[_k] = str(r.get(_k) or "").strip()[:48]
            try:
                    # ★ `1G` 처럼 붙여 쓴 부하는 숫자로 편다 (사용자 요청 2026-08-13).
                #   단위 칸이 이미 Mbps 인데 값에 또 G 가 붙으면 두 번 읽힌다.
                row["rate"] = _nl_rate_plain(str(r.get("rate") or "").strip()[:32],
                                             row.get("runit") or "Mbps")
                row["frame"] = max(64, min(9600, int(r.get("frame") or 128)))
                row["sec"] = max(1, min(600, int(r.get("sec") or 30)))
            except (TypeError, ValueError):
                row["frame"], row["sec"] = 128, 30
            if not row["desc"]:
                row["desc"] = _NL_INST_ACTIONS[act]
        out.append(row)
    return out


def _nl_iface_ctx(dev_id, dev_model):
    """그 장비의 인터페이스 구성을 한 줄로 돌려준다 (없으면 '').

    ★ 이게 없으면 LLM 이 `show interface ethernet 0/5` 처럼 **지어낸다**.
    장비마다 Gi/Te/Tp 도 다르고 포트 수도 다르다(24포트 · 48포트). 실제로 조회해
    저장해 둔 값이 있으면 그것보다 정확한 근거는 없다.
    """
    try:
        cat = _kv_load_sync("device_catalog", {}) or {}
        devs = cat.get("devices") or []
    except Exception:
        return ""
    hit = None
    for d in devs:
        if dev_id and str(d.get("id") or "") == str(dev_id):
            hit = d
            break
    if hit is None and dev_model:
        want = str(dev_model).strip().lower()
        for d in devs:
            nm = str(d.get("name") or "").strip().lower()
            md = str(d.get("model") or "").strip().lower()
            if want and (want == nm or want == md):
                if (d.get("interfaces") or {}).get("summary"):
                    hit = d
                    break
    ifc = (hit or {}).get("interfaces") or {}
    summ = str(ifc.get("summary") or "").strip()
    if not summ:
        return ""
    lines = ["이 장비의 실제 인터페이스 구성: " + summ]
    for g in (ifc.get("groups") or [])[:6]:
        sh, lg = str(g.get("short") or ""), str(g.get("long") or "")
        if sh and lg and sh.lower() != lg.lower():
            lines.append("  %s = %s (%s ~ %s, %s포트)"
                         % (sh, lg, g.get("from"), g.get("to"), g.get("count")))
    lines.append("없는 포트 번호를 쓰지 마라. 표기는 위 이름을 그대로 따른다.")
    return "\n".join(lines)


async def _nl_tc_corpus(limit=400):
    """**Coverage 의 시험 항목**을 근거로 빚는다 — 학습 항목과 같은 모양으로.

    학습 창고(learned_procedures)가 비어 있으면 LLM 은 근거 없이 명령을 지어낸다.
    이 랩이 실제로 그랬다(2026-08-19 확인: 학습 0건). 그런데 Coverage 에는 이미
    이 장비에서 쓰는 명령과 판정 기준이 다 들어 있다 — 그걸 그대로 근거로 쓴다.

    복사해 두지 않고 **그때그때 읽는다**. 시험을 고치면 근거도 같이 바뀐다.
    """
    try:
        rows = await db.tc_list_full()
    except Exception:
        return []
    out = []
    for d in rows[:limit]:
        if not isinstance(d, dict):
            continue
        steps = []
        for c in (d.get("checks") or []):
            if not isinstance(c, dict):
                continue
            cli = str(c.get("cli") or "").strip()
            if not cli:
                continue
            steps.append({
                "kind": str(c.get("kind") or "cli"),
                "cli": cli,
                "desc": str(c.get("step") or ""),
                "type": str(c.get("type") or ""),
                "criteria": c.get("criteria") if isinstance(c.get("criteria"), str) else "",
            })
        if not steps:
            continue
        models = [x for x in (str(d.get("model") or "").strip(),
                              str(d.get("model_group") or "").strip()) if x]
        out.append({"tcid": str(d.get("tcid") or ""),
                    "title": str(d.get("name") or ""),
                    "models": models, "role": "", "vendor": "",
                    "steps": steps, "outputs": []})
    return out


def _nl_known_clis(dev_model, text="", items=None):
    """검증된 한 줄 명령만 모은다 (교정에 쓴다).

    `items` 를 주면 그것을 근거로 삼는다 — 학습 창고 + Coverage 항목."""
    if items is None:
        try:
            items = (_load_learned() or {}).get("items") or []
        except Exception:
            return []
    out, seen = [], set()
    for it in items:
        for s in (it.get("steps") or []):
            c = str(s.get("cli") or "").strip()
            if not c or "\n" in c or _NOT_CLI_STEP.match(c):
                continue
            if c not in seen:
                seen.add(c)
                out.append(c)
    return out


def _nl_cmd_ctx(dev_model, limit=40, items=None):
    """이 장비에서 **검증된 조회 명령 이름만** 모아 근거로 준다.

    ★★ 절차(_nl_learn_ctx)는 지시문과 가까운 것 몇 건만 뽑아 준다. 그래서 LLM 이
      **스스로 떠올린 스텝**의 명령은 근거 없이 짓게 된다 — "포트 카운터를 통해
      트래픽 입/출력을 확인한다" 라고 적어 놓고 명령은 Cisco 식
      `show interface GigabitEthernet 0/1 counters` 를 냈다. 이 장비의 명령은
      학습에 이미 있던 `show port counter` 다 (사용자 신고 2026-08-13).
    ★ 그래서 절차와 **따로**, 검증된 명령 이름만 통째로 준다. 한 줄짜리 조회 명령만
      모으므로 길지 않다. 같은 모델 것을 앞에 둔다.
    ★ 설정 명령은 안 넣는다 — 설정은 들어가는 **순서**가 있어 이름만 알면 오히려
      틀린다. 그건 절차 예시가 알려 준다.
    """
    if items is None:
        try:
            items = (_load_learned() or {}).get("items") or []
        except Exception:
            return ""
    want = str(dev_model or "").strip().lower()
    mine, other, seen = [], [], set()
    for it in items:
        ms = [str(x).strip().lower() for x in (it.get("models") or [])]
        same = bool(want) and (want in ms or any(want[:5] in m for m in ms if m))
        for s in (it.get("steps") or []):
            c = str(s.get("cli") or "").strip()
            if not c or "\n" in c or _NOT_CLI_STEP.match(c):
                continue
            if not re.match(r"(show|display|ping|traceroute)\b", c, re.I):
                continue
            if c in seen:
                continue
            seen.add(c)
            (mine if same else other).append(c)
    out = (mine + other)[:limit]
    if not out:
        return ""
    return ("이 장비에서 **검증된 조회 명령** (실제로 돌려 본 것들이다):\n"
            + "\n".join("  " + c for c in out)
            + "\n같은 것을 확인하는 스텝이면 위 명령을 **글자 그대로** 써라.\n"
              "네가 아는 다른 장비(Cisco 등) 표기를 지어내지 마라 — 목록에 있는 쪽이 맞다.")


def _nl_snap_cli(cli, known):
    """LLM 이 줄여 낸 명령을 검증된 명령으로 되돌린다.

    ★ 제마는 근거에 `show memory usage` 가 있어도 `show memory` 로 줄여 낸다.
      4회 연속 그랬다 — 프롬프트로 아무리 강조해도 안 고쳐졌다.
      그래서 **낸 명령이 검증된 명령의 앞부분과 정확히 같으면** 그 검증본으로 늘린다.

    늘리기만 한다. 줄이거나 다른 명령으로 바꾸지 않는다 — 사용자가 일부러
    짧게 쓴 것을 함부로 고치면 그게 더 나쁘다.
    """
    c = str(cli or "").strip()
    if not c or c in known:
        return c
    low = c.lower()
    cands = [k for k in known
             if k.lower().startswith(low + " ") and len(k.split()) > len(c.split())]
    if len(cands) != 1:
        return c            # 후보가 여럿이면 고르지 않는다 — 틀리게 고치느니 그대로 둔다
    return cands[0]


def _nl_learn_ctx(dev_model, limit=3, text="", only_config=False, items=None):
    """학습된 절차에서 **지금 만들려는 시험과 가까운 것**을 골라 few-shot 으로 준다.

    ★ 모델만 보고 고르면 안 된다. "메모리 조회" 라고 했는데 Netbios·VLAN 절차가
    뽑히면, 학습 데이터에 `show memory usage` 라는 **정답이 있어도 못 쓴다.**
    그래서 모델 일치(가중치 큼) + 지시문 낱말 일치(가중치 작음)를 함께 본다.

    ★ 명령별 표기는 예시로만 배울 수 있다. 같은 장비에서도
    `show running-config interface GigabitEthernet 0/1` 인데
    `show port cpe mac-address gi0/1` 처럼 **그 명령만 축약형**을 쓴다.
    규칙으로 못 적으므로 실제 절차를 보여 준다.

    output(장비 원문)은 **넣지 않는다** — criteria 보다 20배 길어서 모델이 그 형식을
    흉내 내고, 판정 기준에 정렬 공백까지 섞인다 (담당자 리포트 3번).
    """
    if items is None:
        try:
            items = (_load_learned() or {}).get("items") or []
        except Exception:
            return ""
    want = str(dev_model or "").strip().lower()

    # 지시문에서 뜻 있는 낱말만 남긴다 (2자 이상, 흔한 말 제외)
    # ★ 너무 흔한 말은 뺀다. `인터페이스`·`포트` 는 학습의 **거의 모든 절차**와 걸려서,
    #   그걸로 고르면 지시와 상관없는 절차가 1등이 된다. 실제로 "기가 1번 shutdown"
    #   지시에 VLAN 절차가 뽑혀 그 조회 명령을 그대로 베낀 적이 있다.
    #   포트 번호(`1번`·`0/1`)도 뺀다 — 번호는 인터페이스 구성 근거가 정한다.
    _stop = {"시험", "확인", "조회", "해줘", "하기", "장비", "명령", "상태", "정보", "테스트",
             "인터페이스", "포트", "설정", "기가", "번", "대해", "관련",
             "show", "test", "check", "interface", "port"}
    words = [w for w in re.split(r"[^0-9A-Za-z가-힣]+", str(text or "").lower())
             if len(w) >= 2 and w not in _stop and w != want
             and not re.fullmatch(r"\d+번?|\d+/\d+", w)]

    def _hits(it):
        """이 절차의 스텝 중 지시문 낱말이 걸리는 개수."""
        n = 0
        for s in (it.get("steps") or []):
            blob = (str(s.get("desc") or "") + " " + str(s.get("cli") or "")
                    + " " + str(s.get("criteria") or "")).lower()
            if any(w in blob for w in words):
                n += 1
        return n

    def _score(it):
        ms = [str(x).strip().lower() for x in (it.get("models") or [])]
        s = 0
        if want and want in ms:
            s += 10                                  # 같은 모델이면 압도적으로 우선
        elif want and any(want[:5] in m for m in ms if m):
            s += 5                                   # 같은 계열(E5924…)
        # 지시문과 겹치는 스텝이 있으면 그만큼 올린다. 모델이 달라도
        # "메모리 조회" 에 메모리 절차가 있으면 그게 훨씬 쓸모 있다.
        s += min(_hits(it), 4) * 3
        return s

    # 점수순 상위 N 건을 **채운다.** 점수 0 을 버리면 딱 맞는 절차 1건만 남아,
    # 제마가 그 하나를 절차의 전부로 여기고 조회 한 줄만 내놓는다(실제로 그랬다).
    # 맞는 것을 앞에 두되, 뒤는 다른 절차로 채워 '명령 표기 참고' 폭을 넓힌다.
    # ★ 설정 시험이면 **설정이 든 절차만** 근거로 준다.
    #   조회뿐인 절차를 주면 그 모양을 따라 조회 한 줄로 줄어든다(그래서 예전엔 통째로 뺐다).
    #   하지만 `vlan database` 처럼 **설정 표기는 예시로만 배울 수 있다** — 규칙으로 못 적는다.
    #   그래서 조회뿐인 것만 빼고, 설정이 든 것은 넣는다.
    if only_config:
        items = [it for it in items
                 if any(_CFG_STEP.search(str(s2.get("cli") or "")) for s2 in (it.get("steps") or []))]
        if not items:
            return ""
    ranked = sorted(items, key=_score, reverse=True)
    picked = ranked[:limit]

    out = []
    for it in picked:
        # 지시문과 맞는 스텝을 앞에 둔다 — 6개만 넣으므로 무엇을 넣느냐가 중요하다.
        rows = []
        for s in (it.get("steps") or []):
            cli = str(s.get("cli") or "").strip()
            if not cli or _NOT_CLI_STEP.match(cli):
                continue                             # 제어·계측기 스텝은 뺀다
            blob = (str(s.get("desc") or "") + " " + cli + " "
                    + str(s.get("criteria") or "")).lower()
            rows.append((1 if any(w in blob for w in words) else 0, len(rows), s, cli))
        rows.sort(key=lambda x: (-x[0], x[1]))       # 맞는 것 먼저, 원래 순서 유지
        steps = [{"desc": str(s.get("desc") or ""), "cli": cli,
                  "type": str(s.get("type") or ""),
                  "criteria": str(s.get("criteria") or "")}
                 for _h, _i, s, cli in rows[:6]]
        if steps:
            out.append({"title": str(it.get("title") or ""),
                        "models": it.get("models") or [], "steps": steps})
    if not out:
        return ""

    # ★ 지시와 맞는 명령은 **따로 뽑아 맨 앞에** 둔다.
    #   목록 안에 묻어 두면 제마가 그냥 지나치고 아는 대로 쓴다 — `show memory usage`
    #   가 근거에 두 번 있는데도 `show memory` 로 줄여 낸 적이 있다.
    direct, seen = [], set()
    for it in out:
        for s in it["steps"]:
            cli = s["cli"]
            if "\n" in cli or cli in seen:
                continue
            blob = (s["desc"] + " " + cli + " " + s["criteria"]).lower()
            if words and any(w in blob for w in words):
                seen.add(cli)
                direct.append(cli)
    head = ""
    if direct:
        # ★ "참고용" 이라고 분명히 한다. 앞서 "이 중에서 골라 쓴다" 라고 했더니,
        #   설정 시험을 시켰는데도 목록에 있는 **조회 명령 하나만** 내놓았다.
        #   명령 이름·표기를 베끼라는 뜻이지, 절차를 이걸로 때우라는 뜻이 아니다.
        head = ("[검증된 명령 표기] 아래는 실제 장비에서 확인된 명령이다. **같은 일을 하는 명령을 쓸 때는 "
                "이 표기를 글자 그대로 따른다**(줄이거나 바꾸지 마라). 다만 지시에 필요한 다른 명령은 "
                "여기 없어도 만들어야 한다 — 이 목록이 절차의 전부가 아니다:\n"
                + "\n".join("  " + c for c in direct[:8]) + "\n\n")
    return (head
            + "아래는 **실제로 검증된** 시험 절차다. 명령 표기·판정 기준 형식을 그대로 따르라.\n"
            "(이 장비의 것이 아닐 수 있다 — 명령 이름과 판정 형식만 참고하고, 포트 번호는 위 인터페이스 구성을 따른다)\n"
            + json.dumps(out, ensure_ascii=False))


def _nl_chat_me(token: str) -> str:
    """이 요청이 누구인지. 못 알아내면 빈 문자.

    ★ 빈 문자를 **사람으로 취급하면 안 된다.** 예전에는 토큰 없이 들어온 요청을
    `by=""` 로 저장해서, 로그인하지 않은 모두가 **같은 대화 묶음을 공유**했다
    (남의 대화가 내 목록에 뜨고, 내가 지울 수도 있었다).
    """
    u = _user_from_token(token)
    return str((u or {}).get("username") or "")


def _nl_chats_all():
    d = _kv_load_sync("nl_chats", {"items": []})
    return d if isinstance(d, dict) and isinstance(d.get("items"), list) else {"items": []}


def _nl_stable(a, b):
    """두 번 읽은 응답에서 **안 바뀐 부분만** 남긴다."""
    la = str(a or "").replace(chr(13), "").split(_LF)
    lb = str(b or "").replace(chr(13), "").split(_LF)
    out = []
    for i, x in enumerate(la):
        y = lb[i] if i < len(lb) else ""
        if x.strip() and x == y:
            out.append(x)
            continue
        # 줄이 다르면 쉼표로 쪼개 같은 조각만 (한 줄에 고정·변동이 섞인 경우)
        px = [t.strip() for t in x.split(",")]
        py = [t.strip() for t in y.split(",")]
        same = [t for j, t in enumerate(px) if t and j < len(py) and t == py[j]]
        if same:
            out.append(", ".join(same))
    return _LF.join(out)


def _nl_squash(s):
    """견주기용으로 공백을 하나로 누른다 (정렬 칸 때문에 안 맞는 것을 막는다)."""
    return " ".join(str(s or "").split())


#: 「이름 : 값」 한 줄 — 장비 조회 응답의 거의 전부가 이 꼴이다
_NL_KV_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9 /._-]{1,40}?)\s*:\s*(\S.*)$")


def _nl_en_words(s):
    """견줄 낱말만 남긴다 (영문·숫자, 소문자)."""
    return [w for w in re.split(r"[^0-9A-Za-z]+", str(s or "").lower()) if w]


def _nl_pick_line(desc, out):
    """그 스텝이 보려는 줄을 응답에서 **곧장** 고른다. 못 고르면 빈 글자.

    같은 명령을 여러 스텝이 함께 쓰면(show system 을 일곱 번) LLM 에게는
    똑같은 응답 일곱 개가 간다. 그러면 Main Memory 스텝에 Flash Memory 를
    다는 뒤바뀜이 난다 — 실사고다. 게다가 「있는지」 만 보는 검사(부분
    일치)라 `ain Memory Size` 처럼 첫 글자가 떨어진 조각도 통과했다.

    스텝이 무엇을 보려는지는 desc 에 적혀 있다. 줄의 **이름** 과 맞대 우리가
    먼저 정한다 — 사람이 눈으로 하는 것과 같다. 어중간하거나 두 줄이 다투면
    안 고른다(틀린 기준보다 빈 기준이 낫다).
    """
    dw = set(_nl_en_words(desc))
    if not dw:
        return ""
    best, second, pick = 0.0, 0.0, ""
    for ln in str(out or "").replace(chr(13), "").split(_LF):
        m = _NL_KV_RE.match(ln.rstrip())
        if not m:
            continue
        kw = _nl_en_words(m.group(1))
        if not kw:
            continue
        sc = len([w for w in kw if w in dw]) / float(len(kw))
        if sc > best:
            best, second, pick = sc, best, ln.strip()
        elif sc > second:
            second = sc
    return pick if (best >= 0.5 and best > second) else ""


def _nl_whole_word(t, out):
    """out 안의 t 가 **낱말 가운데서** 시작·끝나지 않는가.

    `ain Memory Size` 는 `Main Memory Size` 안에 들어 있어 「있는지」 검사를
    그냥 통과했다 — 첫 글자가 떨어진 조각이 기준으로 앉았다(실사고).
    한 군데라도 낱말 경계에 맞게 들어 있으면 참으로 본다.
    """
    for m in re.finditer(re.escape(t), out):
        a, b = m.start(), m.end()
        if (a == 0 or not out[a - 1].isalnum()) and (b >= len(out) or not out[b].isalnum()):
            return True
    return False


def _nl_snap_lines(toks, out):
    """LLM 이 낸 문구를 **응답에 있는 줄 그대로**로 되돌린다. 없으면 버린다."""
    lines = [x.rstrip() for x in str(out or "").replace(chr(13), "").split(_LF)]
    keep = []
    for t in toks:
        # 글자 그대로, 그리고 **낱말째로** 있으면 그대로. 조각이면 아래로
        # 흘려 그 조각이 든 **온 줄**로 되돌린다.
        if t and t in out and _nl_whole_word(t, out):
            keep.append(t)
            continue
        q = _nl_squash(t)
        if not q:
            continue
        hit = next((l.strip() for l in lines if l.strip() and q in _nl_squash(l)), "")
        if hit and hit in out and hit not in keep:
            keep.append(hit)
    return keep


def _nl_probe(dev, cmds):
    """조회 명령을 **두 번** 보내 안 바뀐 응답만 돌려준다. {cmd: stable}"""
    got = {}
    for _round in (0, 1):
        r = run_cli({"host": dev.get("ip"), "port": dev.get("port"),
                     "protocol": dev.get("protocol"), "username": dev.get("username"),
                     "password": dev.get("password"), "secret": dev.get("secret"),
                     "device_type": dev.get("device_type"), "commands": cmds})
        outs = (r or {}).get("outputs") or []
        for i, c in enumerate(cmds):
            got.setdefault(c, ["", ""])
            # ★ run-cli 는 {command, output, at} **꾸러미**를 준다 (문자열이 아니다).
            #   그대로 str() 하면 시각(at)까지 섞여 두 번 읽은 것이 늘 달라진다.
            o = outs[i] if i < len(outs) else ""
            got[c][_round] = str(o.get("output") or "") if isinstance(o, dict) else str(o)
    return {c: _nl_stable(v[0], v[1]) for c, v in got.items()}


def _tc_words(text):
    """지시문에서 뜻 있는 낱말만 남긴다 (2자 이상, 중복 없이).

    ★ 같은 뜻의 영어·한글을 함께 담는다 — 한글로 시켰는데 TC 제목이 영어인 일이 흔하다.
    ★ `3번`·`0/1` 같은 번호는 뺀다 — 어느 포트인지는 TC 를 고르는 근거가 못 된다.
    """
    out = []
    for w in re.split(r"[^0-9A-Za-z가-힣]+", str(text or "").lower()):
        if len(w) < 2 or w in _TC_STOP:
            continue
        if re.match(r"^[0-9]+번?$", w):
            continue
        for x in [w] + _TC_SYN.get(w, []):
            if x not in out:
                out.append(x)
    return out


def _tc_score(meta, words, want_model):
    """이 TC 가 지금 지시와 얼마나 가까운가 — (점수, 걸린 낱말).

    ★ 제목에서 걸리면 크게, 곁다리(REQ·설명)에서 걸리면 작게 본다.
    ★ 모델이 같으면 크게 준다 — 같은 모델의 검증된 절차가 가장 잘 맞는다.
      다만 **모델만으로는 못 고른다.** 낱말이 하나도 안 걸리면 0점이다.
    """
    hay_t = str(meta.get("name") or "").lower()
    hay_o = " ".join(str(meta.get(k) or "") for k in
                     ("req_id", "reqTitle", "desc", "purpose", "type", "kind")).lower()
    md = str(meta.get("model") or "").strip().lower()
    want = str(want_model or "").strip().lower()
    hits, sc, real = [], 0, 0
    for w in words:
        # 모델명처럼 생긴 말은 **모델로만** 본다 — 제목에 안 적는 것이 보통이다.
        # ★ 비슷한 이름(E5924K ↔ E5924L)은 **다른 장비**다. 앞자리가 같다고 크게 주면
        #   하는 일이 전혀 다른 TC 가 1등이 된다 (실제 135건에 대 보니 그랬다).
        if _TC_MODEL_RE.match(w):
            if md and w == md:
                sc += 4
                hits.append(w)
            elif w in hay_t:
                sc += 3
                hits.append(w)
                real += 1
            elif md and (w[:5] in md or md[:5] in w):
                sc += 1
                hits.append(w)
            continue
        if w in hay_t:
            sc += 3
            hits.append(w)
            real += 1
        elif w in hay_o:
            sc += 1
            hits.append(w)
            real += 1
    # ★ 모델만 같고 **하는 일이 안 걸린** 것은 후보가 아니다 — 가져오면 엉뚱한 시험이다
    if not hits or not real:
        return 0, []
    if want and md and md != "공통":
        if md == want:
            sc += 5
        elif want[:5] and (want[:5] in md or md[:5] in want):
            sc += 2
    return sc, hits


def _tc_iface_groups(dev_id, dev_model):
    """고른 장비의 인터페이스 묶음 — 표기를 바꿀 때 쓴다 (없으면 [])."""
    try:
        cat = _kv_load_sync("device_catalog", {}) or {}
        devs = cat.get("devices") or []
    except Exception:
        return []
    hit = None
    for d in devs:
        if dev_id and str(d.get("id") or "") == str(dev_id):
            hit = d
            break
    if hit is None and dev_model:
        want = str(dev_model).strip().lower()
        for d in devs:
            nm = str(d.get("name") or "").strip().lower()
            md = str(d.get("model") or "").strip().lower()
            if want and want in (nm, md) and ((d.get("interfaces") or {}).get("groups")):
                hit = d
                break
    return ((hit or {}).get("interfaces") or {}).get("groups") or []


def _tc_if_kind(tok):
    t = str(tok or "").lower()
    for kind, names in _TC_IF_KIND:
        if t in names:
            return kind
    return ""


def _tc_port_span(v):
    """'0/24' → ('0', 24) · '24' → ('', 24)"""
    s = str(v or "")
    if "/" in s:
        a, b = s.split("/", 1)
        return a.strip(), int(re.sub(r"[^0-9]", "", b) or 0)
    return "", int(re.sub(r"[^0-9]", "", s) or 0)


def _tc_fit_cli(cli, groups):
    """TC 의 명령을 **고른 장비 표기**로 바꾼다 — (바꾼 명령, 알림 목록).

    ★ 이름 모양은 그대로 둔다 — 짧게 쓴 것(`gi 0/1`)은 짧게, 길게 쓴 것은 길게.
      그 명령만 축약형을 쓰는 장비가 있어, 통째로 길게 펴면 오히려 안 먹는다.
    ★ 그 장비에 **없는 포트 번호는 범위 안으로 당긴다.** 24포트 TC 를 8포트 장비로
      가져오면 9번부터는 없는 포트라, 그대로 두면 시험이 통째로 헛돈다.
    """
    txt = str(cli or "")
    notes = []
    if not txt.strip() or not groups:
        return txt, notes

    def one(m):
        tok, a, b = m.group(1), m.group(2), m.group(3)
        kind = _tc_if_kind(tok)
        g = None
        for x in groups:
            if str(x.get("kind") or "") == kind:
                g = x
                break
        if g is None:
            g = groups[0]
        short = str(g.get("short") or "")
        name = short if (len(tok) <= 4 and short) else str(g.get("long") or short or tok)
        slot, lo = _tc_port_span(g.get("from"))
        _, hi = _tc_port_span(g.get("to"))
        # ★ 반복 변수(${i})가 포트 자리에 오면 **건드리지 않는다** — 숫자가 아니라
        #   회차마다 바뀌는 값이다. 이름·슬롯만 이 장비 것으로 맞춘다.
        num = b if b is not None else a
        if not str(num).isdigit():
            core = ("%s/%s" % (slot, b)) if (b is not None and slot != "") else str(num)
        else:
            want = int(num)
            idx = want
            if hi and idx > hi:
                idx = hi
            if lo and idx < lo:
                idx = lo
            if idx != want:
                notes.append("포트 %d → %d (이 장비에는 %d번이 없습니다)" % (want, idx, want))
            core = ("%s/%d" % (slot, idx)) if slot != "" else str(idx)
        gap = " " if re.match(r"^[A-Za-z]+\s", m.group(0)) else ""
        out = name + gap + core
        if out.lower().replace(" ", "") != m.group(0).lower().replace(" ", ""):
            notes.append("표기 %s → %s" % (m.group(0), out))
        return out

    return _TC_IF_RE.sub(one, txt), notes


def _tc_val_only(s):
    """이 기준이 값뿐인가 — 토막(+ · , · / 로 이어 적기)까지 본다.

    ★ `VLAN0003`·`E5924RL`·`line protocol is up` 처럼 뜻이 있는 것은 그대로 둔다.
      멀쩡한 기준까지 비우면 무엇이 나와도 합격이 된다.
    """
    parts = [x.strip() for x in re.split(r"[+~,/]| {2,}", str(s or "")) if x.strip()]
    return bool(parts) and all(_TC_VAL_TOK.match(x) for x in parts)


def _tc_crit_plain(crit):
    """값이 든 합격 기준에서 **값을 덜어 낸다** — 문구만 남긴다 (사용자 결정 2026-08-14).

    같은 시험이라도 값은 장비마다 다르다. `Main Memory Size : 2 GB` 를 그대로
    가져오면 4 GB 장비에서 늘 불합격이다. 문구만 남겨 두고, 한 번 돌린 뒤
    **실제 응답에서** 값을 고르게 한다.
    ★ 덜어 내고 남는 것이 없으면(숫자뿐인 기준) 원본을 그대로 둔다 — 빈 기준은
      무엇이 나와도 합격이라 더 나쁘다.
    """
    out, changed = [], 0
    for ln in str(crit or "").split("\n"):
        s = ln.strip()
        if not s:
            continue
        # ★ 값뿐이면 통째로 비운다 — 남길 문구가 없다
        if _tc_val_only(s):
            changed += 1
            continue
        v = s
        if ":" in v:
            v = v.split(":")[0].strip()
        elif "=" in v:
            v = v.split("=")[0].strip()
        else:
            v = _TC_VAL_RE.sub("", v).strip()
        if len(v) < 3 or not re.search(r"[A-Za-z가-힣]", v):
            v = s
        if v != s:
            changed += 1
        out.append(v)
    return "\n".join(out), changed


def _tc_src_models(tc):
    """가져올 TC 가 어느 모델 것인가 — 모델 칸과 제목의 괄호에서 모은다.

    ★ 제목에 `System 정보 조회 (E5724RL)` 처럼 적어 두는 일이 많다. 모델 칸이 비어도
      그 이름이 판정 기준에 그대로 박혀 있다.
    """
    out = []
    for v in [str((tc or {}).get("model") or "")] + re.findall(
            r"[(\[]\s*([A-Za-z][A-Za-z0-9-]{3,})\s*[)\]]", str((tc or {}).get("name") or "")):
        v = str(v or "").strip()
        if v and v != "공통" and _TC_MODEL_RE.match(v) and v.lower() not in [x.lower() for x in out]:
            out.append(v)
    return out


def _tc_swap_model(text, src_models, dst):
    """원본 TC 의 모델 이름을 **고른 장비 모델**로 바꾼다 (사용자 신고 2026-08-14).

    ★ E5724RL 용 TC 를 E5924RL 장비로 가져왔더니 합격 기준이 `E5724RL` 그대로였다 —
      그 장비는 제 이름을 내놓으므로 **늘 불합격**이다. 판정 기준·명령·설명 모두 바꾼다.
    ★ 대소문자는 가리지 않되 **글자 경계**를 본다 — 다른 낱말에 든 것은 안 건드린다.
    """
    s = str(text or "")
    if not s or not dst:
        return s, False
    hit = False
    for m in (src_models or []):
        if not m or m.lower() == str(dst).lower():
            continue
        # 붙임표도 이름의 한 부분이다 — E5724RL-2 는 **다른 모델**이라 안 건드린다
        new = re.sub(r"(?<![A-Za-z0-9-])" + re.escape(m) + r"(?![A-Za-z0-9-])",
                     str(dst), s, flags=re.I)
        if new != s:
            s, hit = new, True
    return s, hit


def _tc_to_steps(checks, groups, src_models=None, dst_model=""):
    """TC 스텝(checks) 을 **자연어 시험 절차**로 옮긴다 — (steps, notes).

    ★ 뜻이 같은 것만 옮긴다. TC 의 IF 는 **합격·불합격을 가르는** 것이고 자연어 시험의
      갈림길은 **보낼 명령을 가르는** 것이라 뜻이 다르다 — 옮기지 않고 알린다.
    ★ 들여쓰기는 **반복 안에 있는지**로만 다시 센다. TC 의 '단계 묶음' 은 자연어
      시험에 없는 것이라, 그 들여쓰기를 그대로 가져오면 반복이 잘못 묶인다.
    """
    steps, hints = [], []
    stack = []                 # 열려 있는 반복 — 그 줄의 TC 들여쓰기를 담는다
    fixed = blanked = swapped = empty_crit = 0
    skipped = {}
    for c in (checks or []):
        if not isinstance(c, dict):
            continue
        kind = str(c.get("kind") or "cli").lower()
        try:
            ind = int(c.get("indent") or 0)
        except Exception:
            ind = 0
        while stack and ind <= stack[-1]:
            stack.pop()
        depth = len(stack)
        if kind == "cli":
            cli = str(c.get("cli") or "").strip()
            if not cli:
                continue
            cli2, ns = _tc_fit_cli(cli, groups)
            if ns:
                fixed += 1
                hints.extend(ns)
            crit, ch = _tc_crit_plain(c.get("criteria"))
            blanked += ch
            # ★ 모델 이름도 이 장비 것으로 — 안 바꾸면 그 이름을 찾는 기준이 늘 불합격이다
            desc2 = str(c.get("desc") or "").strip()
            cli2, _s1 = _tc_swap_model(cli2, src_models, dst_model)
            crit, _s2 = _tc_swap_model(crit, src_models, dst_model)
            desc2, _s3 = _tc_swap_model(desc2, src_models, dst_model)
            if _s1 or _s2 or _s3:
                swapped += 1
            t = str(c.get("type") or "")
            if t not in ("contains", "contains_all", "notcontains") or not crit:
                if t and not crit:
                    empty_crit += 1      # 값만 있던 기준을 비워 판정할 것이 없어졌다
                t, crit = "", ""
            steps.append({"kind": "cli", "indent": depth,
                          "desc": desc2,
                          "cli": cli2, "type": t, "criteria": crit})
        elif kind in ("comment", "message"):
            # 주석은 **실행되지 않지만** 절차를 읽는 사람에게는 제목이다.
            # Coverage 의 스텝 목록이 「Comment Main Memory 확인 → CLI show
            # system」 으로 읽히는 까닭이다. 빼면 무엇을 보는 스텝인지 모른다.
            txt = str(c.get("text") or c.get("desc") or "").strip()
            if not txt:
                continue
            txt, _sx = _tc_swap_model(txt, src_models, dst_model)
            steps.append({"kind": "comment", "indent": depth, "desc": txt, "text": txt})
        elif kind in ("snmp_get", "snmp_set", "snmp_trap", "ping"):
            # ★ 실행기는 이것들을 **이미 돈다**(/api/snmp-get · snmp-set ·
            #   snmp-trap/wait · ping). 옮기는 이 자리에서만 버려서 SNMP 항목은
            #   스텝이 통째로 안 나왔다(지적) — 그대로 옮긴다.
            crit, ch = _tc_crit_plain(c.get("criteria"))
            blanked += ch
            crit, _sm = _tc_swap_model(crit, src_models, dst_model)
            desc2, _sd = _tc_swap_model(str(c.get("desc") or "").strip(), src_models, dst_model)
            if _sm or _sd:
                swapped += 1
            t = str(c.get("type") or "")
            if t not in ("contains", "contains_all", "notcontains") or not crit:
                if t and not crit:
                    empty_crit += 1
                t, crit = "", ""
            st = {"kind": kind, "indent": depth, "desc": desc2,
                  "oid": str(c.get("oid") or c.get("cli") or "").strip(),
                  "type": t, "criteria": crit}
            for k2 in ("community", "snmpVersion", "snmpPort", "snmpValue", "snmpType", "trapSec",
                       "host", "count", "sizeB", "timeoutSec"):
                if c.get(k2) not in (None, ""):
                    st[k2] = c.get(k2)
            steps.append(st)
        elif kind == "wait":
            try:
                sec = int(c.get("waitSec") or 5)
            except Exception:
                sec = 5
            steps.append({"kind": "wait", "indent": depth, "sec": max(1, sec)})
        elif kind == "loop":
            mode = str(c.get("loopMode") or "count").lower()
            if mode == "for":
                try:
                    fr = int(c.get("forFrom") or 1)
                    to = int(c.get("forTo") or 1)
                except Exception:
                    fr, to = 1, 1
                steps.append({"kind": "for", "indent": depth,
                              "var": str(c.get("loopVar") or "i"),
                              "from": fr, "to": max(fr, to)})
            elif mode == "count":
                try:
                    n = int(c.get("loopCount") or 1)
                except Exception:
                    n = 1
                steps.append({"kind": "for", "indent": depth, "var": "i",
                              "from": 1, "to": max(1, n)})
            else:
                skipped["반복(멈출 때까지)"] = skipped.get("반복(멈출 때까지)", 0) + 1
                continue
            stack.append(ind)
        else:
            nm = _TC_KIND_SKIP.get(kind, kind)
            skipped[nm] = skipped.get(nm, 0) + 1

    notes = []
    if swapped:
        notes.append("모델 이름을 이 장비 것으로 바꾼 스텝 %d개 (%s → %s)"
                     % (swapped, " · ".join(src_models or []), dst_model))
    if fixed:
        notes.append("표기를 이 장비에 맞춘 스텝 %d개" % fixed)
    for h in list(dict.fromkeys(hints))[:4]:
        notes.append("· " + h)
    if blanked:
        notes.append("값을 비운 합격 기준 %d개 — 돌린 뒤 응답에서 고르세요" % blanked)
    if empty_crit:
        notes.append("기준이 통째로 빈 스텝 %d개 — 지금은 오류만 없으면 합격입니다" % empty_crit)
    for k, v in skipped.items():
        notes.append("못 옮긴 스텝 %d개 — %s (이 화면에서는 못 도는 것입니다)" % (v, k))
    return steps, notes


def _ai_ex_row(x):
    """질문 보기 한 줄로 다듬는다 — 질문이 비면 None (그 줄은 버린다)."""
    if isinstance(x, dict):
        q = str(x.get("q") or "").strip()[:200]
        d = str(x.get("d") or "").strip()[:200]
    else:
        q, d = str(x or "").strip()[:200], ""
        # ★★ 옛 서버가 {q, d} 를 **글자로 눌러** 담은 줄을 되살린다 (사용자 신고 2026-08-14).
        #   설명 칸을 붙이기 전 서버는 한 줄을 str() 로 눌러 담았다. 새 화면이 그 서버로
        #   보내는 동안 "{'q': '…', 'd': '…'}" 꼴이 그대로 목록에 남았다.
        if q[:1] == "{" and ("'q'" in q or '"q"' in q):
            try:
                import ast as _ast
                v = _ast.literal_eval(q)
                if isinstance(v, dict):
                    q = str(v.get("q") or "").strip()[:200]
                    d = str(v.get("d") or "").strip()[:200]
            except Exception:
                pass
    return {"q": q, "d": d} if q else None


# ══ 길 (엔드포인트) ═════════════════════════════

@app.get("/api/ai/nl-chats")
async def nl_chats_list(token: str = ""):
    """내 대화 목록. 본문(메시지)은 빼고 제목·시각만 준다 — 목록은 가벼워야 한다."""
    me = _nl_chat_me(token)
    if not me:
        return {"ok": True, "items": []}      # 로그인 안 했으면 보여 줄 내 대화가 없다
    out = []
    for c in _nl_chats_all()["items"]:
        if not isinstance(c, dict) or (c.get("by") or "") != me:
            continue
        out.append({"id": c.get("id"), "title": c.get("title") or "새 대화",
                    "at": c.get("at"), "n": len(c.get("msgs") or [])})
    out.sort(key=lambda x: str(x.get("at") or ""), reverse=True)
    return {"ok": True, "items": out}


@app.get("/api/ai/nl-chats/{cid}")
async def nl_chat_get(cid: str, token: str = ""):
    """대화 하나를 통째로 — 메시지·절차·실행 결과까지."""
    me = _nl_chat_me(token)
    if not me:
        return {"ok": False, "error": "로그인이 필요합니다"}
    for c in _nl_chats_all()["items"]:
        if isinstance(c, dict) and c.get("id") == cid and (c.get("by") or "") == me:
            return {"ok": True, "chat": c}
    return {"ok": False, "error": "그 대화를 찾지 못했습니다"}


@app.post("/api/ai/nl-chats")
async def nl_chat_save(payload: dict, token: str = ""):
    """대화를 저장한다 (같은 id 면 덮어쓴다)."""
    me = _nl_chat_me(token)
    if not me:
        return {"ok": False, "error": "로그인이 필요합니다"}
    cid = str((payload or {}).get("id") or "").strip()
    if not cid:
        return {"ok": False, "error": "id 가 없습니다"}
    store = _nl_chats_all()
    items = [c for c in store["items"]
             if isinstance(c, dict) and not (c.get("id") == cid and (c.get("by") or "") == me)]
    items.insert(0, {
        "id": cid, "by": me,
        "title": str(payload.get("title") or "새 대화")[:80],
        "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "msgs": payload.get("msgs") if isinstance(payload.get("msgs"), list) else [],
        "plan": payload.get("plan") if isinstance(payload.get("plan"), dict) else None,
        "run": payload.get("run") if isinstance(payload.get("run"), list) else None,
        # 작업 흐름도 함께 담는다 — 이걸 안 담아서 기록을 열면 흐름이 두 줄로
        # 요약돼 있었다(지적). 무엇을 왜 그렇게 정했는지가 거기에만 있다.
        "flow": payload.get("flow") if isinstance(payload.get("flow"), list) else None,
        "vals": payload.get("vals") if isinstance(payload.get("vals"), list) else None,
        "notes": payload.get("notes") if isinstance(payload.get("notes"), list) else None,
        "dev": str(payload.get("dev") or ""),
        "allow_config": bool(payload.get("allow_config")),
    })
    # 내 것만 세어 자른다 — 남의 대화를 지우면 안 된다.
    mine, kept = 0, []
    for c in items:
        if (c.get("by") or "") == me:
            mine += 1
            if mine > _NL_CHAT_MAX:
                continue
        kept.append(c)
    _kv_save_sync("nl_chats", {"items": kept})
    return {"ok": True, "id": cid}


@app.delete("/api/ai/nl-chats/{cid}")
async def nl_chat_del(cid: str, token: str = ""):
    """기록 하나 지우기 — **내 것만**. 남의 대화는 못 지운다."""
    me = _nl_chat_me(token)
    if not me:
        return {"ok": False, "error": "로그인이 필요합니다"}
    want = str(cid or "").strip()
    store = _nl_chats_all()
    kept = [
        c for c in store["items"]
        if not (isinstance(c, dict) and c.get("id") == want and (c.get("by") or "") == me)
    ]
    if len(kept) == len(store["items"]):
        return {"ok": False, "error": "그 기록이 없습니다"}
    _kv_save_sync("nl_chats", {"items": kept})
    return {"ok": True, "id": want}


@app.post("/api/ai/nl-criteria")
async def ai_nl_criteria(payload: dict):
    """빈 판정 기준을 **실제 응답**을 근거로 채운다.

    두 갈래로 부른다.
      · probe=True  — 조회 시험. 여기서 **직접 두 번 읽고** 기준을 짓는다.
      · outputs 지정 — 설정 시험. 화면이 [실행] 으로 이미 받아 둔 응답을 넘긴다.
        (설정 명령은 미리 못 돌린다 — 진짜로 포트가 내려간다)
    """
    steps = payload.get("steps") if isinstance(payload.get("steps"), list) else []
    steps = [s for s in steps if isinstance(s, dict) and str(s.get("cli") or "").strip()]
    if not steps:
        return {"ok": False, "error": "채울 스텝이 없습니다"}
    outs = payload.get("outputs") if isinstance(payload.get("outputs"), dict) else {}
    outs = {str(k): v for k, v in outs.items()}
    probe = bool(payload.get("probe")) and not outs

    if probe:
        dev = payload.get("device") if isinstance(payload.get("device"), dict) else {}
        if not str(dev.get("ip") or "").strip():
            return {"ok": False, "error": "장비 정보가 없습니다"}
        # ★ 조회 명령만 미리 보낸다. 설정 명령이 하나라도 섞이면 통째로 안 한다 —
        #   '만들기만 해서는 장비가 안 바뀐다' 는 약속을 지켜야 한다.
        cmds = []
        for s in steps:
            for ln in str(s.get("cli") or "").split(_LF):
                ln = ln.strip()
                if not ln:
                    continue
                if not _nl_plan_cmd_ok(ln, False):
                    return {"ok": False, "skipped": "config",
                            "error": "설정을 바꾸는 명령이 있어 미리 읽지 않았습니다"}
                cmds.append(ln)
        cmds = list(dict.fromkeys(cmds))          # 같은 명령은 한 번만
        if not cmds:
            return {"ok": False, "error": "읽을 명령이 없습니다"}
        try:
            got = await asyncio.to_thread(_nl_probe, dev, cmds)
        except Exception as e:
            return {"ok": False, "error": "미리 읽지 못했습니다: " + str(e)[:200]}
        outs = {}
        for s in steps:
            first = next((x.strip() for x in str(s.get("cli") or "").split(_LF) if x.strip()), "")
            outs[str(s.get("i"))] = got.get(first, "")

    # ★ desc 로 곧장 짚히는 줄을 미리 구해 둔다. **판단은 LLM 이 한다**(지시) —
    #   이건 LLM 을 건너뛰려는 것이 아니라, LLM 이 **남의 스텝 줄**을 집어 왔을
    #   때(Main 자리에 Flash — 실사고) 그것만 바로잡는 자다.
    fixed = {}
    for s in steps:
        o = str(outs.get(str(s.get("i")), "") or "")
        ln = _nl_pick_line(s.get("desc"), o)
        if ln:
            fixed[str(s.get("i"))] = ln

    rows = []
    for s in steps:
        o = str(outs.get(str(s.get("i")), "") or "").strip()
        if not o:
            continue
        rows.append({"i": s.get("i"), "desc": str(s.get("desc") or ""),
                     "cli": str(s.get("cli") or ""), "응답": o[:1200]})
    if not rows:
        return {"ok": False, "error": "근거로 쓸 응답이 없습니다"}

    schema = {"type": "object", "properties": {"items": {"type": "array", "items": {
        "type": "object", "properties": {
            "i": {"type": "integer"},
            "type": {"type": "string"},
            "criteria": {"type": "string"}}}}}, "required": ["items"]}
    sys_p = _LF.join([
        "너는 네트워크 장비 시험의 **합격 기준**을 정하는 전문가다.",
        "스텝마다 실제 장비 응답을 준다. 그 응답에서 **그대로 있는 문구**를 골라 기준을 지어라.",
        "",
        "[규칙]",
        "1. 응답에 **없는 문구를 지어내지 마라.** 반드시 준 응답에서 글자 그대로 복사한다.",
        "2. **값까지 담아라.** 이름만 담으면 값이 무엇이든 늘 합격이다.",
        "     X  'Main Memory Size'        O  'Main Memory Size    : 2 GB'",
        "3. 준 응답은 **두 번 읽어 안 바뀐 부분만** 남긴 것이다(또는 실제 실행 결과다).",
        "   그래도 uptime·사용률·카운터처럼 **다음에 달라질 값**이 보이면 고르지 마라.",
        "4. type 은 'contains_all' 로 하고, criteria 는 **한 줄에 한 문구씩** 적는다.",
        "   그 스텝이 확인하려는 것(desc)에 맞는 문구만 1~3개. 많이 담을수록 잘 깨진다.",
        "5. 그 스텝에서 확인할 만한 또렷한 문구가 없으면 type·criteria 를 빈 문자열로 두어라.",
        "   **틀린 기준보다 빈 기준이 낫다.**",
        "i 는 준 값을 그대로 돌려준다. JSON만 출력한다.",
    ])
    content, err = await _ai_chat(
        [{"role": "system", "content": sys_p},
         {"role": "user", "content": json.dumps(rows, ensure_ascii=False)}],
        max_tokens=900, json_schema=schema)
    if err:
        return {"ok": False, "error": err}
    obj = _nl_json_any(content) or {}
    # ★ _nl_json_any 는 **배열도** 돌려준다(제마가 실제로 그렇게 답한다). 그대로
    #   .get("items") 하면 AttributeError 로 500 이 난다 — 실제로 그랬다.
    if isinstance(obj, list):
        obj = {"items": obj}
    if not isinstance(obj, dict):
        obj = {}
    # 다른 스텝이 쓸 줄들 — LLM 이 이 중 하나를 집어 오면 뒤바뀐 것이다
    items, got = [], set()
    for it in (obj.get("items") or []):
        if not isinstance(it, dict):
            continue
        c = str(it.get("criteria") or "").strip()
        t = str(it.get("type") or "")
        if not c or t not in ("contains", "contains_all", "notcontains"):
            continue
        # ★ 지어낸 것을 거른다 — 준 응답에 **정말 있는지** 줄마다 확인한다.
        #   다만 **정렬 공백**은 봐 준다. 장비 출력은 `S/W Version         : 1.0.9`
        #   처럼 칸을 맞춰 놓는데 LLM 은 `S/W Version : 1.0.9` 로 눌러 적는다.
        #   글자만 맞으면 **응답에 있는 그 줄 그대로**를 기준으로 삼는다 —
        #   그래야 판정(indexOf)이 실제로 통과한다.
        o = str(outs.get(str(it.get("i")), "") or "")
        toks = _nl_snap_lines([x.strip() for x in c.split(_LF) if x.strip()], o)
        if not toks:
            continue
        key = str(it.get("i"))
        crit = _LF.join(toks)
        mine = fixed.get(key, "")
        others = {v for k2, v in fixed.items() if k2 != key}
        # ★ 뒤바뀜만 바로잡는다. LLM 이 고른 줄이 **다른 스텝의 줄**이고 이 스텝이
        #   짚을 줄이 따로 있으면, 이 스텝 것으로 돌린다. 그 밖에는 LLM 판단 그대로.
        if mine and crit != mine and crit in others:
            crit, t = mine, "contains"
        items.append({"i": it.get("i"),
                      "type": "contains_all" if len(crit.split(_LF)) > 1 else t,
                      "criteria": crit})
        got.add(key)
    # LLM 이 아무 말도 안 한 스텝에만 짚어 둔 줄을 넣는다 — 빈 기준보다 낫다
    for s in steps:
        k3 = str(s.get("i"))
        if k3 not in got and fixed.get(k3):
            items.append({"i": s.get("i"), "type": "contains", "criteria": fixed[k3]})
    # ★ 이 장비 응답에 **없는 옛 기준**을 짚어 준다.
    #   가져온 항목은 원본 TC 의 기준을 이고 온다 — 그 랩의 호스트명 같은 것이라
    #   이 장비에서는 반드시 불합격이다(실사고: hostname R3 인데 기준은
    #   QA_MAIN_L3). 화면이 이걸 보고 비운다.
    stale = []
    for s in steps:
        k4 = str(s.get("i"))
        if k4 in got:
            continue                                   # 새로 정해졌으니 볼 것 없다
        old_c = str(s.get("criteria") or "").strip()
        o4 = str(outs.get(k4, "") or "")
        if not old_c or not o4:
            continue                                   # 기준이 없거나 못 읽은 스텝
        if not _nl_snap_lines([x.strip() for x in old_c.split(_LF) if x.strip()], o4):
            stale.append(s.get("i"))
    return {"ok": True, "items": items, "stale": stale, "probed": bool(probe)}


@app.get("/api/ai/nl-tc-like")
async def ai_nl_tc_like(text: str = "", model: str = "", limit: int = 3):
    """지금 지시와 비슷한 TC 를 몇 건 골라 준다 (사용자 요청 2026-08-14).

    목록(meta)만 읽는다 — 스텝까지 읽으면 TC 가 수백 건일 때 몇 초씩 걸린다.
    """
    words = _tc_words(text)
    if not words:
        return {"ok": True, "items": []}
    try:
        rows = await db.tc_list_meta()
    except Exception:
        return {"ok": False, "error": "TC 목록을 읽지 못했습니다", "items": []}
    scored = []
    for m in (rows or []):
        if not isinstance(m, dict):
            continue
        try:
            n = int(m.get("_cli_count") or 0)
        except Exception:
            n = 0
        if n <= 0:
            continue                    # 스텝이 없는 TC 는 가져와도 빈 절차다
        sc, hits = _tc_score(m, words, model)
        # ★ 한 낱말만 스친 것은 **안 보여 준다** (2026-08-14). 엉뚱한 TC 를 들이밀면
        #   사람이 가져오기 자체를 안 믿게 된다 — 없으면 없는 대로 새로 지으면 된다.
        if sc < _TC_MIN_SCORE:
            continue
        scored.append({"tcid": m.get("tcid"), "name": m.get("name") or m.get("tcid"),
                       "req": m.get("req_id") or "", "model": m.get("model") or "",
                       "steps": n, "score": sc, "hits": hits[:4]})
    scored.sort(key=lambda x: (-x["score"], -x["steps"]))
    try:
        lim = max(1, min(int(limit or 3), 5))
    except Exception:
        lim = 3
    return {"ok": True, "items": scored[:lim]}


@app.post("/api/ai/nl-tc-adopt")
async def ai_nl_tc_adopt(payload: dict):
    """고른 TC 를 **선택한 장비에 맞게 옮겨** 절차로 돌려준다. 장비에 접속하지 않는다."""
    tcid = str((payload or {}).get("tcid") or "").strip()
    if not tcid:
        return {"ok": False, "error": "어느 TC 인지 알려 주세요"}
    try:
        tc = await db.tc_get(tcid)
    except Exception:
        tc = None
    if not tc:
        return {"ok": False, "error": "TC 를 찾지 못했습니다"}
    groups = _tc_iface_groups(payload.get("device_id"), payload.get("model"))
    dst = str((payload or {}).get("model") or "").strip()
    steps, notes = _tc_to_steps(tc.get("checks") or [], groups, _tc_src_models(tc), dst)
    if not steps:
        return {"ok": False, "error": "이 TC 에는 옮길 수 있는 스텝이 없습니다"}
    if not groups:
        notes.append("이 장비의 인터페이스 구성이 없어 표기는 그대로 두었습니다")
    return {"ok": True, "title": str(tc.get("name") or tcid),
            "purpose": "Tests 의 %s 를 가져와 이 장비에 맞게 옮긴 절차입니다" % tcid,
            "steps": steps, "blocked": [],
            "tc": {"tcid": tcid, "name": str(tc.get("name") or ""), "notes": notes}}


@app.post("/api/ai/nl-plan")
async def ai_nl_plan(payload: dict):
    """자연어 지시 → **시험 초안**(제목 + 스텝 목록). 장비에 접속하지 않는다.

    실행은 화면이 `/api/run-cli` 로 따로 한다 — 사용자가 고친 CLI 를 그대로 쓰기 위해서다.
    """
    text = str((payload or {}).get("text") or "").strip()
    if not text:
        return {"ok": False, "error": "무엇을 시험할지 적어 주세요"}
    dev_model = str(payload.get("model") or "").strip()
    # ★ 스위치를 없앴다. 만들기는 늘 다 만들고, 위험한 것은 돌리기 직전에 묻는다.
    # 다만 **설정 시험인지**는 여전히 알아야 한다 — 프롬프트 모양과 학습 예시가 갈린다.
    allow_cfg = _nl_wants_config(text)
    # 대화로 고치기 — 지금 절차를 함께 보내면 **새로 만들지 않고 고쳐서** 돌려준다.
    prev = payload.get("steps") if isinstance(payload.get("steps"), list) else []
    prev_title = str(payload.get("title") or "").strip()

    schema = {"type": "object", "properties": {
        "title": {"type": "string"}, "purpose": {"type": "string"},
        "steps": {"type": "array", "items": {"type": "object", "properties": {
            "kind": {"type": "string"},          # cli(기본) · if · for · wait · inst
            "indent": {"type": "integer"},       # 반복 블록 안이면 1 크게 (0=반복 밖)
            "desc": {"type": "string"}, "cli": {"type": "string"},
            "type": {"type": "string"}, "criteria": {"type": "string"},
            "condition": {"type": "string"},     # if 일 때 — 예: ${out} 포함 [y/n] · ${i} == 11
            "then": {"type": "string"},          # if 참일 때 보낼 명령
            "otherwise": {"type": "string"},     # if 거짓일 때 보낼 명령 (없으면 건너뜀)
            "var": {"type": "string"},           # for 일 때 — 반복 변수
            "from": {"type": "integer"}, "to": {"type": "integer"},
            "sec": {"type": "integer"},          # wait 일 때 — 대기 초 (inst start 면 인가 시간)
            "action": {"type": "string"},        # inst 일 때 — reserve·config·start·stat·stop·release
            "ports": {"type": "string"},         # inst 일 때 — 잡을 계측기 포트 (예: 3-1,3-2)
            "cnt": {"type": "string"},           # inst config 일 때 — 스트림 개수 (기본 1)
            "streams": {"type": "array", "items": {"type": "object"}},   # 스트림 목록 (화면이 채운다)
            "runit": {"type": "string"},         # 부하 단위 — Percent(%) · Mbps · bps · Frames/sec(fps)
            "smacm": {"type": "string"},         # 값이 어떻게 변하나 — Fixed · Increment · Decrement · Random
            "rate": {"type": "string"},          # inst config 일 때 — 예: 1.2G · 10%
            "frame": {"type": "integer"}}}}},    # inst config 일 때 — 프레임 크기(바이트)
        "required": ["steps"]}

    # 설정 시험은 **모양**을 알려 줘야 한다. 안 알려 주면 설정을 시켰는데도
    # `show running-config …` 한 줄만 내놓는다 (실제로 그랬다).
    _rule = ("설정 변경 명령도 만들 수 있다. 다만 되돌릴 수 없는 명령(reload·erase·format·"
             "factory·upgrade·firmware·write·delete)은 절대 만들지 마라.\n"
             "[설정 시험의 모양] 사용자가 설정을 바꾸는 시험을 시키면 **반드시 세 부분**으로 만든다:\n"
             "  ① 설정한다 — 한 스텝의 cli 에 진입부터 여러 줄로 적는다. 예:\n"
             "       configure terminal\\n       interface GigabitEthernet 0/1\\n       shutdown\\n       end\n"
             "  ② 확인한다 — show 로 그 설정이 실제로 들어갔는지 본다 (type·criteria 를 채운다).\n"
             "  ③ 되돌린다 — 바꾼 것을 원래대로 돌려놓는다. 예: no shutdown\n"
             "     ※ 인터페이스만 생각하지 마라. **만드는 시험**도 같은 세 부분이다:\n"
             "       'vlan 3 생성 시험' → ① configure terminal / vlan database / vlan 3 / end\n"
             "                            ② show vlan   (criteria: 'VLAN0003')\n"
             "                            ③ configure terminal / vlan database / no vlan 3 / end\n"
             "                            ※ VLAN 은 `vlan database` 로 **한 단계 더 들어가서** 만든다.\n"
             "                              `configure terminal` 바로 밑에서 `vlan 3` 하면 안 된다.\n"
             "       'ip 주소 할당' → ① 설정 ② show 로 확인 ③ no ip address 로 되돌림\n"
             "     ※ ① 없이 ② 만 내놓으면 **만들지도 않고 조회만 하는 시험**이 된다.\n"
             "[트래픽] 부하(rate)와 프레임 크기(frame)는 **사용자가 말했을 때만** 적는다. "
             "말이 없으면 비워 둬라 — 시스템이 회선의 10% · 128바이트로 채운다.\n"             "1100 Mbps · 1518 같은 값을 지어내지 마라.\n"
             "[reload] 재부팅 시험이면 cli 에 `reload` 만 적어라. 장비가 되묻는 y/n 응답은 시스템이 자동으로 붙인다.\n"
             "확인만 하는 절차를 내놓지 마라. 시키지 않은 설정은 건드리지 마라.\n") if allow_cfg else (
        "조회(show/display/ping 등) 명령만 만든다. 설정 변경 명령은 절대 만들지 마라.\n"
        "다만 **계측기 스텝(kind=\"inst\")은 쓸 수 있다** — 장비 설정을 바꾸지 않고\n"
        "트래픽만 흘리는 것이므로 조회 시험에서도 허용된다.\n")
    sys_p = ("너는 네트워크 장비 시험 설계 전문가다. 사용자의 지시를 장비에서 돌릴 시험 절차로 만든다.\n"
             "각 스텝: desc(무엇을 확인하는지 한국어 한 줄), cli(실행할 명령 한 줄), "
             "type(contains=출력에 있어야 정상 / notcontains=없어야 정상 / 빈 문자열=오류만 없으면 합격), "
             "criteria(type 이 contains·notcontains 일 때 출력에서 찾을 문자열).\n"
             "확실한 판정 문자열이 없으면 type 과 criteria 를 빈 문자열로 두어라 — 지어내지 마라.\n"
             "\n"
             "[판정 기준은 **값까지** 담는다 — 가장 자주 틀리는 곳]\n"
             "항목 이름만 적으면 **무엇을 확인하는 시험인지 알 수 없다.** 그 이름은 명령을 치면\n"
             "늘 나오므로, 값이 무엇이든 항상 합격이 된다.\n"
             "  지시: '메인 메모리 용량 확인'\n"
             "    X  criteria: 'Main Memory Size'        ← 이름만 — 0 GB 여도 합격이다\n"
             "    O  criteria: 'Main Memory Size : 2 GB' ← 값까지 — 용량이 바뀌면 불합격\n"
             "  지시: '포트 상태 확인'\n"
             "    X  criteria: 'line protocol'\n"
             "    O  criteria: 'line protocol is up'\n"
             "※ 값을 **모르면** 지어내지 마라. 그럴 때는 type·criteria 를 빈 문자열로 두고,\n"
             "  돌린 뒤 실제 응답을 보고 사람이 고르게 한다. **틀린 기준보다 빈 기준이 낫다.**\n"
             "※ 다만 근거(검증된 절차·인터페이스 구성)에 값이 있으면 그것을 쓴다.\n"
             "※ **한·두 글자만 적지 마라.** 숫자 하나를 기준으로 쓰면 엉뚱한 곳에 걸린다.\n"
             "     지시: 'vlan 3 생성'\n"
             "       X  criteria: '3'          ← Gi0/3 · Gi0/13 · Gi0/23 에 걸려 **없어도 합격**이 된다\n"
             "       O  criteria: 'VLAN0003'   ← 그 VLAN 을 짚는 또렷한 문구\n"
             "\n[제어 스텝] 명령만 늘어놓지 말고, 시험에 필요하면 아래를 쓴다. kind 로 구분한다.\n"
             "  kind=\"cli\"  (기본) 명령을 보낸다. cli 에 적는다.\n"
                          "  kind=\"if\"   조건을 보고 갈린다.\n"
             "                condition: 왼쪽 · 연산자 · 오른쪽 을 띄어쓴다.\n"
             "                  연산자: == != 포함 > < >= <=   (여러 개면 && 또는 || 로 잇는다)\n"
             "                  `${out}` 은 **앞 스텝의 출력**, `${변수}` 는 반복 변수 값이다.\n"
             "                  예) `${out} 포함 [y/n]` · `${i} == 11` · `${i} >= 3 && ${i} <= 5`\n"
             "                then:      참일 때 보낼 명령 (예: n)\n"
             "                otherwise: 거짓일 때 보낼 명령. 없으면 비운다.\n"
             "                ※ 조건은 반드시 위 형태로 적어라. 연산자 없는 문장(예: `11번 포트면`)은\n"
             "                  읽지 못해 시험이 그 자리에서 멈춘다.\n"
             "                ※ reload 는 **두 번** 물을 수 있다. 같은 `[y/n]` 이라 그 글자로 가르면\n"
             "                  안 된다 — 저장하지 말아야 할 자리에 y 가 나가 설정이 저장된다.\n"
             "                  묻는 문구로 가른다:\n"
             "                    `${out} 포함 Save?`     → n  (설정을 저장하지 않는다)\n"
             "                    `${out} 포함 continue`  → y  (재부팅은 진행한다)\n"
             "  kind=\"for\"  반복한다. var·from·to 를 적는다.\n"
             "                ※ **반복할 스텝들은 indent 를 1 크게 적는다.** 그 들여쓴 스텝까지가\n"
             "                  반복 안이고, 다시 indent 가 작아지면 반복 밖이다.\n"
             "                  for 안에 steps 를 중첩하지 마라. 명령 안에서 ${var} 를 쓴다.\n"
             "                예) 24개 포트를 껐다 켜며 확인 — 세 스텝이 **모두** 반복 안이다:\n"
             "                    [{\"kind\":\"for\",\"var\":\"i\",\"from\":1,\"to\":24,\"indent\":0},\n"
             "                     {\"kind\":\"cli\",\"indent\":1,\"cli\":\"configure terminal\\ninterface GigabitEthernet 0/${i}\\nshutdown\\nend\"},\n"
             "                     {\"kind\":\"cli\",\"indent\":1,\"cli\":\"show interface GigabitEthernet 0/${i}\",\"type\":\"contains\",\"criteria\":\"administratively down\"},\n"
             "                     {\"kind\":\"cli\",\"indent\":1,\"cli\":\"configure terminal\\ninterface GigabitEthernet 0/${i}\\nno shutdown\\nend\"}]\n"
             "  kind=\"wait\" 장비가 준비될 때까지 기다린다. sec 에 초를 적는다 (재부팅 뒤 등).\n"
             "  kind=\"inst\" **계측기**(트래픽 발생기)로 트래픽을 흘린다. cli 는 비우고 action 을 적는다.\n"
             "                action 은 이 여섯 가지뿐이다 — 다른 말을 지어내지 마라:\n"
             "                  reserve  계측기 포트를 예약한다 (트래픽 스텝 맨 앞)\n"
             "                  config   스트림을 만든다. rate(예: 1.2G · 10%) · frame(바이트) 를 적는다\n"
             "                  start    트래픽을 인가한다. **얼마나 흘릴지는 여기 적지 않는다** —\n"
             "                           멈추라고 할 때까지 흐르므로, 뒤에 wait 스텝을 두어 기다린다\n"
             "                  stat     송수신량을 읽어 손실을 본다 (여기서 type·criteria 를 쓸 수 있다)\n"
             "                  stop     트래픽을 멈춘다\n"
             "                  release  포트를 반납한다 (맨 뒤 — 빼먹으면 다음 사람이 못 쓴다)\n"
             "                ※ 어느 계측기로 보낼지는 **사람이 화면에서 고른다.** 장비 이름을 적지 마라.\n"
             "모든 스텝에 indent 를 적어라 (반복 밖이면 0). 제어 스텝을 억지로 넣지 마라 — 필요할 때만 쓴다.\n"
             "\n[트래픽을 흘려야 하는 시험 — 언제 계측기를 쓰나]\n"
             "설정이 **실제로 동작하는지** 보려면 값을 읽는 것만으로는 모자란다. 아래 기능은\n"
             "설정을 넘기는 트래픽을 흘려 봐야 동작을 확인할 수 있다:\n"
             "  rate limit · policer · QoS · shaping · storm control · ACL 차단 · 대역 제한\n"
             "  그리고 손실률·처리량·지연 처럼 흘려 봐야 나오는 값 전부\n"
             "이런 시험이면 **반드시 다섯 부분**으로 만든다:\n"
             "  ① show 로 지금 설정값을 읽는다 (기준값을 안다)\n"
             "  ② inst reserve → inst config (기준값을 **넘기는** rate 로) → inst start\n"
             "     → wait (흐르는 동안 기다린다. sec 에 초를 적는다)\n"
             "  ③ 장비에서 확인한다 — show interface … counters 로 입력·출력을 본다\n"
             "  ④ inst stat 으로 송수신량을 읽는다\n"
             "  ⑤ inst stop → inst release 로 정리한다\n"
             "예) rate limit 시험 — 설정이 1000 Mbps 면 1.2G 를 흘려 초과분이 버려지는지 본다:\n"
             "  [{\"kind\":\"cli\",\"indent\":0,\"desc\":\"지금 rate limit 설정값을 읽는다\",\"cli\":\"show rate-limit\"},\n"
             "   {\"kind\":\"inst\",\"indent\":0,\"action\":\"reserve\"},\n"
             "   {\"kind\":\"inst\",\"indent\":0,\"action\":\"config\",\"rate\":\"1.2G\",\"frame\":1518},\n"
             "   {\"kind\":\"inst\",\"indent\":0,\"action\":\"start\"},\n"
             "   {\"kind\":\"wait\",\"indent\":0,\"sec\":30},\n"
             "   {\"kind\":\"cli\",\"indent\":0,\"desc\":\"출력이 설정값으로 제한되는지 본다\",\"cli\":\"show interface counters\"},\n"
             "   {\"kind\":\"inst\",\"indent\":0,\"action\":\"stat\"},\n"
             "   {\"kind\":\"inst\",\"indent\":0,\"action\":\"stop\"},\n"
             "   {\"kind\":\"inst\",\"indent\":0,\"action\":\"release\"}]\n"
             "※ 설정 값만 보라고 한 시험(설정 상태만 확인 등)이면 계측기를 쓰지 마라.\n"
             "※ 그 밖의 조회 시험에도 쓰지 마라. 계측기는 포트를 잡아 다른 사람이 못 쓴다.\n"
             "\n[CLI 표기 규칙 — 가장 중요]\n"
             "근거에 검증된 절차가 있으면, 거기에 나온 **명령을 글자 그대로 복사해서 쓴다.**\n"
             "- 근거에 `show memory usage` 가 있으면 `show memory` 로 줄이지 마라. 한 글자도 바꾸지 마라.\n"
             "- 지시와 맞는 명령이 근거에 있으면 **반드시 그것을 쓴다.** 네가 아는 다른 명령을 쓰지 마라.\n"
             "- 인터페이스 표기도 근거를 따른다. 예: GigabitEthernet 0/5 (X: ethernet 0/5, X: gi 0/5).\n"
             "- 근거에 없는 포트 번호는 만들지 마라.\n"
             + _rule + "JSON만 출력한다.")

    # 근거를 모아 준다 — 없으면 LLM 이 Cisco 식으로 지어낸다.
    ctx = []
    _if = _nl_iface_ctx(payload.get("device_id"), dev_model)
    if _if:
        ctx.append(_if)
    # ★ 설정 시험이면 **설정이 든 학습 절차만** 근거로 준다 (2026-08-11).
    #   예전엔 통째로 뺐다 — 조회뿐인 예시를 주면 그 모양을 따라 조회 한 줄로 줄었기 때문이다.
    #   하지만 `configure terminal → vlan database → vlan 3` 같은 **진입 순서는 예시로만**
    #   배울 수 있다. 규칙으로 못 적고 장비마다 다르다. 실제로 그 학습이 있는데도 근거에서
    #   빠져 `vlan database` 없이 절차가 나왔다.
    # 근거 — 학습된 절차가 앞, 그다음이 Coverage 의 시험 항목(지시).
    # 학습이 비어 있어도 이 랩에서 실제로 쓰는 명령·기준으로 짓게 된다.
    try:
        _learned = (_load_learned() or {}).get("items") or []
    except Exception:
        _learned = []
    _corpus = _learned + await _nl_tc_corpus()
    _lc = _nl_learn_ctx(dev_model, text=text, only_config=allow_cfg, items=_corpus)
    if _lc:
        ctx.append(_lc)
    # ★★ 절차에 안 뽑힌 스텝은 명령을 지어낸다 — 검증된 명령 이름을 따로 준다
    #    (사용자 신고 2026-08-13: `show interface … counters` ← `show port counter`)
    _cc = _nl_cmd_ctx(dev_model, items=_corpus)
    if _cc:
        ctx.append(_cc)
    user_p = "대상 모델: %s\n" % (dev_model or "공통")
    if ctx:
        user_p += "\n" + "\n\n".join(ctx) + "\n"
    if prev:
        # ★ 고치는 경우다. 지금 절차를 그대로 보여 주고 **바뀐 부분만** 손대게 한다.
        #   안 그러면 "3번을 60초로" 라고 했는데 절차 전체를 새로 지어 낸다.
        _pv = []
        for _i, _s in enumerate(prev, 1):
            if not isinstance(_s, dict):
                continue
            _row = {"n": _i, "kind": str(_s.get("kind") or "cli"),
                    "desc": str(_s.get("desc") or ""), "cli": str(_s.get("cli") or ""),
                    "type": str(_s.get("type") or ""), "criteria": str(_s.get("criteria") or ""),
                    "condition": str(_s.get("condition") or ""), "then": str(_s.get("then") or ""),
                    "otherwise": str(_s.get("otherwise") or ""), "var": str(_s.get("var") or ""),
                    "from": _s.get("from"), "to": _s.get("to"), "sec": _s.get("sec"),
                    "indent": _s.get("indent") or 0}
            # ★ 돌려 본 적이 있으면 **그 응답**을 함께 준다.
            #   합격 기준을 넣어 달라고 했는데 실제 응답을 모르면 지어낼 수밖에 없다.
            #   (실제로 "합격 기준도 넣어줘" 에 기준이 안 들어갔다 — 2026-08-11)
            _o = str(_s.get("output") or "").strip()
            if _o:
                _row["실행해_본_응답"] = _o[:600]
            _pv.append(_row)
        user_p += ("\n[지금 만들어 둔 시험 절차] 제목: %s\n%s\n"
                   "위 절차를 사용자의 말대로 **고쳐서** 전체를 다시 내놓아라. "
                   "고치라고 하지 않은 스텝은 **그대로 두어라** — 새로 지어내지 마라.\n"
                   "스텝에 `실행해_본_응답` 이 있으면 그것이 **그 장비의 진짜 출력**이다. "
                   "합격 기준을 넣거나 고칠 때는 **거기 있는 문구를 그대로 골라** 써라 "
                   "(값까지 담아서). 없는 문구를 지어내지 마라.\n"
                   % (prev_title or "(제목 없음)", json.dumps(_pv, ensure_ascii=False)))
        user_p += "\n고칠 내용: %s" % text
    else:
        user_p += "\n지시: %s" % text

    content, err = await _ai_chat(
        [{"role": "system", "content": sys_p},
         {"role": "user", "content": user_p}],
        max_tokens=1200, json_schema=schema)
    if err:
        return {"ok": False, "error": err}
    obj = _nl_json_any(content)
    if obj is None:
        return {"ok": False, "error": "LLM 응답을 읽지 못했습니다 — 다시 시도해 주세요"}

    _known = _nl_known_clis(dev_model, text, items=_corpus)
    _cfg_touched = False       # 앞 스텝에서 설정을 바꿨나 (reload 의 저장 질문 판단)
    steps, blocked = [], []
    for s in _nl_steps_from(obj):
        # 제어 스텝(if·for·wait)은 명령이 아니다. 조건 안의 명령만 안전 검사한다.
        if s["kind"] != "cli":
            # 계측기 스텝은 장비로 나가는 명령이 아니다 — 검사할 CLI 가 없다
            if s["kind"] == "inst":
                steps.append(s)
                continue
            _inner = [s.get("then", ""), s.get("otherwise", "")]
            _bad2 = [x for x in _inner if x and not _nl_plan_cmd_ok(x, True)]
            if _bad2:
                blocked.extend(_bad2)
                continue
            steps.append(s)
            continue
        # 여러 줄 CLI 는 줄마다 본다 — 한 줄만 위험해도 그 스텝은 통째로 막는다.
        s["cli"] = _nl_split_cli(s["cli"])
        # 줄여 낸 명령을 검증된 것으로 되돌린다 (show memory → show memory usage)
        s["cli"] = "\n".join(_nl_snap_cli(x, _known)
                             for x in str(s["cli"]).split("\n") if x.strip())
        lines = [x.strip() for x in str(s["cli"]).split("\n") if x.strip()]
        bad = [x for x in lines if not _nl_plan_cmd_ok(x, True)]
        if bad:
            blocked.extend(bad)
            continue
        # 설정을 바꾼 적이 있으면 기억해 둔다 — reload 때 장비가
        # "System configuration has been modified. Save? [y/n]:" 를 먼저 묻는다.
        # ★ 앞 스텝에서 바꾸고 뒤 스텝에서 reload 하는 것이 보통이라, **절차 전체**를 봐야 한다.
        # `\b` 를 쓰면 `configure terminal` 이 `config` 로 안 걸린다 — 접두사로 본다.
        # 설정 모드 진입(config·vlan database)이나 설정을 바꾸는 명령이 하나라도 있으면
        # 그 뒤의 reload 는 "Save? [y/n]" 을 먼저 묻는다.
        if any(re.match(r"^\s*(do\s+)?(conf(ig(ure)?)?\b|vlan\s+database\b|no\s+\S)", x, re.I)
               for x in lines):
            _cfg_touched = True
        # reload 는 장비가 y/n 을 되묻는다. 응답을 안 보내면 그대로 멈춘다.
        # ★ 자동으로 끼워 넣지 않고 **조건문 스텝**으로 만든다 (사용자 결정 2026-08-04).
        #   설정을 바꿨는지 정규식으로 추측하는 것보다, 장비가 실제로 물은 것을 보고
        #   갈리는 편이 정확하다. 사용자도 화면에서 그 분기를 보고 고칠 수 있다.
        _has_reload = any(re.match(r"^\s*(do\s+)?(reload|reboot)\b", x, re.I) for x in lines)
        # ★ reload 말고도 되묻는 명령이 있다. `no vlan 3` 은
        #   "continue to delete vlan ? [y/n])" 을 묻고, 응답을 안 보내면 거기서 멈춘다.
        #   (사용자가 실제 출력을 줬다 — 2026-08-11)
        _has_del = any(re.search(r"^\s*no\s+vlan\b", x, re.I) for x in lines)
        _yn_after = [x for x in lines if x.strip().lower() in ("y", "n", "yes", "no")]
        if s["type"] not in ("contains", "notcontains"):
            s["type"], s["criteria"] = "", ""      # 판정 문자열 없이 type 만 오면 거짓 기준이 된다
        # ★ 한 스텝에 여러 줄을 담지 않는다(지시) — **CLI 한 줄이 스텝 하나**다.
        #   줄바꿈으로 뭉쳐 두면 무엇이 몇 번째로 나가는지 목록에서 안 읽히고,
        #   한 줄짜리 입력칸에서 고치다 줄바꿈이 통째로 사라지는 사고도 있었다.
        #   설명은 첫 줄이, 판정은 마지막 줄이 갖는다 — 설정 시험은 마지막에
        #   확인 명령이 오기 때문이다.
        # ★ 다만 **설정 모드로 들어가는 블록은 나누지 않는다.**
        #   `configure terminal` 다음 줄부터는 그 세션이 설정 모드에 있어야 하는데,
        #   스텝을 나누면 한 스텝이 한 번의 run-cli 라 프롬프트 상태가 이어진다는
        #   보장이 없다(사용자 지적: 다음 CLI 가 새 프롬프트에서 나갔다).
        #   조회 명령만 여럿인 경우에만 줄마다 스텝으로 가른다.
        _entersCfg = any(
            re.match(r"^\s*(do\s+)?(conf(ig(ure)?)?\b|vlan\s+database\b)", x, re.I) for x in lines
        )
        if len(lines) > 1 and not _entersCfg:
            for _i, _ln in enumerate(lines):
                _s2 = dict(s)
                _s2["cli"] = _ln
                if _i:
                    _s2["desc"] = ""
                if _i != len(lines) - 1:
                    _s2["type"], _s2["criteria"] = "", ""
                steps.append(_s2)
        else:
            steps.append(s)
        # reload 뒤에 응답이 없으면 **분기 스텝**을 덧붙인다.
        #   ① 설정을 바꿨으면 "Save?" 를 먼저 묻는다 → 물으면 n, 안 물으면 건너뛴다
        #   ② "continue to reboot ?" 에는 y
        # LLM 이 이미 분기를 만들어 뒀으면 덧붙이지 않는다 — 안 그러면 같은 응답이 두 번 간다.
        _has_yn_branch = any(x.get("kind") == "if"
                             and str(x.get("then", "")).strip().lower() in ("y", "n", "yes", "no")
                             for x in _nl_steps_from(obj))
    # ★★ 판단 값을 **절차 전체**로 다시 잰다 (2026-08-11).
    #   루프 안에서 잰 `_has_reload`·`_yn_after` 는 **마지막 CLI 스텝** 것만 남는다.
    #   `reload` 가 1번이고 마지막이 `show logging` 이면 reload 를 못 본 셈이 되어
    #   순서 세우기가 통째로 안 돌았다 — 화면에서 실제로 그랬다.
    _all_cli = "\n".join(str(x.get("cli") or "") for x in steps)
    _has_reload = bool(re.search(r"^\s*(do\s+)?(reload|reboot)\b", _all_cli, re.I | re.M))
    _has_del = bool(re.search(r"^\s*no\s+vlan\b", _all_cli, re.I | re.M))
    _yn_after = [x for x in _all_cli.split("\n") if x.strip().lower() in ("y", "n", "yes", "no")]
    _has_yn_branch = any(x.get("kind") == "if"
                         and str(x.get("then", "")).strip().lower() in ("y", "n", "yes", "no")
                         for x in steps)

    # ★ 되묻기 손질은 **절차를 다 모은 뒤** 한 번만 한다 (2026-08-11).
    #   예전엔 CLI 스텝마다 돌아서, 마지막 스텝 차례에는 아직 안 붙은 분기를
    #   못 보고 끝났다 — 순서를 세워도 그 뒤에 붙는 분기가 뒤죽박죽이 됐다.
    # ★★ LLM 이 만든 분기가 **위험하면 바로잡는다** (2026-08-11).
    #   `reload` 는 두 번 묻는다: 먼저 `Save? [y/n]`, 그 다음 `continue to reboot ? [y/n]`.
    #   그런데 LLM 이 `${out} 포함 [y/n]` → `y` 를 만들면 **첫 물음(Save?)에 걸려**
    #   설정이 저장돼 버린다. 사용자가 "저장하지 말라" 고 못박은 흐름과 정반대다.
    #   `[y/n]` 은 물음이 아니라 **응답 형식**이라 그것으로 가르면 안 된다.
    for _st in steps:
        if _st.get("kind") != "if":
            continue
        _c = str(_st.get("condition") or "")
        _t = str(_st.get("then") or "").strip().lower()
        # 응답 형식(`[y/n]`·`(y/n)`)만 보고 갈리는 분기
        if not re.search(r"[\[(]\s*y\s*/\s*n\s*[\])]", _c):
            continue
        if _t in ("y", "yes"):
            # 저장하지 않는다 — 재부팅은 뒤에 오는 `continue` 분기가 맡는다
            _st["condition"] = "${out} 포함 Save?"
            _st["then"] = "n"
            _st["desc"] = "설정 저장을 물으면 저장하지 않는다"
        elif _t in ("n", "no"):
            _st["condition"] = "${out} 포함 Save?"
            _st["desc"] = "설정 저장을 물으면 저장하지 않는다"

    # ★★ 되묻기 분기의 `아니면` 에 y/n 을 두면 **안 물었는데도 보낸다** (2026-08-11).
    #   화면에서 실제로 났다: 2번이 이미 `y` 로 재부팅을 시작했는데, 3번이 조건 거짓이라
    #   `아니면` 의 `y` 를 **또 보냈다.** 장비는 이미 내려가는 중이라 그 y 는 갈 곳이 없고,
    #   그대로 응답을 기다리다 시험이 통째로 timed out 났다.
    #   되묻기는 **물었을 때만** 답하는 것이다 — 안 물었으면 아무것도 안 보낸다.
    for _st in steps:
        if _st.get("kind") != "if":
            continue
        _o = str(_st.get("otherwise") or "").strip().lower()
        if _o in ("y", "n", "yes", "no"):
            _c2 = str(_st.get("condition") or "").lower()
            if any(w in _c2 for w in ("save", "continue", "reboot", "delete", "y/n", "confirm")):
                _st["otherwise"] = ""


    # 바로잡고 나면 `Save?` 분기가 둘일 수 있다 (LLM 이 만든 것 + 원래 있던 것).
    # 같은 조건·같은 응답이면 하나만 남긴다 — 두 번 보내면 두 번째가 새 명령이 된다.
    _seen_if = set()
    _kept = []
    for _st in steps:
        if _st.get("kind") == "if":
            _k = (str(_st.get("condition") or "").strip().lower(),
                  str(_st.get("then") or "").strip().lower())
            if _k in _seen_if:
                continue
            _seen_if.add(_k)
        _kept.append(_st)
    steps = _kept

    # ★ 바로잡느라 `y` 분기를 `Save? → n` 으로 바꿨으면 **재부팅 확인이 없어진다.**
    #   reload 는 결국 진행 여부를 묻는데 답할 스텝이 없으면 거기서 멈춘다.
    if _has_reload and not _yn_after and not any(
            "continue" in str(x.get("condition") or "").lower()
            or "reboot" in str(x.get("condition") or "").lower() for x in steps):
        steps.append({
            "kind": "if", "desc": "재부팅 확인에 응답한다",
            "cli": "", "type": "", "criteria": "",
            "condition": "${out} 포함 continue", "then": "y", "otherwise": "",
        })

    # ★★ **묻는 순서대로 세운다** (사용자 지적 2026-08-11).
    #   IF 는 위에서부터 차례로 본다. `Save?` 를 먼저 묻는데 `continue` 분기가 위에 있으면,
    #   그 조건이 거짓이라 **아무것도 안 보내고 지나간다.** 그러면 장비는 여전히
    #   `Save?` 에서 기다리는데 남은 분기로는 재부팅까지 못 간다 — 부팅이 안 된다.
    #   reload 바로 뒤의 y/n 분기 묶음만 골라, Save? → continue 순으로 다시 세운다.
    if _has_reload:
        _ri = -1
        for _k, _st in enumerate(steps):
            if re.match(r"^\s*(do\s+)?(reload|reboot)\b",
                        str(_st.get("cli") or "").strip(), re.I):
                _ri = _k
        if _ri >= 0:
            _grp, _k = [], _ri + 1
            while _k < len(steps) and steps[_k].get("kind") == "if" \
                    and str(steps[_k].get("then") or "").strip().lower() in ("y", "n", "yes", "no"):
                _grp.append(steps[_k]); _k += 1
            if len(_grp) > 1:
                def _ord(x):
                    c = str(x.get("condition") or "").lower()
                    if "save" in c:
                        return 0                    # 저장 물음이 먼저다
                    if "continue" in c or "reboot" in c:
                        return 1                    # 재부팅 확인은 그 다음
                    return 2
                steps[_ri + 1:_k] = sorted(_grp, key=_ord)

    # 지우기 확인 — 묻는 문구(`delete`)로 갈라야 한다.
    if _has_del and not _yn_after and not _has_yn_branch:
        steps.append({
            "kind": "if", "desc": "지우기 확인에 응답한다",
            "cli": "", "type": "", "criteria": "",
            "condition": "${out} 포함 delete", "then": "y", "otherwise": "",
        })
    if _has_reload and not _yn_after and not _has_yn_branch:
        if _cfg_touched:
            steps.append({
                "kind": "if", "desc": "설정 저장을 물으면 저장하지 않는다",
                "cli": "", "type": "", "criteria": "",
                "condition": "${out} 포함 Save?", "then": "n", "otherwise": "",
            })
        # ★ 여기서 `[y/n]` 을 보면 안 된다. 앞의 "Save? [y/n]" 에도 그 글자가 있어서
        #   같이 걸리고, 저장하지 말아야 할 자리에 y 가 나가 **설정이 저장된다.**
        #   묻는 문구(`continue`/`reboot`)로 갈라야 한다.
        steps.append({
            "kind": "if", "desc": "재부팅 확인에 응답한다",
            "cli": "", "type": "", "criteria": "",
            "condition": "${out} 포함 continue", "then": "y", "otherwise": "",
        })

    title = str(obj.get("title") or "").strip() if isinstance(obj, dict) else ""
    if not title:
        title = prev_title or text[:60]     # 고치는 중이면 원래 제목을 지킨다
    purpose = str(obj.get("purpose") or "").strip() if isinstance(obj, dict) else ""

    if not steps:
        return {"ok": False, "title": title, "blocked": blocked,
                "error": ("만들 수 있는 명령이 없습니다"
                          + (" — 위험해서 막은 명령: " + ", ".join(blocked[:5]) if blocked else ""))}
    # ★★ 트래픽이 필요한 시험인데 계측기 스텝이 하나도 없으면 여기서 덧댄다.
    #    프롬프트로 시켰어도 작은 모델은 자주 빠뜨린다 — 빠지면 '동작 시험' 이라
    #    적어 놓고 show 한 줄만 도는 거짓 시험이 된다 (사용자 신고 2026-08-13).
    if steps and _nl_wants_traffic(text) and not any(s.get("kind") == "inst" for s in steps):
        steps = _nl_add_inst(steps)
    # ★★ 인가·멈춤 사이에 대기가 없으면 30초 시험이 0초 시험이 된다 (사용자 신고)
    steps = _nl_fix_wait(steps, text)
    # ★ 프레임은 사람이 말했을 때만 그 값 — 아니면 128byte (사용자 요청 2026-08-14)
    steps = _nl_fix_frame(steps, text)
    # ★ 부하도 마찬가지 — 안 말했으면 회선의 10% (사용자 요청 2026-08-14)
    steps = _nl_fix_rate(steps, text)
    return {"ok": True, "title": title, "purpose": purpose, "steps": steps, "blocked": blocked}


@app.get("/api/ai/examples")
async def ai_examples_get():
    """첫 화면에 뜰 질문 보기. 담아 둔 것이 없으면 기본 세 줄."""
    d = _kv_load_sync(_AI_EX_KEY, None)
    rows = (d or {}).get("items") if isinstance(d, dict) else None
    if not isinstance(rows, list) or not rows:
        return {"ok": True, "items": [dict(x) for x in _AI_EX_DEFAULT], "default": True}
    out = [r for r in (_ai_ex_row(x) for x in rows) if r]
    return {"ok": True, "items": out}


@app.post("/api/ai/examples")
async def ai_examples_set(payload: dict, token: str = ""):
    """질문 보기를 통째로 담는다 — **관리자만**. 빈 줄은 버리고 20개까지."""
    _require_admin(token)
    rows, seen = [], set()
    for x in (payload or {}).get("items") or []:
        r = _ai_ex_row(x)
        if r and r["q"] not in seen:      # 같은 질문은 한 번만 — 설명만 다른 줄이 쌓인다
            seen.add(r["q"])
            rows.append(r)
    rows = rows[:20]
    _kv_save_sync(_AI_EX_KEY, {"items": rows})
    # ★★ 담기면 **켜져 있는 모든 화면**에 곧바로 보낸다 (사용자 요청 2026-08-14) —
    #   담당자가 고친 것을 남들이 새로고침해야 보는 것은 늦다.
    try:
        await broadcast({"type": "ai_examples", "items": rows})
    except Exception:
        pass
    return {"ok": True, "items": rows}

