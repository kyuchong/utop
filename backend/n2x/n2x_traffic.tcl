# N2X 트래픽 — 계정(레이블) 세션 + 포트 + 스트림 + 전송 + 통계 → JSON
# 사용법: n2xtclsh85 n2x_traffic.tcl <server> <label> <module> <txPort> <rxPort> <pps> <numPackets> <durSec> <frameBytes>
lappend auto_path "C:/N2xTcl85/lib"
foreach pkg {AgtClient AgtCommon} { if {[catch {package require $pkg} e]} { puts "{\"ok\":false,\"error\":\"pkg: $e\"}"; exit 1 } }
set server  [lindex $argv 0]
set label   [lindex $argv 1]
set module  [lindex $argv 2]
set txPort  [lindex $argv 3]
set rxPort  [lindex $argv 4]
set pps     [lindex $argv 5]
set npkt    [lindex $argv 6]
set dur     [lindex $argv 7]
set fbytes  [lindex $argv 8]
if {$pps eq ""}    { set pps 1000 }
if {$npkt eq ""}   { set npkt 0 }
if {$dur eq ""}    { set dur 5 }
if {$fbytes eq ""} { set fbytes 64 }
AgtSetServerHostname $server

# 1) 세션: 같은 레이블 있으면 재사용
set session ""
if {![catch {SmInvoke AgtSessionManager ListOpenSessions} openSes]} {
    foreach s $openSes { if {![catch {SmInvoke AgtSessionManager GetSessionLabel $s} lb] && $lb eq $label} { set session $s; break } }
}
if {$session eq ""} {
    if {[catch {AgtOpenSession RouterTester900 AGT_SESSION_ONLINE} session]} { puts "{\"ok\":false,\"error\":\"session: $session\"}"; exit 1 }
    catch {AgtSetSessionLabel $session $label}
}
if {[catch {AgtConnect $session} r]} { puts "{\"ok\":false,\"error\":\"connect: $r\"}"; exit 1 }

# 2) 포트 (송신 tx, 수신 rx)
if {[catch {AgtInvoke AgtPortSelector AddPort $module $txPort} hTx]} { puts "{\"ok\":false,\"error\":\"txport $module/$txPort: $hTx\"}"; exit 1 }
if {[catch {AgtInvoke AgtPortSelector AddPort $module $rxPort} hRx]} { puts "{\"ok\":false,\"error\":\"rxport $module/$rxPort: $hRx\"}"; exit 1 }

# 3) 프로파일(rate) + 스트림 그룹
set hProfile [AgtInvoke AgtProfileList AddProfile $hTx AGT_CONSTANT_PROFILE]
AgtInvoke AgtConstantProfile SetAverageLoad $hProfile $pps AGT_UNITS_PACKETS_PER_SEC
if {$npkt > 0} { AgtInvoke AgtConstantProfile SetNumberOfPacketsToInject $hProfile $npkt }
set hParams [AgtInvoke AgtStreamGroupList AddStreamGroupsWithExistingProfile $hProfile AGT_PACKET_STREAM_GROUP 1]
set hSG [lindex $hParams 0]
AgtInvoke AgtStreamGroup SetExpectedDestinationPorts $hSG $hRx
AgtInvoke AgtStreamGroup SetPduHeaders $hSG {ethernet ipv4 udp}
catch {AgtInvoke AgtStreamGroup SetFrameLength $hSG AGT_FIXED_FRAME_LENGTH $fbytes}

# 4) 통계 선택 (TX/RX/손실/지연/순서이탈)
set hStats [AgtInvoke AgtStatisticsList Add AGT_STATISTICS]
AgtInvoke AgtStatistics SelectPorts $hStats [list $hTx $hRx]
set statList [list AGT_STREAM_PACKETS_TRANSMITTED AGT_STREAM_PACKETS_RECEIVED AGT_STREAM_PACKET_LOSS AGT_STREAM_AVERAGE_LATENCY AGT_STREAM_MISORDERED_PACKETS]
AgtInvoke AgtStatistics SelectStreamGroups $hStats $hSG
AgtInvoke AgtStatistics SelectStatistics $hStats $statList

# 5) 전송 시작 + 종료 대기
AgtInvoke AgtTestController SetTestMode AGT_TEST_ONCE
AgtInvoke AgtTestController SetTestDuration $dur
AgtInvoke AgtTestController StartTest
set st [AgtInvoke AgtTestController GetTestState]
set guard 0
while {$st ne "AGT_TEST_STOPPED" && $guard < [expr {$dur + 30}]} { after 1000; set st [AgtInvoke AgtTestController GetTestState]; incr guard }

# 6) 통계 조회 (statList 순서대로 반환)
if {[catch {AgtInvoke AgtStatistics GetStreamStatistics $hStats $hSG 0 $hRx} res]} { set res "" }
# 반환형식: "<n> {tx rx loss lat mis}" — 통계 값은 두번째 요소(리스트)에 들어있음
set statRow [lindex $res 1]
if {[llength $statRow] < 2} { set statRow $res }
set tx   [expr {int([lindex $statRow 0])}]
set rx   [expr {int([lindex $statRow 1])}]
set loss [expr {int([lindex $statRow 2])}]
set lat  [lindex $statRow 3]
if {[string is double -strict $lat]} { set lat [format %.2f $lat] }
set mis  [expr {int([lindex $statRow 4])}]
puts "{\"ok\":true,\"session\":$session,\"tx\":\"$tx\",\"rx\":\"$rx\",\"loss\":\"$loss\",\"latency\":\"$lat\",\"misorder\":\"$mis\",\"raw\":\"$res\"}"
exit 0
