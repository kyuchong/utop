# -*- coding: utf-8 -*-
"""장비 · 계측기 — main.py 에서 글자 그대로 옮겨 왔다(2026-09-28, 분리 3호).

바뀐 것은 셋뿐이다: @app→@router, main 의 이름→core.<이름>(앞 밑줄 뗀 것),
그리고 임포트 머리. 주소는 하나도 안 바뀐다.

이 파일이 대는 길:
  /api/devices2/…          장비(PG) 목록·저장·삭제·랙 배치·접속 확인·SNMP 포트·CSV 들이기
  /api/device-catalog2/…   모델 카탈로그(PG) · /api/device-roles
  /api/device-catalog/…    옛 카탈로그(KV) 와 백업
  /api/racks · /api/rackview   랙 틀과 랙뷰 한 판
  /api/stc/…               Spirent — 트래픽 실행·REST 서버·포트 예약·계측기 세션
  /api/n2x/…               IXIA N2X — Tcl 데몬·중계·예약·트래픽
  /api/devices/…           옛 장비 목록(devices.json)

main 에 남긴 것: CLI 실행(run-cli·세션·ping)·SNMP get/set/trap 은 **시험 실행**
묶음(5호)으로 간다 — 스텝을 돌리는 코드라 사이클 쪽과 함께 있어야 한다.
자원 잠금(/api/locks)도 사이클 화면의 것이라 거기로 간다.
"""
import asyncio
import httpx
import json
import os
import platform
import socket
import subprocess
import sys
import threading
import time as _t
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel

import core
import db

router = APIRouter()

# 이 파일은 backend/routes/ 에 있다. 옮겨 온 코드가 `__file__` 기준으로 찾던
# stc/·n2x/·tools/ 는 **backend/** 에 있으므로 한 단 위를 기준으로 잡는다 —
# 그대로 두면 데몬 스크립트·STC 도우미를 routes/ 아래에서 찾아 전부 못 찾는다(스모크로 잡힘).
_BACKEND_DIR = Path(__file__).resolve().parent.parent


# ───────────────────────────────────────────
# 장비 (PG)
#
# 키는 IP. 같은 모델이 여러 대여도 접속 대상은 IP 로 갈린다.
# 제품군(L2·L3·OLT·ONT·CPE·HGW)은 role, 제조사는 vendor 에 담는다.
#
# 옛 /api/devices (devices.json) 와 경로를 나눠 둔다 — 옛 화면이 아직
# 그걸 쓰고 있어서, 한 번에 갈아치우면 옛 화면이 멈춘다.
# ───────────────────────────────────────────
DEVICE_ROLES = ["L2", "L3", "OLT", "ONT", "CPE", "HGW", "계측기", "기타"]


@router.get("/api/device-catalog2")
async def device_catalog_list(kind: str = ""):
    items = await db.catalog_list(kind)
    # 지울 수 있는지 화면이 알 수 있게 쓰는 장비 수를 함께 준다
    for it in items:
        it["used"] = await db.catalog_usage(it["kind"], it["name"])
    return {"items": items, "kinds": list(db.CATALOG_KINDS)}


@router.post("/api/device-catalog2")
async def device_catalog_save(payload: dict):
    try:
        await db.catalog_upsert(payload)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"success": True}


@router.post("/api/device-catalog2/classify")
async def device_catalog_classify(payload: dict):
    """모델을 벤더·제품군·모델그룹으로 옮긴다 — 준 칸만 고친다."""
    try:
        await db.catalog_classify(str(payload.get("name") or ""), payload)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"success": True}


@router.post("/api/device-catalog2/rename")
async def device_catalog_rename(payload: dict):
    kind = str(payload.get("kind") or "").strip()
    old = str(payload.get("old") or "").strip()
    new = str(payload.get("new") or "").strip()
    if kind == "model":
        raise HTTPException(400, "모델명은 플랜·시험이 물려 있어 여기서 못 바꿉니다")
    if kind not in db.CATALOG_KINDS or not old or not new:
        raise HTTPException(400, "kind·old·new 가 필요합니다")
    try:
        await db.catalog_rename(kind, old, new)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    return {"success": True}


@router.delete("/api/device-catalog2/{kind}/{name}")
async def device_catalog_delete(kind: str, name: str):
    used = await db.catalog_usage(kind, name)
    if used:
        # 몇 대인지만 말하면 다음에 할 일을 모른다 — 어느 장비인지 찍어 준다
        who = await db.catalog_users(kind, name)
        tail = " …" if used > len(who) else ""
        raise HTTPException(
            400,
            f"{used}대가 쓰고 있어 지울 수 없습니다 — {', '.join(who)}{tail}\n"
            "장비 화면에서 이 장비의 모델을 바꾸거나 장비를 지운 뒤 다시 시도하세요",
        )
    if not await db.catalog_delete(kind, name):
        raise HTTPException(404, "없는 항목입니다")
    return {"success": True}


@router.get("/api/device-roles")
async def device_roles():
    # 카탈로그에 등록된 것을 먼저 쓴다. 비어 있으면 기본 목록으로 시작한다.
    cat = await db.catalog_list()
    by: dict = {}
    for it in cat:
        by.setdefault(it["kind"], []).append(it["name"])

    # 이미 쓰고 있는 값도 함께 준다. 카탈로그에 아직 안 올린 것이 목록에서
    # 빠지면 그 장비를 편집할 때 값이 사라진 것처럼 보인다.
    async def distinct(col: str) -> list[str]:
        async with db.pool().acquire() as c:
            rows = await c.fetch(
                f"SELECT DISTINCT {col} AS v FROM device "
                f"WHERE {col} IS NOT NULL AND {col} <> '' ORDER BY 1"
            )
        return [r["v"] for r in rows]

    def merge(kind: str, used: list[str], fallback: list[str] | None = None) -> list[str]:
        out = list(by.get(kind) or fallback or [])
        for v in used:
            if v not in out:
                out.append(v)
        return out

    return {
        "roles": merge("family", await distinct("role"), DEVICE_ROLES),
        "labs": merge("lab", await distinct("lab")),
        "vendors": merge("vendor", await distinct("vendor")),
        "models": merge("model", await distinct("model")),
        "groups": by.get("group") or [],
        "usernames": await distinct("username"),
        # 모델을 고르면 제조사·제품군·기본 인터페이스를 채운다
        "model_info": {
            it["name"]: {
                "vendor": it.get("vendor"),
                "model_group": it.get("model_group"),
                "family": it.get("family"),
                "interfaces": it.get("interfaces"),
            }
            for it in cat
            if it["kind"] == "model"
        },
        "protocols": list(db.PROTOCOLS),
        "cli_protocols": list(db.CLI_PROTOCOLS),
    }


# 접속 확인은 장비에 실제로 붙어 본다. 동기 라이브러리(paramiko/telnetlib)라
# 그대로 await 하면 이벤트 루프가 멈춰 50명 전원이 같이 멈춘다. 스레드로 보낸다.
_PROBE_TIMEOUT = 6


def _probe_sync(proto: str, host: str, port: int) -> tuple[bool, str]:
    """포트가 열려 있는지만 본다.

    로그인까지 해보면 확실하지만 시간이 오래 걸리고, 잘못된 계정으로 여러 번
    시도하면 장비가 계정을 잠근다. 목록의 '연결상태' 는 '길이 열려 있나' 로 충분하다.
    """
    import socket
    if not host or not port:
        return False, "주소 또는 포트가 비어 있습니다"
    try:
        with socket.create_connection((host, int(port)), timeout=_PROBE_TIMEOUT):
            return True, ""
    except OSError as e:
        return False, str(e)


