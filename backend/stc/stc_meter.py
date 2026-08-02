# -*- coding: utf-8 -*-
# TC 계측기 스텝 실행기: 영속 STC 세션(U_TOP_meter)에 대해 한 액션을 수행한다.
#  사용: python stc_meter.py <action> <cfg.json>
#   action: build | arp | start | stop | query
#   cfg: {chassis, restIp, restPort, ports:["1/1",...],
#         streams:[{name,count,src,dst,srcMac,dstMac,srcIp,dstIp,gw,minByte,maxByte,byteType,load,unit}]}
#  - unicast 스트림을 'raw streamBlock'(EthernetII/IPv4/UDP, MAC/IP 직접)으로 빌드한다(디바이스 없음).
#  - 세션은 종료하지 않고 유지 → start 로 빌드/전송, query 로 조회, stop 으로 정지, 다음 스텝에서 재사용.
from __future__ import print_function
import sys, os, json, time

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

def log(m):
    sys.stdout.write("[" + time.strftime("%H:%M:%S") + "] " + m + "\n"); sys.stdout.flush()

# 검증된 헬퍼 재사용(같은 폴더의 stc_traffic.py)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from stc_traffic import get_child, get_all, get_num
except Exception:
    def get_child(stc, h, rel):
        try:
            v = stc.get(h, rel)
            if isinstance(v, list): return v[0] if v else None
            parts = str(v or "").split(); return parts[0] if parts else None
        except Exception: return None
    def get_all(stc, h):
        try:
            v = stc.get(h); return v if isinstance(v, dict) else {}
        except Exception: return {}
    def get_num(v, d=0):
        try:
            if v in (None, "", "null"): return d
            return int(float(v))
        except Exception: return d

SESS = "U_TOP_meter"
_LOADUNIT = {"Percent(%)": "PERCENT_LINE_RATE", "%": "PERCENT_LINE_RATE",
             "Frames/sec(fps)": "FRAMES_PER_SECOND", "fps": "FRAMES_PER_SECOND",
             "Mbps": "MEGABITS_PER_SECOND", "bps": "BITS_PER_SECOND"}
_BYTEMODE = {"Fixed": "FIXED", "Increment": "INCR", "Decrement": "DECR", "Random": "RANDOM"}


def _session(stc):
    # U_TOP_meter 세션 join(없으면 생성). 손상/먹통이면 kill 후 재생성.
    def _kill(sid):
        try: stc.end_session(end_tcsession="kill", sid=sid, timeout=0)
        except Exception: pass
        try: stc._sid = None; stc._rest.del_header("X-STC-API-Session")
        except Exception: pass
    existing = []
    try: existing = [s for s in stc.sessions() if s.split(" - ")[0] == SESS]
    except Exception: pass
    for s in existing:
        try:
            stc.join_session(s)
            stc.get("system1"); t = stc.create("project"); stc.delete(t)   # 읽기+쓰기 검증
            return True
        except Exception as e:
            log("손상 세션 정리(kill): %s (%r)" % (s, e)); _kill(s)
    try:
        stc.new_session(user_name="utop", session_name=SESS)
    except Exception:
        try:
            for s in stc.sessions():
                if s.split(" - ")[0] == SESS: _kill(s)
        except Exception: pass
        time.sleep(1.0); stc.new_session(user_name="utop", session_name=SESS)
    return False


def _project(stc):
    pj = [x for x in str(stc.get("system1", "children-Project") or "").split(" ") if x]
    return pj[0] if pj else stc.create("project")


def _port_handles(stc, project, chassis, ports):
    # 기존 포트/스트림 정리 후 새로 생성·예약·attach
    for h in [x for x in str(stc.get(project, "children-Port") or "").split(" ") if x]:
        try: stc.delete(h)
        except Exception: pass
    try: stc.apply()
    except Exception: pass
    pmap = {}
    for pk in ports:
        sl, pt = str(pk).split("/")[-2:]
        loc = "//%s/%s/%s" % (chassis, sl, pt)
        h = stc.create("port", under=project, Location=loc, Name="mp%s_%s" % (sl, pt))
        pmap[pk] = h
    hlist = [pmap[pk] for pk in ports]
    try:
        stc.perform("AttachPorts", PortList=hlist, AutoConnect="TRUE")
    except Exception as e:
        log("AttachPorts(일반) 실패 → RevokeOwner 재시도: %r" % e)
        try: stc.perform("AttachPorts", PortList=hlist, AutoConnect="TRUE", RevokeOwner="TRUE")
        except Exception as e2: log("AttachPorts 최종 실패: %r" % e2)
    return pmap


