# N2X 중계 (PowerShell 판) — 아무것도 설치하지 않는다.
#
# 왜 이게 있나
# -----------
# 윈도우 서버라 파이썬을 못 깐다. 그런데 PowerShell 과 .NET 은 윈도우에
# 원래 들어 있다. 그것만으로 중계를 세운다 — 다운로드도, 설치도 없다.
#
#   리눅스 백엔드(213) ──HTTP 5099──▶ (이 스크립트) ──▶ n2xtclsh85 ──▶ 섀시
#
# 하는 일은 파이썬 판(n2x_relay.py)과 똑같다. 리눅스가 HTTP 로 보낸 N2X
# 명령을 n2xtclsh85.exe 로 실행하고 결과를 돌려준다.
#
# 돌리기
# ------
#   1) 이 파일과 n2x_daemon.tcl 을 한 폴더에 둔다 (예: C:\utop-n2x)
#   2) 관리자 PowerShell 을 연다 (HttpListener 가 바깥 접속을 받으려면 필요)
#   3) 아래 한 줄:
#
#        powershell -ExecutionPolicy Bypass -File n2x_relay.ps1 -Key 아무값
#
#      N2X 경로가 기본과 다르면 -Tclsh 로 잡는다:
#        ... -File n2x_relay.ps1 -Key 아무값 -Tclsh "C:\Program Files (x86)\N2xTcl85\bin\n2xtclsh85.exe"
#
#   4) 방화벽에서 5099 인바운드(TCP) 를 연다.
#
# 리눅스(213) .env 에 같은 열쇠:
#   N2X_RELAY_URL=http://210.1.2.248:5099
#   N2X_RELAY_KEY=아무값
# 그리고  docker compose up -d api

param(
    [int]$Port = 5099,
    [string]$Key = $env:N2X_RELAY_KEY,
    [string]$Tclsh = $(if ($env:N2X_TCLSH) { $env:N2X_TCLSH } else { "C:\Program Files (x86)\N2xTcl85\bin\n2xtclsh85.exe" }),
    [string]$Daemon = $(Join-Path $PSScriptRoot "n2x_daemon.tcl")
)

$ErrorActionPreference = "Stop"

# server|label -> System.Diagnostics.Process (데몬 하나를 살려 둔다)
$script:daemons = @{}

function Start-Daemon($server, $label) {
    if (-not (Test-Path $Tclsh))  { return @{ error = "n2xtclsh 없음: $Tclsh" } }
    if (-not (Test-Path $Daemon)) { return @{ error = "n2x_daemon.tcl 없음: $Daemon" } }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Tclsh
    $psi.Arguments = "`"$Daemon`" $server $label"
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput  = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    # ready 한 줄 대기 (최대 45초)
    $t = $p.StandardOutput.ReadLineAsync()
    if (-not $t.Wait(45000)) {
        try { $p.Kill() } catch {}
        return @{ error = "N2X 연결 시간 초과 — 섀시·서버 확인" }
    }
    $ready = $t.Result
    try {
        $rj = $ready | ConvertFrom-Json
        if ($rj.ready -eq $false) {
            try { $p.Kill() } catch {}
            return @{ error = "N2X 세션 연결 실패: $($rj.error)" }
        }
    } catch {}
    return @{ proc = $p }
}

function Get-Daemon($server, $label) {
    $k = "$server|$label"
    $d = $script:daemons[$k]
    if ($d -and -not $d.HasExited) { return @{ proc = $d } }
    if ($d) { $script:daemons.Remove($k) }
    $nd = Start-Daemon $server $label
    if ($nd.error) { return $nd }
    $script:daemons[$k] = $nd.proc
    return $nd
}

function Send-Cmd($server, $label, $cmd) {
    $d = Get-Daemon $server $label
    if ($d.error) { return @{ ok = $false; error = $d.error } }
    $p = $d.proc
    try {
        $p.StandardInput.WriteLine($cmd.TrimEnd())
        $p.StandardInput.Flush()
    } catch {
        # 죽었으면 한 번 다시
        $script:daemons.Remove("$server|$label")
        $d = Get-Daemon $server $label
        if ($d.error) { return @{ ok = $false; error = $d.error } }
        $p = $d.proc
        $p.StandardInput.WriteLine($cmd.TrimEnd())
        $p.StandardInput.Flush()
    }
    # 응답 한 줄 (ports 45초, traffic 60초까지 — 넉넉히 150초)
    $t = $p.StandardOutput.ReadLineAsync()
    if (-not $t.Wait(150000)) {
        return @{ ok = $false; error = "N2X 응답 시간 초과" }
    }
    $line = $t.Result
    try { return ($line | ConvertFrom-Json) }
    catch { return @{ ok = $false; error = "응답을 못 읽음: $line" } }
}

function Write-Json($ctx, $code, $obj) {
    $json = $obj | ConvertTo-Json -Depth 20 -Compress
    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ctx.Response.StatusCode = $code
    $ctx.Response.ContentType = "application/json; charset=utf-8"
    $ctx.Response.ContentLength64 = $buf.Length
    $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
    $ctx.Response.OutputStream.Close()
}

# ── HTTP ────────────────────────────────────────────────────────
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")
try {
    $listener.Start()
} catch {
    Write-Host "포트 $Port 를 못 열었습니다. 관리자 PowerShell 로 실행하거나,"
    Write-Host "미리 다음을 한 번 돌리세요:"
    Write-Host "  netsh http add urlacl url=http://+:$Port/ user=Everyone"
    throw
}

Write-Host ("=" * 56)
Write-Host " N2X 중계 (PowerShell)  ·  포트 $Port"
Write-Host ("  n2xtclsh : {0}  ({1})" -f $Tclsh, $(if (Test-Path $Tclsh) {"있음"} else {"없음!"}))
Write-Host ("  daemon   : {0}  ({1})" -f $Daemon, $(if (Test-Path $Daemon) {"있음"} else {"없음!"}))
Write-Host ("  열쇠     : {0}" -f $(if ($Key) {"정해짐"} else {"없음 — -Key 로 넣으세요!"}))
Write-Host ("=" * 56)

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $stamp = (Get-Date).ToString("HH:mm:ss")
    try {
        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -like "/health*") {
            Write-Json $ctx 200 @{ ok = $true; tclsh = (Test-Path $Tclsh); daemon = (Test-Path $Daemon) }
            continue
        }
        if ($req.HttpMethod -ne "POST" -or $req.Url.AbsolutePath -notlike "/api/n2x/send*") {
            Write-Json $ctx 404 @{ ok = $false; error = "not found" }
            continue
        }
        $body = (New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)).ReadToEnd()
        $d = $body | ConvertFrom-Json
        if (-not $Key) { Write-Json $ctx 503 @{ ok = $false; error = "이 중계에 열쇠(-Key)가 없습니다" }; continue }
        if ("$($d.key)" -ne $Key) { Write-Json $ctx 403 @{ ok = $false; error = "열쇠가 맞지 않습니다" }; continue }
        $server = "$($d.server)".Trim()
        $label  = if ($d.label) { "$($d.label)".Trim() } else { "utop" }
        $cmd    = "$($d.cmd)".Trim()
        if (-not $server -or -not $cmd) { Write-Json $ctx 400 @{ ok = $false; error = "server 와 cmd 가 필요" }; continue }
        Write-Host "[$stamp] $cmd"
        Write-Json $ctx 200 (Send-Cmd $server $label $cmd)
    } catch {
        try { Write-Json $ctx 500 @{ ok = $false; error = "$_" } } catch {}
    }
}
