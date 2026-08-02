# N2X 포트 예약 해제 — 계정(레이블) 세션에서 포트 RemovePort
# 사용법: n2xtclsh85 n2x_release.tcl <server> <label> <module> <port>
lappend auto_path "C:/N2xTcl85/lib"
foreach pkg {AgtClient AgtCommon} { if {[catch {package require $pkg} e]} { puts "{\"ok\":false,\"error\":\"pkg: $e\"}"; exit 1 } }
set server [lindex $argv 0]
set label  [lindex $argv 1]
set module [lindex $argv 2]
set port   [lindex $argv 3]
AgtSetServerHostname $server

set session ""
if {![catch {SmInvoke AgtSessionManager ListOpenSessions} openSes]} {
    foreach s $openSes { if {![catch {SmInvoke AgtSessionManager GetSessionLabel $s} lb] && $lb eq $label} { set session $s; break } }
}
if {$session eq ""} { puts "{\"ok\":false,\"error\":\"session($label) not found\"}"; exit 1 }
if {[catch {AgtConnect $session} r]} { puts "{\"ok\":false,\"error\":\"connect: $r\"}"; exit 1 }

if {[catch {AgtInvoke AgtPortSelector FindPortHandle $module $port} h]} { puts "{\"ok\":false,\"error\":\"findport $module/$port: $h\"}"; exit 1 }
if {[catch {AgtInvoke AgtPortSelector RemovePort $h} rr]} { puts "{\"ok\":false,\"error\":\"remove: $rr\"}"; exit 1 }
puts "{\"ok\":true,\"released\":\"$module/$port\"}"
exit 0
