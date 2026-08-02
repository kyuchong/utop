# -*- coding: utf-8 -*-
# U-TOP: STC 실제 섀시 연결 확인 (트래픽 생성 없음).
# 사용법: py -3.12 stc_conncheck.py <chassis_ip> [rest_ip] [rest_port]
# 결과를 JSON 한 줄로 stdout 에 출력한다. 백엔드 /api/stc/conncheck 가 파싱.
from __future__ import print_function
import os
import sys
import json

def main():
    chassis = sys.argv[1] if len(sys.argv) > 1 else "192.168.5.100"
    rest_ip = sys.argv[2] if len(sys.argv) > 2 else "localhost"
    rest_port = int(sys.argv[3]) if len(sys.argv) > 3 else 8888
    out = {"ok": False, "chassis": chassis}
    try:
        from stcrestclient import stchttp
    except Exception as e:
        out["error"] = "stcrestclient 미설치: " + str(e)
        print(json.dumps(out)); return
    sid = None
    stc = None
    # 세션 이름을 호출마다 고유하게(pid) → 겹침/누수로 인한 409 Conflict 방지
    sess_name = "U_TOP_cc_" + str(os.getpid())
    try:
        # StcHttp 생성자가 REST 서버에 즉시 접속(GET sessions)하므로 try 안에서 생성해 오류를 JSON 으로 보고한다.
        stc = stchttp.StcHttp(rest_ip, port=rest_port)
        sid = stc.new_session("utop", sess_name)
        try:
            stc.perform("ChassisConnect", params={"Hostname": chassis})
        except Exception:
            stc.perform("ChassisConnect", params={"InputHostnameList": [chassis]})

        pcm = stc.get("system1", "children-PhysicalChassisManager")
        chs = stc.get(pcm, "children-PhysicalChassis") if pcm else ""
        first = (chs.split(" ")[0] if isinstance(chs, str) and chs else "")
        if first:
            info = stc.get(first)
            out["model"] = info.get("Model")
            out["serial"] = info.get("SerialNum")
            out["firmware"] = info.get("FirmwareVersion")
            out["hostname"] = info.get("Hostname")
            mods = stc.get(first, "children-PhysicalTestModule")
            mod_list = mods.split(" ") if isinstance(mods, str) and mods else []
            modules = []
            for m in mod_list:
                try:
                    mi = stc.get(m)
                    # 포트 수는 모듈 속성 PortCount 로 바로 얻는다(빠름).
                    # 실제 포트는 PhysicalPortGroup 밑에 중첩(children-PhysicalPort 는 모듈 직속엔 빈값).
                    try:
                        pc = int(mi.get("PortCount") or 0)
                    except Exception:
                        pc = 0
                    model = mi.get("Model") or ""
                    # 빈 슬롯(모델 없음)은 포트 0 으로 간주
                    if not model:
                        pc = 0
                    # 포트별 예약/링크 상태: PhysicalPortGroup 의 OwnershipState/Owner 로 판정
                    detail = []
                    if pc:
                        try:
                            grps = stc.get(m, "children-PhysicalPortGroup")
                            for g in (grps.split(" ") if isinstance(grps, str) and grps else []):
                                try:
                                    gi = stc.get(g)
                                    own = str(gi.get("OwnershipState") or "")
                                    reserved = "RESERVED" in own.upper()
                                    owner = ""
                                    if reserved:
                                        owner = str(gi.get("OwnerUserId") or "") + "@" + str(gi.get("OwnerHostname") or "")
                                    # PortsCsvString 예: "15" (그룹당 포트 인덱스)
                                    for pidx in str(gi.get("PortsCsvString") or gi.get("Index") or "").split(","):
                                        pidx = pidx.strip()
                                        if not pidx:
                                            continue
                                        detail.append({
                                            "index": pidx,
                                            "status": "reserved" if reserved else "available",
                                            "owner": owner,
                                        })
                                except Exception:
                                    pass
                        except Exception:
                            pass
                    if not detail:
                        detail = [{"index": str(i), "status": "available"} for i in range(1, pc + 1)]
                    modules.append({
                        "handle": m,
                        "slot": mi.get("Index"),
                        "model": model,
                        "ports": pc,
                        "port_detail": detail,
                    })
                except Exception:
                    modules.append({"handle": m})
            out["modules"] = modules
            out["module_count"] = len(modules)
        out["ok"] = True
    except Exception as e:
        msg = str(e)
        if "Cannot connect to STC server" in msg:
            out["error"] = "STC REST 서버에 연결할 수 없습니다 (" + rest_ip + ":" + str(rest_port) + ") — stcweb.exe(REST 서버)가 실행 중인지 확인하세요."
        else:
            out["error"] = repr(e)
    finally:
        try:
            if sid is not None and stc is not None:
                stc.end_session()
        except Exception:
            pass
    print(json.dumps(out))

if __name__ == "__main__":
    main()