def _build_streams(stc, pmap, streams):
    # raw streamBlock(EthernetII/IPv4/UDP) 직접 빌드. count>1 이면 같은 행을 N개 생성.
    sbs = []
    for s in streams:
        src = s.get("src"); dst = s.get("dst")
        if src not in pmap:
            log("스트림 건너뜀(src 포트 없음): %s" % s.get("name")); continue
        cnt = max(1, get_num(s.get("count", 1), 1))
        bmode = _BYTEMODE.get(str(s.get("byteType", "Fixed")), "FIXED")
        minb = str(s.get("minByte", 64)); maxb = str(s.get("maxByte", minb))
        lunit = _LOADUNIT.get(str(s.get("unit", "Percent(%)")), "PERCENT_LINE_RATE")
        for k in range(cnt):
            nm = "%s_%d" % (s.get("name", "SB"), k + 1) if cnt > 1 else s.get("name", "SB")
            sb = stc.create("streamBlock", under=pmap[src], Name=nm)
            try:
                stc.config(sb, FrameConfig="EthernetII IPv4 Udp")
                # MAC/IP 직접 설정(raw)
                frame = ("EthernetII.1.srcMac %s EthernetII.1.dstMac %s "
                         "IPv4.1.sourceAddr %s IPv4.1.destAddr %s "
                         "IPv4.1.gateway %s") % (
                    s.get("srcMac", "00:00:00:00:00:01"), s.get("dstMac", "00:00:00:00:00:02"),
                    s.get("srcIp", "1.1.1.1"), s.get("dstIp", "2.1.1.1"), s.get("gw", "0.0.0.0"))
                stc.config(sb, Frame=frame)
            except Exception as e:
                log("Frame 설정 WARN(%s): %r" % (nm, e))
            # 프레임 길이 모드
            try:
                if bmode == "FIXED":
                    stc.config(sb, FrameLengthMode="FIXED", FixedFrameLength=minb)
                else:
                    stc.config(sb, FrameLengthMode=bmode, MinFrameLength=minb, MaxFrameLength=maxb, StepFrameLength="1")
            except Exception as e:
                log("FrameLength WARN(%s): %r" % (nm, e))
            # 부하
            try:
                stc.config(sb, Load=str(s.get("load", 10)), LoadUnit=lunit)
            except Exception as e:
                log("Load WARN(%s): %r" % (nm, e))
            try: stc.perform("StreamBlockUpdate", StreamBlock=sb)
            except Exception: pass
            sbs.append({"sb": sb, "name": nm, "src": src, "dst": dst})
    return sbs


def _gen_ana(stc, project):
    gens, anas = [], []
    for ph in [x for x in str(stc.get(project, "children-Port") or "").split(" ") if x]:
        g = get_child(stc, ph, "children-Generator"); a = get_child(stc, ph, "children-Analyzer")
        if g: gens.append(g)
        if a: anas.append(a)
    return gens, anas


