# -*- coding: utf-8 -*-
# U-TOP: STC 예약/해제/상태를 '백엔드 프로세스 안의 하나의 영속 세션'에서 수행한다.
#
# 왜 in-process 인가:
#   STC 예약은 "연속된 연결 + 살아있는 포트 핸들"을 전제로 한다.
#   액션마다 subprocess 를 새로 띄우면 포트 핸들이 끊겨 ReleasePortCommand 가 먹지 않아
#   해제가 불가능해진다(실측으로 확인). 하나의 프로세스에서 핸들을 유지하면
#   create→ReservePortCommand / DetachPorts→ReleasePortCommand→delete 가 정확히 동작한다.
#
# 다중 사용자 기준:
#   - 예약/해제는 공유 작업 세션(U_TOP_work) 1개에서 수행(섀시 소유자는 모든 U-TOP 이
#     같은 Windows 계정 → 계정 구분은 레지스트리가 함). 계측기엔 세션 1개만 존재.
#   - '누가 예약했는지' 는 레지스트리(stc_resv_registry.json: "chassis|slot/port" -> 계정)로 추적.
#   - 호출은 main.py 가 단일 asyncio 락으로 직렬화하므로 self.stc 동시접근은 없다.
import os
import json

REG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stc_resv_registry.json")
WORK_SESS = "U_TOP_work"


def _split(v):
    return [x for x in v.split(" ") if x] if isinstance(v, str) and v.strip() else []


def _is_session_broken(msg):
    m = str(msg).lower()
    return ("session not found" in m) or ("failed to connect user" in m) or ("invalid handle" in m and "session" in m)


def parse_ports(s):
    """'1/1,2/3' -> [('1','1'),('2','3')]  ('//chassis/slot/port' 형태도 허용)"""
    out = []
    for tok in str(s or "").split(","):
        tok = tok.strip().replace("//", "")
        if not tok:
            continue
        parts = tok.split("/")
        if len(parts) >= 2:
            out.append((parts[-2], parts[-1]))
    return out


