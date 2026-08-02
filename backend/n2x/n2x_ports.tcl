# N2X 포트 상태 스캔 — 모듈별 포트의 가용/잠김/내세션 여부 → JSON (STC식 포트 그리드용)
# 사용법: n2xtclsh85 n2x_ports.tcl <server> <label>
lappend auto_path "C:/N2xTcl85/lib"
foreach pkg {AgtClient AgtCommon} { if {[catch {package require $pkg} e]} { puts "{\"ok\":false,\"error\":\"pkg: $e\"}"; exit 1 } }
set server [lindex $argv 0]
set label  [lindex $argv 1]
if {$label eq ""} { set label "2" }
AgtSetServerHostname $server

# 세션: 같은 레이블 재사용, 없으면 생성
set session ""
array set sesLabel {}
if {![catch {SmInvoke AgtSessionManager ListOpenSessions} openSes]} {
    foreach s $openSes {
        if {![catch {SmInvoke AgtSessionManager GetSessionLabel $s} lb]} {
            set sesLabel($s) $lb
            if {$lb eq $label && $session eq ""} { set session $s }
        }
    }
}
if {$session eq ""} {
    if {[catch {AgtOpenSession RouterTester900 AGT_SESSION_ONLINE} session]} { puts "{\"ok\":false,\"error\":\"session: $session\"}"; exit 1 }
    catch {AgtSetSessionLabel $session $label}
}
if {[catch {AgtConnect $session} r]} { puts "{\"ok\":false,\"error\":\"connect: $r\"}"; exit 1 }

set modJson {}
if {![catch {SmInvoke AgtModuleManager ListModules} mods]} {
    foreach mod $mods {
        if {[catch {SmInvoke AgtModuleManager GetSerialNumber $mod} sn]} { set sn "?" }
        if {[catch {SmInvoke AgtModuleManager GetModuleState $sn} mst]} { set mst "?" }
        if {[catch {SmInvoke AgtModuleManager GetModuleDescription $sn} de]} { set de "? 0" }
        set card [lindex $de 0]
        set pc [lindex $de 1]
        if {![string is integer -strict $pc]} { set pc 0 }
        set portJson {}
        # 응답 없는 모듈은 포트 스캔 생략
        if {$mst ne "AGT_MODULE_NOT_RESPONDING"} {
            for {set p 1} {$p <= $pc} {incr p} {
                set pst "?"; set plock "0"
                catch {AgtInvoke AgtPortSelector GetPortState $mod $p} pst
                catch {AgtInvoke AgtPortSelector GetPortLock $mod $p} plock
                set mine [expr {($plock ne "0" && $plock eq $session) ? 1 : 0}]
                set ll ""
                if {$plock ne "0" && [info exists sesLabel($plock)]} { set ll $sesLabel($plock) }
                set avail [expr {($plock eq "0") ? 1 : 0}]
                lappend portJson "{\"port\":$p,\"state\":\"$pst\",\"lock\":\"$plock\",\"label\":\"$ll\",\"mine\":$mine,\"avail\":$avail}"
            }
        }
        lappend modJson "{\"id\":$mod,\"card\":\"$card\",\"ports\":$pc,\"state\":\"$mst\",\"portList\":\[[join $portJson ,]\]}"
    }
}
puts "{\"ok\":true,\"session\":$session,\"label\":\"$label\",\"modules\":\[[join $modJson ,]\]}"
exit 0