def main():
    if len(sys.argv) < 3:
        print("[ERROR] 사용: stc_meter.py <action> <cfg.json>"); return 1
    action = sys.argv[1].strip().lower()
    try:
        cfg = json.load(open(sys.argv[2], "r"))
    except Exception as e:
        print("[ERROR] cfg 읽기 실패: %r" % e); return 1
    chassis = cfg.get("chassis", "192.168.5.100")
    rest_ip = cfg.get("restIp", "localhost"); rest_port = int(cfg.get("restPort", 8888))
    ports = cfg.get("ports", []); streams = cfg.get("streams", [])
    try:
        from stcrestclient import stchttp
    except Exception as e:
        print("[ERROR] stcrestclient 미설치: %r" % e); return 1
    try:
        stc = stchttp.StcHttp(rest_ip, port=rest_port); stc.set_timeout(90)
        _session(stc); project = _project(stc)

        if action in ("start", "build"):
            log("빌드: 포트 %d · 스트림행 %d" % (len(ports), len(streams)))
            pmap = _port_handles(stc, project, chassis, ports)
            sbs = _build_streams(stc, pmap, streams)
            try:
                stc.perform("ResultsSubscribe", Parent=project, ConfigType="StreamBlock", ResultType="RxStreamSummaryResults")
                stc.perform("ResultsSubscribe", Parent=project, ConfigType="StreamBlock", ResultType="TxStreamResults")
            except Exception as e:
                log("ResultsSubscribe WARN: %r" % e)
            stc.apply(); log("apply 완료 — 스트림 %d" % len(sbs))
            if action == "build":
                print("BUILD_OK streams=%d" % len(sbs)); return 0
            gens, anas = _gen_ana(stc, project)
            if anas: stc.perform("AnalyzerStart", AnalyzerList=anas)
            if gens: stc.perform("GeneratorStart", GeneratorList=gens)
            print("START_OK gen=%d ana=%d streams=%d" % (len(gens), len(anas), len(sbs))); return 0

        if action == "arp":
            ph_all = [x for x in str(stc.get(project, "children-Port") or "").split(" ") if x]
            stc.perform("ArpNdStartCommand", HandleList=ph_all)
            print("ARP_OK ports=%d" % len(ph_all)); return 0

        if action == "stop":
            gens, anas = _gen_ana(stc, project)
            if gens:
                try: stc.perform("GeneratorStop", GeneratorList=gens)
                except Exception: pass
            time.sleep(0.6)
            if anas:
                try: stc.perform("AnalyzerStop", AnalyzerList=anas)
                except Exception: pass
            print("STOP_OK gen=%d ana=%d" % (len(gens), len(anas))); return 0

        if action == "query":
            lines = []; tot_tx = tot_rx = tot_drop = 0
            for ph in [x for x in str(stc.get(project, "children-Port") or "").split(" ") if x]:
                for sb in [x for x in str(stc.get(ph, "children-StreamBlock") or "").split(" ") if x]:
                    nm = str(get_all(stc, sb).get("Name", sb))
                    th = get_child(stc, sb, "children-TxStreamResults")
                    rh = get_child(stc, sb, "children-RxStreamSummaryResults")
                    tx = get_num(get_all(stc, th).get("FrameCount", 0)) if th else 0
                    rxd = get_all(stc, rh) if rh else {}
                    rx = get_num(rxd.get("FrameCount", 0)); drop = get_num(rxd.get("DroppedFrameCount", 0))
                    lat = get_num(rxd.get("AvgLatency", 0))
                    tot_tx += tx; tot_rx += rx; tot_drop += drop
                    lines.append("  %-18s TX %-12d RX %-12d 손실 %-8d 지연 %sus" % (nm[:18], tx, rx, drop, lat))
            verdict = "합격(무손실)" if tot_drop == 0 and tot_tx > 0 else ("손실 %d" % tot_drop)
            print("QUERY_OK")
            print("총 TX %d · RX %d · 손실 %d → %s" % (tot_tx, tot_rx, tot_drop, verdict))
            for ln in lines: print(ln)
            return 0

        if action in ("close", "disconnect"):
            gens, anas = _gen_ana(stc, project)
            if gens:
                try: stc.perform("GeneratorStop", GeneratorList=gens)
                except Exception: pass
            if anas:
                try: stc.perform("AnalyzerStop", AnalyzerList=anas)
                except Exception: pass
            try: stc.perform("ChassisDisconnectAll")
            except Exception as e: log("ChassisDisconnect WARN: %r" % e)
            try:
                stc.end_session(end_tcsession=True)   # 우리 U_TOP_meter 세션 종료(해제)
            except Exception:
                try: stc.end_session(True)
                except Exception as e2: log("end_session WARN: %r" % e2)
            print("CLOSE_OK"); return 0

        print("[ERROR] 알 수 없는 action: %s" % action); return 1
    except Exception as e:
        import traceback
        print("[ERROR] %s 실패: %r" % (action, e)); traceback.print_exc(); return 1


if __name__ == "__main__":
    sys.exit(main())
