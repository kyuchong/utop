# -*- coding: utf-8 -*-
# U-TOP: STC 실제 포트 예약/해제.
# 예약은 STC 세션에 묶이므로, reserve 후 세션을 끝내지 않고 유지한다(서버측 세션 유지 →
# Spirent STC 프로그램에서 'Reserved by utop' 로 보임). release 는 세션을 종료해 예약을 푼다.
# 사용법: python stc_reserve.py <action> <ports> <chassis> [rest_ip] [rest_port]
#   action: reserve | release | status
#   ports : "1/15,1/16" (reserve 시 예약할 전체 집합)
from __future__ import print_function
import sys
import json

SESS = "U_TOP_reserve"


def parse_ports(s):
    out = []
    for tok in (s or "").split(","):
        tok = tok.strip().replace("//", "")
        if not tok:
            continue
        parts = tok.split("/")
        try:
            out.append((int(parts[-2]), int(parts[-1])))
        except Exception:
            pass
    return out


def find_session(stc):
    try:
        for s in stc.sessions():
            # 세션 표기는 "U_TOP_reserve - utop" 형태
            if s == SESS or s.split(" - ")[0] == SESS or s.startswith(SESS + " "):
                return s
    except Exception:
        pass
    return None


def chassis_connect(stc, chassis):
    try:
        stc.perform("ChassisConnect", params={"Hostname": chassis})
    except Exception:
        try:
            stc.perform("ChassisConnect", params={"InputHostnameList": [chassis]})
        except Exception:
            pass


def get_project(stc):
    proj = stc.get("system1", "children-Project")
    if isinstance(proj, str) and proj.strip():
        return proj.split(" ")[0]
    return stc.create("project", under="system1")


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "status"
    ports_s = sys.argv[2] if len(sys.argv) > 2 else ""
    chassis = sys.argv[3] if len(sys.argv) > 3 else "192.168.5.100"
    rest_ip = sys.argv[4] if len(sys.argv) > 4 else "localhost"
    rest_port = int(sys.argv[5]) if len(sys.argv) > 5 else 8888
    out = {"ok": False, "action": action, "session": SESS}

    try:
        from stcrestclient import stchttp
    except Exception as e:
        out["error"] = "stcrestclient 미설치: " + str(e)
        print(json.dumps(out)); return

    try:
        # StcHttp 생성자가 REST 서버에 즉시 접속하므로 try 안에서 생성해 오류를 JSON 으로 보고
        stc = stchttp.StcHttp(rest_ip, port=rest_port)
        existing = find_session(stc)
        if action == "release":
            if existing:
                stc.join_session(existing)
                stc.end_session()  # 세션 종료 → 이 세션이 잡은 포트 전부 해제
                out["ok"] = True; out["released"] = True
            else:
                out["ok"] = True; out["released"] = False; out["note"] = "예약 세션 없음"
            print(json.dumps(out)); return

        # reserve / status 는 세션을 유지(join or create)
        if existing:
            stc.join_session(existing)
        else:
            stc.new_session("utop", SESS)
        chassis_connect(stc, chassis)
        project = get_project(stc)

        if action == "status":
            ports = stc.get(project, "children-Port")
            handles = ports.split(" ") if isinstance(ports, str) and ports else []
            locs = []
            for h in handles:
                try:
                    locs.append(stc.get(h).get("Location"))
                except Exception:
                    pass
            out["ok"] = True; out["reserved"] = locs; out["exists"] = bool(existing)
            print(json.dumps(out)); return

        if action == "reserve":
            # 기존 utop 포트 오브젝트 정리 후, 요청된 전체 집합을 새로 만든다
            try:
                old = stc.get(project, "children-Port")
                for h in (old.split(" ") if isinstance(old, str) and old else []):
                    try:
                        stc.delete(h)
                    except Exception:
                        pass
            except Exception:
                pass
            locs = []
            for (slot, port) in parse_ports(ports_s):
                loc = "//%s/%d/%d" % (chassis, slot, port)
                locs.append(loc)
                stc.create("port", under=project,
                           attributes={"Location": loc, "Name": "utop_p%d_%d" % (slot, port)})
            if locs:
                stc.perform("ReservePortCommand", params={"Location": locs})
            stc.apply()
            out["ok"] = True; out["reserved"] = locs
            # end_session 호출하지 않음 → 예약 유지
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
