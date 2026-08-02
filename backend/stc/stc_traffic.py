# -*- coding: utf-8 -*-
# U-TOP: 위저드(포트→Device→Stream)에서 수집한 설정(JSON)으로 STC 트래픽을
#  '한 세션에 통으로' 빌드하고 전송한다. STC_UDP.py 의 검증된 REST API 시퀀스를 그대로 사용.
#  - L2(EthernetII only) / L3(IPv4) 디바이스, DeviceCount + 증가(step), 유연한 스트림 지원.
#  - 위저드가 U_TOP_op 로 잡아둔 포트를 ReservePortCommand(RevokeOwner) 로 강제 인수해서 사용.
# 사용법: python stc_traffic.py <config.json> [stopfile]
#  config.json: {chassis,restIp,restPort,duration,interval,ports:["9/6"],
#                devices:[{port,name,mode,mac,ip,gw,prefix,count,macStep,ipStep,gwStep}],
#                streams:[{name,active,src,dst,proto,frame,frameMode,load,loadUnit,dstPort,srcPort,bidir}]}
from __future__ import print_function
import sys
import os
import json
import time
import traceback

# stdout 을 UTF-8 로 강제(한글 윈도우 cp949 에서 한글/em-dash 인코딩 크래시 방지).
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass


def log(m):
    sys.stdout.write("[" + time.strftime("%H:%M:%S") + "] " + m + "\n")
    sys.stdout.flush()


_REG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stc_resv_registry.json")


def write_registry(chassis, ports, user):
    # 전송이 잡은 포트를 레지스트리에 user 로 기록 → 위저드가 '내 예약'으로 계속 표시.
    try:
        try:
            with open(_REG_FILE, "r") as f:
                reg = json.load(f)
        except Exception:
            reg = {}
        for pk in ports:
            sl, pt = str(pk).split("/")[-2:]
            reg["%s|%s/%s" % (chassis, sl, pt)] = user or "admin"
        with open(_REG_FILE, "w") as f:
            json.dump(reg, f)
    except Exception:
        pass


def get_child(stc, handle, relation):
    try:
        v = stc.get(handle, relation)
        if isinstance(v, list):
            return v[0] if v else None
        if v in (None, "", "[]"):
            return None
        parts = str(v).split()
        return parts[0] if parts else None
    except Exception:
        return None


def get_all(stc, handle):
    try:
        v = stc.get(handle)
        return v if isinstance(v, dict) else {}
    except Exception:
        return {}


def get_children(stc, handle, relation):
    # relation 으로 연결된 자식 핸들을 '전부' 반환(공백 구분 문자열/리스트 모두 처리).
    try:
        v = stc.get(handle, relation)
        if isinstance(v, list):
            return [x for x in v if x]
        if v in (None, "", "[]"):
            return []
        return [p for p in str(v).split() if p]
    except Exception:
        return []


def get_num(v, d=0):
    try:
        if v in (None, "", "null"):
            return d
        return int(float(v))
    except Exception:
        return d


_STC_DBG = {"on": True}