def _snmp_probe_sync(host: str, port: int, community: str) -> tuple[bool, str]:
    """SNMPv2c 로 sysDescr.0 을 실제로 읽어 본다 — 의존성 없이 최소 BER.

    UDP 라 TCP 처럼 포트 열림을 볼 수 없고, community 가 틀리면 장비가
    아예 응답하지 않는 것이 보통이다. 그래서 「응답 없음」 은 주소·포트·
    community 셋 중 하나가 틀렸다는 뜻이다.
    """
    import os
    import socket

    if not host:
        return False, "주소가 비어 있습니다"

    def tlv(t: int, v: bytes) -> bytes:
        n = len(v)
        if n < 0x80:
            return bytes([t, n]) + v
        eb = n.to_bytes((n.bit_length() + 7) // 8, "big")
        return bytes([t, 0x80 | len(eb)]) + eb + v

    def ber_int(n: int) -> bytes:
        b = n.to_bytes((max(n.bit_length(), 1) + 8) // 8, "big", signed=True)
        return tlv(0x02, b)

    oid = bytes([0x2B, 6, 1, 2, 1, 1, 1, 0])  # 1.3.6.1.2.1.1.1.0 = sysDescr.0
    rid = int.from_bytes(os.urandom(2), "big") & 0x7FFF
    vb = tlv(0x30, tlv(0x06, oid) + b"\x05\x00")
    pdu = tlv(0xA0, ber_int(rid) + ber_int(0) + ber_int(0) + tlv(0x30, vb))
    msg = tlv(0x30, ber_int(1) + tlv(0x04, (community or "public").encode()) + pdu)

    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(_PROBE_TIMEOUT)
    try:
        s.sendto(msg, (host, int(port or 161)))
        data, _ = s.recvfrom(65535)
    except socket.timeout:
        return False, "응답 없음 — 주소·포트(161)·community 확인 (SNMP 줄의 계정 칸이 community, 비우면 public)"
    except OSError as e:
        return False, str(e)
    finally:
        s.close()

    # 관대하게 판다 — error-status 만 읽고, 나머지가 이상해도 응답이 온
    # 것 자체가 SNMP 가 살아 있다는 뜻이다.
    def read_tlv(b: bytes, i: int):
        t = b[i]
        ln = b[i + 1]
        i += 2
        if ln & 0x80:
            k = ln & 0x7F
            ln = int.from_bytes(b[i : i + k], "big")
            i += k
        return t, b[i : i + ln], i + ln

    try:
        _, body, _ = read_tlv(data, 0)          # SEQUENCE
        _, _, i = read_tlv(body, 0)             # version
        _, _, i = read_tlv(body, i)             # community
        t, pdu_b, _ = read_tlv(body, i)         # GetResponse(0xA2)
        _, _, j = read_tlv(pdu_b, 0)            # request-id
        _, est, j = read_tlv(pdu_b, j)          # error-status
        if int.from_bytes(est or b"\x00", "big"):
            return False, f"SNMP 오류 (error-status {int.from_bytes(est, 'big')}) — community 권한을 확인하세요"
        _, _, j = read_tlv(pdu_b, j)            # error-index
        _, vbl, _ = read_tlv(pdu_b, j)          # varbind list
        _, vb1, _ = read_tlv(vbl, 0)
        _, _, k = read_tlv(vb1, 0)              # oid
        vt, _, _ = read_tlv(vb1, k)             # value
        if vt in (0x80, 0x81, 0x82):            # noSuchObject 류
            return False, "장비가 sysDescr 를 주지 않습니다"
        return True, ""
    except Exception:
        return True, ""


def _snmp_bulk_sync(host: str, port: int, community: str,
                    roots: list, max_rep: int = 60) -> dict:
    """SNMPv2c GetBulk 로 서브트리를 읽는다 — 포트 상태(ifOperStatus) 몫.

    의존성 없이 최소 BER. roots 의 각 서브트리에 대해 {끝자리 index: 값} 을
    돌려준다. 값은 INTEGER 면 int, 아니면 bytes 그대로.
    """
    import os
    import socket

    def tlv(t: int, v: bytes) -> bytes:
        n = len(v)
        if n < 0x80:
            return bytes([t, n]) + v
        eb = n.to_bytes((n.bit_length() + 7) // 8, "big")
        return bytes([t, 0x80 | len(eb)]) + eb + v

    def ber_int(n: int) -> bytes:
        b = n.to_bytes((max(n.bit_length(), 1) + 8) // 8, "big", signed=True)
        return tlv(0x02, b)

    def oid_enc(parts: tuple) -> bytes:
        out = [40 * parts[0] + parts[1]]
        for x in parts[2:]:
            if x < 0x80:
                out.append(x)
            else:
                stack = [x & 0x7F]
                x >>= 7
                while x:
                    stack.append((x & 0x7F) | 0x80)
                    x >>= 7
                out.extend(reversed(stack))
        return tlv(0x06, bytes(out))

    def oid_dec(b: bytes) -> tuple:
        if not b:
            return ()
        out = [b[0] // 40, b[0] % 40]
        val = 0
        for c in b[1:]:
            val = (val << 7) | (c & 0x7F)
            if not c & 0x80:
                out.append(val)
                val = 0
        return tuple(out)

    def read_tlv(b: bytes, i: int):
        t = b[i]
        ln = b[i + 1]
        i += 2
        if ln & 0x80:
            k = ln & 0x7F
            ln = int.from_bytes(b[i : i + k], "big")
            i += k
        return t, b[i : i + ln], i + ln

    result: dict = {tuple(r): {} for r in roots}
    cursors = [tuple(r) for r in roots]
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(_PROBE_TIMEOUT)
    try:
        for _round in range(20):  # 48포트 × 2열이면 한두 번에 끝난다 — 폭주 방지 상한
            rid = int.from_bytes(os.urandom(2), "big") & 0x7FFF
            vbs = b"".join(tlv(0x30, oid_enc(c) + b"\x05\x00") for c in cursors)
            pdu = tlv(0xA5, ber_int(rid) + ber_int(0) + ber_int(max_rep) + tlv(0x30, vbs))
            msg = tlv(0x30, ber_int(1) + tlv(0x04, community.encode()) + pdu)
            sock.sendto(msg, (host, int(port or 161)))
            data, _ = sock.recvfrom(65535)
            _, body, _ = read_tlv(data, 0)
            _, _, i = read_tlv(body, 0)
            _, _, i = read_tlv(body, i)
            _, pdu_b, _ = read_tlv(body, i)
            _, _, j = read_tlv(pdu_b, 0)
            _, est, j = read_tlv(pdu_b, j)
            if int.from_bytes(est or b"\x00", "big"):
                break
            _, _, j = read_tlv(pdu_b, j)
            _, vbl, _ = read_tlv(pdu_b, j)
            k = 0
            n_roots = len(cursors)
            col = 0
            done = [False] * n_roots
            last = list(cursors)
            while k < len(vbl):
                _, vb1, k = read_tlv(vbl, k)
                to, ob, m = read_tlv(vb1, 0)
                vt, vv, _ = read_tlv(vb1, m)
                oid = oid_dec(ob)
                root = tuple(roots[col % n_roots])
                if oid[: len(root)] == root and vt not in (0x82,):  # endOfMibView 제외
                    idx = oid[len(root) :]
                    val = int.from_bytes(vv, "big", signed=True) if vt == 0x02 else vv
                    result[root][idx[-1] if len(idx) == 1 else idx] = val
                    last[col % n_roots] = oid
                else:
                    done[col % n_roots] = True
                col += 1
            cursors = last
            if all(done) or col == 0:
                break
    except OSError:
        pass
    finally:
        sock.close()
    return result


# 장비마다 20초 캐시 — 랙뷰 카드가 뜰 때마다 장비를 두드리지 않게
_SNMP_PORTS_CACHE: dict = {}


@router.get("/api/devices2/{dev_id}/snmp-ports")
async def devices2_snmp_ports(dev_id: str):
    """포트 형상 실측 — SNMP(ifDescr·ifOperStatus)로 링크 up/down 을 읽는다."""
    d = await db.device_get(dev_id)
    if d is None:
        raise HTTPException(404, "장비를 찾을 수 없습니다")
    a = next((x for x in (d.get("access") or [])
              if x.get("protocol") == "snmp" and x.get("enabled", True)), None)
    if a is None:
        return {"ok": False, "reason": "SNMP 미등록"}
    import time as _time
    ent = _SNMP_PORTS_CACHE.get(d["id"])
    if ent and _time.time() - ent[0] < 20:
        return ent[1]
    host = (a.get("host") or d.get("ip") or "").strip()
    comm = (a.get("username") or "").strip() or "public"
    import asyncio as _aio
    loop = _aio.get_running_loop()
    res = await loop.run_in_executor(
        None, _snmp_bulk_sync, host, a.get("port") or 161, comm,
        [(1, 3, 6, 1, 2, 1, 2, 2, 1, 2), (1, 3, 6, 1, 2, 1, 2, 2, 1, 8)],
    )
    names = res.get((1, 3, 6, 1, 2, 1, 2, 2, 1, 2), {})
    stats = res.get((1, 3, 6, 1, 2, 1, 2, 2, 1, 8), {})
    # 물리 포트와 VLAN 을 가른다 — ifDescr 에는 mgmt·port-channel·CPU 도
    # 섞여 온다. 실물 포트는 예외 없이 슬롯/포트(Giga0/1) 꼴이라 '/' 가
    # 곧 물리의 표식이다. vlan 은 VLAN 정보로, 나머지 논리들은 뺀다.
    ports, vlans, others = [], [], 0
    for idx in names.keys():
        nm = names[idx]
        nm = nm.decode("utf-8", "replace") if isinstance(nm, (bytes, bytearray)) else str(nm)
        low = nm.lower()
        st = stats.get(idx)
        row = {"name": nm, "up": st == 1}
        if "vlan" in low or low.startswith("br"):
            vlans.append(row)
        elif "/" in nm:
            ports.append(row)
        else:
            others += 1
    # '/' 없는 장비(드물다)면 물리 표식이 안 통한 것 — 다 보여주는 쪽이 낫다
    if not ports and others:
        for idx in names.keys():
            nm = names[idx]
            nm = nm.decode("utf-8", "replace") if isinstance(nm, (bytes, bytearray)) else str(nm)
            if "vlan" in nm.lower() or nm.lower().startswith("br"):
                continue
            ports.append({"name": nm, "up": stats.get(idx) == 1})
    # ifIndex 차례는 포트 번호 차례가 아니다 — 이름을 자연 정렬한다
    # (Giga0/2 < Giga0/10 이 되게 숫자 덩어리는 숫자로 비교)
    import re as _re

    def _natkey(nm: str):
        return [(0, int(t)) if t.isdigit() else (1, t.lower())
                for t in _re.split(r"(\d+)", nm) if t]

    ports.sort(key=lambda x: _natkey(x["name"]))
    vlans.sort(key=lambda x: _natkey(x["name"]))
    out = {"ok": len(ports) + len(vlans) > 0, "ports": ports, "vlans": vlans,
           "reason": "" if ports or vlans else "SNMP 응답 없음"}
    _SNMP_PORTS_CACHE[d["id"]] = (_time.time(), out)
    return out


@router.post("/api/devices2/{dev_id}/check")
async def devices2_check(dev_id: str, protocol: str = ""):
    """접속해 보고 결과를 남긴다.

    protocol 을 주면 그것 하나만 — 목록에서 Telnet 칸만 눌러 확인하는 경우다.
    비우면 등록된 방식 전부."""
    d = await db.device_get(dev_id)
    if d is None:
        raise HTTPException(404, "장비를 찾을 수 없습니다")

    import asyncio
    loop = asyncio.get_running_loop()
    out = []
    want = (protocol or "").strip().lower()
    for a in d.get("access") or []:
        if not a.get("enabled", True):
            continue
        proto = a["protocol"]
        if want and proto != want:
            continue
        host = (a.get("host") or d.get("ip") or "").strip()
        # N2X 는 TCP 포트가 없다. 소켓으로 찔러 보는 대신, 중계로 ping 을
        # 보내 실제 섀시 세션이 열리는지 본다. STC 는 REST 라 그 쪽으로.
        if proto == "n2x":
            # 검사는 세션 하나를 **공유**한다(label 고정). 계측기마다 새
            # 세션을 열면 N2X 세션 한도("maximum sessions running")를 금방
            # 넘긴다 — 섀시는 하나여도 UTOP 이 7대를 각각 열려 하기 때문.
            r = await loop.run_in_executor(None, _n2x_send, host, "utop", "ping")
            ok = bool(isinstance(r, dict) and r.get("ok"))
            err = "" if ok else str((r or {}).get("error") or "N2X 응답 없음")
        elif proto == "stc":
            # STC 는 REST 서버(host)에 붙고, 그 서버가 섀시(장비 ip)로 연결한다.
            # 소켓만 찔러 보면 REST 서버가 살아있는지만 알지 섀시까지는 모른다.
            # 실제 섀시 인벤토리를 읽어 본다.
            r = await stc_conncheck({
                "chassis": (d.get("ip") or "").strip(),
                "restIp": host or "localhost",
                "restPort": a.get("port") or 8888,
            })
            ok = bool(isinstance(r, dict) and r.get("ok"))
            err = "" if ok else str((r or {}).get("error") or "STC 응답 없음")
        elif proto == "snmp":
            # community 는 SNMP 줄의 계정 칸 — 비우면 public.
            # 공용 계정(root 따위)으로 폴백하면 안 된다 — 그건 CLI 로그인
            # 계정이지 community 가 아니라서, 장비가 침묵해 「응답 없음」 이
            # 됐다(겪었다).
            comm = (a.get("username") or "").strip() or "public"
            ok, err = await loop.run_in_executor(
                None, _snmp_probe_sync, host, a.get("port") or 161, comm
            )
        else:
            ok, err = await loop.run_in_executor(
                None, _probe_sync, proto, host, a.get("port") or 0
            )
        await db.device_access_mark(d["id"], proto, ok, err)
        out.append({"protocol": proto, "host": host, "port": a.get("port"),
                    "ok": ok, "error": err})
    return {"success": True, "results": out}


@router.get("/api/devices2")
async def devices2_list(ifs: int = 1):
    """
    `ifs=0` 이면 **인터페이스 줄을 싣지 않고 개수만** 준다(성능).

    목록 화면은 인터페이스를 「48」 처럼 수로만 쓰는데, 장비 92대 × 48줄이면
    4천 줄이 브라우저로 넘어가 첫 화면이 무겁다(지적).
    """
    devs = await db.device_list(with_ifs=bool(ifs))
    if not ifs:
        async with db.pool().acquire() as c:
            rows = await c.fetch(
                "SELECT device_id, name FROM device_interface ORDER BY device_id, sort_order, name"
            )
        by: dict = {}
        for r in rows:
            by.setdefault(r["device_id"], []).append(r["name"])
        for d in devs:
            names = by.get(d["id"], [])
            d["if_count"] = len(names)
            # 「gi1/0/1-48, te1/1-4」 — 표가 구성을 그대로 보여 준다(지시).
            # 48줄을 다 실으면 목록이 무거워지므로 여기서 접어 보낸다.
            d["if_brief"] = _compress_ifs(names) if names else ""
    return {"devices": devs}


# 이 라우트는 /api/devices2/{dev_id} 보다 먼저 선언되어야 한다.
# 뒤에 두면 'export.csv' 가 dev_id 로 잡혀 404 가 난다.
@router.get("/api/devices2/export.csv")
async def devices2_export(with_secrets: int = 0):
    """장비 목록을 CSV 로. 비밀번호는 기본적으로 비운다.

    평문 저장은 결정된 사항이지만, CSV 는 메일과 메신저로 쉽게 돌아다닌다.
    파일 하나가 사내 장비 전체의 비밀번호가 되는 것은 저장과 다른 문제다.
    가져올 때 빈 칸은 '기존 값 유지' 로 처리하므로 이대로도 왕복이 된다.
    """
    import csv, io
    devs = await db.device_list()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(DEV_CSV_COLS)
    for d in devs:
        tel, ssh = _acc_of(d, "telnet"), _acc_of(d, "ssh")
        con, snmp = _acc_of(d, "console"), _acc_of(d, "snmp")
        w.writerow([
            d.get("lab") or "",
            d.get("ip") or "", d.get("operator") or "", d.get("vendor") or "",
            d.get("role") or "", d.get("model") or "",
            tel.get("port") or "", ssh.get("port") or "",
            con.get("host") or "", con.get("port") or "",
            (snmp.get("username") or snmp.get("community") or ""),
            ((snmp.get("params") or {}).get("community_rw") or ""),
            d.get("username") or "",
            (d.get("password") or "") if with_secrets else "",
            _compress_ifs([i["name"] for i in d.get("interfaces") or []]),
        ])
    # 엑셀이 UTF-8 을 알아보게 BOM 을 붙인다. 없으면 한글이 깨져서 열린다.
    data = "﻿" + buf.getvalue()
    from fastapi.responses import Response
    return Response(
        content=data.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="devices.csv"'},
    )


@router.get("/api/devices2/{dev_id}")
async def devices2_get(dev_id: str):
    d = await db.device_get(dev_id)
    if d is None:
        raise HTTPException(404, "장비를 찾을 수 없습니다")
    return d


@router.post("/api/devices2")
async def devices2_save(payload: dict):
    ip = str(payload.get("ip") or "").strip()
    if not ip:
        raise HTTPException(400, "IP 를 입력하세요")
    # 같은 IP 가 이미 있으면 그 장비를 고치는 것으로 본다. IP 가 키다.
    cur = await db.device_get(ip)
    if cur and not payload.get("id"):
        payload["id"] = cur["id"]
    try:
        dev_id = await db.device_upsert(payload)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"success": True, "id": dev_id}


@router.post("/api/devices2/{dev_id}/rack")
async def devices2_set_rack(dev_id: str, payload: dict):
    """랙 자리 지정/해제 — 랙뷰에서 끌어다 놓거나 뺀다. rack_id 비우면 해제.

    겹침은 서버가 최종 판정한다(409). 화면 검사만 믿으면 두 사람이 같은
    칸에 동시에 끌어다 놓았을 때 늦게 온 쪽이 조용히 겹쳐 앉는다.
    """
    rid = str(payload.get("rack_id") or "").strip()
    if rid:
        try:
            pos = int(payload.get("rack_pos") or 0)
            units = max(1, int(payload.get("rack_units") or 1))
        except (TypeError, ValueError):
            raise HTTPException(400, "자리(U)가 숫자가 아닙니다")
        if pos < 1:
            raise HTTPException(400, "자리(U)가 필요합니다")
        kv = core.kv_load_sync("racks", {}) or {}
        rk = next((r for r in (kv.get("racks") or []) if str(r.get("id")) == rid), None)
        top = int((rk or {}).get("units") or 45)
        if pos + units - 1 > top:
            raise HTTPException(409, f"{top}U 랙 위를 벗어납니다")
        used: set = set()
        for d in await db.device_list(with_ifs=False):
            if str(d.get("rack_id") or "") != rid or not d.get("rack_pos"):
                continue
            if d["id"] == dev_id or d.get("ip") == dev_id:
                continue  # 자기 자신은 빼고 센다 — 제자리 이동·크기 변경 몫
            used.update(range(d["rack_pos"], d["rack_pos"] + (d.get("rack_units") or 1)))
        for b in kv.get("blanks") or []:
            brid = str(b.get("rack_id") or "")
            same = brid == rid or (not brid and rk and b.get("rack_name") == rk.get("name"))
            if not same:
                continue
            try:
                bp, bu = int(b.get("pos") or 0), int(b.get("units") or 1)
            except (TypeError, ValueError):
                continue
            used.update(range(bp, bp + bu))
        bad = sorted(u for u in range(pos, pos + units) if u in used)
        if bad:
            raise HTTPException(409, f"{bad[0]}U 가 이미 차 있습니다 — 다른 자리에 놓으세요")
    ok = await db.device_set_rack(
        dev_id, payload.get("rack_id"), payload.get("rack_pos"), payload.get("rack_units")
    )
    if not ok:
        raise HTTPException(404, "장비를 찾을 수 없습니다")
    return {"ok": True}


@router.post("/api/devices2/{dev_id}/default-protocol")
async def devices2_set_default_protocol(dev_id: str, payload: dict):
    """
    이 장비가 무엇으로 붙는지 바꾼다.

    전에는 장비 화면까지 가야 했다. 시험을 짜다가 「telnet 인데 왜 22번으로
    나가지」 를 알아차리는 자리는 세션 줄인데, 고치는 자리는 딴 데였다.
    """
    proto = str((payload or {}).get("protocol") or "").strip().lower()
    try:
        ok = await db.device_access_set_default(dev_id, proto)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if not ok:
        raise HTTPException(404, f"이 장비에 {proto} 접속이 등록되어 있지 않습니다")
    return {"success": True, "protocol": proto}


@router.delete("/api/devices2/{dev_id}")
async def devices2_delete(dev_id: str):
    if not await db.device_delete(dev_id):
        raise HTTPException(404, "장비를 찾을 수 없습니다")
    return {"success": True}


@router.post("/api/devices2/import-legacy")
async def devices2_import(request: Request):
    """옛 devices.json 을 PG 로 옮긴다. 여러 번 눌러도 안전하다(IP 기준 upsert)."""
    core.me(request)
    src = core.DEVICES_FILE
    if not src.exists():
        raise HTTPException(404, f"{src.name} 이 없습니다")
    data = core.load_json(src) or {}
    # 랙 이름만 적힌 옛 장비 몫 — 이름을 KV 랙 id 로 풀어 준다
    _rk = core.kv_load_sync("racks", {}) or {}
    rack_by_name = {str(r.get("name") or ""): str(r.get("id") or "") for r in (_rk.get("racks") or [])}
    n = 0
    for d in data.get("devices", []) or []:
        if not str(d.get("ip") or "").strip():
            continue
        payload = {
            "id": d.get("id") or d.get("ip"),
            "ip": d.get("ip"),
            "name": d.get("id") or d.get("ip"),
            "model": d.get("model"),
            "device_group": d.get("group"),
            "lab": d.get("lab"),
            "protocol": d.get("protocol"),
            "port": d.get("port"),
            "username": d.get("username"),
            "password": d.get("password"),
            "description": d.get("description"),
            "status": d.get("status"),
        }
        rid = d.get("rack_id") or rack_by_name.get(str(d.get("rack_name") or ""))
        if rid and d.get("rack_pos"):
            payload["rack_id"] = rid
            payload["rack_pos"] = d.get("rack_pos")
            payload["rack_units"] = d.get("rack_units") or 1
        await db.device_upsert(payload)
        n += 1
    return {"success": True, "imported": n}


# ── 장비 CSV 일괄 처리 ────────────────────────────────────────────
# 장비 30대를 창 하나씩 열어 등록하는 것은 현실적이지 않다. 내보내고,
# 엑셀에서 고치고, 다시 넣는 왕복 하나로 일괄등록·수정을 함께 해결한다.
DEV_CSV_COLS = [
    "LAB", "IP", "사업자", "제조사", "제품군", "모델명",
    "telnet포트", "ssh포트", "console주소", "console포트", "snmp", "snmp_rw",
    "계정", "비밀번호", "인터페이스",
]


def _expand_ifs(text: str) -> list[str]:
    """gi1/0/1-48 을 펼친다. 화면의 입력 규칙과 같아야 한다."""
    import re
    out: list[str] = []
    for raw in re.split(r"[,\n]", text or ""):
        s = raw.strip()
        if not s:
            continue
        # te6/1~te6/8 처럼 앞자리를 되풀이해 적은 것도 받는다. 기존 자료가
        # 물결로 들어와 있어서 '-' 만 알면 48포트가 1개로 세어진다.
        m = re.match(r"^(.*?)(\d+)\s*[-~]\s*(?:)?(\d+)$", s)
        if not m:
            out.append(s)
            continue
        prefix, a, b = m.group(1), int(m.group(2)), int(m.group(3))
        if b < a or b - a > 512:
            out.append(s)
            continue
        out.extend(f"{prefix}{i}" for i in range(a, b + 1))
    return out


def _compress_ifs(names: list[str]) -> str:
    """펼친 포트를 범위로 다시 접는다.

    48포트를 그대로 내보내면 한 칸이 화면을 넘어가 엑셀에서 손댈 수가 없다.
    _expand_ifs 의 역이라 내보내고 다시 넣어도 같은 결과가 나온다.
    """
    import re
    out: list[str] = []
    st: dict = {"pre": None, "from": 0, "to": 0, "width": 1}

    def flush():
        if st["pre"] is None:
            return
        if st["from"] == st["to"]:
            out.append(f"{st['pre']}{str(st['from']).zfill(st['width'])}")
        else:
            out.append(f"{st['pre']}{st['from']}-{st['to']}")

    for nm in names:
        m = re.match(r"^(.*?)(\d+)$", nm)
        if not m:
            flush()
            st["pre"] = None
            out.append(nm)
            continue
        pre, digits = m.group(1), m.group(2)
        num, width = int(digits), len(digits)
        # 0 으로 채운 이름(gi1/0/01)은 접으면 자릿수가 사라진다. 그대로 둔다.
        padded = width > 1 and digits[0] == "0"
        if st["pre"] == pre and num == st["to"] + 1 and not padded:
            st["to"] = num
            continue
        flush()
        st.update({"pre": pre, "from": num, "to": num, "width": width})
    flush()
    return ",".join(out)


def _acc_of(d: dict, proto: str) -> dict:
    for a in d.get("access") or []:
        if a.get("protocol") == proto:
            return a
    return {}


@router.post("/api/devices2/import-csv")
async def devices2_import_csv(payload: dict):
    """CSV 로 일괄 등록·수정. IP 가 키라 같은 IP 는 덮어쓴다.

    dry_run=true 면 저장하지 않고 무엇이 바뀌는지만 돌려준다 — 30줄을 넣기
    전에 확인할 수 있어야 한다.
    """
    import csv, io
    text = str(payload.get("csv") or "").lstrip("﻿")
    if not text.strip():
        raise HTTPException(400, "CSV 내용이 비어 있습니다")
    dry = bool(payload.get("dry_run"))

    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise HTTPException(400, "머리글만 있고 자료가 없습니다")

    missing = [c for c in ("IP",) if c not in (rows[0].keys() or [])]
    if missing:
        raise HTTPException(400, f"필수 열이 없습니다: {', '.join(missing)}. 내보내기 파일의 머리글을 그대로 쓰세요")

    created, updated, errors = [], [], []
    for n, r in enumerate(rows, start=2):   # 2 = 머리글 다음 줄
        ip = (r.get("IP") or "").strip()
        if not ip:
            errors.append(f"{n}행: IP 가 비어 있습니다")
            continue
        cur = await db.device_get(ip)

        def pick(key: str, old):
            """빈 칸은 기존 값 유지. 비밀번호를 안 내보내도 왕복이 되게 한다."""
            v = (r.get(key) or "").strip()
            return v if v else (old or None)

        def num(key: str, old, dflt=None):
            v = (r.get(key) or "").strip()
            if not v:
                return old if old is not None else dflt
            try:
                return int(v)
            except ValueError:
                errors.append(f"{n}행: {key} 가 숫자가 아닙니다 ({v})")
                return old if old is not None else dflt

        access = []
        tel_old, ssh_old = _acc_of(cur or {}, "telnet"), _acc_of(cur or {}, "ssh")
        con_old, snmp_old = _acc_of(cur or {}, "console"), _acc_of(cur or {}, "snmp")

        tp = num("telnet포트", tel_old.get("port"))
        if tp:
            access.append({"protocol": "telnet", "port": tp, "enabled": True,
                           "is_default": True})
        sp = num("ssh포트", ssh_old.get("port"))
        if sp:
            access.append({"protocol": "ssh", "port": sp, "enabled": True,
                           "is_default": not tp})
        ch, cp = pick("console주소", con_old.get("host")), num("console포트", con_old.get("port"))
        if ch or cp:
            access.append({"protocol": "console", "host": ch, "port": cp, "enabled": True})
        comm = pick("snmp", snmp_old.get("username") or snmp_old.get("community"))
        rw = pick("snmp_rw", (snmp_old.get("params") or {}).get("community_rw"))
        if comm or rw:
            access.append({"protocol": "snmp", "port": snmp_old.get("port") or 161,
                           # RO 는 읽는 쪽이 보는 칸(username)에 적는다
                           "username": comm or None, "community": comm or None,
                           "params": {**(snmp_old.get("params") or {}),
                                      **({"community_rw": rw, "rw": True} if rw else {})},
                           "enabled": True})

        if_text = (r.get("인터페이스") or "").strip()
        payload_dev = {
            "id": (cur or {}).get("id") or ip,
            "ip": ip,
            "lab": pick("LAB", (cur or {}).get("lab")),
            "operator": pick("사업자", (cur or {}).get("operator")),
            "vendor": pick("제조사", (cur or {}).get("vendor")),
            "role": pick("제품군", (cur or {}).get("role")),
            "model": pick("모델명", (cur or {}).get("model")),
            "username": pick("계정", (cur or {}).get("username")),
            "password": pick("비밀번호", (cur or {}).get("password")),
            "access": access,
        }
        # 인터페이스 칸이 비면 건드리지 않는다. 빈 칸을 '전부 삭제' 로 읽으면
        # 내보내기에서 지우고 올린 사람이 48포트를 통째로 잃는다.
        if if_text:
            payload_dev["interfaces"] = [
                {"name": nm, "kind": "general"} for nm in _expand_ifs(if_text)
            ]

        if dry:
            (updated if cur else created).append(
                {"ip": ip, "name": payload_dev.get("model"),
                 "interfaces": len(payload_dev.get("interfaces") or []) or None,
                 "access": [a["protocol"] for a in access]}
            )
            continue
        try:
            await db.device_upsert(payload_dev)
            (updated if cur else created).append({"ip": ip, "name": payload_dev.get("model")})
        except Exception as e:
            errors.append(f"{n}행 ({ip}): {e}")

    return {"success": not errors, "dry_run": dry,
            "created": created, "updated": updated, "errors": errors}


@router.get("/api/device-catalog")
async def get_device_catalog():
    d = core.kv_load_sync("device_catalog", {"devices": []})
    return d if isinstance(d, dict) else {"devices": []}

DEVICE_CATALOG_BACKUP_DIR = core.DATA_DIR / "backups" / "device_catalog"

def _device_catalog_backup(prev: dict) -> None:
    """저장 직전 이전 device_catalog 를 타임스탬프 파일로 백업. 최근 30개 유지."""
    try:
        DEVICE_CATALOG_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
        (DEVICE_CATALOG_BACKUP_DIR / f"{ts}.json").write_text(
            json.dumps(prev, ensure_ascii=False), encoding="utf-8"
        )
        files = sorted(DEVICE_CATALOG_BACKUP_DIR.glob("*.json"))
        for old in files[:-30]:
            try: old.unlink()
            except Exception: pass
    except Exception:
        pass


@router.post("/api/device-catalog")
async def save_device_catalog(data: dict, force: bool = False):
    # 저장 직전 이전 값 자동 백업 + 안전장치 (급격한 감소 거부)
    try:
        prev = core.kv_load_sync("device_catalog", None)
        if isinstance(prev, dict):
            prev_n = len((prev.get("devices") or []))
            new_n = len((data.get("devices") or []) if isinstance(data, dict) else [])
            # ★ 안전장치: 개수가 급격히 줄면(50% 이상 or 5대 이상 유실) 거부하고 백업만 남김.
            if not force and prev_n >= 5 and (new_n <= prev_n * 0.5 or (prev_n - new_n) >= 5):
                asyncio.get_event_loop().run_in_executor(None, _device_catalog_backup, prev)
                return {
                    "ok": False,
                    "error": f"장비 개수 급감 감지 (기존 {prev_n}대 → 요청 {new_n}대) — 유실 방지를 위해 저장 거부. 실제 삭제라면 force=true 옵션으로 재요청하거나 페이지 새로고침 후 다시 시도하세요.",
                    "prev_count": prev_n,
                    "new_count": new_n,
                }
            if prev_n > 0 and new_n < prev_n:
                asyncio.get_event_loop().run_in_executor(None, _device_catalog_backup, prev)
            elif prev_n > 0 and (new_n // 10) != (prev_n // 10):
                asyncio.get_event_loop().run_in_executor(None, _device_catalog_backup, prev)
    except Exception:
        pass
    core.kv_save_sync("device_catalog", data)
    return {"ok": True}


@router.get("/api/device-catalog/backups")
async def list_device_catalog_backups():
    """자동 백업 목록 (최근 순)."""
    if not DEVICE_CATALOG_BACKUP_DIR.exists():
        return {"ok": True, "items": []}
    items = []
    for f in sorted(DEVICE_CATALOG_BACKUP_DIR.glob("*.json"), reverse=True):
        try:
            st = f.stat()
            # 파일 내 장비 개수 미리보기
            try:
                d = json.loads(f.read_text(encoding="utf-8"))
                cnt = len(d.get("devices") or [])
            except Exception:
                cnt = 0
            items.append({"name": f.stem, "size": st.st_size, "mtime": st.st_mtime, "count": cnt})
        except Exception: pass
    return {"ok": True, "items": items}


@router.get("/api/device-catalog/backups/{name}")
async def get_device_catalog_backup(name: str):
    safe = "".join(ch if (ch.isalnum() or ch in "-_.") else "_" for ch in name)
    p = DEVICE_CATALOG_BACKUP_DIR / f"{safe}.json"
    if not p.exists():
        raise HTTPException(404, "백업 없음")
    try:
        return {"ok": True, "data": json.loads(p.read_text(encoding="utf-8"))}
    except Exception:
        raise HTTPException(500, "백업 읽기 실패")


RACKS_FILE = core.DATA_DIR / "state" / "racks.json"

def _ensure_blank_ids(d):
    """옛 자료로 들어온 부품에 id 가 없으면 채워서 저장해 둔다.
    부품 바꾸기·빼기·옮기기가 id 로 찾기 때문에, 없으면 저장이 헛돌거나
    (자기 자신 제외가 안 걸려) 겹침 검사에 걸려 저장 버튼이 죽는다."""
    try:
        if not isinstance(d, dict):
            return d
        dirty = False
        for i, b in enumerate(d.get("blanks") or []):
            if isinstance(b, dict) and not b.get("id"):
                b["id"] = f"blk-fix-{i}-{b.get('pos', 0)}"
                dirty = True
        if dirty:
            core.kv_save_sync("racks", d)
    except Exception:
        pass
    return d

@router.get("/api/racks")
async def get_racks():
    d = _ensure_blank_ids(core.kv_load_sync("racks", {"racks": []}))
    return d if isinstance(d, dict) else {"racks": []}

@router.post("/api/racks")
async def save_racks(data: dict):
    # 안전장치: 기존 데이터가 있는데 요청이 완전히 비어있으면 거부 (빈 저장으로 랙 배치 유실 방지)
    prev = core.kv_load_sync("racks", {})
    if isinstance(prev, dict) and (prev.get("labs") or prev.get("racks")) and not (data.get("labs") or data.get("racks")):
        return {"success": False, "error": "빈 데이터로 기존 랙 배치를 덮어쓸 수 없습니다"}
    core.kv_save_sync("racks", data)
    return {"success": True}


@router.get("/api/rackview")
async def rackview():
    """랙뷰 한 판 — 랙 틀(KV 'racks') + PG 장비 배치 + 아직 안 옮긴 옛 배치.

    옛 devices.json 의 배치는 IP 로 겹침을 가른다: 같은 IP 가 PG 에 있으면
    PG 가 정본이고, 없으면 회색 유령으로 보여 준다 — 랙에 꽂혀 있는 것은
    사실이니 숨기지 않는다(숨김 금지 원칙).
    """
    kv = _ensure_blank_ids(core.kv_load_sync("racks", {}) or {})
    racks = kv.get("racks") or []
    # 인터페이스 이름까지 싣는다 — 호버 카드의 포트 형상 몫
    devs = await db.device_list(with_ifs=True)
    placed, unplaced, pg_ips = [], [], set()
    for d in devs:
        ip = str(d.get("ip") or "").strip()
        if ip:
            pg_ips.add(ip)
        slim = {
            "id": d["id"], "ip": ip, "name": d.get("name"), "model": d.get("model"),
            "lab": d.get("lab"), "role": d.get("role"), "vendor": d.get("vendor"),
            "rack_units": d.get("rack_units"), "power_w": d.get("power_w"),
            "ifs": [str(i.get("name") or "") for i in (d.get("interfaces") or [])],
        }
        if d.get("rack_id") and d.get("rack_pos"):
            placed.append({
                **slim, "source": "pg",
                "rack_id": d["rack_id"], "rack_pos": d["rack_pos"],
                "rack_units": d.get("rack_units") or 1,
                "access": [
                    {"protocol": a.get("protocol"), "status": a.get("last_status"),
                     "enabled": a.get("enabled")}
                    for a in (d.get("access") or [])
                ],
            })
        else:
            unplaced.append(slim)
    legacy = []
    try:
        old = core.load_json(core.DEVICES_FILE) or {}
        by_name = {str(r.get("name") or ""): str(r.get("id") or "") for r in racks}
        for d in old.get("devices", []) or []:
            ip = str(d.get("ip") or "").strip()
            rid = d.get("rack_id") or by_name.get(str(d.get("rack_name") or ""))
            pos = d.get("rack_pos")
            if not rid or not pos or (ip and ip in pg_ips):
                continue
            legacy.append({
                "ip": ip, "name": d.get("id") or d.get("name") or ip,
                "model": d.get("model"), "lab": d.get("lab"), "source": "legacy",
                "rack_id": rid, "rack_pos": int(pos),
                "rack_units": int(d.get("rack_units") or 1),
            })
    except Exception:
        pass
    return {
        "labs": kv.get("labs") or [],
        "racks": racks,
        "blanks": kv.get("blanks") or [],
        "devices": placed + legacy,
        "unplaced": unplaced,
        # 부품 견본 — 비어 있으면 화면이 기본 팔레트를 쓴다
        "part_presets": kv.get("part_presets") or [],
    }


# ───────────────────────────────────────────
# 라우터 - STC (Spirent) 트래픽 실행 (py2.7 스크립트 subprocess)
# ───────────────────────────────────────────
_stc_proc = {"p": None}

@router.post("/api/stc/run")
async def stc_run(data: dict):
    import os, shlex
    script = (data.get("script_path") or "").strip()
    py = (data.get("py_cmd") or "py -2.7").strip()
    if not script or not os.path.exists(script):
        return {"ok": False, "error": "STC 스크립트를 찾을 수 없습니다: " + (script or "(빈 경로)")}
    p = _stc_proc.get("p")
    if p is not None and p.poll() is None:
        return {"ok": False, "error": "이미 실행 중입니다. 먼저 중지하세요."}
    try:
        cmd = shlex.split(py, posix=False) + [script]
    except Exception:
        cmd = py.split() + [script]
    env = dict(os.environ)
    env["STC_GUI_CHILD"] = "1"
    # U-TOP 폼 파라미터 → 스크립트 오버라이드 (params 가 있으면 STC_OVERRIDE=1)
    params = data.get("params") or {}
    if params:
        env["STC_OVERRIDE"] = "1"
        def _setenv(k, v):
            if v is not None and str(v) != "":
                env[k] = str(v)
        _setenv("STC_REST_IP", params.get("restIp"))
        _setenv("STC_REST_PORT", params.get("restPort"))
        _setenv("STC_USER", params.get("user"))
        _setenv("STC_SESSION", params.get("session"))
        _setenv("STC_CHASSIS", params.get("chassis"))
        _setenv("STC_PORT_A", params.get("portA"))
        _setenv("STC_PORT_B", params.get("portB"))
        _setenv("STC_FRAME", params.get("frame"))
        _setenv("STC_LOAD", params.get("load"))
        _setenv("STC_LOAD_UNIT", params.get("loadUnit"))
        _setenv("STC_PROTO", params.get("proto"))
        _setenv("STC_DST_PORT", params.get("dstPort"))
        _setenv("STC_SRC_PORT", params.get("srcPort"))
        _setenv("STC_DURATION", params.get("duration"))
        _setenv("STC_INTERVAL", params.get("interval"))
        _setenv("STC_BIDIR", "1" if params.get("bidir") else "0")
        _setenv("STC_DEVA_IP", params.get("devAip"))
        _setenv("STC_DEVA_GW", params.get("devAgw"))
        _setenv("STC_DEVA_MAC", params.get("devAmac"))
        _setenv("STC_DEVB_IP", params.get("devBip"))
        _setenv("STC_DEVB_GW", params.get("devBgw"))
        _setenv("STC_DEVB_MAC", params.get("devBmac"))
    # REST 대상이 로컬이면 stcweb.exe REST 서버를 자동 기동.
    # 안 알려 줬으면 계측기 등록에서 찾는다 — 이 서버는 리눅스라 localhost 엔 없다
    _rip0, rest_port = await _stc_rest_for(
        str((params.get("chassis") if params else "") or ""),
        (params.get("restIp") if params else ""),
        (params.get("restPort") if params else None),
    )
    rest_ip = str(_rip0).strip().lower()
    if params is not None:
        params["restIp"], params["restPort"] = _rip0, rest_port
        _setenv("STC_REST_IP", _rip0)
        _setenv("STC_REST_PORT", rest_port)
    if rest_ip in ("localhost", "127.0.0.1", "") and not _port_listening(rest_port):
        await core.broadcast({"type": "stc_line", "line": "[REST] localhost:" + str(rest_port) + " 미기동 → 서버 자동 시작"})
        srv = await stc_server_start({"port": rest_port})
        if not srv.get("ok"):
            return {"ok": False, "error": "REST 서버 시작 실패: " + str(srv.get("error"))}
    workdir = os.path.dirname(script) or "."
    # Windows + uvicorn(SelectorEventLoop) 환경에서 asyncio.create_subprocess_exec 는
    # NotImplementedError 가 나므로, 동기 Popen + 스레드로 stdout 을 읽어 WebSocket 으로 흘린다.
    try:
        proc = subprocess.Popen(
            cmd, cwd=workdir,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, bufsize=1)
    except Exception as e:
        return {"ok": False, "error": "실행 실패: " + str(e) + " (py/stcrestclient 설치 확인)"}
    _stc_proc["p"] = proc
    loop = asyncio.get_event_loop()
    await core.broadcast({"type": "stc_start", "cmd": " ".join(cmd)})

    def _emit(msg):
        try:
            asyncio.run_coroutine_threadsafe(core.broadcast(msg), loop)
        except Exception:
            pass

    def _pump():
        try:
            for raw in iter(proc.stdout.readline, b""):
                txt = raw.decode("utf-8", "replace").rstrip("\r\n")
                _emit({"type": "stc_line", "line": txt})
            rc = proc.wait()
            _emit({"type": "stc_done", "code": rc})
        except Exception as e:
            _emit({"type": "stc_line", "line": "[backend error] " + str(e)})
            _emit({"type": "stc_done", "code": -1})

    threading.Thread(target=_pump, daemon=True).start()
    return {"ok": True, "cmd": " ".join(cmd)}

@router.post("/api/stc/stop")
async def stc_stop():
    p = _stc_proc.get("p")
    if p is not None and p.poll() is None:
        try:
            p.terminate()
        except Exception:
            pass
        return {"ok": True, "stopped": True}
    return {"ok": True, "stopped": False}


# ── 위저드 트래픽 전송: 수집한 설정(JSON)으로 stc_traffic.py 통빌드+전송, 결과 스트리밍 ──
_stc_traffic_proc = {"p": None, "stop": None}

@router.post("/api/stc/traffic/run")
async def stc_traffic_run(data: dict):
    import os
    import json as _json
    p = _stc_traffic_proc.get("p")
    if p is not None and p.poll() is None:
        return {"ok": False, "error": "이미 전송 중입니다. 먼저 정지하세요."}
    _rip1, rest_port = await _stc_rest_for(str(data.get("chassis") or ""), data.get("restIp"), data.get("restPort"))
    rest_ip = str(_rip1).strip().lower()
    data["restIp"], data["restPort"] = _rip1, rest_port   # 전송 스크립트도 같은 곳을 본다
    if rest_ip in ("localhost", "127.0.0.1", "") and not _port_listening(rest_port):
        srv = await stc_server_start({"port": rest_port})
        if not srv.get("ok"):
            return {"ok": False, "error": "REST 서버 시작 실패: " + str(srv.get("error"))}
    cfgdir = str(_BACKEND_DIR)
    cfgpath = os.path.join(cfgdir, "stc", "_stc_traffic_cfg.json")
    stoppath = os.path.join(cfgdir, "_stc_traffic_stop")
    try:
        if os.path.exists(stoppath):
            os.remove(stoppath)
    except Exception:
        pass
    try:
        with open(cfgpath, "w") as f:
            _json.dump(data, f)
    except Exception as e:
        return {"ok": False, "error": "config 쓰기 실패: " + repr(e)}
    # 전송 후 위저드 예약(U_TOP_op) 복원/사전해제용 정보
    _ports_csv = ",".join([str(x).split("/")[-2] + "/" + str(x).split("/")[-1] for x in (data.get("ports") or [])])
    _user = str(data.get("user") or "admin")
    _chassis = str(data.get("chassis") or "192.168.5.100").strip()
    _rip = data.get("restIp") or rest_ip or "localhost"
    _rport = rest_port
    # 전송 직전: 위저드 예약(U_TOP_op)을 빠르게 해제 → 포트 free → U_TOP_tx 가 RevokeOwner(~50초) 없이 즉시 예약.
    #  (전송 스크립트가 예약 후 레지스트리에 user 를 다시 써서 위저드 '내 예약' 표시를 유지함)
    if _ports_csv:
        try:
            await asyncio.to_thread(_run_stc_helper, "releaseports", _chassis, _rip, _rport,
                                    {"user": _user, "ports": _ports_csv, "fast": True})
        except Exception:
            pass
    script = os.path.join(cfgdir, "stc", "stc_traffic.py")
    cmd = [sys.executable, "-u", script, cfgpath, stoppath]   # -u: 버퍼링 없이 실시간 stdout
    env = dict(os.environ)
    env["STC_GUI_CHILD"] = "1"
    env["PYTHONUNBUFFERED"] = "1"
    try:
        proc = subprocess.Popen(cmd, cwd=cfgdir, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, env=env, bufsize=1)
    except Exception as e:
        return {"ok": False, "error": "실행 실패: " + repr(e)}
    _stc_traffic_proc["p"] = proc
    _stc_traffic_proc["stop"] = stoppath
    loop = asyncio.get_event_loop()
    await core.broadcast({"type": "stc_start", "cmd": "traffic"})

    def _emit(msg):
        try:
            asyncio.run_coroutine_threadsafe(core.broadcast(msg), loop)
        except Exception:
            pass

    def _pump():
        try:
            for raw in iter(proc.stdout.readline, b""):
                _emit({"type": "stc_line", "line": raw.decode("utf-8", "replace").rstrip("\r\n")})
            rc = proc.wait()
            _emit({"type": "stc_line", "line": "[전송 종료] code=" + str(rc)})
            # U_TOP_op 를 그대로 써서 포트 예약이 유지되므로 복원 불필요. 상태 캐시만 무효화.
            try:
                _stc_status_cache.pop(_chassis, None)
            except Exception:
                pass
            _emit({"type": "stc_done", "code": rc})
        except Exception as e:
            _emit({"type": "stc_line", "line": "[backend error] " + repr(e)})
            _emit({"type": "stc_done", "code": -1})

    threading.Thread(target=_pump, daemon=True).start()
    return {"ok": True}

@router.post("/api/stc/traffic/stop")
async def stc_traffic_stop(data: dict = None):
    # 정지 신호 파일 생성 → 스크립트가 트래픽 정지 후 포트 해제/세션 종료(정리 보장).
    sp = _stc_traffic_proc.get("stop")
    if sp:
        try:
            with open(sp, "w") as f:
                f.write("stop")
        except Exception:
            pass
    return {"ok": True, "stopped": True}

# ───────────────────────────────────────────
# 라우터 - STC REST API 서버 (stcweb.exe) 관리
# stcrestclient 는 이 REST 서버에 붙고, 서버가 섀시로 연결한다.
# 서버 옆 stcweb.yaml 에 service addr(:8888)·대상 섀시가 설정돼 있다.
# ───────────────────────────────────────────
_stcweb_proc = {"p": None}

# stcweb.exe 후보 경로 (설치본 위치). 환경변수 STCWEB_PATH 로 덮어쓸 수 있다.
_STCWEB_CANDIDATES = [
    os.environ.get("STCWEB_PATH", ""),
    r"C:\Program Files\Spirent Communications\Spirent TestCenter 5.23\Spirent TestCenter Application\stcweb.exe",
    r"D:\Spirent Communications\Spirent TestCenter 5.23\Spirent TestCenter Application\stcweb.exe",
    r"C:\Spirent Communications\Spirent TestCenter 5.23\Spirent TestCenter Application\stcweb.exe",
]

# 버전(5.23 등)이 달라도 찾도록 설치 폴더를 와일드카드로 탐색 (최신 버전 우선)
_STCWEB_GLOBS = [
    r"C:\Program Files\Spirent Communications\Spirent TestCenter *\Spirent TestCenter Application\stcweb.exe",
    r"C:\Program Files (x86)\Spirent Communications\Spirent TestCenter *\Spirent TestCenter Application\stcweb.exe",
    r"D:\Spirent Communications\Spirent TestCenter *\Spirent TestCenter Application\stcweb.exe",
    r"C:\Spirent Communications\Spirent TestCenter *\Spirent TestCenter Application\stcweb.exe",
]

def _find_stcweb():
    for c in _STCWEB_CANDIDATES:
        if c and os.path.exists(c):
            return c
    import glob as _glob
    for pat in _STCWEB_GLOBS:
        hits = sorted(_glob.glob(pat))
        if hits:
            return hits[-1]  # 정렬상 마지막 = 최신 버전
    return None

def _port_listening(port, host="127.0.0.1"):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.5)
    try:
        return s.connect_ex((host, int(port))) == 0
    except Exception:
        return False
    finally:
        s.close()

@router.get("/api/stc/server/status")
async def stc_server_status(port: int = 8888):
    p = _stcweb_proc.get("p")
    managed = bool(p is not None and p.poll() is None)
    return {
        "listening": _port_listening(port),
        "managed": managed,
        "exe": _find_stcweb(),
    }

# ── IXIA N2X 트래픽 시험 (상주 데몬: n2xtclsh85 가 세션을 계속 유지) ──
# 실행 PC 가 리눅스로 바뀌면 이 경로는 없다. 코드를 고치지 않고 바꿀 수
# 있게 환경변수로 뺀다 — 리눅스용 N2X Tcl 이 있으면 그 경로를 넣으면 된다.
N2X_TCLSH = os.environ.get("N2X_TCLSH") or r"C:\N2xTcl85\bin\n2xtclsh85.exe"

# ── N2X 중계 ────────────────────────────────────────────────
#
# N2X 는 STC 와 처지가 다르다. STC 는 REST 서버를 **네트워크 너머로**
# 가리킬 수 있어서 리눅스 백엔드에서도 붙지만, N2X 는 백엔드가 있는 그
# 기계에서 Tcl 프로세스를 직접 띄운다. 실행 PC 를 리눅스로 옮기는 순간
# 이 길이 끊긴다.
#
# 그래서 윈도우 PC 한 대에 백엔드를 하나 더 띄우고 N2X 명령만 그리로
# 넘긴다. 시험은 리눅스가 돌리고, Tcl 만 건너간다.
#
#   리눅스 백엔드  ──HTTP──▶  윈도우 백엔드  ──▶  N2X Tcl  ──▶  섀시
#     N2X_RELAY_URL              N2X_RELAY_KEY
#
# 비워 두면 예전처럼 이 기계에서 직접 띄운다 — 실행 PC 가 윈도우면 아무
# 설정도 필요 없다. 즉 어느 쪽을 골라도 이 코드 하나로 된다.
N2X_RELAY_URL = (os.environ.get("N2X_RELAY_URL") or "").rstrip("/")
# 중계는 로그인 세션이 아니라 이 열쇠로 연다. 계측기를 아무나 못 돌리게
# 하려면 양쪽에 같은 값을 넣어야 한다.
N2X_RELAY_KEY = os.environ.get("N2X_RELAY_KEY") or ""
# 중계 전용으로 뜬다 — DB 도 RAG 도 잡지 않는다.
#
# 중계는 N2X 앱 서버(윈도우) 위에 올라간다. 그 기계는 계측기를 돌리는 것이
# 일이지 시험 자료를 들고 있지 않다. 거기에 PostgreSQL 을 물리게 하면
# 랩 네트워크에 구멍을 하나 더 내는 셈이고, DB 가 잠깐 흔들리면 계측기까지
# 같이 멈춘다.
N2X_RELAY_ONLY = (os.environ.get("N2X_RELAY_ONLY") or "").strip() not in ("", "0", "false")
N2X_DAEMON = os.path.join(str(_BACKEND_DIR), "n2x", "n2x_daemon.tcl")
_n2x_daemons = {}            # key "server|label" -> {proc, lock, ready}
_n2x_reg_lock = threading.Lock()

def _n2x_log(msg):
    """콘솔 인코딩(Windows cp949 등)이 유니코드 문자를 못 담아 크래시하는 것을 방지.
    print 실패 시 ASCII-safe 로 대체 후 재출력. HTTP 응답과 무관하게 서버 로그 전용."""
    try:
        print(msg)
    except (UnicodeEncodeError, UnicodeError):
        try:
            print(str(msg).encode("ascii", "replace").decode("ascii"))
        except Exception:
            pass
    except Exception:
        pass

def _n2x_readline(proc, timeout):
    """타임아웃 있는 readline. 시간 초과 시 None 반환(데몬이 멈춘 것으로 간주)."""
    box = {}
    def _r():
        try:
            box["line"] = proc.stdout.readline()
        except Exception as e:
            box["err"] = e
    t = threading.Thread(target=_r, daemon=True)
    t.start()
    t.join(timeout)
    if t.is_alive():
        return None
    if "err" in box:
        raise box["err"]
    return box.get("line", "")

def _n2x_drain_stderr(proc):
    """데몬 stderr 남은 내용 흡수(디버그용). 최대 4KB."""
    try:
        if proc and proc.stderr:
            data = proc.stderr.read(4096) if not proc.stderr.closed else ""
            return (data or "").strip()
    except Exception:
        pass
    return ""

def _n2x_start_daemon(server, label):
    """새 데몬 프로세스 기동 + ready 대기. 성공 시 {proc, lock, ready} 반환, 실패 시 {error}."""
    # 무엇이 없는지 말해 준다. "N2X Tcl 환경 없음" 만 보면 섀시가 안 켜진
    # 건지, 이 서버에 뭘 깔아야 하는 건지 알 수가 없다.
    if not os.path.exists(N2X_TCLSH):
        return {"error": f"N2X Tcl 이 이 서버에 없습니다 — 찾은 곳: {N2X_TCLSH} "
                         f"(N2X_TCLSH 환경변수로 경로를 지정하세요. "
                         f"지금 이 서버는 {platform.system()} 입니다)"}
    if not os.path.exists(N2X_DAEMON):
        return {"error": f"N2X 데몬 스크립트가 없습니다 — {N2X_DAEMON}"}
    try:
        proc = subprocess.Popen(
            [N2X_TCLSH, N2X_DAEMON, server, label],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1, encoding="utf-8", errors="replace")
        rl = _n2x_readline(proc, 40)
        if rl is None:
            err = _n2x_drain_stderr(proc)
            try: proc.kill()
            except Exception: pass
            _n2x_log(f"[N2X] daemon start timeout server={server} label={label} stderr={err[:400]}")
            return {"error": "N2X 연결 시간 초과 — 서버 상태 확인 후 다시 시도"}
        ready = (rl or "").strip()
        if not ready:
            err = _n2x_drain_stderr(proc)
            try: proc.kill()
            except Exception: pass
            _n2x_log(f"[N2X] daemon ready empty server={server} label={label} stderr={err[:400]}")
            return {"error": "N2X 데몬 초기화 실패(빈 응답) — 서버 확인"}
        # ready 응답에 error 필드가 있으면(연결 자체 실패) 그것도 전달
        try:
            rj = json.loads(ready)
            if isinstance(rj, dict) and rj.get("ready") is False:
                err_msg = str(rj.get("error", "알 수 없음"))
                try: proc.kill()
                except Exception: pass
                _n2x_log(f"[N2X] daemon ready=false server={server} label={label} err={err_msg}")
                return {"error": "N2X 세션 연결 실패: " + err_msg}
        except Exception:
            pass
        return {"proc": proc, "lock": threading.Lock(), "ready": ready}
    except Exception as e:
        _n2x_log(f"[N2X] daemon spawn exception: {e}")
        return {"error": str(e)}

def _n2x_get_daemon(server, label):
    key = server + "|" + label
    with _n2x_reg_lock:
        d = _n2x_daemons.get(key)
        if d and d["proc"].poll() is None:
            return d
        # 죽은 데몬은 제거하고 새로 기동
        if d:
            _n2x_daemons.pop(key, None)
        nd = _n2x_start_daemon(server, label)
        if "error" in nd:
            return nd
        _n2x_daemons[key] = nd
        return nd

# 데몬이 내주는 잘못 코드 → 사람이 읽는 말.
#
# 문구를 Tcl 안에 한국어로 적어 두었더니 그대로 깨져 나왔다
# (`∞£åφÜ¿φÒ£ ∞èñφè¬ …`). Windows 의 Tcl 은 .tcl 파일을 시스템 인코딩으로
# 읽는데 파일은 UTF-8 이라, 한글이 그 자리에서 어긋난다. 데몬은 ASCII 만
# 말하고 한국어는 여기서 붙인다.
_N2X_ERRS = {
    "no_valid_stream":
        "스트림을 하나도 만들지 못했습니다 — 그 포트를 이 세션이 잡고 있지 않습니다",
}


def _n2x_humanize(res):
    """데몬 응답의 error 를 사람이 읽는 말로 바꾼다. 모르는 것은 그대로 둔다."""
    if not isinstance(res, dict):
        return res
    code = str(res.get("error") or "")
    ko = _N2X_ERRS.get(code)
    if not ko:
        return res
    bad = str(res.get("badPorts") or "").strip()
    if bad:
        ko += f" (못 잡은 포트: {bad}). 「포트 확인」 으로 실제 포트 번호를 보고 Traffic 탭의 시험 포트와 맞추세요"
    out = dict(res)
    out["error"] = ko
    out["code"] = code
    return out


def _n2x_send(server, label, cmd, _retry=True):
    """N2X 명령 한 줄. 중계가 설정돼 있으면 그리로, 아니면 이 기계에서 직접.

    모든 N2X 기능(ports · reserve · release · traffic · ping)이 이 함수
    하나를 지난다. 그래서 여기 한 곳만 갈라 두면 기능마다 따로 손볼 것이
    없다.
    """
    if N2X_RELAY_URL:
        try:
            # N2X 명령은 길다 — ports 스캔이 45초, traffic 이 60초까지 간다.
            # 중계 타임아웃은 그보다 넉넉해야 중간에 끊기지 않는다.
            r = httpx.post(
                N2X_RELAY_URL + "/api/n2x/send",
                json={"server": server, "label": label, "cmd": cmd, "key": N2X_RELAY_KEY},
                timeout=150,
            )
            if r.status_code != 200:
                return {"ok": False,
                        "error": f"N2X 중계 오류 {r.status_code} — {r.text[:200]}"}
            return r.json()
        except Exception as e:
            _n2x_log(f"[N2X] relay failed url={N2X_RELAY_URL} err={e}")
            return {"ok": False,
                    "error": f"N2X 중계에 못 붙었습니다 ({N2X_RELAY_URL}) — {e}"}
    return _n2x_send_local(server, label, cmd, _retry)


def _n2x_send_local(server, label, cmd, _retry=True):
    """상주 데몬에 한 줄 명령 전송 → JSON 응답. 데몬 EOF(=크래시) 감지 시 1회 자동 재기동+재시도.
    NOTE: reserve/release 는 이미 서버에 반영됐을 가능성이 있어 auto-retry 하지 않는다(중복 명령 방지)."""
    # reserve/release 는 부작용 있는 명령 — retry 금지
    _is_side_effect = cmd.startswith("reserve") or cmd.startswith("release")
    if _is_side_effect:
        _retry = False
    d = _n2x_get_daemon(server, label)
    if "error" in d:
        return {"ok": False, "error": d["error"]}
    if d["proc"].poll() is not None:
        with _n2x_reg_lock:
            _n2x_daemons.pop(server + "|" + label, None)
        d = _n2x_get_daemon(server, label)
        if "error" in d:
            return {"ok": False, "error": d["error"]}
    proc = d["proc"]
    # 명령별 timeout — ping 은 짧게, reserve/release 는 넉넉히(AddPort 는 N2X 서버 부하 시 15-25s 소요),
    # ports 는 전체 스캔이라 길게, traffic 은 중간
    if cmd.startswith("ports"):
        tmo = 45
    elif cmd.startswith("ping"):
        tmo = 10
    elif cmd.startswith("reserve") or cmd.startswith("release"):
        tmo = 15   # reserve/release 는 짧게 잡음. 초과 시 데몬 kill 하지 않고 background 로 결과 확인 → 다른 조회 진행 가능
    else:
        tmo = 60
    # 데몬 파이프는 단일이라 lock 으로 명령 직렬화. 다만 앞선 명령이 hang 이면 뒤 요청이 무한 대기 →
    # lock 획득 자체에도 타임아웃을 걸어, 대기 초과 시 즉시 실패로 반환 (사용자가 계속 응답 안 오는 상태 방지).
    # ports 는 캐시(5초)로 대체 가능하니 짧게(3s), 나머지는 명령 timeout+5s 로 설정.
    if cmd.startswith("ports"):
        lock_wait = 3.0
    elif cmd.startswith("ping"):
        lock_wait = 5.0
    else:
        lock_wait = tmo + 5.0
    if not d["lock"].acquire(timeout=lock_wait):
        _n2x_log(f"[N2X] lock acquire timeout({lock_wait}s) cmd={cmd[:40]} -- daemon busy with previous command")
        return {"ok": False, "error": f"데몬 사용 중 — 앞선 명령 대기 시간 초과({lock_wait}s). 잠시 후 다시 시도"}
    _lock_transferred = [False]   # async 반환 시 background 로 lock 소유권 넘기고 여기 finally 에서 release 안 하도록
    try:
        try:
            # 전송 직전 프로세스 죽음 감지 → 자동 재기동
            if proc.poll() is not None:
                err = _n2x_drain_stderr(proc)
                _n2x_log(f"[N2X] daemon dead before send cmd={cmd[:40]} stderr={err[:400]}")
                with _n2x_reg_lock:
                    _n2x_daemons.pop(server + "|" + label, None)
                if _retry:
                    return _n2x_send_local(server, label, cmd, _retry=False)
                return {"ok": False, "error": "데몬 재기동 실패 — 백엔드 로그 확인"}
            proc.stdin.write(cmd + "\n")
            proc.stdin.flush()
            rl = _n2x_readline(proc, tmo)
            if rl is None:
                _n2x_log(f"[N2X] readline timeout cmd={cmd[:40]} tmo={tmo}s -- returning early (background will drain)")
                # reserve/release: 데몬은 살려두고, 백그라운드 스레드가 남은 응답을 읽어 캐시 무효화만 처리
                # → 다른 조회(ports 등) 는 lock 이 즉시 풀리므로 바로 응답 가능
                if cmd.startswith("reserve") or cmd.startswith("release"):
                    def _bg_drain(_d, _s, _l, _c):
                        try:
                            extra = _n2x_readline(_d["proc"], 60)   # 최대 60초 더 대기
                            if extra:
                                _n2x_log(f"[N2X] bg drain done cmd={_c[:40]} resp={extra[:80]}")
                                # 결과에 따라 캐시 무효화 (실제 상태 변화 반영)
                                _n2x_ports_cache_invalidate(_s, _l)
                            else:
                                _n2x_log(f"[N2X] bg drain empty (daemon crashed) cmd={_c[:40]}")
                                with _n2x_reg_lock:
                                    _n2x_daemons.pop(_s + "|" + _l, None)
                        except Exception as _e:
                            _n2x_log(f"[N2X] bg drain exception cmd={_c[:40]} err={_e}")
                        finally:
                            try: _d["lock"].release()
                            except Exception: pass
                    _lock_transferred[0] = True   # finally 에서 release 하지 않도록 표시
                    threading.Thread(target=_bg_drain, args=(d, server, label, cmd), daemon=True).start()
                    return {"ok": False, "async": True,
                            "error": f"N2X 처리 시간이 길어 background 로 확인 중 ({tmo}s+). 잠시 후 재조회 시 반영됩니다.",
                            "hint": "reserve/release 는 실제 서버에 반영됐을 가능성이 큼 — 재조회 시 상태 확인"}
                # ports 등 조회 명령은 기존대로 kill/재기동
                err = _n2x_drain_stderr(proc)
                _n2x_log(f"[N2X] readline timeout cmd={cmd[:40]} tmo={tmo}s stderr={err[:400]}")
                try: proc.kill()
                except Exception: pass
                with _n2x_reg_lock:
                    _n2x_daemons.pop(server + "|" + label, None)
                return {"ok": False, "error": f"데몬 응답 시간 초과({tmo}s) — 다시 시도하세요"}
            line = (rl or "").strip()
            if not line:
                # EOF = 데몬 프로세스 종료. stderr 확인 후 1회 재시도
                err = _n2x_drain_stderr(proc)
                exit_code = proc.poll()
                _n2x_log(f"[N2X] EOF (daemon died) cmd={cmd[:40]} exit={exit_code} stderr={err[:400]}")
                with _n2x_reg_lock:
                    _n2x_daemons.pop(server + "|" + label, None)
                if _retry:
                    return _n2x_send_local(server, label, cmd, _retry=False)
                return {"ok": False, "error": "데몬 응답 없음(연결 끊김): " + (err[:200] if err else "원인 불명 — 백엔드 로그 확인")}
            return json.loads(line)
        except (BrokenPipeError, OSError) as e:
            err = _n2x_drain_stderr(proc)
            _n2x_log(f"[N2X] pipe broken cmd={cmd[:40]} err={e} stderr={err[:400]}")
            with _n2x_reg_lock:
                _n2x_daemons.pop(server + "|" + label, None)
            if _retry:
                return _n2x_send_local(server, label, cmd, _retry=False)
            return {"ok": False, "error": "데몬 파이프 끊김 — 다시 시도"}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    finally:
        if not _lock_transferred[0]:
            try: d["lock"].release()
            except Exception: pass

@router.post("/api/n2x/send")
def n2x_send_relay(data: dict):
    """중계 창구 — 다른 UTOP 백엔드가 보낸 N2X 명령을 이 기계에서 실행한다.

    이 기계에 N2X Tcl 이 깔려 있어야 한다. 리눅스 백엔드가 여기로 넘긴다.

    로그인 세션이 아니라 열쇠로 연다 — 서버끼리 부르는 자리라 사람의
    세션이 없다. 열쇠를 안 정해 두면 아무나 계측기를 돌릴 수 있으므로
    비어 있으면 아예 막는다.
    """
    if not N2X_RELAY_KEY:
        return {"ok": False, "error": "이 서버는 중계로 열려 있지 않습니다 (N2X_RELAY_KEY 없음)"}
    if str(data.get("key") or "") != N2X_RELAY_KEY:
        return {"ok": False, "error": "중계 열쇠가 다릅니다"}
    cmd = str(data.get("cmd") or "").strip()
    if not cmd:
        return {"ok": False, "error": "cmd 필요"}
    return _n2x_send_local(str(data.get("server") or ""), str(data.get("label") or "utop"), cmd)


@router.get("/api/n2x/ping")
def n2x_ping(server: str = "210.1.2.248", label: str = "utop"):
    return _n2x_send(server, label, "ping")

@router.get("/api/n2x/diag")
def n2x_diag(server: str = "210.1.2.248", label: str = "utop"):
    """데몬 상태 진단 — 등록된 데몬 프로세스 목록, alive 여부, stderr 잔여 등."""
    out = {"ok": True, "target": f"{server}|{label}", "daemons": []}
    with _n2x_reg_lock:
        for key, d in _n2x_daemons.items():
            proc = d.get("proc")
            alive = proc and proc.poll() is None
            info = {"key": key, "alive": bool(alive), "pid": proc.pid if proc else None,
                    "ready": d.get("ready", ""), "exit_code": proc.poll() if proc else None}
            out["daemons"].append(info)
    out["target_alive"] = any(d["key"] == f"{server}|{label}" and d["alive"] for d in out["daemons"])
    return out

def _n2x_local_ver() -> int:
    """저장소에 있는 n2x_daemon.tcl 의 판. 없으면 0."""
    try:
        import re as _re
        with open(N2X_DAEMON, encoding="utf-8") as f:
            mm = _re.search(r"^set DAEMON_VER (\d+)", f.read(), _re.M)
        return int(mm.group(1)) if mm else 0
    except Exception:
        return 0


@router.get("/api/n2x/daemon.tcl")
def n2x_daemon_file():
    """
    지금 서버가 갖고 있는 데몬 스크립트를 그대로 내려준다.

    이 파일은 N2X 기계(윈도우)의 사본이 도는데, 그것을 어디서 받아야 하는지가
    어디에도 없었다. 저장소를 뒤지거나 사람에게 물어야 했다. 서버가 제
    사본을 내주면 그 기계에서 브라우저로 열어 받으면 끝난다 — 판이 어긋날
    자리도 그만큼 줄어든다.
    """
    if not os.path.exists(N2X_DAEMON):
        raise HTTPException(404, f"데몬 스크립트가 없습니다 — {N2X_DAEMON}")
    return FileResponse(
        N2X_DAEMON,
        media_type="text/plain; charset=utf-8",
        filename="n2x_daemon.tcl",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/api/n2x/relay.py")
def n2x_relay_file():
    """중계 스크립트도 같은 자리에서. 처음 깔 때 이것부터 필요하다."""
    p = os.path.join(str(_BACKEND_DIR.parent), "tools", "n2x_relay.py")
    if not os.path.exists(p):
        raise HTTPException(404, f"중계 스크립트가 없습니다 — {p}")
    return FileResponse(
        p,
        media_type="text/plain; charset=utf-8",
        filename="n2x_relay.py",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/api/n2x/ver")
def n2x_ver(server: str = "210.1.2.248", label: str = "utop"):
    """
    윈도우에서 도는 데몬이 몇 번째 판인가.

    이 스크립트는 리눅스가 아니라 N2X 기계의 사본이 돈다. 저장소만 고치고
    컨테이너를 다시 올려도 실제로 도는 것은 안 바뀐다 — 그런데 화면에는
    그 사실이 어디에도 안 나와서, 고친 것이 왜 안 먹는지 알 수가 없었다.
    """
    want = _n2x_local_ver()
    res = _n2x_send(server, label, "ver")
    got = 0
    if isinstance(res, dict):
        try:
            got = int(res.get("ver") or 0)
        except Exception:
            got = 0

    # 「닿았는데 옛 판」 과 「아예 안 닿는다」 는 다른 일이다.
    #
    # 전에는 둘을 하나로 묶어 「옛 판입니다 (거기 알 수 없음)」 이라고 했다.
    # 주소를 잘못 적어 중계가 없는 자리를 고른 사람에게 이 말은 거짓이고,
    # 시키는 대로 파일을 복사해도 아무것도 안 바뀐다 — 고칠 곳은 주소다.
    reachable = got > 0
    stale = reachable and want > got
    if not reachable:
        note = (
            f"N2X 중계에 닿지 않습니다 ({server}). 주소가 맞는지, 그 기계에서 "
            "n2x_relay.py 가 떠 있는지 보세요."
        )
    elif stale:
        note = (
            f"N2X 기계의 n2x_daemon.tcl 이 옛 판입니다 (거기 {got} · 여기 {want}). "
            "backend/n2x/n2x_daemon.tcl 을 그 기계의 중계 폴더로 복사하고 n2x_relay.py 를 다시 띄우세요."
        )
    else:
        note = ""
    return {
        "ok": True,
        "local": want,
        "remote": got,
        "reachable": reachable,
        "stale": stale,
        "note": note,
    }


@router.post("/api/n2x/reset")
def n2x_reset(data: dict):
    """
    데몬 강제 재기동 — 섀시가 붙잡고 있는 세션을 놓게 한다.

    N2X 섀시는 동시에 열 수 있는 세션 수가 정해져 있다. 그것이 차면
    「The system already has maximum sessions running」 로 트래픽 시작이
    막힌다. 세션은 우리가 띄운 Tcl 데몬이 하나씩 쥐고 있으므로, 데몬을
    죽이는 것이 곧 세션을 놓는 것이다.

    **라벨을 안 주면 그 섀시로 띄운 데몬을 전부** 정리한다. 라벨 하나만
    죽이게 두었더니, 화면마다 다른 라벨로 띄운 것들이 남아 아무리 눌러도
    자리가 안 났다.
    """
    server = str(data.get("server", "210.1.2.248"))
    label = str(data.get("label") or "").strip()
    killed = []
    with _n2x_reg_lock:
        if label:
            keys = [k for k in list(_n2x_daemons) if k == server + "|" + label]
        else:
            keys = [k for k in list(_n2x_daemons) if k.startswith(server + "|")]
        for k in keys:
            d = _n2x_daemons.pop(k, None)
            if d and d.get("proc"):
                try:
                    d["proc"].kill()
                    killed.append(k.split("|", 1)[1])
                except Exception:
                    pass
    for lb in (killed or [label or "utop"]):
        _n2x_ports_cache_invalidate(server, lb)
    return {"ok": True, "killed": killed, "count": len(killed),
            "note": ("정리한 세션 " + ", ".join(killed)) if killed
                    else "우리가 띄운 세션은 없었습니다 — 남은 세션은 다른 PC 나 N2X GUI 가 쥐고 있습니다"}

# ── ports 응답 캐시 (server|label → {ts, data}) ─────────────────────────
# N2X 서버는 매 조회마다 모든 모듈·포트를 순차 스캔해서 부하가 크고 느림.
# 짧은 창(N2X_PORTS_CACHE_TTL초) 내 반복 조회는 캐시로 응답 → 사용자 여럿이 페이지를 열어도
# 실제 N2X 호출은 창당 1회. 예약/해제 성공 시 즉시 무효화(_n2x_ports_cache_invalidate).
_n2x_ports_cache = {}
_n2x_ports_cache_lock = threading.Lock()
N2X_PORTS_CACHE_TTL = 5.0   # 초

def _n2x_ports_cache_key(server, label):
    return str(server) + "|" + str(label)

def _n2x_ports_cache_invalidate(server, label):
    with _n2x_ports_cache_lock:
        _n2x_ports_cache.pop(_n2x_ports_cache_key(server, label), None)

def _n2x_ports_cached(server, label, force=False):
    """캐시 우선 조회. force=True 면 캐시 무시하고 새로 조회.
    데몬이 busy(lock timeout) 이면 만료된 캐시라도 반환 → 예약 진행 중에도 조회 응답 유지 (stale-while-busy 전략)."""
    import time as _t
    key = _n2x_ports_cache_key(server, label)
    if not force:
        with _n2x_ports_cache_lock:
            hit = _n2x_ports_cache.get(key)
            if hit and (_t.time() - hit["ts"]) < N2X_PORTS_CACHE_TTL:
                d = dict(hit["data"]); d["cached"] = True; d["cache_age"] = round(_t.time() - hit["ts"], 2)
                return d
    data = _n2x_send(server, label, "ports")
    if isinstance(data, dict) and data.get("ok"):
        with _n2x_ports_cache_lock:
            _n2x_ports_cache[key] = {"ts": _t.time(), "data": data}
    elif isinstance(data, dict) and not data.get("ok"):
        # 데몬 busy / lock timeout 등으로 실패 → 만료된 캐시라도 있으면 그걸로 대체 (사용자가 계속 이전 상태는 보게)
        with _n2x_ports_cache_lock:
            hit = _n2x_ports_cache.get(key)
        if hit:
            age = round(_t.time() - hit["ts"], 1)
            d = dict(hit["data"])
            d["cached"] = True; d["stale"] = True; d["cache_age"] = age
            d["stale_reason"] = data.get("error", "데몬 사용 중")
            return d
    return data

@router.get("/api/n2x/probe")
def n2x_probe(server: str = "210.1.2.248", label: str = "utop", force: int = 0):
    return _n2x_ports_cached(server, label, force=bool(force))

@router.get("/api/n2x/ports")
def n2x_ports(server: str = "210.1.2.248", label: str = "utop", force: int = 0):
    return _n2x_ports_cached(server, label, force=bool(force))

@router.post("/api/n2x/reserve-batch")
def n2x_reserve_batch(data: dict):
    """여러 (module, port) 예약을 한 번의 요청으로. 데몬 파이프는 단일이라 서버 단에서 순차 처리 →
    프론트가 병렬로 개별 요청 보낼 때 발생하던 파이프 race/timeout 문제 회피.
    사전 헬스체크(ping) + 포트 상태 조회(ports)로 이미 다른 세션이 잡은 포트는 시도 없이 명확한 에러 반환.
    payload: {server, label, targets: [{module, port}, ...]} → {ok:true, results:[{module,port,ok,error?}]}"""
    server = str(data.get("server", "210.1.2.248"))
    label = str(data.get("label", "utop"))
    targets = data.get("targets") or []
    if not targets:
        return {"ok": False, "error": "targets 필요"}
    # 데몬 사전 헬스체크: ping 실패 시 좀비 데몬 강제 정리 후 재기동 유도
    _hc = _n2x_send(server, label, "ping")
    if not (isinstance(_hc, dict) and _hc.get("ok")):
        with _n2x_reg_lock:
            _z = _n2x_daemons.pop(server + "|" + label, None)
        if _z:
            try: _z["proc"].kill()
            except Exception: pass
        _hc2 = _n2x_send(server, label, "ping")
        if not (isinstance(_hc2, dict) and _hc2.get("ok")):
            return {"ok": False, "error": "N2X 데몬 응답 없음 — 데몬 재기동 실패 · 서버 관리자 확인 필요"}
    # 포트 상태 조회 — reserve 전에 다른 세션이 잡고 있는지 미리 확인 (잡혀있으면 hang 방지 위해 시도 스킵)
    port_state = {}   # "module/port" -> {"lock": "sessionId", "label": "누구", "mine": bool}
    try:
        pj = _n2x_ports_cached(server, label)
        if isinstance(pj, dict) and pj.get("ok"):
            for m in (pj.get("modules") or []):
                mid = str(m.get("id"))
                for p in (m.get("portList") or []):
                    port_state[mid + "/" + str(p.get("port"))] = {
                        "lock": str(p.get("lock", "0")),
                        "label": p.get("label") or "",
                        "mine": bool(p.get("mine")),
                    }
    except Exception:
        pass
    results = []
    for t in targets:
        m = ""; p = ""
        try:
            m = str((t or {}).get("module", "")).strip()
            p = str((t or {}).get("port", "")).strip()
            if not m or not p:
                results.append({"module": m, "port": p, "ok": False, "error": "module/port 누락"})
                continue
            key = m + "/" + p
            _st = port_state.get(key)
            # 다른 세션이 잡고 있으면 시도 스킵 (hang 방지) — 강제 예약을 원하면 force 플래그 사용해야 함
            if _st and not _st["mine"] and _st["lock"] != "0":
                core.who = _st["label"] or ("세션 " + _st["lock"])
                results.append({"module": m, "port": p, "ok": False,
                                "error": "이미 다른 세션이 사용 중 (label: " + core.who + ")",
                                "locked_by": core.who})
                continue
            # 내가 이미 잡은 포트면 성공으로 (재예약 불필요)
            if _st and _st["mine"]:
                results.append({"module": m, "port": p, "ok": True, "already_mine": True})
                continue
            r = _n2x_send(server, label, "reserve " + m + " " + p)
            if isinstance(r, dict) and r.get("ok"):
                results.append({"module": m, "port": p, "ok": True})
            else:
                results.append({"module": m, "port": p, "ok": False, "error": (r or {}).get("error", "실패")})
        except Exception as e:
            results.append({"module": m, "port": p, "ok": False, "error": str(e)})
    _n2x_ports_cache_invalidate(server, label)
    return {"ok": True, "results": results}

def _n2x_verify_reserved(server, label, module, port):
    """포트가 실제로 label 세션에 예약됐는지 서버에 물어봐 확인. 상태 변경 후이므로 캐시 무시."""
    pj = _n2x_ports_cached(server, label, force=True)
    if not isinstance(pj, dict) or not pj.get("ok"):
        return None   # 확인 불가
    for m in (pj.get("modules") or []):
        if str(m.get("id")) == str(module):
            for p in (m.get("portList") or []):
                if str(p.get("port")) == str(port):
                    return bool(p.get("mine"))
    return False

@router.post("/api/n2x/reserve")
def n2x_reserve(data: dict):
    module = str(data.get("module", ""))
    ports = data.get("ports", [])
    if not module or not ports:
        return {"ok": False, "error": "module/ports 누락"}
    server = str(data.get("server", "210.1.2.248"))
    label = str(data.get("label", "utop"))
    port = str(ports[0])
    if data.get("force"):
        # 강제: 다른 세션이 이 포트를 잠갔으면 그 세션(label)에서 해당 포트만 release 후 점유
        pj = _n2x_ports_cached(server, label)
        lk = None
        if isinstance(pj, dict) and pj.get("ok"):
            for m in (pj.get("modules") or []):
                if str(m.get("id")) == module:
                    for p in (m.get("portList") or []):
                        if str(p.get("port")) == port and not p.get("mine") and str(p.get("lock", "0")) != "0":
                            lk = p.get("label")
        if lk and str(lk) != label:
            _n2x_send(server, str(lk), "release " + module + " " + port)
            _n2x_ports_cache_invalidate(server, str(lk))
            _n2x_ports_cache_invalidate(server, label)
            import time
            time.sleep(0.5)
    res = _n2x_send(server, label, "reserve " + module + " " + port)
    _n2x_ports_cache_invalidate(server, label)
    # reserve 실패 응답이 왔더라도 서버 상태 재확인 — 파이프 끊김 사이 이미 예약됐을 수 있음
    if isinstance(res, dict) and not res.get("ok"):
        try:
            import time
            time.sleep(0.3)   # N2X 서버 상태 반영 대기
            ok_actual = _n2x_verify_reserved(server, label, module, port)
            if ok_actual is True:
                _n2x_log(f"[N2X] reserve reported fail but port actually reserved -- recovering module={module} port={port}")
                return {"ok": True, "reserved": module + "/" + port, "recovered": True, "note": res.get("error", "")}
        except Exception as e:
            _n2x_log(f"[N2X] verify after reserve fail failed: {e}")
    return res

@router.post("/api/n2x/release")
def n2x_release(data: dict):
    module = str(data.get("module", ""))
    port = str(data.get("port", ""))
    if not module or not port:
        return {"ok": False, "error": "module/port 필요"}
    server = str(data.get("server", "210.1.2.248"))
    label = str(data.get("label", "utop"))
    res = _n2x_send(server, label, "release " + module + " " + port)
    _n2x_ports_cache_invalidate(server, label)
    # release 실패 응답이 왔더라도 실제로 해제됐는지 재확인
    if isinstance(res, dict) and not res.get("ok"):
        try:
            import time
            time.sleep(0.3)
            ok_actual = _n2x_verify_reserved(server, label, module, port)
            if ok_actual is False:   # 내 예약에 없음 = 해제된 것
                _n2x_log(f"[N2X] release reported fail but port actually released -- recovering module={module} port={port}")
                return {"ok": True, "released": module + "/" + port, "recovered": True, "note": res.get("error", "")}
        except Exception as e:
            _n2x_log(f"[N2X] verify after release fail failed: {e}")
    return res

def _n2x_streams_from(data: dict):
    streams = data.get("streams") or []
    # 단일(구버전 폼) 호환: module/txPort/rxPort 가 오면 1개 스트림으로 변환
    if not streams and data.get("module") and data.get("txPort") and data.get("rxPort"):
        streams = [{"txMod": data.get("module"), "txPort": data.get("txPort"),
                    "rxMod": data.get("module"), "rxPort": data.get("rxPort"),
                    "proto": "udp", "frame": data.get("frame", 64),
                    "pps": data.get("pps", 1000), "npkt": data.get("npkt", 0)}]
    return streams


# 화면의 말 → 데몬의 말.
#
# 데몬은 윈도우에서 도는 Tcl 이라 한글이 그대로 가면 깨진다(전에 오류
# 메시지가 그렇게 깨져 읽을 수가 없었다). 여기서 ASCII 로 바꿔 보낸다.
_N2X_MODS = {"증가": "inc", "감소": "dec", "무작위": "rand", "Yes": "inc", "No": "fix"}


def _n2x_specs(streams):
    def _clean(v):
        t = str(v if v is not None else "").strip()
        t = _N2X_MODS.get(t, t)
        return t.replace(",", "").replace(" ", "")
    # unit 은 맨 뒤에 붙인다 — 자리로 읽는 형식이라, 중간에 끼우면 옛 spec 이
    # 통째로 어긋난다. 없으면 데몬이 pps 로 본다.
    #
    # 뒤의 일곱은 **주소를 여럿으로 뿌리기** 위한 것이다.
    #
    # 여태 계측기에는 값이 하나씩만 갔다(`SetFieldFixedValue`). 화면에서는
    # 「01 부터 열 개」 로 적어 두고 선로에는 01 하나만 나갔는데, 화면
    # 어디에도 그 말이 없었다 — 시험은 돌고 결과도 나오는데 잰 것이 딴것이다.
    # 시작 · 개수 · 모드를 함께 보내고, 데몬이 목록을 만들어
    # `SetFieldValueList` 로 넣는다.
    keys = [
        "txMod", "txPort", "rxMod", "rxPort", "proto", "frame", "pps", "npkt",
        "srcMac", "dstMac", "srcIp", "dstIp", "unit", "frameMax",
        "cnt", "srcMacMod", "dstMacMod", "srcIpMod", "dstIpMod", "vlan", "vlanMod",
    ]
    specs = []
    for s in streams:
        # 송신 모듈만 주면 수신 모듈도 동일하게
        if not s.get("rxMod"):
            s["rxMod"] = s.get("txMod") or s.get("module") or ""
        if not s.get("txMod"):
            s["txMod"] = s.get("module") or ""
        specs.append(",".join(_clean(s.get(k, "")) for k in keys))
    return specs




@router.post("/api/n2x/traffic/start")
def n2x_traffic_start(data: dict):
    # 비동기 시작 — 즉시 리턴(대기 X). dur 0/미지정 = 연속(데몬에서 1시간), 이후 /stat 폴링
    streams = _n2x_streams_from(data)
    if not streams:
        return {"ok": False, "error": "streams(또는 module/txPort/rxPort) 필요"}
    # 보내는 줄을 그대로 남긴다.
    #
    # 「10 갈래로 잡았는데 두 줄만 나온다」 를 쫓는 데 한참 걸렸다. 화면 ·
    # 서버 · 데몬 셋 중 어디서 값이 빠지는지 볼 데가 없었기 때문이다.
    # 이 한 줄이면 무엇이 실제로 나갔는지 바로 보인다.
    cmd = "tstart " + str(data.get("dur") or 0) + " " + " ".join(_n2x_specs(streams))
    _n2x_log("[N2X] " + cmd)
    return _n2x_humanize(_n2x_send(
        str(data.get("server", "210.1.2.248")), str(data.get("label", "utop")), cmd))


@router.post("/api/n2x/traffic/stat")
def n2x_traffic_stat(data: dict):
    # 실시간 통계 폴링 (전송 중에도 조회)
    return _n2x_send(str(data.get("server", "210.1.2.248")), str(data.get("label", "utop")), "tstat")


@router.post("/api/n2x/traffic/stop")
def n2x_traffic_stop(data: dict):
    return _n2x_send(str(data.get("server", "210.1.2.248")), str(data.get("label", "utop")), "tstop")


@router.post("/api/n2x/arp")
def n2x_arp(data: dict):
    """
    GW 에게 ARP 를 보내 MAC 을 받아 온다.

    L3 로 쏘려면 프레임의 목적지 MAC 이 첫 홉(=GW)의 MAC 이어야 한다.
    지금까지 그 값은 사람이 장비에서 `show arp` 로 읽어 손으로 옮겨 적었다.
    한 자만 틀려도 프레임이 장비로 안 가고 손실 100% 로 나오는데, 화면에는
    「안 받았다」 만 뜬다.

    데몬이 그 명령을 아직 모르면 `unknown` 이 돌아온다. 그때는 **거짓으로
    성공을 만들지 않는다** — 무엇이 없어서 못 하는지 그대로 말한다.
    """
    server = str(data.get("server") or "210.1.2.248")
    label = str(data.get("label") or "utop")
    port = str(data.get("port") or "").strip()
    gw = str(data.get("gw") or "").strip()
    if not gw:
        return {"ok": False, "error": "GW 가 비어 있습니다"}
    if not port:
        return {"ok": False, "error": "이 스트림의 보내는 포트가 비어 있습니다"}
    mod, _, pnum = port.partition("/")
    res = _n2x_send(
        server,
        label,
        "arp %s %s %s %s %s"
        % (
            mod or "-",
            pnum or "-",
            gw,
            str(data.get("srcIp") or "-").strip() or "-",
            str(data.get("srcMac") or "-").strip() or "-",
        ),
    )
    if isinstance(res, dict) and str(res.get("error") or "") == "unknown":
        return {
            "ok": False,
            "error": (
                "이 N2X 데몬은 아직 ARP 를 모릅니다. n2x_daemon.tcl 을 새 판으로 "
                "바꾸고 n2x_relay.py 를 다시 띄우세요."
            ),
        }
    return res


@router.post("/api/n2x/traffic/clear")
def n2x_traffic_clear(data: dict):
    return _n2x_send(str(data.get("server", "210.1.2.248")), str(data.get("label", "utop")), "tclear")

@router.post("/api/stc/meter/{action}")
async def stc_meter_action(action: str, data: dict):
    # TC 계측기 스텝 실행: stc_meter.py 로 한 액션 수행(영속 U_TOP_meter 세션). stdout 텍스트 반환.
    import json as _json
    cfg = (data or {}).get("cfg") or {}
    if action not in ("build", "arp", "start", "stop", "query", "close", "disconnect"):
        return {"ok": False, "error": "알 수 없는 action: " + str(action)}
    _rip, _rport = await _stc_rest_for(str(cfg.get("chassis") or ""), cfg.get("restIp"), cfg.get("restPort"))
    cfg["restIp"], cfg["restPort"] = _rip, _rport
    rest_ip = str(_rip).strip().lower()
    rest_port = int(_rport)
    if rest_ip in ("localhost", "127.0.0.1", "") and not _port_listening(rest_port):
        srv = await stc_server_start({"port": rest_port})
        if not srv.get("ok"):
            return {"ok": False, "error": "REST 서버 시작 실패: " + str(srv.get("error"))}
    cfgdir = str(_BACKEND_DIR)
    cfgpath = os.path.join(cfgdir, "stc", "_stc_meter_cfg.json")
    try:
        with open(cfgpath, "w") as f:
            _json.dump(cfg, f)
    except Exception as e:
        return {"ok": False, "error": "cfg 쓰기 실패: " + repr(e)}
    script = os.path.join(cfgdir, "stc", "stc_meter.py")

    def _run():
        cmd = [sys.executable, "-u", script, action, cfgpath]
        env = dict(os.environ)
        env["PYTHONUNBUFFERED"] = "1"
        try:
            cp = subprocess.run(cmd, cwd=cfgdir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, timeout=150)
            return (cp.stdout.decode("utf-8", "replace") if cp.stdout else ""), cp.returncode
        except subprocess.TimeoutExpired:
            return "[시간 초과 150초]", 1
        except Exception as e:
            return "[실행 실패] " + repr(e), 1

    text, rc = await asyncio.to_thread(_run)
    ok = (rc == 0) and ("[ERROR]" not in text)
    return {"ok": ok, "text": (text or "").strip(), "code": rc}

@router.post("/api/stc/server/start")
async def _stc_rest_for(chassis: str, rest_ip: str = "", rest_port=None):
    """이 섀시의 **REST 서버 주소**. 화면이 안 알려 주면 등록에서 찾는다.

    STC 는 두 자리가 있다: 섀시(장비 IP)와 REST 서버(윈도우 PC). 화면 몇
    군데가 REST 서버를 `localhost` 로 박아 두었는데, 이 서버는 리눅스라
    거기엔 아무도 없다 — 그래서 「stcweb.exe 를 찾을 수 없습니다」 로
    끝났다(지적: 계측기는 붙는데 시험 탭에서만).

    계측기 등록의 stc 접속 줄에 그 주소가 이미 있다(host·port). 그것이
    정본이다. 못 찾으면 받은 값을 그대로 쓴다 — 지어내지 않는다.
    """
    ip = str(rest_ip or "").strip()
    port = int(rest_port or 0) or 0
    local = ip.lower() in ("", "localhost", "127.0.0.1")
    if not local and port:
        return ip, port
    try:
        for d in await db.device_list(with_ifs=False):
            if str(d.get("ip") or "").strip() != str(chassis or "").strip():
                continue
            for a in (d.get("access") or []):
                if str(a.get("protocol") or "").lower() != "stc":
                    continue
                h = str(a.get("host") or "").strip()
                p = int(a.get("port") or 0) or 0
                if local and h:
                    ip = h
                if not port and p:
                    port = p
                break
    except Exception as e:
        print(f"[stc] 등록에서 REST 주소를 못 읽었습니다: {e}", flush=True)
    return (ip or "localhost"), (port or 8888)


async def stc_server_start(data: dict = None):
    data = data or {}
    port = int(data.get("port") or 8888)
    if _port_listening(port):
        return {"ok": True, "already": True, "listening": True}
    exe = _find_stcweb()
    if not exe:
        # 이 서버가 리눅스면 stcweb 은 여기서 뜰 수 있는 물건이 아니다.
        # 「환경변수를 지정하라」 만 적어 두면 없는 파일을 찾아 헤매게 된다
        # (지적: 계측기는 붙는데 시험 탭에서만 이 말이 뜬다).
        if os.name != "nt":
            return {"ok": False, "error":
                    f"STC REST 서버(포트 {port})에 닿지 못했습니다 — 이 서버는 리눅스라 "
                    "stcweb 을 여기서 띄울 수 없습니다. STC PC 에서 REST 서버를 켜고, "
                    "계측기 등록의 포트가 그 서버 포트와 같은지 확인하세요."}
        return {"ok": False, "error": "stcweb.exe 를 찾을 수 없습니다. STCWEB_PATH 환경변수로 경로를 지정하세요."}
    workdir = os.path.dirname(exe)
    # Popen 으로 detached 기동 (asyncio subprocess 는 Windows uvicorn 루프에서 미지원)
    try:
        proc = subprocess.Popen([exe], cwd=workdir,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        return {"ok": False, "error": "REST 서버 실행 실패: " + str(e)}
    _stcweb_proc["p"] = proc
    await core.broadcast({"type": "stc_line", "line": "[REST] stcweb.exe 시작 — 포트 " + str(port) + " 대기..."})
    # 포트가 열릴 때까지 최대 ~25초 대기
    for _ in range(50):
        await asyncio.sleep(0.5)
        if proc.poll() is not None:
            return {"ok": False, "error": "REST 서버가 즉시 종료됨 (exit " + str(proc.poll()) + ")"}
        if _port_listening(port):
            await core.broadcast({"type": "stc_line", "line": "[REST] 서버 준비됨 (localhost:" + str(port) + ")"})
            return {"ok": True, "listening": True, "exe": exe}
    return {"ok": False, "error": "REST 서버가 시간 내 포트 " + str(port) + " 를 열지 못함"}


# STC 인벤토리 캐시 — 매번 ChassisConnect 하면 수십 초가 걸린다.
# 담아 두고, 그 안의 재조회는 즉시 돌려준다. 「새로고침」(force) 이면 무시한다.
#
# 60초는 짧았다. 이 값이 말하는 것은 **어떤 슬롯에 몇 포트가 꽂혀 있나**
# 이고, 그것은 사람이 카드를 뽑았다 꽂을 때나 바뀐다 — 시험 하나 만드는
# 동안 바뀔 일이 없다(지적: 느리다). 예약 상태는 이 캐시로 보지 않는다.
_STC_CC_CACHE = {}   # "chassis|rest_ip:rest_port" -> {"ts": t, "data": {...}}
_STC_CC_TTL = 600


@router.post("/api/stc/conncheck")
async def stc_conncheck(data: dict = None):
    """실제 섀시 연결 확인 (트래픽 생성 없음). 섀시/모듈 인벤토리를 반환.

    매번 새 세션을 열고 섀시에 접속하므로 수십 초 걸린다. 그래서 결과를
    잠깐 캐시한다 — 포트 현황을 다시 열거나 다른 사람이 같은 섀시를 봐도
    바로 뜬다. force=1 이면 캐시를 건너뛴다.
    """
    data = data or {}
    _ck = str(data.get("chassis") or "") + "|" + str(data.get("restIp") or "") + ":" + str(data.get("restPort") or "")
    if not data.get("force"):
        hit = _STC_CC_CACHE.get(_ck)
        if hit and (_t.time() - hit["ts"]) < _STC_CC_TTL:
            d = dict(hit["data"]); d["cached"] = True
            d["cache_age"] = round(_t.time() - hit["ts"])
            return d
    chassis = (data.get("chassis") or "192.168.5.100").strip()
    # 화면이 안 알려 줬으면 계측기 등록에서 찾는다
    rest_ip, rest_port = await _stc_rest_for(chassis, data.get("restIp"), data.get("restPort"))
    # 로컬 REST 서버 자동 기동
    if rest_ip.lower() in ("localhost", "127.0.0.1", "") and not _port_listening(rest_port):
        srv = await stc_server_start({"port": rest_port})
        if not srv.get("ok"):
            return {"ok": False, "error": "REST 서버 시작 실패: " + str(srv.get("error"))}
    helper = str(_BACKEND_DIR / "stc" / "stc_conncheck.py")
    # 백엔드와 동일한 python(sys.executable)을 직접 호출한다.
    # 'py -3.12' 런처를 쓰면 손자 python 프로세스가 stdout 파이프를 잡아 timeout 이 안 풀린다.
    # 또한 이 인터프리터에는 stcrestclient 가 설치돼 있다(백엔드가 그 위에서 동작).
    cmd = [sys.executable, helper, chassis, rest_ip, str(rest_port)]
    # 동기 subprocess 를 스레드에서 실행 (Windows uvicorn 루프 호환)
    def _run():
        return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90)
    try:
        cp = await asyncio.to_thread(_run)
        raw = cp.stdout
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "연결 확인 시간 초과 (90초)"}
    except Exception as e:
        return {"ok": False, "error": "실행 실패: " + repr(e)}
    text = raw.decode("utf-8", "replace") if raw else ""
    # 마지막 JSON 라인 파싱
    result = None
    for line in reversed(text.strip().splitlines()):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                result = json.loads(line)
                break
            except Exception:
                continue
    if result is None:
        return {"ok": False, "error": "결과 파싱 실패", "raw": text[-500:]}
    if isinstance(result, dict) and result.get("ok"):
        _STC_CC_CACHE[_ck] = {"ts": _t.time(), "data": result}
    return result

# ───────────────────────────────────────────
# 라우터 - STC 실제 포트 예약/해제 (영속 세션 U_TOP_reserve)
# 예약은 세션에 묶이므로 reserve 후 세션을 유지 → Spirent STC 프로그램에 'Reserved by utop' 로 보임.
# ───────────────────────────────────────────
async def _run_stc_reserve(action, ports, chassis, rest_ip, rest_port):
    # 로컬 REST 서버 자동 기동
    if str(rest_ip).lower() in ("localhost", "127.0.0.1", "") and not _port_listening(rest_port):
        srv = await stc_server_start({"port": rest_port})
        if not srv.get("ok"):
            return {"ok": False, "error": "REST 서버 시작 실패: " + str(srv.get("error"))}
    helper = str(_BACKEND_DIR / "stc" / "stc_reserve.py")
    cmd = [sys.executable, helper, action, (ports or "-"), chassis, rest_ip, str(rest_port)]
    def _run():
        return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90)
    try:
        cp = await asyncio.to_thread(_run)
        raw = cp.stdout
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "시간 초과 (90초)"}
    except Exception as e:
        return {"ok": False, "error": "실행 실패: " + repr(e)}
    text = raw.decode("utf-8", "replace") if raw else ""
    for line in reversed(text.strip().splitlines()):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                return json.loads(line)
            except Exception:
                continue
    return {"ok": False, "error": "결과 파싱 실패", "raw": text[-500:]}

@router.post("/api/stc/reserve")
async def stc_reserve(data: dict = None):
    data = data or {}
    chassis = (data.get("chassis") or "192.168.5.100").strip()
    rest_ip, rest_port = await _stc_rest_for(chassis, data.get("restIp"), data.get("restPort"))
    ports = (data.get("ports") or "").strip()  # "1/15,1/16" — 예약할 전체 집합
    return await _run_stc_reserve("reserve", ports, chassis, rest_ip, rest_port)

@router.post("/api/stc/reserve/status")
async def stc_reserve_status(data: dict = None):
    data = data or {}
    chassis = (data.get("chassis") or "192.168.5.100").strip()
    rest_ip, rest_port = await _stc_rest_for(chassis, data.get("restIp"), data.get("restPort"))
    return await _run_stc_reserve("status", "-", chassis, rest_ip, rest_port)

@router.post("/api/stc/release")
async def stc_release(data: dict = None):
    data = data or {}
    chassis = (data.get("chassis") or "192.168.5.100").strip()
    rest_ip, rest_port = await _stc_rest_for(chassis, data.get("restIp"), data.get("restPort"))
    return await _run_stc_reserve("release", "-", chassis, rest_ip, rest_port)

# ───────────────────────────────────────────
# 라우터 - STC 트래픽 시험 단계 (영속 세션 U_TOP_traffic)
# connect/reserve/devices/streams/start/stop/counters/status/end 를 한 세션에서 순차 수행
# ───────────────────────────────────────────
_STC_SESS_ACTIONS = {"connect", "reserve", "releaseports", "forcereset", "devices", "streams", "start", "stop", "counters", "status", "portstatus", "end"}

# ── STC: 영속 in-process 세션 + 단일 락 + 상태 캐시 ──────────
#  핵심: STC 예약은 '연속 연결 + 살아있는 포트 핸들'을 전제로 한다. 액션마다 subprocess 를
#  새로 띄우면 핸들이 끊겨 해제가 불가능 → 하나의 영속 세션(StcLive)을 백엔드 안에 유지한다.
#   · connect/reserve/releaseports/forcereset/portstatus → StcLive(공유 작업 세션 U_TOP_work)
#   · 단일 락(_stc_live_lock)으로 직렬화(계정이 몇이든 안전). '누가 예약'은 레지스트리가 추적.
#   · 상태는 백엔드 단일 폴러가 캐시 → 모든 브라우저는 캐시 + 계정별 mine 만 덧칠(계측기 부하 일정).
#   · devices/streams/start/stop/counters/end → 아직 subprocess(U_TOP_traffic, 트래픽 단계에서 이관).
from stc.stc_live import StcLive
_stc_live = StcLive()
_stc_live_lock = asyncio.Lock()       # 예약/해제/연결(U_TOP_work) 직렬화
_stc_status_lock = asyncio.Lock()     # 상태 서브프로세스(U_TOP_status) 중복 방지
_stc_status_cache = {}         # chassis -> {"ts": float, "rows": [...]}
_stc_status_targets = {}       # chassis -> (rest_ip, rest_port)
# 마지막으로 「포트 상태 좀」 하고 물어본 시각. chassis -> epoch
#
# 여태 한 번 물어본 섀시는 **영영** 목록에 남았고, 폴러가 3초마다 TCL
# 서브프로세스를 띄웠다. 아무도 안 보고 있어도 그랬다 — 253 의 CPU 가
# 종일 붙어 있던 것이 이것이다(지적). 보는 사람이 없으면 멈춘다.
_stc_status_seen = {}
_STC_WATCH_TTL = 90            # 이 초 동안 아무도 안 물어보면 폴러에서 뺀다
_stc_poller_started = False
_STC_LIVE_ACTIONS = {"connect", "reserve", "releaseports", "forcereset"}

def _stc_err(msg: str) -> str:
    """STC 가 준 실패를 사람 말로. 원문은 뒤에 남긴다."""
    t = str(msg or "")
    low = t.lower()
    if "timed out waiting for session" in low:
        return ("STC REST 서버가 세션을 못 띄웠습니다 — 계측기 안의 BLL 이 뜨는 데 "
                "오래 걸리는 중입니다. 20초쯤 뒤 다시 누르거나, 그래도 같으면 "
                "REST 서버를 다시 시작하세요. (원문: " + t[:120] + ")")
    if "connection refused" in low or "failed to establish" in low:
        return ("STC REST 서버에 닿지 못했습니다 — 서버가 떠 있는지(기본 8888) 확인하세요. "
                "(원문: " + t[:120] + ")")
    if "session not found" in low:
        return ("STC 세션이 끊겼습니다 — 다시 누르면 새로 붙습니다. (원문: " + t[:120] + ")")
    return t


def _run_stc_helper(action, chassis, rest_ip, rest_port, params):
    """stc_session.py 서브프로세스(트래픽 단계용). JSON dict 반환(예외도 dict)."""
    helper = str(_BACKEND_DIR / "stc" / "stc_session.py")
    cmd = [sys.executable, helper, action, chassis, rest_ip, str(rest_port), json.dumps(params)]
    try:
        cp = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
        raw = cp.stdout
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "시간 초과 (120초)"}
    except Exception as e:
        return {"ok": False, "error": "실행 실패: " + repr(e)}
    text = raw.decode("utf-8", "replace") if raw else ""
    for line in reversed(text.strip().splitlines()):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                return json.loads(line)
            except Exception:
                continue
    return {"ok": False, "error": "결과 파싱 실패", "raw": text[-500:]}

async def _stc_live_status(chassis, rest_ip, rest_port):
    # 상태는 읽기전용 서브프로세스(U_TOP_status)로 — 영속 세션 핸들 손상 없이 안정적.
    #  예약 세션(StcLive/U_TOP_work)과 독립이라 락 불필요.
    # light: 링크·속도(포트마다 REST 왕복)는 건너뛴다. 목록과 예약 상태가
    # 이 화면이 쓰는 전부다 — 왕복 수가 절반 아래로 준다(지적: 느리다).
    res = await asyncio.to_thread(_run_stc_helper, "portstatus", chassis, rest_ip, rest_port,
                                  {"user": "_utop_status_", "light": True})
    if isinstance(res, dict) and res.get("ok"):
        _stc_status_cache[chassis] = {"ts": _t.time(), "rows": res.get("ports", [])}
    return res

async def _stc_poller_loop():
    while True:
        try:
            now = _t.time()
            for ch, (rip, rport) in list(_stc_status_targets.items()):
                # 보고 있는 사람이 없으면 뺀다. 서브프로세스 한 번이 가볍지
                # 않다 — 섀시 하나만 남아 있어도 코어 하나를 문다.
                if now - _stc_status_seen.get(ch, 0) > _STC_WATCH_TTL:
                    _stc_status_targets.pop(ch, None)
                    _stc_status_seen.pop(ch, None)
                    print(f"[stc] 보는 사람이 없어 상태 폴링을 멈춥니다 — {ch}", flush=True)
                    continue
                async with _stc_status_lock:   # sync-poll 과 같은 U_TOP_status 세션 → 직렬화 필수
                    await _stc_live_status(ch, rip, rport)
        except Exception:
            pass
        # 볼 것이 없으면 느리게 — 빈 채로 3초마다 깨울 이유가 없다
        await asyncio.sleep(3 if _stc_status_targets else 15)

def _ensure_poller():
    global _stc_poller_started
    if not _stc_poller_started:
        _stc_poller_started = True
        try:
            asyncio.create_task(_stc_poller_loop())
        except Exception:
            _stc_poller_started = False

def _overlay_mine(rows, user):
    """캐시된 raw 상태(예약은 전부 other)에 요청 계정의 '내 예약'을 덧칠."""
    out = []
    for r in rows:
        st = r.get("status"); who = r.get("who")
        nr = {"slot": r.get("slot"), "port": r.get("port"), "status": st}
        if r.get("link"):
            nr["link"] = r.get("link")
        if r.get("speed"):
            nr["speed"] = r.get("speed")
        if st in ("other", "mine"):
            if who and who == user:
                nr["status"] = "mine"; nr["who"] = user
            else:
                nr["status"] = "other"; nr["who"] = who or "외부"
        out.append(nr)
    return out

@router.post("/api/stc/sess/{action}")
async def stc_sess(action: str, data: dict = None):
    if action not in _STC_SESS_ACTIONS:
        return {"ok": False, "error": "알 수 없는 단계: " + action}
    data = data or {}
    chassis = (data.get("chassis") or "192.168.5.100").strip()
    rest_ip, rest_port = await _stc_rest_for(chassis, data.get("restIp"), data.get("restPort"))
    params = data.get("params") or {}
    user = str(params.get("user") or "admin")
    # 로컬 REST 서버 자동 기동
    if rest_ip.lower() in ("localhost", "127.0.0.1", "") and not _port_listening(rest_port):
        srv = await stc_server_start({"port": rest_port})
        if not srv.get("ok"):
            return {"ok": False, "error": "REST 서버 시작 실패: " + str(srv.get("error"))}

    # 상태조회: 단일 폴러 캐시 + 계정별 mine 덧칠
    if action == "portstatus":
        _stc_status_targets[chassis] = (rest_ip, rest_port)
        _stc_status_seen[chassis] = _t.time()      # 지금 보고 있다
        _ensure_poller()
        cache = _stc_status_cache.get(chassis)
        now = _t.time()
        # 있는 값을 **먼저 준다**. 섀시에 묻는 일은 포트마다 REST 왕복이라
        # 몇 초가 든다 — 그동안 화면이 멎어 있으면 「느리다」 가 된다(지적).
        # 묵은 값이면 뒤에서 새로 읽어 두고, 다음 번에 새 값이 나간다.
        if cache and (now - cache["ts"]) > 12:
            async def _bg():
                async with _stc_status_lock:
                    c2 = _stc_status_cache.get(chassis)
                    if not c2 or (_t.time() - c2["ts"]) > 12:
                        await _stc_live_status(chassis, rest_ip, rest_port)
            try:
                asyncio.create_task(_bg())
            except Exception as e:
                print(f"[stc] 뒷일로 못 넘겼습니다: {e}", flush=True)
        elif not cache:
            # 처음 한 번은 어쩔 수 없이 기다린다 — 줄 것이 없다
            async with _stc_status_lock:
                if not _stc_status_cache.get(chassis):
                    await _stc_live_status(chassis, rest_ip, rest_port)
            cache = _stc_status_cache.get(chassis)
        rows = cache["rows"] if cache else []
        return {"ok": True, "action": "portstatus", "user": user,
                "ports": _overlay_mine(rows, user),
                "cached": True, "ts": (cache["ts"] if cache else 0),
                # 몇 초 전 값인가 — 화면이 「지금 것」 인 척하지 않게
                "age": round(now - cache["ts"], 1) if cache else 0}

    # 그 외 모든 액션(예약/해제/강제리셋/연결/트래픽): 서브프로세스.
    #  예약/해제는 command-only(ReservePortCommand/RevokeOwner)라 포트 오브젝트를 안 만들어
    #  세션이 손상되지 않음(검증됨). 작업 세션(U_TOP_work) 동시접근 방지 위해 직렬화.
    async with _stc_live_lock:
        res = await asyncio.to_thread(_run_stc_helper, action, chassis, rest_ip, rest_port, params)
    if action in ("reserve", "releaseports", "forcereset", "connect"):
        _stc_status_cache.pop(chassis, None)   # 점유 변화 → 다음 조회에서 실상태 반영
    # 영어 한 덩어리를 그대로 던지지 않는다 — 무엇을 해야 하는지까지 적는다
    if isinstance(res, dict) and res.get("error"):
        res["error"] = _stc_err(res["error"])
    return res


# ───────────────────────────────────────────
@router.get("/api/devices")
async def get_devices():
    return core.load_json(core.DEVICES_FILE)

class DeviceCreate(BaseModel):
    group: str
    model: str
    ip: str
    protocol: str
    port: int
    username: str = ""
    password: str = ""
    description: str = ""

@router.post("/api/devices")
async def add_device(device: DeviceCreate):
    data = core.load_json(core.DEVICES_FILE)
    new_id = f"dev{len(data['devices'])+1:03d}"
    new_dev = {"id": new_id, "status": "unknown", **device.model_dump()}
    data["devices"].append(new_dev)
    core.save_json(core.DEVICES_FILE, data)
    return {"success": True, "device": new_dev}

@router.put("/api/devices/{device_id}")
async def update_device(device_id: str, device: DeviceCreate):
    data = core.load_json(core.DEVICES_FILE)
    for i, d in enumerate(data["devices"]):
        if d["id"] == device_id:
            status = d.get("status", "unknown")
            data["devices"][i] = {"id": device_id, "status": status, **device.model_dump()}
            core.save_json(core.DEVICES_FILE, data)
            return {"success": True}
    raise HTTPException(404, "장비를 찾을 수 없습니다")

@router.delete("/api/devices/{device_id}")
async def delete_device(device_id: str):
    data = core.load_json(core.DEVICES_FILE)
    data["devices"] = [d for d in data["devices"] if d["id"] != device_id]
    core.save_json(core.DEVICES_FILE, data)
    return {"success": True}

@router.post("/api/devices/{device_id}/connect")
async def connect_device(device_id: str):
    data = core.load_json(core.DEVICES_FILE)
    device = next((d for d in data["devices"] if d["id"] == device_id), None)
    if not device:
        raise HTTPException(404, "장비를 찾을 수 없습니다")

    proto = device.get("protocol", "").upper()
    ip = device["ip"]
    port = device["port"]

    if proto == "SSH":
        ok = core.check_ssh(ip, port, device.get("username",""), device.get("password",""))
    elif proto == "TELNET":
        ok = core.check_telnet(ip, port)
    elif proto in ("TCL", "API", "REST"):
        ok = core.check_tcp(ip, port)
    else:
        ok = core.check_tcp(ip, port)

    status = "connected" if ok else "disconnected"
    for d in data["devices"]:
        if d["id"] == device_id:
            d["status"] = status
    core.save_json(core.DEVICES_FILE, data)
    await core.broadcast({"type": "device_status", "id": device_id, "status": status})
    return {"success": True, "status": status}

@router.post("/api/devices/{device_id}/command")
async def run_command(device_id: str, body: dict):
    data = core.load_json(core.DEVICES_FILE)
    device = next((d for d in data["devices"] if d["id"] == device_id), None)
    if not device:
        raise HTTPException(404, "장비를 찾을 수 없습니다")
    command = body.get("command", "")
    proto = device.get("protocol", "").upper()
    try:
        if proto == "SSH":
            output = core.ssh_exec(device["ip"], device["port"], device["username"], device["password"], command)
        elif proto == "TCL":
            output = core.tcl_exec(command)
        else:
            output = f"[{proto}] 직접 명령 실행은 SSH/TCL만 지원합니다."
    except Exception as e:
        output = f"[오류] {e}"
    return {"output": output}
