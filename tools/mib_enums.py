# UBQS MIB 텍스트 → SNMP enum 맵(OID → {정수: 이름}) 추출 → data/snmp/snmp_enums.json
# pysmi/pysnmp 컴파일 불필요. MIB 추가/변경 시 이 스크립트만 재실행하면 백엔드가 자동 반영.
#   실행:  .venv\Scripts\python.exe tools\mib_enums.py
import os, re, json, sys
from pathlib import Path

# 경로는 레포 루트 기준. 예전엔 r"C:\utop\MIB" 로 하드코딩돼 있었다.
# os.walk 는 없는 디렉터리에서 예외 없이 빈 결과를 내므로, 경로가 어긋나면 아래
# json.dump 가 snmp_enums.json 을 빈 파일로 덮어써 백엔드 SNMP enum 이 통째로 사라진다.
ROOT = Path(__file__).resolve().parent.parent
MIB_DIR = str(ROOT / "data" / "MIB")
OUT = str(ROOT / "data" / "snmp" / "snmp_enums.json")   # snmp_names.json 도 같은 폴더

if not os.path.isdir(MIB_DIR):
    print(f"[중단] MIB 디렉터리가 없습니다: {MIB_DIR}", file=sys.stderr)
    print("       기존 snmp_enums.json 을 덮어쓰지 않고 종료합니다.", file=sys.stderr)
    sys.exit(1)

# 표준 루트 숫자 OID
ROOTS = {
    "iso":"1","org":"1.3","dod":"1.3.6","internet":"1.3.6.1","directory":"1.3.6.1.1",
    "mgmt":"1.3.6.1.2","mib-2":"1.3.6.1.2.1","transmission":"1.3.6.1.2.1.10",
    "experimental":"1.3.6.1.3","private":"1.3.6.1.4","enterprises":"1.3.6.1.4.1",
    "snmpV2":"1.3.6.1.6","snmpModules":"1.3.6.1.6.3",
}

parent = {}     # name -> (parentName, subid)
enums  = {}     # objName -> {num:name}
tc_enums = {}   # TEXTUAL-CONVENTION 타입명 -> {num:name}
ot_ref = []     # 인라인 INTEGER 없는 OBJECT-TYPE: (objName, SYNTAX 타입명) — TC 참조 후처리

# 이름과 매크로 키워드는 같은 줄([ \t]+, 줄바꿈 금지) — IMPORTS 목록 오인 방지
re_oi  = re.compile(r"([A-Za-z][\w-]*)[ \t]+OBJECT[ \t]+IDENTIFIER\s*::=\s*\{\s*([A-Za-z][\w-]*)\s+(\d+)\s*\}")
re_alias = re.compile(r"^\s*([A-Za-z][\w-]*)\s*::=\s*\{\s*([A-Za-z][\w-]*)\s+(\d+)\s*\}", re.M)
re_idy = re.compile(r"([A-Za-z][\w-]*)[ \t]+(?:MODULE-IDENTITY|OBJECT-IDENTITY)\b.*?::=\s*\{\s*([A-Za-z][\w-]*)\s+(\d+)\s*\}", re.S)
re_ot  = re.compile(r"([A-Za-z][\w-]*)[ \t]+OBJECT-TYPE\b(.*?)::=\s*\{\s*([A-Za-z][\w-]*)\s+(\d+)\s*\}", re.S)
re_int = re.compile(r"SYNTAX\s+INTEGER\s*\{([^}]+)\}", re.S)
re_tc  = re.compile(r"([A-Za-z][\w-]*)[ \t]+::=[ \t]+TEXTUAL-CONVENTION\b.*?SYNTAX\s+INTEGER\s*\{([^}]+)\}", re.S)   # TC enum
re_synref = re.compile(r"SYNTAX\s+([A-Za-z][\w-]*)")   # SYNTAX 타입명(참조)
re_pair = re.compile(r"([A-Za-z][\w-]*)\s*\(\s*(-?\d+)\s*\)")

def walk_files():
    for root, dirs, files in os.walk(MIB_DIR):
        if ".svn" in root: continue
        for f in files:
            if f.lower().endswith((".mib", ".my", ".txt")) and ".svn-base" not in f:
                yield os.path.join(root, f)