class StcLive:
    def __init__(self):
        self.stc = None
        self.project = None
        self.handles = {}        # "slot/port" -> port 핸들 (영속 세션 동안 유지)
        self._connected = set()  # ChassisConnect 완료한 섀시 (세션당 1회만)

    # ── 레지스트리 ──
    def reg_load(self):
        try:
            with open(REG_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}

    def reg_save(self, d):
        try:
            with open(REG_FILE, "w") as f:
                json.dump(d, f)
        except Exception:
            pass

    def reg_key(self, chassis, slot, port):
        return "%s|%s/%s" % (chassis, slot, port)

    # ── 세션 확보(영속) ──
    def ensure(self, rest_ip, rest_port, chassis):
        from stcrestclient import stchttp
        # 우리가 만든 작업 세션이 살아있는지 확인(get 성공 = 살아있음).
        alive = False
        if self.stc is not None:
            try:
                self.stc.get("system1")
                alive = True
            except Exception:
                alive = False
        if not alive:
            # 깨끗한 작업 세션을 '새로' 생성한다. 기존 U_TOP_work 를 그대로 join 하지 않는 이유:
            #  반복 create/delete 로 서버측 세션이 손상되면 GET 은 되는데 POST(create)가
            #  'session not found' 로 실패하는 사례가 있음 → 기존 세션을 종료하고 새로 만든다.
            #  (예약 추적은 레지스트리가 하므로 세션 재생성은 안전. status 가 available 을 자동 정리.)
            #  ※ new_session(kill_existing=True) 는 이 서버에서 sid 형식 버그로 실패 → 수동 종료.
            tmp = stchttp.StcHttp(rest_ip, port=rest_port)
            try:
                for s in tmp.sessions():
                    if s.split(" - ")[0] == WORK_SESS:
                        try:
                            tmp.join_session(s)
                            tmp.end_session()
                        except Exception:
                            pass
            except Exception:
                pass
            self.stc = stchttp.StcHttp(rest_ip, port=rest_port)
            self.stc.new_session("utop", WORK_SESS)
            p = _split(self.stc.get("system1", "children-Project"))
            self.project = p[0] if p else self.stc.create("project", under="system1")
            self.handles = {}
            self._connected = set()
        # ChassisConnect 는 세션당 섀시당 '한 번만'. 반복하면 서버측 핸들이 손상됨.
        #  (영속 세션은 연결 후 chassis 상태 변화를 계속 받으므로 재연결 불필요.)
        if chassis not in self._connected:
            for kw in ({"Hostname": chassis}, {"InputHostnameList": [chassis]}):
                try:
                    self.stc.perform("ChassisConnect", params=kw)
                    self._connected.add(chassis)
                    break
                except Exception:
                    continue
            # 연결이 완전히 가라앉도록 대기(직후 섀시 객체 탐색 시 invalid handle 방지)
            try:
                self.stc.wait_until_complete()
            except Exception:
                pass

    # ── 예약(추가식): 가능한 포트만 잡고 막힌 건 failed ──
    def reserve(self, rest_ip, rest_port, chassis, ports, user):
        # 세션이 손상(GET되나 POST 실패)되면 새 세션으로 1회 자가 치유 후 재시도.
        for attempt in (1, 2):
            self.ensure(rest_ip, rest_port, chassis)
            reg = self.reg_load()
            ok = []
            failed = []
            rdbg = []
            broken = False
            for (s, p) in parse_ports(ports):
                key = "%s/%s" % (s, p)
                loc = "//%s/%s/%s" % (chassis, s, p)
                if key in self.handles:                      # 이미 우리 세션이 예약 중
                    ok.append(loc)
                    reg[self.reg_key(chassis, s, p)] = user
                    continue
                h = None
                try:
                    h = self.stc.create("port", under=self.project, Location=loc, Name="utop_p%s_%s" % (s, p))
                    self.stc.apply()
                    self.stc.perform("ReservePortCommand", params={"Location": [loc]})
                    self.stc.apply()
                    self.handles[key] = h
                    ok.append(loc)
                    reg[self.reg_key(chassis, s, p)] = user
                except Exception as e:
                    msg = repr(e)
                    rdbg.append({"port": key, "err": msg[:160]})
                    if _is_session_broken(msg):
                        broken = True
                        break
                    if h:
                        try:
                            self.stc.delete(h)
                            self.stc.apply()
                        except Exception:
                            pass
                    failed.append(loc)
            if broken and attempt == 1:
                self._force_new()           # 세션 새로 만들고 통째로 재시도
                continue
            self.reg_save(reg)
            return {"ok": True, "reserved": ok, "failed": failed, "dbg": rdbg}

    def _force_new(self):
        # 다음 ensure 가 작업 세션을 새로 만들도록 강제(손상 세션 폐기).
        self.stc = None
        self._connected = set()
        self.handles = {}
        self.project = None

    # ── 해제: 본인 예약만(강제 아님). 같은 핸들로 Detach→Release→delete ──
    def release(self, rest_ip, rest_port, chassis, ports, user):
        self.ensure(rest_ip, rest_port, chassis)
        reg = self.reg_load()
        rel = []
        denied = []
        dbg = []
        for (s, p) in parse_ports(ports):
            key = "%s/%s" % (s, p)
            loc = "//%s/%s/%s" % (chassis, s, p)
            owner = reg.get(self.reg_key(chassis, s, p))
            if owner and owner != user:               # 남의 예약은 일반 해제 금지(강제 리셋 사용)
                denied.append(loc)
                continue
            h = self.handles.get(key)
            d = {"port": key, "h": h, "release": "", "delete": ""}
            try:
                # 예약 단계 포트는 attach 안 했으므로 ReleasePortCommand(Location) + 오브젝트 delete 만.
                try:
                    self.stc.perform("ReleasePortCommand", params={"Location": [loc]}); d["release"] = "ok"
                except Exception as e:
                    d["release"] = repr(e)[:80]
                if h:
                    try:
                        self.stc.delete(h); d["delete"] = "ok"
                    except Exception as e:
                        d["delete"] = repr(e)[:80]
                self.stc.apply()
                self.handles.pop(key, None)
                rel.append(loc)
                reg.pop(self.reg_key(chassis, s, p), None)
            except Exception as e:
                d["err"] = repr(e)[:80]
            dbg.append(d)
        self.reg_save(reg)
        return {"ok": True, "released": rel, "matched": len(rel), "denied": denied, "dbg": dbg}

    # ── 강제 리셋(Force User Off): RevokeOwner 로 탈취 후 해제 ──
    def forcereset(self, rest_ip, rest_port, chassis, ports):
        self.ensure(rest_ip, rest_port, chassis)
        reg = self.reg_load()
        done = []
        failed = []
        for (s, p) in parse_ports(ports):
            key = "%s/%s" % (s, p)
            loc = "//%s/%s/%s" % (chassis, s, p)
            h = None
            try:
                h = self.stc.create("port", under=self.project, Location=loc, Name="force_%s_%s" % (s, p))
                self.stc.apply()
                revoked = False
                for kw in ({"Location": [loc], "RevokeOwner": "TRUE"},
                           {"PortList": [h], "RevokeOwner": "TRUE"}):
                    try:
                        self.stc.perform("ReservePortCommand", params=kw)
                        revoked = True
                        break
                    except Exception:
                        continue
                self.stc.apply()
                if not revoked:
                    raise RuntimeError("RevokeOwner 거부")
                try:
                    self.stc.perform("DetachPorts", params={"PortList": [h]})
                except Exception:
                    pass
                try:
                    self.stc.perform("ReleasePortCommand", params={"Location": [loc]})
                except Exception:
                    pass
                try:
                    self.stc.delete(h)
                except Exception:
                    pass
                self.stc.apply()
                self.handles.pop(key, None)
                done.append(loc)
                reg.pop(self.reg_key(chassis, s, p), None)
            except Exception as ex:
                if h:
                    try:
                        self.stc.delete(h)
                        self.stc.apply()
                    except Exception:
                        pass
                failed.append({"loc": loc, "error": repr(ex)})
        self.reg_save(reg)
        return {"ok": True, "reset": done, "failed": failed}

    # ── 상태: 섀시 OwnershipState(실시간) + 레지스트리(누가). mine 은 endpoint 가 계정별로 덧칠 ──
    def status(self, rest_ip, rest_port, chassis):
        self.ensure(rest_ip, rest_port, chassis)
        try:
            return self._status_once(chassis)
        except Exception:
            # 섀시 핸들이 꼬이면(invalid handle 등) 재연결 후 1회 재시도.
            self._connected.discard(chassis)
            self.ensure(rest_ip, rest_port, chassis)
            try:
                return self._status_once(chassis)
            except Exception as e:
                return {"ok": True, "ports": [], "warn": repr(e)[:120]}

    def _status_once(self, chassis):
        reg = self.reg_load()
        reg_changed = False
        rows = []
        seen = set()
        pcm = self.stc.get("system1", "children-PhysicalChassisManager")
        clist = _split(self.stc.get(pcm, "children-PhysicalChassis")) if pcm else []
        ch0 = None
        for c in clist:
            try:
                if self.stc.get(c).get("Hostname") == chassis:
                    ch0 = c
                    break
            except Exception:
                pass
        if not ch0 and clist:
            ch0 = clist[-1]   # Hostname 매칭 실패 시 가장 최근 연결 섀시로 폴백
        if ch0:
            for m in _split(self.stc.get(ch0, "children-PhysicalTestModule")):
                try:
                    slot = str(self.stc.get(m).get("Index"))
                except Exception:
                    continue
                for g in _split(self.stc.get(m, "children-PhysicalPortGroup")):
                    try:
                        gi = self.stc.get(g, "OwnershipState", "PortsCsvString", "Index")
                        own = str(gi.get("OwnershipState") or "").upper()
                        reserved = "RESERVED" in own
                        available = "AVAILABLE" in own
                        for pidx in str(gi.get("PortsCsvString") or gi.get("Index") or "").split(","):
                            pidx = pidx.strip()
                            if not pidx:
                                continue
                            k = slot + "/" + pidx
                            if k in seen:
                                continue
                            seen.add(k)
                            rk = "%s|%s" % (chassis, k)
                            who = reg.get(rk)
                            if reserved:
                                rows.append({"slot": slot, "port": pidx, "status": "other", "who": who or "외부"})
                            elif available:
                                if who:
                                    reg.pop(rk, None)
                                    reg_changed = True
                                rows.append({"slot": slot, "port": pidx, "status": "available"})
                            else:
                                rows.append({"slot": slot, "port": pidx, "status": "unavailable"})
                    except Exception:
                        pass
        if reg_changed:
            self.reg_save(reg)
        return {"ok": True, "ports": rows}

    # ── 연결 확인(model/firmware) ──
    def connect(self, rest_ip, rest_port, chassis):
        self.ensure(rest_ip, rest_port, chassis)
        out = {"ok": True}
        try:
            pcm = self.stc.get("system1", "children-PhysicalChassisManager")
            chs = _split(self.stc.get(pcm, "children-PhysicalChassis")) if pcm else []
            if chs:
                info = self.stc.get(chs[0])
                out["model"] = info.get("Model")
                out["serial"] = info.get("SerialNum")
                out["firmware"] = info.get("FirmwareVersion")
        except Exception as e:
            out["note"] = repr(e)
        return out
