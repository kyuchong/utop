# N2X 영구 세션 데몬 — 한 번 연결 후 세션 유지. stdin 명령(한 줄) → stdout JSON(한 줄)
# 사용법: n2xtclsh85 n2x_daemon.tcl <server> <label>
# 명령: ports | reserve <mod> <port> | release <mod> <port>
#       traffic <mod> <tx> <rx> <pps> <npkt> <dur> <frame> | ping | quit
lappend auto_path "C:/N2xTcl85/lib"
if {[catch {package require AgtClient; package require AgtCommon} e]} { puts "{\"ready\":false,\"error\":\"pkg\"}"; flush stdout; exit 1 }
set server [lindex $argv 0]
set label  [lindex $argv 1]
if {$label eq ""} { set label "utop" }
AgtSetServerHostname $server
proc jstr {s} { return [string map {\\ \\\\ \" \\\" \n \\n \r {} \t { }} $s] }

# 세션 연결 (있으면 재사용, 없으면 생성) — 이후 계속 유지
set session ""
if {![catch {SmInvoke AgtSessionManager ListOpenSessions} ses]} {
    foreach s $ses { if {![catch {SmInvoke AgtSessionManager GetSessionLabel $s} lb] && $lb eq $label} { set session $s; break } }
}
if {$session eq ""} {
    if {[catch {AgtOpenSession RouterTester900 AGT_SESSION_ONLINE} session]} { puts "{\"ready\":false,\"error\":\"[jstr $session]\"}"; flush stdout; exit 1 }
    catch {AgtSetSessionLabel $session $label}
}
if {[catch {AgtConnect $session} r]} { puts "{\"ready\":false,\"error\":\"[jstr $r]\"}"; flush stdout; exit 1 }
puts "{\"ready\":true,\"session\":$session}"; flush stdout

proc cmd_ports {} {
    global session label
    array set sl {}
    if {![catch {SmInvoke AgtSessionManager ListOpenSessions} ses]} { foreach s $ses { if {![catch {SmInvoke AgtSessionManager GetSessionLabel $s} lb]} { set sl($s) $lb } } }
    set modJson {}
    if {![catch {SmInvoke AgtModuleManager ListModules} mods]} {
        foreach mod $mods {
            set sn "?"; set mst "?"; set de "? 0"
            catch {SmInvoke AgtModuleManager GetSerialNumber $mod} sn
            catch {SmInvoke AgtModuleManager GetModuleState $sn} mst
            catch {SmInvoke AgtModuleManager GetModuleDescription $sn} de
            set card [lindex $de 0]; set pc [lindex $de 1]
            if {![string is integer -strict $pc]} { set pc 0 }
            set portJson {}
            if {$mst ne "AGT_MODULE_NOT_RESPONDING"} {
                for {set p 1} {$p <= $pc} {incr p} {
                    set pst "?"; set plock "0"
                    catch {AgtInvoke AgtPortSelector GetPortState $mod $p} pst
                    catch {AgtInvoke AgtPortSelector GetPortLock $mod $p} plock
                    set mine [expr {($plock ne "0" && $plock eq $session) ? 1 : 0}]
                    set ll ""; if {$plock ne "0" && [info exists sl($plock)]} { set ll $sl($plock) }
                    set avail [expr {($plock eq "0") ? 1 : 0}]
                    lappend portJson "{\"port\":$p,\"state\":\"$pst\",\"lock\":\"$plock\",\"label\":\"[jstr $ll]\",\"mine\":$mine,\"avail\":$avail}"
                }
            }
            lappend modJson "{\"id\":$mod,\"card\":\"$card\",\"ports\":$pc,\"state\":\"$mst\",\"portList\":\[[join $portJson ,]\]}"
        }
    }
    return "{\"ok\":true,\"session\":$session,\"label\":\"[jstr $label]\",\"modules\":\[[join $modJson ,]\]}"
}
proc getPort {mod port} {
    if {![catch {AgtInvoke AgtPortSelector AddPort $mod $port} h]} { return $h }
    if {![catch {AgtInvoke AgtPortSelector FindPortHandle $mod $port} h2]} { return $h2 }
    return ""
}
proc cmd_traffic {mod tx rx pps npkt dur fb} {
    global session
    set hTx [getPort $mod $tx]; set hRx [getPort $mod $rx]
    if {$hTx eq "" || $hRx eq ""} { return "{\"ok\":false,\"error\":\"port add fail\"}" }
    catch {AgtInvoke AgtTrafficList RemoveAll}
    set hProfile [AgtInvoke AgtProfileList AddProfile $hTx AGT_CONSTANT_PROFILE]
    AgtInvoke AgtConstantProfile SetAverageLoad $hProfile $pps AGT_UNITS_PACKETS_PER_SEC
    if {$npkt > 0} { AgtInvoke AgtConstantProfile SetNumberOfPacketsToInject $hProfile $npkt }
    set hParams [AgtInvoke AgtStreamGroupList AddStreamGroupsWithExistingProfile $hProfile AGT_PACKET_STREAM_GROUP 1]
    set hSG [lindex $hParams 0]
    AgtInvoke AgtStreamGroup SetExpectedDestinationPorts $hSG $hRx
    AgtInvoke AgtStreamGroup SetPduHeaders $hSG {ethernet ipv4 udp}
    catch {AgtInvoke AgtStreamGroup SetFrameLength $hSG AGT_FIXED_FRAME_LENGTH $fb}
    set hStats [AgtInvoke AgtStatisticsList Add AGT_STATISTICS]
    AgtInvoke AgtStatistics SelectPorts $hStats [list $hTx $hRx]
    AgtInvoke AgtStatistics SelectStreamGroups $hStats $hSG
    AgtInvoke AgtStatistics SelectStatistics $hStats [list AGT_STREAM_PACKETS_TRANSMITTED AGT_STREAM_PACKETS_RECEIVED AGT_STREAM_PACKET_LOSS AGT_STREAM_AVERAGE_LATENCY AGT_STREAM_MISORDERED_PACKETS]
    AgtInvoke AgtTestController SetTestMode AGT_TEST_ONCE
    AgtInvoke AgtTestController SetTestDuration $dur
    AgtInvoke AgtTestController StartTest
    set st [AgtInvoke AgtTestController GetTestState]; set g 0
    while {$st ne "AGT_TEST_STOPPED" && $g < [expr {$dur+30}]} { after 1000; set st [AgtInvoke AgtTestController GetTestState]; incr g }
    set res ""; catch {AgtInvoke AgtStatistics GetStreamStatistics $hStats $hSG 0 $hRx} res
    set row [lindex $res 1]; if {[llength $row] < 2} { set row $res }
    set txn [expr {int([lindex $row 0])}]; set rxn [expr {int([lindex $row 1])}]; set ls [expr {int([lindex $row 2])}]
    set lt [lindex $row 3]; if {[string is double -strict $lt]} { set lt [format %.2f $lt] }
    set ms [expr {int([lindex $row 4])}]
    return "{\"ok\":true,\"tx\":\"$txn\",\"rx\":\"$rxn\",\"loss\":\"$ls\",\"latency\":\"$lt\",\"misorder\":\"$ms\"}"
}

# 다중 스트림 — 각 spec="txM,txP,rxM,rxP,proto,frame,pps,npkt,srcMac,dstMac,srcIp,dstIp" (빈값/-=미설정)
set ::g_sg {}; set ::g_hStats ""    ;# 비동기 전송용 전역 상태 (구성된 스트림그룹/통계 핸들)
set ::g_badPorts {}                  ;# 핸들을 못 잡은 포트 — 에러에 적어 준다
set ::g_statKeys {}                  ;# 실제 선택된 통계 항목(이름 순서) — GetStreamStatistics 행 매핑용
# 통계 항목을 풍부하게 선택(지연 min/max·송수신 바이트). 상수 미지원이면 단계적으로 폴백.
proc _select_stats {hStats} {
    # N2X Setup Measurements→Streams 열 순서. 각 필드는 후보 상수 중 이 빌드에서 유효한 것을 채택.
    set want [list \
        {tx     AGT_STREAM_PACKETS_TRANSMITTED} \
        {rx     AGT_STREAM_PACKETS_RECEIVED} \
        {txoct  {AGT_STREAM_TEST_OCTETS_TRANSMITTED AGT_STREAM_OCTETS_TRANSMITTED AGT_STREAM_BYTES_TRANSMITTED}} \
        {rxoct  {AGT_STREAM_TEST_OCTETS_RECEIVED AGT_STREAM_OCTETS_RECEIVED AGT_STREAM_BYTES_RECEIVED}} \
        {txtput {AGT_STREAM_TEST_THROUGHPUT_TRANSMITTED AGT_STREAM_TRANSMIT_THROUGHPUT AGT_STREAM_THROUGHPUT_TRANSMITTED}} \
        {rxtput {AGT_STREAM_TEST_THROUGHPUT_RECEIVED AGT_STREAM_RECEIVE_THROUGHPUT AGT_STREAM_THROUGHPUT_RECEIVED}} \
        {loss   AGT_STREAM_PACKET_LOSS} \
        {lat    AGT_STREAM_AVERAGE_LATENCY} \
        {seq    {AGT_STREAM_SEQUENCE_ERRORS AGT_STREAM_MISORDERED_PACKETS}}]
    set chosen {}; set keymap {}
    foreach item $want {
        set field [lindex $item 0]
        foreach c [lindex $item 1] {
            if {![catch {AgtInvoke AgtStatistics SelectStatistics $hStats [concat $chosen $c]}]} {
                lappend chosen $c; lappend keymap $field; break
            }
        }
    }
    if {![llength $chosen]} {
        set chosen [list AGT_STREAM_PACKETS_TRANSMITTED AGT_STREAM_PACKETS_RECEIVED AGT_STREAM_PACKET_LOSS AGT_STREAM_AVERAGE_LATENCY AGT_STREAM_MISORDERED_PACKETS]
        set keymap [list tx rx loss lat seq]
        catch {AgtInvoke AgtStatistics SelectStatistics $hStats $chosen}
    }
    set ::g_statKeys $keymap
}
# 부하 단위 → AGT 상수 후보.
#
# 화면에서 「100 Percent」 를 넣어도 여기서 pps 로 박아 보내고 있었다 —
# 100pps 가 나갔다. 단위마다 상수 이름이 빌드별로 조금씩 달라서, 통계
# 항목을 고를 때처럼 후보를 늘어놓고 되는 것을 쓴다.
proc _load_units {unit} {
    set u [string tolower [string trim $unit]]
    if {[string match "*percent*" $u] || [string match "*%*" $u]} {
        return {AGT_UNITS_PERCENT_MAX_RATE AGT_UNITS_PERCENT AGT_UNITS_PERCENT_LINE_RATE}
    }
    if {[string match "*mbps*" $u] || [string match "*mb/s*" $u]} {
        return {AGT_UNITS_MEGABITS_PER_SEC AGT_UNITS_MBITS_PER_SEC AGT_UNITS_BITS_PER_SEC}
    }
    if {$u eq "bps" || [string match "*bits*" $u]} {
        return {AGT_UNITS_BITS_PER_SEC}
    }
    # fps · frames/sec · 빈값 — 예전부터 쓰던 기본
    return {AGT_UNITS_PACKETS_PER_SEC AGT_UNITS_FRAMES_PER_SEC}
}

# 스트림 구성 (StartTest 직전까지). 전역 ::g_sg/::g_hStats 에 저장. 반환=스트림 수
# NOTE: 이전 세션에 트래픽이 남아 있으면 "Cannot add ... list is in use" 에러 발생 →
#       StopTest 후 실제로 STOPPED 상태가 될 때까지 폴링, 리스트 잠금 해제 확실히 대기.
proc _build_streams {specs} {
    set ::g_badPorts {}
    catch {AgtInvoke AgtTestController StopTest}
    # 테스트가 실제로 STOPPED 될 때까지 최대 5초 폴링 (RemoveAll 이 잠긴 리스트에서 실패하는 것 방지)
    set _tries 0
    while {$_tries < 50} {
        set _st ""; catch {AgtInvoke AgtTestController GetTestState} _st
        if {$_st eq "AGT_TEST_STOPPED" || $_st eq ""} break
        after 100
        incr _tries
    }
    after 200
    # RemoveAll 을 여러 번 시도 — 첫 시도가 잠금으로 실패해도 다음에는 성공하도록
    set _rmTries 0
    while {$_rmTries < 3} {
        set _ok1 1; set _ok2 1; set _ok3 1
        if {[catch {AgtInvoke AgtStatisticsList RemoveAll}]} { set _ok1 0 }
        if {[catch {AgtInvoke AgtTrafficList RemoveAll}]} { set _ok2 0 }
        if {[catch {AgtInvoke AgtStreamGroupList RemoveAllStreamGroups}]} { set _ok3 0 }
        if {$_ok1 && $_ok2 && $_ok3} break
        after 200
        catch {AgtInvoke AgtTestController StopTest}
        incr _rmTries
    }
    # AgtProfileList 도 정리 — 이번 에러의 실제 원인 (프로필 리스트가 잠긴 상태)
    catch {
        foreach _pt [AgtInvoke AgtPortSelector GetSelectedPorts] {
            catch { foreach _hp [AgtInvoke AgtProfileList ListProfilesOnPort $_pt] { catch {AgtInvoke AgtProfileList Remove $_hp} } }
        }
    }
    set sgInfo {}; set allPorts {}; set idx 0
    foreach spec $specs {
        set f [split $spec ,]
        set txM [lindex $f 0]; set txP [lindex $f 1]; set rxM [lindex $f 2]; set rxP [lindex $f 3]
        set proto [lindex $f 4]; set frame [lindex $f 5]; set pps [lindex $f 6]; set npkt [lindex $f 7]
        set srcMac [lindex $f 8]; set dstMac [lindex $f 9]; set srcIp [lindex $f 10]; set dstIp [lindex $f 11]
        set unit [lindex $f 12]
        set hTx [getPort $txM $txP]; set hRx [getPort $rxM $rxP]
        if {$hTx eq ""} { lappend ::g_badPorts "$txM/$txP" }
        if {$hRx eq ""} { lappend ::g_badPorts "$rxM/$rxP" }
        if {$hTx eq "" || $hRx eq ""} continue
        lappend allPorts $hTx $hRx
        if {$pps eq ""} { set pps 1000 }
        set unitCands [_load_units $unit]
        catch { foreach _hp [AgtInvoke AgtProfileList ListProfilesOnPort $hTx] { catch {AgtInvoke AgtProfileList Remove $_hp} } }
        set hProfile [AgtInvoke AgtProfileList AddProfile $hTx AGT_CONSTANT_PROFILE]
        # 단위마다 상수 이름이 빌드별로 다르다. 되는 것이 나올 때까지 넣어
        # 보고, 다 안 되면 pps 로 떨어뜨린다 — 아무것도 안 보내는 것보다 낫다.
        set _lset 0
        foreach _u $unitCands {
            if {![catch {AgtInvoke AgtConstantProfile SetAverageLoad $hProfile $pps $_u}]} { set _lset 1; break }
        }
        if {!$_lset} { AgtInvoke AgtConstantProfile SetAverageLoad $hProfile $pps AGT_UNITS_PACKETS_PER_SEC }
        if {$npkt ne "" && $npkt > 0} { AgtInvoke AgtConstantProfile SetNumberOfPacketsToInject $hProfile $npkt }
        set hParams [AgtInvoke AgtStreamGroupList AddStreamGroupsWithExistingProfile $hProfile AGT_PACKET_STREAM_GROUP 1]
        set hSG [lindex $hParams 0]; set hPdu [lindex $hParams 1]
        AgtInvoke AgtStreamGroup SetExpectedDestinationPorts $hSG $hRx
        set hdr "ethernet ipv4 udp"
        if {$proto eq "tcp"} { set hdr "ethernet ipv4 tcp" } elseif {$proto eq "ipv4"} { set hdr "ethernet ipv4" } elseif {$proto eq "eth"} { set hdr "ethernet" }
        AgtInvoke AgtStreamGroup SetPduHeaders $hSG $hdr
        if {$frame ne "" && $frame > 0} { catch {AgtInvoke AgtStreamGroup SetFrameLength $hSG AGT_FIXED_FRAME_LENGTH $frame} }
        if {$srcMac ne "" && $srcMac ne "-"} { catch {AgtInvoke AgtPduHeader SetFieldFixedValue $hPdu ethernet 1 source_address $srcMac} }
        if {$dstMac ne "" && $dstMac ne "-"} { catch {AgtInvoke AgtPduHeader SetFieldFixedValue $hPdu ethernet 1 destination_address $dstMac} }
        if {$srcIp ne "" && $srcIp ne "-"} { catch {AgtInvoke AgtPduHeader SetFieldFixedValue $hPdu ipv4 1 source_address $srcIp} }
        if {$dstIp ne "" && $dstIp ne "-"} { catch {AgtInvoke AgtPduHeader SetFieldFixedValue $hPdu ipv4 1 destination_address $dstIp} }
        lappend sgInfo [list $hSG $hRx $idx]
        incr idx
    }
    if {![llength $sgInfo]} { set ::g_sg {}; set ::g_hStats ""; return 0 }
    set hStats [AgtInvoke AgtStatisticsList Add AGT_STATISTICS]
    set uniq {}; foreach p $allPorts { if {[lsearch $uniq $p] < 0} { lappend uniq $p } }
    AgtInvoke AgtStatistics SelectPorts $hStats $uniq
    set _allSG {}; foreach si $sgInfo { lappend _allSG [lindex $si 0] }
    AgtInvoke AgtStatistics SelectStreamGroups $hStats $_allSG
    _select_stats $hStats
    set ::g_sg $sgInfo; set ::g_hStats $hStats
    return [llength $sgInfo]
}
# 현재 통계 읽기 → JSON streams 요소들(콤마 join 안 한 상태) 반환
proc _read_stats {} {
    if {$::g_hStats eq ""} { return "" }
    set keys $::g_statKeys
    if {![llength $keys]} { set keys [list tx rx loss lat seq] }
    set rows {}
    foreach si $::g_sg {
        set hSG [lindex $si 0]; set hRx [lindex $si 1]; set ix [lindex $si 2]
        set res ""; catch {AgtInvoke AgtStatistics GetStreamStatistics $::g_hStats $hSG 0 $hRx} res
        set row [lindex $res 1]; if {[llength $row] < 2} { set row $res }
        array set V {tx 0 rx 0 txoct - rxoct - txtput - rxtput - loss 0 lat 0 seq 0}
        for {set k 0} {$k < [llength $keys]} {incr k} {
            set f [lindex $keys $k]; set v [lindex $row $k]
            if {![string is double -strict $v]} continue
            switch -- $f {
                tx     { set V(tx)   [expr {int($v)}] }
                rx     { set V(rx)   [expr {int($v)}] }
                loss   { set V(loss) [expr {int($v)}] }
                seq    { set V(seq)  [expr {int($v)}] }
                txoct  { set V(txoct) [expr {wide($v)}] }
                rxoct  { set V(rxoct) [expr {wide($v)}] }
                lat    { set V(lat)    [format %.2f $v] }
                txtput { set V(txtput) [format %.3f $v] }
                rxtput { set V(rxtput) [format %.3f $v] }
            }
        }
        lappend rows "{\"idx\":$ix,\"tx\":$V(tx),\"rx\":$V(rx),\"txOct\":\"$V(txoct)\",\"rxOct\":\"$V(rxoct)\",\"txTput\":\"$V(txtput)\",\"rxTput\":\"$V(rxtput)\",\"loss\":$V(loss),\"latency\":\"$V(lat)\",\"misorder\":$V(seq)}"
    }
    return [join $rows ,]
}
# 동기(기존 호환): 구성 + StartTest + 종료까지 대기 + 통계
proc cmd_traffic_multi {dur specs} {
    if {[_build_streams $specs] == 0} { return "{\"ok\":false,\"error\":\"no_valid_stream\",\"badPorts\":\"[join $::g_badPorts ,]\"}" }
    AgtInvoke AgtTestController SetTestMode AGT_TEST_ONCE
    AgtInvoke AgtTestController SetTestDuration $dur
    AgtInvoke AgtTestController StartTest
    set st [AgtInvoke AgtTestController GetTestState]; set g 0
    while {$st ne "AGT_TEST_STOPPED" && $g < [expr {$dur+30}]} { after 1000; set st [AgtInvoke AgtTestController GetTestState]; incr g }
    return "{\"ok\":true,\"streams\":\[[_read_stats]\]}"
}
# 비동기 시작 — 구성 + StartTest 후 즉시 리턴(대기 X). dur 비거나 0이면 사실상 연속(1시간)
proc cmd_tstart {dur specs} {
    if {[_build_streams $specs] == 0} { return "{\"ok\":false,\"error\":\"no_valid_stream\",\"badPorts\":\"[join $::g_badPorts ,]\"}" }
    AgtInvoke AgtTestController SetTestMode AGT_TEST_ONCE
    if {$dur ne "" && $dur > 0} { AgtInvoke AgtTestController SetTestDuration $dur } else { AgtInvoke AgtTestController SetTestDuration 3600 }
    AgtInvoke AgtTestController StartTest
    return "{\"ok\":true,\"started\":true,\"count\":[llength $::g_sg]}"
}
# 비동기 통계 — 실시간 폴링용 (전송 중에도 조회)
proc cmd_tstat {} {
    if {$::g_hStats eq ""} { return "{\"ok\":true,\"state\":\"idle\",\"running\":false,\"streams\":\[\]}" }
    set st ""; catch {AgtInvoke AgtTestController GetTestState} st
    set run "true"; if {$st eq "AGT_TEST_STOPPED" || $st eq ""} { set run "false" }
    return "{\"ok\":true,\"state\":\"$st\",\"running\":$run,\"keys\":\"[join $::g_statKeys ,]\",\"streams\":\[[_read_stats]\]}"
}
# 비동기 정지 — StopTest 후 누적 통계 반환
proc cmd_tstop {} {
    catch {AgtInvoke AgtTestController StopTest}
    return "{\"ok\":true,\"stopped\":true,\"keys\":\"[join $::g_statKeys ,]\",\"streams\":\[[_read_stats]\]}"
}
# 클리어 — 정지 + 통계/구성 제거(다음 start 시 0부터)
proc cmd_tclear {} {
    catch {AgtInvoke AgtTestController StopTest}
    catch {AgtInvoke AgtStatisticsList RemoveAll}
    catch {AgtInvoke AgtTrafficList RemoveAll}
    catch {AgtInvoke AgtStreamGroupList RemoveAllStreamGroups}
    set ::g_sg {}; set ::g_hStats ""
    return "{\"ok\":true,\"cleared\":true}"
}

while {[gets stdin line] >= 0} {
    set line [string trim $line]; if {$line eq ""} continue
    set parts [split $line]; set cmd [lindex $parts 0]
    if {$cmd eq "quit"} break
    if {[catch {
        switch -- $cmd {
            ping    { set out "{\"ok\":true,\"session\":$session}" }
            ports   { set out [cmd_ports] }
            reserve { if {[catch {AgtInvoke AgtPortSelector AddPort [lindex $parts 1] [lindex $parts 2]} h]} { set out "{\"ok\":false,\"error\":\"[jstr $h]\"}" } else { set out "{\"ok\":true,\"reserved\":\"[lindex $parts 1]/[lindex $parts 2]\"}" } }
            release { if {[catch {AgtInvoke AgtPortSelector FindPortHandle [lindex $parts 1] [lindex $parts 2]} h]} { set out "{\"ok\":false,\"error\":\"[jstr $h]\"}" } elseif {[catch {AgtInvoke AgtPortSelector RemovePort $h} rr]} { set out "{\"ok\":false,\"error\":\"[jstr $rr]\"}" } else { set out "{\"ok\":true,\"released\":\"[lindex $parts 1]/[lindex $parts 2]\"}" } }
            traffic { set out [cmd_traffic [lindex $parts 1] [lindex $parts 2] [lindex $parts 3] [lindex $parts 4] [lindex $parts 5] [lindex $parts 6] [lindex $parts 7]] }
            trun    { set out [cmd_traffic_multi [lindex $parts 1] [lrange $parts 2 end]] }
            tstart  { set out [cmd_tstart [lindex $parts 1] [lrange $parts 2 end]] }
            tstat   { set out [cmd_tstat] }
            tstop   { set out [cmd_tstop] }
            tclear  { set out [cmd_tclear] }
            default { set out "{\"ok\":false,\"error\":\"unknown\"}" }
        }
    } err]} { set out "{\"ok\":false,\"error\":\"[jstr $err]\"}" }
    puts $out; flush stdout
}
exit 0