def print_results(stc, portmap, ports, chassis, el, final=False, sblist=None):
    # 결과는 UI 표가 in-place 로 갱신하도록 JSON 마커 한 줄로만 출력(로그 누적 방지).
    # 1) StreamBlock(스트림)별 시그니처 결과 — TX/RX/손실/지연/지터/순서이탈 (per-stream)
    srows = []
    for item in (sblist or []):
        sb = item.get("sb")
        if not sb:
            continue
        # 디바이스(시그니처)별 수신 결과 — DeviceCount=N 이면 RxStreamSummaryResults 가 N개 생성됨
        rxrs = get_children(stc, sb, "children-RxStreamSummaryResults") or [None]
        # StreamIndex 순으로 정렬(디바이스 #1, #2 … 순서 고정)
        rxrs = sorted(rxrs, key=lambda h: get_num(get_all(stc, h).get("StreamIndex", 0)) if h else 0)
        multi = len([h for h in rxrs if h]) > 1
        for idx, rxr in enumerate(rxrs):
            rx = get_all(stc, rxr) if rxr else {}
            rxf = get_num(rx.get("FrameCount", rx.get("SigFrameCount", 0)))
            _drp = rx.get("DroppedFrameCount", None)
            dropped = get_num(_drp) if _drp not in (None, "", "null") else 0
            # 이 STC 펌웨어는 TxStreamBlockResults 송신 카운터를 채우지 않으므로(=0),
            # STC 가 시그니처로 직접 측정한 수신 + 손실 = 송신 으로 산출(추정 아님, 측정값 합산).
            txf = rxf + max(0, dropped)
            nm = item.get("name", "")
            if multi:
                nm = "%s #%d" % (nm, idx + 1)
            srows.append({
                "name": nm, "src": item.get("src", ""), "dst": item.get("dst", ""),
                "tx": txf, "rx": rxf, "dropped": dropped,
                "lossPct": (round(dropped * 100.0 / txf, 4) if txf else 0),
                "latMin": get_num(rx.get("MinLatency", 0)), "latAvg": get_num(rx.get("AvgLatency", 0)), "latMax": get_num(rx.get("MaxLatency", 0)),
                "jitAvg": get_num(rx.get("AvgInterarrivalJitter", rx.get("AvgJitter", 0))),
                "outSeq": get_num(rx.get("ReorderedFrameCount", rx.get("OutSeqFrameCount", 0))),
                "dup": get_num(rx.get("DuplicateFrameCount", 0)),
            })
    # 스트림 결과가 하나라도 실측되면 그걸로 출력
    if srows and any((r["tx"] or r["rx"]) for r in srows):
        print("__STC_RES__ " + json.dumps({"t": round(el, 1), "final": bool(final), "streams": srows}))
        sys.stdout.flush()
        return
    # 2) 폴백: 포트(Generator/Analyzer Port) 단위 — STC 가 스트림 결과를 안 줄 때
    rows = []
    for pk in ports:
        pm = portmap.get(pk, {})
        tx = {}
        rx = {}
        if pm.get("gen"):
            r = get_child(stc, pm["gen"], "children-GeneratorPortResults")
            if r:
                tx = get_all(stc, r)
        if pm.get("ana"):
            r = get_child(stc, pm["ana"], "children-AnalyzerPortResults")
            if r:
                rx = get_all(stc, r)
        txf = get_num(tx.get("GeneratorFrameCount", tx.get("TotalFrameCount", 0)))
        rxf = get_num(rx.get("TotalFrameCount", rx.get("SigFrameCount", 0)))
        txr = get_num(tx.get("GeneratorFrameRate", tx.get("TotalFrameRate", 0)))
        rxr = get_num(rx.get("TotalFrameRate", 0))
        loss = max(0, txf - rxf)
        rows.append({"port": pk, "tx": txf, "txfps": txr, "rx": rxf, "rxfps": rxr, "loss": loss})
    print("__STC_RES__ " + json.dumps({"t": round(el, 1), "final": bool(final), "ports": rows}))
    sys.stdout.flush()


