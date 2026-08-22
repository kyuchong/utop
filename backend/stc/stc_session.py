# -*- coding: utf-8 -*-
# U-TOP: STC 트래픽 시험을 '하나의 영속 세션'에서 단계별로 수행한다.
# 각 단계는 별도 subprocess 로 호출되며, 세션(U_TOP_traffic)은 stcweb 서버에 유지된다
# (end 전까지 end_session 하지 않음). 핸들은 이름/관계로 매번 재탐색한다.
#
# 사용법: python stc_session.py <action> <chassis> <rest_ip> <rest_port> [params_json]
#   action: connect | reserve | devices | streams | start | stop | counters | status | end
#
# 네이밍(재탐색용):
#   세션 U_TOP_traffic / 포트 Name utop_p{slot}_{port} / 장비 utop_dev_A·utop_dev_B
#   스트림 utop_sb_A2B · utop_sb_B2A
from __future__ import print_function
import os
import sys
import json
import time

SESS = "U_TOP_traffic"  # main() 에서 사용자별 이름으로 덮어씀
REG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stc_resv_registry.json")


def _sess_name(user):
    # 상태 조회(portstatus)는 읽기 전용 세션 U_TOP_status. 예약/해제/연결/강제리셋은
    #  공유 작업 세션 U_TOP_work(command-only 라 손상 없음). '누가 예약'은 레지스트리가 추적.
    if str(user or "") == "_utop_status_":
        return "U_TOP_rd"
    return "U_TOP_op"


def _reg_load():
    try:
        with open(REG_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}


def _reg_save(d):
    try:
        with open(REG_FILE, "w") as f:
            json.dump(d, f)
    except Exception:
        pass


def _reg_key(chassis, loc):
    # loc "//chassis/slot/port" -> "chassis|slot/port"
    tail = str(loc).split("//")[-1]
    parts = tail.split("/")
    if len(parts) >= 3:
        return chassis + "|" + parts[-2] + "/" + parts[-1]
    return chassis + "|" + tail


def _split(v):
    return v.split(" ") if isinstance(v, str) and v.strip() else []


def find_session(stc):
    try:
        for s in stc.sessions():
            if s == SESS or s.split(" - ")[0] == SESS or s.startswith(SESS + " "):
                return s
    except Exception:
        pass
    return None


def chassis_connect(stc, chassis):
    # 항상 ChassisConnect 수행 → ownership(예약 상태) 최신화. 웜 상태에선 ~0.2초로 빠름.
    # (건너뛰면 다른 세션의 예약/해제를 못 봐서 stale 상태가 됨)
    try:
        stc.perform("ChassisConnect", params={"Hostname": chassis})
    except Exception:
        try:
            stc.perform("ChassisConnect", params={"InputHostnameList": [chassis]})
        except Exception:
            pass


def get_project(stc):
    proj = stc.get("system1", "children-Project")
    p = _split(proj)
    if p:
        return p[0]
    return stc.create("project", under="system1")


def find_port(stc, project, slot, port):
    # STC 가 포트 Name 에 위치를 붙이는 경우가 있어 Name prefix / Location 둘 다 본다.
    want_name = pname(slot, port)
    want_loc = "/%s/%s" % (slot, port)
    for h in _split(stc.get(project, "children-Port")):
        try:
            a = stc.get(h)
            nm = str(a.get("Name", "")); loc = str(a.get("Location", ""))
            if nm == want_name or nm.startswith(want_name + " ") or loc.endswith(want_loc):
                return h
        except Exception:
            pass
    return None


def dev_handle_by_name(stc, project, name):
    for h in _split(stc.get(project, "children-EmulatedDevice")):
        try:
            nm = str(stc.get(h).get("Name", ""))
            if nm == name or nm.startswith(name + " "):
                return h
        except Exception:
            pass
    return None


def pname(slot, port):
    return "utop_p%s_%s" % (slot, port)


