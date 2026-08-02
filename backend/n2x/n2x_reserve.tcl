# N2X 포트 예약 — 계정(레이블)으로 세션 생성 + 포트 reserve + 세션 유지(닫지 않음)
# 사용법: n2xtclsh85 n2x_reserve.tcl <server> <label> <module> <port1> [port2 ...]
lappend auto_path "C:/N2xTcl85/lib"
foreach pkg {AgtClient AgtCommon} {
    if {[catch {package require $pkg} e]} { puts "{\"ok\":false,\"error\":\"pkg: $e\"}"; exit 1 }
}
set server [lindex $argv 0]
set label  [lindex $argv 1]
set module [lindex $argv 2]
set ports  [lrange $argv 3 end]
AgtSetServerHostname $server

# 같은 레이블 세션이 이미 있으면 재사용, 없으면 새로 생성
set session ""
if {![catch {SmInvoke AgtSessionManager ListOpenSessions} openSes]} {
    foreach s $openSes {
        if {![catch {SmInvoke AgtSessionManager GetSessionLabel $s} lb] && $lb eq $label} { set session $s; break }
    }
}
if {$session eq ""} {
    if {[catch {AgtOpenSession RouterTester900 AGT_SESSION_ONLINE} session]} {
        puts "{\"ok\":false,\"error\":\"session: $session\"}"; exit 1
    }
    catch {AgtSetSessionLabel $session $label}
}
if {[catch {AgtConnect $session} r]} {
    puts "{\"ok\":false,\"error\":\"connect: $r\"}"; exit 1
}

set reserved {}
set failed {}
foreach p $ports {
    if {[catch {AgtInvoke AgtPortSelector AddPort $module $p} h]} {
        lappend failed "\"$module/$p\""
    } else {
        lappend reserved "\"$module/$p\""
    }
}
# 세션은 닫지 않고 유지 — 다음 단계(스트림/트래픽)에서 AgtConnect 로 재연결
puts "{\"ok\":true,\"session\":$session,\"label\":\"$label\",\"reserved\":\[[join $reserved ,]\],\"failed\":\[[join $failed ,]\]}"
exit 0