def main():
    if len(sys.argv) < 2:
        print("[ERROR] config.json 경로 필요")
        return 1
    cfgpath = sys.argv[1]
    stopfile = sys.argv[2] if len(sys.argv) > 2 else None
    try:
        with open(cfgpath, "r") as f:
            cfg = json.load(f)
    except Exception as e:
        print("[ERROR] config 읽기 실패: %r" % e)
        return 1

    chassis = cfg.get("chassis", "192.168.5.100")
    rest_ip = cfg.get("restIp", "localhost")
    rest_port = int(cfg.get("restPort", 8888))
    duration = float(cfg.get("duration", 30))
    interval = float(cfg.get("interval", 2))
    ports = cfg.get("ports", [])                       # ["9/6", ...]
    devices = cfg.get("devices", [])
    streams = [s for s in cfg.get("streams", []) if s.get("active", True)]

    try:
        from stcrestclient import stchttp
    except Exception as e:
        print("[ERROR] stcrestclient 미설치: %r" % e)
        return 1

    stc = None
    gens = []
    anas = []
    portmap = {}
    try:
        log("STC 연결 %s:%d" % (rest_ip, rest_port))
        stc = stchttp.StcHttp(rest_ip, port=rest_port)
        stc.set_timeout(90)
        # 전송 전용 세션(U_TOP_tx)을 '재사용' — 위저드 세션(U_TOP_op)은 빌드로 손상될 수 있어 분리.
        #  포트는 백엔드가 사전해제(free)해두므로 RevokeOwner 없이 즉시 예약. 전송 후에도 U_TOP_tx 가
        #  포트를 계속 쥐고(해제 안 함) 레지스트리도 user 로 써서 위저드에 '내 예약'으로 계속 보임.
        sess = "U_TOP_tx"
        reused = False

        def _kill_sess(sid):
            # 합류 없이 세션 강제 종료(corpse 제거). 클라 헤더도 초기화.
            try:
                stc.end_session(end_tcsession='kill', sid=sid, timeout=0)
            except Exception:
                pass
            try:
                stc._sid = None
                stc._rest.del_header('X-STC-API-Session')
            except Exception:
                pass

        try:
            existing = [s for s in stc.sessions() if s.split(" - ")[0] == sess]
        except Exception:
            existing = []
        for s in existing:
            try:
                stc.join_session(s)
                stc.get("system1")          # 살아있는지 검증
                reused = True
                break
            except Exception:
                # 손상된 전송 세션 → 강제 종료 후 새로 생성
                log("손상된 전송 세션 정리(kill): %s" % s)
                _kill_sess(s)
        if not reused:
            try:
                stc.new_session(user_name="utop", session_name=sess)
            except Exception:
                # 409(이미 존재)·기타 → 남은 세션 kill 후 재생성
                try:
                    for s in stc.sessions():
                        if s.split(" - ")[0] == sess:
                            _kill_sess(s)
                except Exception:
                    pass
                time.sleep(1.5)
                stc.new_session(user_name="utop", session_name=sess)
        pj = [x for x in str(stc.get("system1", "children-Project") or "").split(" ") if x]
        project = pj[0] if pj else stc.create("project")
        if reused:
            log("전송 세션 재사용 — 빠른 시작")
            # 이전 잔여 오브젝트(포트/디바이스) 정리 → streamBlock 도 포트와 함께 제거됨
            for rel in ("children-EmulatedDevice", "children-Port"):
                for h in [x for x in str(stc.get(project, rel) or "").split(" ") if x]:
                    try:
                        stc.delete(h)
                    except Exception:
                        pass
            try:
                stc.apply()
            except Exception:
                pass
        # 섀시 연결은 항상 확인(reused여도) — 안 하면 포트가 online 안 돼 트래픽이 안 흐름. 연결돼 있으면 빠름.
        log("섀시 연결 확인 %s" % chassis)
        stc.connect(chassis)

        # ── 포트 오브젝트 + (필요시)예약 + Attach ──
        for pk in ports:
            sl, pt = str(pk).split("/")[-2:]
            loc = "//%s/%s/%s" % (chassis, sl, pt)
            name = "p%s_%s" % (sl, pt)
            h = stc.create("port", under=project, Location=loc, Name=name)
            portmap[pk] = {"handle": h, "location": loc, "name": name}
        log("포트 오브젝트 %d개 생성 — 예약 시작" % len(portmap))
        for pk in ports:
            loc = portmap[pk]["location"]
            ok = False
            # 일반 예약 우선(free 포트면 즉시). 실패 시에만 RevokeOwner(타세션 강제, ~50초 느림).
            try:
                stc.perform("ReservePortCommand", Location=[loc])
                ok = True
            except Exception:
                log("  %s 일반예약 실패 → RevokeOwner 강제(느릴 수 있음)" % loc)
                try:
                    stc.perform("ReservePortCommand", Location=[loc], RevokeOwner="TRUE")
                    ok = True
                except Exception as e:
                    log("  예약 실패 %s: %r" % (loc, e))
            log("  예약 %s: %s" % (loc, "OK" if ok else "실패"))
        log("Attach 시작 …")
        try:
            stc.perform("AttachPorts", PortList=[portmap[pk]["handle"] for pk in ports])
        except Exception as e:
            log("AttachPorts WARN: %r" % e)
        log("포트 예약/Attach 완료: %d개 (apply 는 빌드 후 일괄)" % len(portmap))
        # 레지스트리에 user 기록 → 전송 후에도 U_TOP_tx 가 포트를 쥐고 있어 위저드에 '내 예약' 유지.
        write_registry(chassis, ports, cfg.get("user", "admin"))

        # ── 디바이스(L2/L3) 생성 + Count/증가 ──
        devmap = {}
        port_devs = {}
        for d in devices:
            pk = d.get("port")
            if pk not in portmap:
                continue
            mode = str(d.get("mode") or "L3").upper()
            cnt = max(1, int(d.get("count", 1)))
            dev = stc.create("emulateddevice", under=project, Name=d.get("name", "dev"), DeviceCount=str(cnt))
            eth_attrs = {}
            if d.get("mac"):
                eth_attrs["SourceMac"] = d["mac"]
            if d.get("macStep"):
                eth_attrs["SrcMacStep"] = d["macStep"]
            if cnt > 1:
                eth_attrs["IsRange"] = "TRUE"
            eth = stc.create("ethiiif", under=dev, **eth_attrs)
            endpoint = eth
            if mode == "L3":
                ipa = {"Address": d.get("ip", "1.1.1.1"), "Gateway": d.get("gw", "0.0.0.0"),
                       "PrefixLength": str(d.get("prefix", 24))}
                if d.get("ipStep"):
                    ipa["AddrStep"] = d["ipStep"]
                if d.get("gwStep"):
                    ipa["GatewayStep"] = d["gwStep"]
                if cnt > 1:
                    ipa["IsRange"] = "TRUE"
                l3 = stc.create("ipv4if", under=dev, **ipa)
                stc.config(l3, attributes={"StackedOnEndpoint-targets": [eth]})
                stc.config(dev, attributes={"TopLevelIf-targets": [l3], "PrimaryIf-targets": [l3]})
                endpoint = l3
            else:
                stc.config(dev, attributes={"TopLevelIf-targets": [eth], "PrimaryIf-targets": [eth]})
            devmap[d.get("name")] = {"handle": dev, "endpoint": endpoint, "port": pk, "mode": mode}
            port_devs.setdefault(pk, []).append(dev)
            log("Device %s: port=%s mode=%s count=%d" % (d.get("name"), pk, mode, cnt))
        for pk, dl in port_devs.items():
            stc.config(portmap[pk]["handle"], attributes={"AffiliationPort-sources": dl})

        # ── 스트림 생성 ──
        def make_stream(s, src, dst, suffix):
            sd = devmap.get(src)
            dd = devmap.get(dst)
            if not sd or not dd:
                log("스트림 건너뜀(디바이스 없음): %s" % s.get("name"))
                return None
            ph = portmap[sd["port"]]["handle"]
            sb = stc.create("streamBlock", under=ph, Name=s.get("name", "SB") + suffix)
            stc.config(sb, attributes={"SrcBinding-targets": [sd["endpoint"]]})
            stc.config(sb, attributes={"DstBinding-targets": [dd["endpoint"]]})
            stc.config(sb, FrameLengthMode=str(s.get("frameMode", "FIXED")), FixedFrameLength=str(s.get("frame", 512)))
            stc.config(sb, Load=str(s.get("load", 10)), LoadUnit=str(s.get("loadUnit", "PERCENT_LINE_RATE")))
            l4 = "Tcp" if str(s.get("proto", "UDP")).upper() == "TCP" else "Udp"
            if sd["mode"] == "L3":
                stc.config(sb, FrameConfig="EthernetII IPv4 " + l4)
                stc.config(sb, Frame="%s.1.destPort %s %s.1.sourcePort %s" % (l4, s.get("dstPort", 80), l4, s.get("srcPort", 1024)))
            else:
                stc.config(sb, FrameConfig="EthernetII")
            try:
                stc.perform("StreamBlockUpdate", StreamBlock=sb)
            except Exception:
                pass
            return sb

        ns = 0
        sblist = []
        for s in streams:
            _sb = make_stream(s, s.get("src"), s.get("dst"), "")
            if _sb:
                sblist.append({"sb": _sb, "name": s.get("name", "SB"), "src": s.get("src", ""), "dst": s.get("dst", "")})
                ns += 1
            if s.get("bidir") and s.get("src") != s.get("dst"):
                _sb2 = make_stream(s, s.get("dst"), s.get("src"), "_rev")
                if _sb2:
                    sblist.append({"sb": _sb2, "name": s.get("name", "SB") + "_rev", "src": s.get("dst", ""), "dst": s.get("src", "")})
                    ns += 1

        # ── 결과 구독 ──
        try:
            stc.perform("ResultsSubscribe", Parent=project, ConfigType="Generator", ResultType="GeneratorPortResults")
            stc.perform("ResultsSubscribe", Parent=project, ConfigType="Analyzer", ResultType="AnalyzerPortResults")
        except Exception as e:
            log("ResultsSubscribe WARN: %r" % e)
        try:
            stc.perform("ResultsSubscribe", Parent=project, ConfigType="StreamBlock", ResultType="TxStreamBlockResults")
            stc.perform("ResultsSubscribe", Parent=project, ConfigType="StreamBlock", ResultType="RxStreamSummaryResults")
        except Exception as e:
            log("Stream ResultsSubscribe WARN: %r" % e)
        log("빌드 완료: 포트 %d · 디바이스 %d · 스트림 %d" % (len(portmap), len(devmap), ns))
        stc.apply()
        log("apply 완료 — 트래픽 준비")

        # ── 디바이스 시작 + (L3만)ARP/ND + 트래픽 시작 ──
        has_l3 = any(str(d.get("mode") or "L3").upper() == "L3" for d in devices)
        ph_all = [portmap[pk]["handle"] for pk in ports]
        try:
            stc.perform("DevicesStartAllCommand")
        except Exception:
            pass
        if has_l3:
            # L3 만 ARP/ND 필요(게이트웨이 MAC 해석).
            try:
                stc.perform("ArpNdStartCommand", HandleList=ph_all)
            except Exception as e:
                log("ArpNd WARN: %r" % e)
        # 디바이스/포트가 online 되도록 대기(이 시간 부족하면 Generator 가 안 생겨 트래픽 0).
        time.sleep(2)
        for pk in ports:
            g = get_child(stc, portmap[pk]["handle"], "children-Generator")
            a = get_child(stc, portmap[pk]["handle"], "children-Analyzer")
            if g:
                gens.append(g)
                portmap[pk]["gen"] = g
            if a:
                anas.append(a)
                portmap[pk]["ana"] = a
        log("Generator %d개 · Analyzer %d개 발견" % (len(gens), len(anas)))
        if anas:
            stc.perform("AnalyzerStart", AnalyzerList=anas)
        if gens:
            stc.perform("GeneratorStart", GeneratorList=gens)
        else:
            log("⚠ Generator 가 없습니다 — 포트가 online 되지 않았을 수 있음(트래픽 안 나감)")
        if duration > 0:
            log("▶ 트래픽 전송 시작 — %.0f초 (정지 누르면 조기 종료)" % duration)
        else:
            log("▶ 트래픽 전송 시작 — 지속 전송(정지 누를 때까지)")

        # ── 폴링(LIVE 결과). duration<=0 이면 정지 신호까지 무한 전송. ──
        start = time.time()
        nextp = start
        while True:
            now = time.time()
            el = now - start
            if stopfile and os.path.exists(stopfile):
                log("■ 정지 신호 — 트래픽 중단")
                break
            if duration > 0 and el >= duration:
                break
            if now >= nextp:
                try:
                    print_results(stc, portmap, ports, chassis, el, sblist=sblist)
                except Exception as e:
                    log("결과 폴링 WARN: %r" % e)
                nextp = now + max(0.5, interval)
            time.sleep(0.2)

        # ── 최종 결과(정지 '전'에 읽음) + 정지 ──
        # 정지(GeneratorStop/AnalyzerStop) 후에는 카운터가 0 으로 보일 수 있어
        # 누적 프레임이 사라진다 → 반드시 정지 전에 최종 누적을 읽어 emit.
        time.sleep(0.6)   # 인플라이트 프레임 RX 반영 잠깐 대기(손실 오인 방지)
        try:
            print_results(stc, portmap, ports, chassis, el, final=True, sblist=sblist)
        except Exception:
            pass
        if gens:
            try:
                stc.perform("GeneratorStop", GeneratorList=gens)
            except Exception:
                pass
        if anas:
            try:
                stc.perform("AnalyzerStop", AnalyzerList=anas)
            except Exception:
                pass
        log("✔ 전송 완료")
        return 0
    except Exception as e:
        print("[ERROR] 전송 실패: %r" % e)
        traceback.print_exc()
        sys.stdout.flush()
        return 1
    finally:
        # ★ U_TOP_op(위저드 세션)을 그대로 사용하므로 포트 해제·섀시해제·세션종료 안 함.
        #   트래픽만 정지하고 포트 예약은 위저드에 유지(사라지지 않음). 빌드 오브젝트는
        #   다음 실행 시작 때 정리됨. 트래픽 구성은 남겨두되 Generator/Analyzer 는 정지.
        if stc is not None:
            try:
                try:
                    if gens:
                        stc.perform("GeneratorStop", GeneratorList=gens)
                except Exception:
                    pass
                try:
                    if anas:
                        stc.perform("AnalyzerStop", AnalyzerList=anas)
                except Exception:
                    pass
                try:
                    stc.perform("DevicesStopAllCommand")
                except Exception:
                    pass
                log("정리 완료(트래픽 정지 · 포트 예약 유지)")
            except Exception as e:
                log("cleanup WARN: %r" % e)


if __name__ == "__main__":
    sys.exit(main())
