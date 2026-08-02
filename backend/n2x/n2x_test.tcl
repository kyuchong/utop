# N2X 포트 reserve 검증 — 모듈 4102 포트 9,10 예약 시도 후 즉시 해제(PoC)
lappend auto_path "C:/N2xTcl85/lib"
foreach pkg {AgtClient AgtCommon} { if {[catch {package require $pkg} e]} { puts "PKG_FAIL $pkg: $e"; exit 1 } }
puts "PKG_OK"
AgtSetServerHostname 210.1.2.248

if {[catch {AgtOpenSession RouterTester900 AGT_SESSION_ONLINE} session]} { puts "SESSION_FAIL: $session"; exit 1 }
puts "SESSION_CREATED: $session"
catch {AgtSetSessionLabel $session 2}
if {[catch {AgtConnect $session} r]} { puts "CONNECT_WARN: $r" }

# 모듈 4102 포트 1~16 가용성 스캔 (AddPort 시도 후 즉시 해제)
for {set p 1} {$p <= 16} {incr p} {
    if {[catch {AgtInvoke AgtPortSelector AddPort 4102 $p} h]} {
        puts "PORT 4102/$p : LOCKED"
    } else {
        puts "PORT 4102/$p : AVAILABLE"
        catch {AgtInvoke AgtPortSelector RemovePort $h}
    }
}

# PoC 정리: 포트 해제 + 세션 닫기
catch {AgtRemoveAllPorts}
catch {AgtCloseSession $session}
puts "DONE (reserve 검증 후 해제)"
exit 0