def parse_pp(s):
    s = str(s).replace("//", "")
    parts = s.split("/")
    return parts[-2], parts[-1]


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "status"
    chassis = sys.argv[2] if len(sys.argv) > 2 else "192.168.5.100"
    rest_ip = sys.argv[3] if len(sys.argv) > 3 else "localhost"
    rest_port = int(sys.argv[4]) if len(sys.argv) > 4 else 8888
    params = {}
    if len(sys.argv) > 5 and sys.argv[5]:
        try:
            params = json.loads(sys.argv[5])
        except Exception:
            params = {}
    # 사용자별 세션 → 격리(동시 접근 경합 제거) + '누가 예약했는지' 추적
    user = str(params.get("user") or "").strip()
    global SESS
    SESS = _sess_name(user)
    out = {"ok": False, "action": action, "session": SESS, "user": user}

    try:
        from stcrestclient import stchttp
    except Exception as e:
        out["error"] = "stcrestclient 미설치: " + str(e)
        print(json.dumps(out)); return

    try:
        # StcHttp 생성자가 REST 서버에 즉시 접속하므로 try 안에서 생성해 오류를 JSON 으로 보고
        # 세션이 뜨기를 기다리는 시간을 넉넉히 — 기본값으로는 BLL 이 뜨는
        # 동안 클라이언트가 먼저 포기해 「timed out」 으로 보인다(겪었다)
        stc = stchttp.StcHttp(rest_ip, port=rest_port, timeout=180)
        existing = find_session(stc)
        if action == "end":
            if existing:
                stc.join_session(existing); stc.end_session()
                out["ok"] = True; out["ended"] = True
            else:
                out["ok"] = True; out["ended"] = False; out["note"] = "세션 없음"
            # 이 사용자의 레지스트리 항목 정리
            reg = _reg_load()
            reg2 = dict((k, v) for k, v in reg.items() if v != (user or "?"))
            if len(reg2) != len(reg):
                _reg_save(reg2)
            print(json.dumps(out)); return

        # connect 는 세션 생성, 나머지는 기존 세션 join (없으면 생성)
        # 세션 획득(동시요청 경합에 견고): join 우선, 없으면 new, 409면 다시 join, 재시도.
        got = False
        for _try in range(8):
            ex = find_session(stc)
            if ex:
                try:
                    stc.join_session(ex); got = True; break
                except Exception:
                    time.sleep(0.7); continue
            try:
                stc.new_session("utop", SESS); got = True; break
            except Exception:
                # 409(이미 있음) 면 다음 루프에서 join 시도, 그 외엔 잠시 대기
                time.sleep(0.7); continue
        if not got:
            out["error"] = "세션 획득 실패(경합/좀비) — 잠시 후 재시도"; print(json.dumps(out)); return
        # status 만 섀시 연결 불필요(프로젝트 포트 오브젝트만 읽음).
        # portstatus 는 ChassisConnect(웜 0.2초)로 ownership 을 갱신해야 정확.
        if action != "status":
            chassis_connect(stc, chassis)
        project = get_project(stc)

        if action == "connect":
            pcm = stc.get("system1", "children-PhysicalChassisManager")
            chs = _split(stc.get(pcm, "children-PhysicalChassis")) if pcm else []
            if chs:
                info = stc.get(chs[0])
                out["model"] = info.get("Model"); out["serial"] = info.get("SerialNum")
                out["firmware"] = info.get("FirmwareVersion")
            out["ok"] = True
            print(json.dumps(out)); return

        if action == "reserve":
            # 포트 오브젝트 없이 ReservePortCommand(Location)만으로 예약.
            #  create/delete 를 안 하므로 영속 세션이 손상되지 않음(검증됨).
            #  타 세션(iTest 등)이 점유한 포트는 ReservePortCommand 가 실패 → failed.
            pairs = []
            for tok in (params.get("ports") or "").split(","):
                tok = tok.strip()
                if tok:
                    pairs.append(parse_pp(tok))
            reserved_ok = []; failed = []
            for (s, p) in pairs:
                loc = "//%s/%s/%s" % (chassis, s, p)
                try:
                    stc.perform("ReservePortCommand", params={"Location": [loc]})
                    stc.apply()
                    reserved_ok.append(loc)
                except Exception:
                    failed.append(loc)
            if reserved_ok:
                reg = _reg_load()
                for loc in reserved_ok:
                    reg[_reg_key(chassis, loc)] = user or "?"
                _reg_save(reg)
            out["ok"] = True; out["reserved"] = reserved_ok; out["failed"] = failed
            print(json.dumps(out)); return

        if action == "releaseports":
            # 해제: RevokeOwner 로 소유권을 (재)확보한 뒤 ReleasePortCommand → Available.
            #  포트 오브젝트/핸들 불필요 → 세션 손상 없음. 우리 세션이 예약한 것이든 아니든 확실히 해제.
            locs = []
            for tok in (params.get("ports") or "").split(","):
                tok = tok.strip()
                if tok:
                    s, p = parse_pp(tok)
                    locs.append("//%s/%s/%s" % (chassis, s, p))
            released = []
            for loc in locs:
                done = False
                # 1) 일반 해제 우선 — 자기 세션이 예약한 포트면 즉시(RevokeOwner 불필요).
                try:
                    stc.perform("ReleasePortCommand", params={"Location": [loc]})
                    stc.apply()
                    released.append(loc); done = True
                except Exception:
                    done = False
                # 2) 안 되면(타 세션 소유) RevokeOwner 강제 후 해제 — 느릴 수 있음(~50초).
                #    fast 모드면 RevokeOwner 생략(블록 방지) — 자기 소유 포트만 빠르게 해제.
                if not done and not params.get("fast"):
                    try:
                        stc.perform("ReservePortCommand", params={"Location": [loc], "RevokeOwner": "TRUE"})
                    except Exception:
                        pass
                    try:
                        stc.perform("ReleasePortCommand", params={"Location": [loc]})
                        stc.apply()
                        released.append(loc)
                    except Exception:
                        pass
            if locs:
                reg = _reg_load()
                for loc in locs:
                    reg.pop(_reg_key(chassis, loc), None)
                _reg_save(reg)
            out["ok"] = True; out["released"] = released; out["matched"] = len(released)
            print(json.dumps(out)); return

        if action == "forcereset":
            # 강제 리셋(Force User Off) = 해제와 동일 메커니즘(RevokeOwner). 타 예약도 강제 해제.
            locs = []
            for tok in (params.get("ports") or "").split(","):
                tok = tok.strip()
                if tok:
                    s, p = parse_pp(tok)
                    locs.append("//%s/%s/%s" % (chassis, s, p))
            reset_ok = []; failed = []
            for loc in locs:
                for kw in ({"Location": [loc], "RevokeOwner": "TRUE"},
                           {"Location": [loc], "RevokeOwner": "TRUE", "AutoConnect": "TRUE"}):
                    try:
                        stc.perform("ReservePortCommand", params=kw); break
                    except Exception:
                        continue
                try:
                    stc.perform("ReleasePortCommand", params={"Location": [loc]})
                    stc.apply()
                    reset_ok.append(loc)
                except Exception as ex:
                    failed.append({"loc": loc, "error": repr(ex)[:80]})
            if reset_ok:
                reg = _reg_load()
                for loc in reset_ok:
                    reg.pop(_reg_key(chassis, loc), None)
                _reg_save(reg)
            out["ok"] = True; out["reset"] = reset_ok; out["failed"] = failed
            print(json.dumps(out)); return

        if action == "devices":
            # params: portA, portB, A{ip,gw,mac,prefix}, B{...}
            made = []
            for tag in ("A", "B"):
                pp = params.get("port" + tag)
                d = params.get(tag) or {}
                if not pp:
                    continue
                s, p = parse_pp(pp)
                ph = find_port(stc, project, s, p)
                if not ph:
                    out["error"] = "포트 오브젝트 없음(reserve 먼저): " + pname(s, p)
                    print(json.dumps(out)); return
                dname = "utop_dev_" + tag
                old = dev_handle_by_name(stc, project, dname)
                if old:
                    try: stc.delete(old)
                    except Exception: pass
                dev = stc.create("emulateddevice", under=project, Name=dname,
                                 EnablePingResponse="TRUE", DeviceCount="1")
                eth_attrs = {}
                if d.get("mac"):
                    eth_attrs["SourceMac"] = d.get("mac")
                eth = stc.create("ethiiif", under=dev, **eth_attrs)
                l3 = stc.create("ipv4if", under=dev,
                                Address=str(d.get("ip", "1.1.1.1")),
                                Gateway=str(d.get("gw", "0.0.0.0")),
                                PrefixLength=str(d.get("prefix", "24")))
                stc.config(l3, attributes={"StackedOnEndpoint-targets": [eth]})
                stc.config(dev, attributes={"TopLevelIf-targets": [l3]})
                stc.config(dev, attributes={"PrimaryIf-targets": [l3]})
                stc.config(ph, attributes={"AffiliationPort-sources": [dev]})
                made.append({"tag": tag, "name": dname, "ip": d.get("ip"), "port": pname(s, p)})
            stc.apply()
            out["ok"] = True; out["devices"] = made
            print(json.dumps(out)); return

        if action == "streams":
            # Spirent 추적 스트림은 signature+FCS 때문에 최소 78B 필요 → 미만이면 자동 보정
            try:
                fr = int(float(params.get("frame", 512)))
            except Exception:
                fr = 512
            frame_note = None
            if fr < 78:
                frame_note = "프레임 %dB는 너무 작아 78B로 자동 조정(Spirent signature 최소)" % fr
                fr = 78
            frame = str(fr)
            load = str(params.get("load", 10))
            lunit = str(params.get("loadUnit", "PERCENT_LINE_RATE"))
            proto = str(params.get("proto", "UDP")).upper()
            dstp = str(params.get("dstPort", 80))
            srcp = str(params.get("srcPort", 1024))
            bidir = bool(params.get("bidir", True))
            l4 = "Tcp" if proto == "TCP" else "Udp"
            devA = dev_handle_by_name(stc, project, "utop_dev_A")
            devB = dev_handle_by_name(stc, project, "utop_dev_B")
            if not devA or not devB:
                out["error"] = "장비 없음(devices 먼저)"; print(json.dumps(out)); return
            epA = _split(stc.get(devA, "children-Ipv4If"))[0]
            epB = _split(stc.get(devB, "children-Ipv4If"))[0]
            # device 의 소속 포트: TopLevelIf 의 부모를 못 쓰므로 AffiliationPort 로 역추적
            # 간단히: 이름규칙으로 못 찾으니, 각 device 가 붙은 포트를 PrimaryIf->Port 로 찾는다
            def dev_port(dev):
                # emulateddevice -> AffiliationPort-targets
                ap = stc.get(dev, "AffiliationPort-targets")
                aps = _split(ap)
                return aps[0] if aps else None
            pA = dev_port(devA); pB = dev_port(devB)
            # 기존 utop 스트림 정리
            for prt in (pA, pB):
                if not prt:
                    continue
                for sb in _split(stc.get(prt, "children-StreamBlock")):
                    try:
                        if str(stc.get(sb).get("Name", "")).startswith("utop_sb_"):
                            stc.delete(sb)
                    except Exception:
                        pass
            made = []
            def mkstream(name, src_port, src_ep, dst_ep):
                sb = stc.create("streamBlock", under=src_port, Name=name)
                stc.config(sb, attributes={"SrcBinding-targets": [src_ep]})
                stc.config(sb, attributes={"DstBinding-targets": [dst_ep]})
                stc.config(sb, FrameLengthMode="FIXED", FixedFrameLength=frame)
                stc.config(sb, Load=load, LoadUnit=lunit)
                stc.config(sb, FrameConfig="EthernetII IPv4 " + l4)
                stc.config(sb, Frame="%s.1.destPort %s %s.1.sourcePort %s" % (l4, dstp, l4, srcp))
                try:
                    stc.perform("StreamBlockUpdate", params={"StreamBlock": sb})
                except Exception:
                    pass
                return sb
            if pA:
                mkstream("utop_sb_A2B", pA, epA, epB); made.append("utop_sb_A2B")
            if bidir and pB:
                mkstream("utop_sb_B2A", pB, epB, epA); made.append("utop_sb_B2A")
            stc.apply()
            out["ok"] = True; out["streams"] = made
            if frame_note:
                out["note"] = frame_note
            print(json.dumps(out)); return

        if action in ("start", "stop"):
            gens = []
            for h in _split(stc.get(project, "children-Port")):
                try:
                    if not str(stc.get(h).get("Name", "")).startswith("utop_p"):
                        continue
                except Exception:
                    continue
                g = _split(stc.get(h, "children-Generator"))
                gens.extend(g)
                a = _split(stc.get(h, "children-Analyzer"))
                # analyzer start/stop 함께
                if action == "start":
                    for an in a:
                        try: stc.perform("AnalyzerStart", params={"AnalyzerList": [an]})
                        except Exception: pass
            if gens:
                cmd = "GeneratorStart" if action == "start" else "GeneratorStop"
                stc.perform(cmd, params={"GeneratorList": gens})
            out["ok"] = True; out["generators"] = len(gens)
            print(json.dumps(out)); return

        if action == "counters":
            # 스트림별 tx/rx 결과 subscribe 후 읽기
            try:
                stc.perform("ResultsSubscribe", params={"Parent": project, "ConfigType": "StreamBlock", "ResultType": "TxStreamResults"})
                stc.perform("ResultsSubscribe", params={"Parent": project, "ConfigType": "StreamBlock", "ResultType": "RxStreamSummaryResults"})
            except Exception:
                pass
            rows = []
            tot_tx = tot_rx = 0
            for h in _split(stc.get(project, "children-Port")):
                try:
                    if not str(stc.get(h).get("Name", "")).startswith("utop_p"):
                        continue
                except Exception:
                    continue
                for sb in _split(stc.get(h, "children-StreamBlock")):
                    nm = stc.get(sb).get("Name", sb)
                    tx = rx = 0
                    txr = _split(stc.get(sb, "children-TxStreamResults"))
                    if txr:
                        tx = int(stc.get(txr[0]).get("FrameCount") or 0)
                    rxr = _split(stc.get(sb, "children-RxStreamSummaryResults"))
                    if rxr:
                        rx = int(stc.get(rxr[0]).get("FrameCount") or 0)
                    rows.append({"name": nm, "tx": tx, "rx": rx, "loss": max(0, tx - rx)})
                    tot_tx += tx; tot_rx += rx
            out["ok"] = True; out["streams"] = rows
            out["totals"] = {"tx": tot_tx, "rx": tot_rx, "loss": max(0, tot_tx - tot_rx)}
            print(json.dumps(out)); return

        if action == "status":
            ports = [stc.get(h).get("Name") for h in _split(stc.get(project, "children-Port"))]
            devs = [stc.get(h).get("Name") for h in _split(stc.get(project, "children-EmulatedDevice"))]
            out["ok"] = True; out["ports"] = ports; out["devices"] = devs; out["exists"] = bool(existing)
            print(json.dumps(out)); return

        if action == "portstatus":
            # 실시간: ChassisConnect(위에서 수행)로 최신 OwnershipState 읽음.
            # "내 예약(mine)"은 우리 세션 project 의 port 오브젝트 Location 기준(확실).
            #  → RESERVED 이고 우리 것이면 mine, 아니면 other, AVAILABLE 면 available, 그 외 unavailable.
            # 1) 우리 예약 = 영속 세션 project 의 port 오브젝트 Location (확실)
            mine_locs = set()
            for h in _split(stc.get(project, "children-Port")):
                try:
                    mine_locs.add(str(stc.get(h).get("Location", "")).replace("//", "/"))
                except Exception:
                    pass
            reg = _reg_load()          # 누가 예약했는지 (포트→로그인ID)
            reg_changed = False
            # 2) ownership: 영속 세션에서 직접 읽음(위에서 ChassisConnect 로 갱신됨, ~0.5초).
            #    새 세션 생성은 BLL 프로세스 spawn(~10초)이라 느려서 안 씀.
            rows = []
            seen = set()
            pcm = stc.get("system1", "children-PhysicalChassisManager")
            ch0 = None
            for c in (_split(stc.get(pcm, "children-PhysicalChassis")) if pcm else []):
                try:
                    if stc.get(c).get("Hostname") == chassis:
                        ch0 = c; break
                except Exception:
                    pass
            if ch0:
                for m in _split(stc.get(ch0, "children-PhysicalTestModule")):
                    try:
                        slot = str(stc.get(m).get("Index"))
                    except Exception:
                        continue
                    for g in _split(stc.get(m, "children-PhysicalPortGroup")):
                        try:
                            gi = stc.get(g, "OwnershipState", "PortsCsvString", "Index")
                            own = str(gi.get("OwnershipState") or "").upper()
                            reserved = "RESERVED" in own
                            available = "AVAILABLE" in own
                            csv_list = [x.strip() for x in str(gi.get("PortsCsvString") or gi.get("Index") or "").split(",") if x.strip()]
                            # 실제 케이블 링크상태/속도: 그룹의 PhysicalPort 에서 LinkStatus/LineSpeedStatus 읽음
                            #
                            # 이 읽기가 **포트마다 REST 왕복 한 번**이다. 44포트면 그만큼
                            # 더 걸린다 — 포트 목록만 필요할 때(「섀시에서 읽기」)는 건너뛴다
                            # (지적: STC 포트 읽기가 느리다). params.light 로 끈다.
                            link_map = {}
                            try:
                                if params.get("light"):
                                    raise StopIteration
                                pps = _split(stc.get(g, "children-PhysicalPort"))
                                for _i, _pp in enumerate(pps):
                                    if _i < len(csv_list):
                                        try:
                                            _ppi = stc.get(_pp, "LinkStatus", "LineSpeedStatus")
                                            link_map[csv_list[_i]] = (str(_ppi.get("LinkStatus") or ""), str(_ppi.get("LineSpeedStatus") or ""))
                                        except Exception:
                                            pass
                            except StopIteration:
                                pass
                            except Exception:
                                pass
                            for pidx in csv_list:
                                k = slot + "/" + pidx
                                if k in seen:
                                    continue
                                seen.add(k)
                                loc = "/" + chassis + "/" + slot + "/" + pidx
                                rk = chassis + "|" + slot + "/" + pidx
                                who = reg.get(rk)
                                # mine 판정: 레지스트리(누가 예약)가 단일 진실 소스.
                                #  섀시 OwnershipState 의 OwnerUserId 는 모든 U-TOP 이 같은
                                #  Windows 계정이라 사용자 구분 불가 → 레지스트리로 판정.
                                #  세션 project Location(mine_locs)은 보조 fallback.
                                if reserved and ((who and who == user) or (loc in mine_locs)):
                                    stt = "mine"
                                    if not who:     # 세션엔 있는데 레지스트리 누락 → 보정 기록
                                        who = user; reg[rk] = user; reg_changed = True
                                elif reserved:
                                    stt = "other"   # who: 레지스트리의 U-TOP 사용자, 없으면 외부
                                elif available:
                                    stt = "available"
                                    if who:         # 풀렸는데 레지스트리에 남음 → 정리
                                        reg.pop(rk, None); reg_changed = True; who = None
                                else:
                                    stt = "unavailable"
                                row = {"slot": slot, "port": pidx, "status": stt}
                                _lk = link_map.get(pidx)
                                if _lk:
                                    row["link"] = "up" if "up" in _lk[0].lower() else "down"
                                    if _lk[1]:
                                        row["speed"] = _lk[1]
                                if stt == "other":
                                    row["who"] = who or "외부"
                                elif stt == "mine":
                                    row["who"] = who or (user or "나")
                                rows.append(row)
                        except Exception:
                            pass
            if reg_changed:
                _reg_save(reg)
            out["ok"] = True; out["ports"] = rows
            print(json.dumps(out)); return

        out["error"] = "알 수 없는 action: " + action
        print(json.dumps(out))
    except Exception as e:
        msg = str(e)
        if "Cannot connect to STC server" in msg:
            out["error"] = "STC REST 서버에 연결할 수 없습니다 (" + rest_ip + ":" + str(rest_port) + ") — stcweb.exe(REST 서버)가 실행 중인지 확인하세요."
        else:
            out["error"] = repr(e)
        print(json.dumps(out))


if __name__ == "__main__":
    main()