for path in walk_files():
    try:
        txt = open(path, encoding="utf-8", errors="replace").read()
    except Exception:
        continue
    txt = re.sub(r"--.*", "", txt)  # 한 줄 주석 제거
    for m in re_oi.finditer(txt):
        parent.setdefault(m.group(1), (m.group(2), int(m.group(3))))
    for m in re_idy.finditer(txt):
        parent.setdefault(m.group(1), (m.group(2), int(m.group(3))))
    for m in re_alias.finditer(txt):
        parent.setdefault(m.group(1), (m.group(2), int(m.group(3))))
    for m in re_tc.finditer(txt):   # TEXTUAL-CONVENTION { normal(1), ... }
        d = {pm.group(2): pm.group(1) for pm in re_pair.finditer(m.group(2))}
        if d:
            tc_enums.setdefault(m.group(1), d)
    for m in re_ot.finditer(txt):
        nm, body, par, sub = m.group(1), m.group(2), m.group(3), int(m.group(4))
        parent.setdefault(nm, (par, sub))
        im = re_int.search(body)
        if im:
            d = {pm.group(2): pm.group(1) for pm in re_pair.finditer(im.group(1))}
            if d:
                enums[nm] = d
        else:
            sm = re_synref.search(body)   # 인라인 INTEGER 없음 → SYNTAX 타입명 기록(TC 참조 후처리)
            if sm:
                ot_ref.append((nm, sm.group(1)))

# TC 참조형 OBJECT-TYPE 해소: SYNTAX 가 TEXTUAL-CONVENTION enum 타입이면 그 enum 적용 (예: ubiEnvMonSupplyState → UbiEnvMonState → normal(1)…)
for nm, tname in ot_ref:
    if nm not in enums and tname in tc_enums:
        enums[nm] = tc_enums[tname]

cache = {}
def resolve(name, seen=None):
    if name in ROOTS: return ROOTS[name]
    if name in cache: return cache[name]
    seen = seen or set()
    if name in seen or name not in parent: return None
    seen.add(name)
    par, sub = parent[name]
    base = resolve(par, seen)
    if base is None: return None
    cache[name] = base + "." + str(sub)
    return cache[name]

out = {}
for nm, d in enums.items():
    oid = resolve(nm)
    if oid:
        out[oid] = d

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"enum OBJECT-TYPE: {len(enums)} / OID resolved: {len(out)} -> {OUT}")

# ── OID → 이름(전체 경로) 맵: 값이 OBJECT IDENTIFIER 인 응답을 .iso.org...E5724RL 처럼 표시 ──
ROOT_PATHS = {
    "iso": "iso", "org": "iso.org", "dod": "iso.org.dod", "internet": "iso.org.dod.internet",
    "directory": "iso.org.dod.internet.directory", "mgmt": "iso.org.dod.internet.mgmt",
    "mib-2": "iso.org.dod.internet.mgmt.mib-2", "transmission": "iso.org.dod.internet.mgmt.mib-2.transmission",
    "experimental": "iso.org.dod.internet.experimental", "private": "iso.org.dod.internet.private",
    "enterprises": "iso.org.dod.internet.private.enterprises",
    "snmpV2": "iso.org.dod.internet.snmpV2", "snmpModules": "iso.org.dod.internet.snmpV2.snmpModules",
}
npc = {}
def namepath(name, seen=None):
    if name in ROOT_PATHS: return ROOT_PATHS[name]
    if name in npc: return npc[name]
    seen = seen or set()
    if name in seen or name not in parent: return name
    seen.add(name)
    par, _sub = parent[name]
    pp = namepath(par, seen)
    npc[name] = (pp + "." + name) if pp else name
    return npc[name]

names = {}
for nm in list(parent.keys()):
    oidn = resolve(nm)
    if oidn and oidn not in names:
        names[oidn] = "." + namepath(nm)   # 선행 점(.iso.org...)
NAMES_OUT = os.path.join(os.path.dirname(OUT), "snmp_names.json")
json.dump(names, open(NAMES_OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"OID name map: {len(names)} -> {NAMES_OUT}")
