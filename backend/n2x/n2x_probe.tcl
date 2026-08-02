# N2X 조회 — 서버 연결 + 열린 세션 + 모듈 구성을 JSON 한 줄로 출력
# 사용법: n2xtclsh85 n2x_probe.tcl <serverIp>
lappend auto_path "C:/N2xTcl85/lib"
foreach pkg {AgtClient AgtCommon} {
    if {[catch {package require $pkg} e]} { puts "{\"ok\":false,\"error\":\"pkg $pkg: $e\"}"; exit 1 }
}
set server [lindex $argv 0]
if {$server eq ""} { set server "210.1.2.248" }
AgtSetServerHostname $server

# 1) 열린 세션 목록 (연결 확인)
if {[catch {SmInvoke AgtSessionManager ListOpenSessions} sessions]} {
    puts "{\"ok\":false,\"error\":\"connect fail: $sessions\"}"; exit 1
}
set sesJson {}
foreach s $sessions {
    if {[catch {SmInvoke AgtSessionManager GetSessionLabel $s} label]} { set label "?" }
    lappend sesJson "{\"id\":$s,\"label\":\"$label\"}"
}

# 2) 모듈(카드) 구성 — 임시 세션 열어서 조회 후 닫음
set modJson {}
if {![catch {AgtOpenSession RouterTester900 AGT_SESSION_ONLINE} session]} {
    catch {AgtConnect $session}
    if {![catch {SmInvoke AgtModuleManager ListModules} mods]} {
        foreach mod $mods {
            if {[catch {SmInvoke AgtModuleManager GetSerialNumber $mod} sn]} { set sn "?" }
            if {[catch {SmInvoke AgtModuleManager GetModuleState $sn} st]} { set st "?" }
            if {[catch {SmInvoke AgtModuleManager GetModuleDescription $sn} de]} { set de "? 0" }
            set card [lindex $de 0]
            set pc [lindex $de 1]
            if {![string is integer -strict $pc]} { set pc 0 }
            lappend modJson "{\"id\":$mod,\"serial\":\"$sn\",\"state\":\"$st\",\"card\":\"$card\",\"ports\":$pc}"
        }
    }
    catch {AgtCloseSession $session}
}

puts "{\"ok\":true,\"server\":\"$server\",\"sessions\":\[[join $sesJson ,]\],\"modules\":\[[join $modJson ,]\]}"
exit 0
