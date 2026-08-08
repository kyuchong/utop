# N2X relay (PowerShell) - no install. No ConvertTo-Json/ConvertFrom-Json
# (some Windows Server PowerShell builds miss or mishandle them). We forward the
# daemon's raw JSON line verbatim, and build small JSON by hand.
#
# Run (admin PowerShell), keep n2x_daemon.tcl reachable:
#   powershell -ExecutionPolicy Bypass -File n2x_relay.ps1 -Key mykey123 -Tclsh "C:\Program Files (x86)\N2xTcl85\bin\n2xtclsh85.exe" -Daemon "C:\utop-n2x\n2x\n2x_daemon.tcl"
# Firewall: allow TCP 5099 inbound.

param(
    [int]$Port = 5099,
    [string]$Key = $env:N2X_RELAY_KEY,
    [string]$Tclsh = $(if ($env:N2X_TCLSH) { $env:N2X_TCLSH } else { "C:\Program Files (x86)\N2xTcl85\bin\n2xtclsh85.exe" }),
    [string]$Daemon = ""
)

$ErrorActionPreference = "Stop"

if (-not $Daemon) {
    $dir = $PSScriptRoot
    if (-not $dir -and $PSCommandPath) { $dir = Split-Path -Parent $PSCommandPath }
    if (-not $dir -and $MyInvocation.MyCommand.Path) { $dir = Split-Path -Parent $MyInvocation.MyCommand.Path }
    if (-not $dir) { $dir = (Get-Location).Path }
    $Daemon = Join-Path $dir "n2x_daemon.tcl"
}

$script:daemons = @{}

function Esc([string]$s) {
    if ($null -eq $s) { return "" }
    $s.Replace("\", "\\").Replace('"', '\"').Replace("`r", "").Replace("`n", "\n").Replace("`t", " ")
}
function ErrJson([string]$msg) { return '{"ok":false,"error":"' + (Esc $msg) + '"}' }

function Field([string]$body, [string]$name) {
    $m = [regex]::Match($body, '"' + $name + '"\s*:\s*"((?:[^"\\]|\\.)*)"')
    if ($m.Success) { return $m.Groups[1].Value.Replace('\"', '"').Replace('\\', '\') }
    return ""
}

function Start-Daemon($server, $label) {
    if (-not (Test-Path $Tclsh))  { return @{ error = "n2xtclsh not found: $Tclsh" } }
    if (-not (Test-Path $Daemon)) { return @{ error = "n2x_daemon.tcl not found: $Daemon" } }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Tclsh
    $psi.Arguments = "`"$Daemon`" $server $label"
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput  = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $t = $p.StandardOutput.ReadLineAsync()
    if (-not $t.Wait(45000)) {
        try { $p.Kill() } catch {}
        return @{ error = "N2X connect timeout - check chassis/server" }
    }
    $ready = $t.Result
    if ($ready -like '*"ready":false*') {
        try { $p.Kill() } catch {}
        return @{ error = "N2X session failed: $ready" }
    }
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
    if ($d.error) { return (ErrJson $d.error) }
    $p = $d.proc
    try {
        $p.StandardInput.WriteLine($cmd.TrimEnd())
        $p.StandardInput.Flush()
    } catch {
        $script:daemons.Remove("$server|$label")
        $d = Get-Daemon $server $label
        if ($d.error) { return (ErrJson $d.error) }
        $p = $d.proc
        $p.StandardInput.WriteLine($cmd.TrimEnd())
        $p.StandardInput.Flush()
    }
    $t = $p.StandardOutput.ReadLineAsync()
    if (-not $t.Wait(150000)) { return (ErrJson "N2X response timeout") }
    $line = $t.Result
    if (-not $line) { return (ErrJson "empty response from N2X") }
    return $line
}

function Write-Body($ctx, $code, [string]$json) {
    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ctx.Response.StatusCode = $code
    $ctx.Response.ContentType = "application/json; charset=utf-8"
    $ctx.Response.ContentLength64 = $buf.Length
    $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
    $ctx.Response.OutputStream.Close()
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")
try {
    $listener.Start()
} catch {
    Write-Host "Cannot open port $Port. Run as Administrator, or first run:"
    Write-Host "  netsh http add urlacl url=http://+:$Port/ user=Everyone"
    throw
}

Write-Host ("=" * 56)
Write-Host " N2X relay (PowerShell)  -  port $Port"
Write-Host ("  n2xtclsh : {0}  ({1})" -f $Tclsh, $(if (Test-Path $Tclsh) {"OK"} else {"MISSING!"}))
Write-Host ("  daemon   : {0}  ({1})" -f $Daemon, $(if (Test-Path $Daemon) {"OK"} else {"MISSING!"}))
Write-Host ("  key      : {0}" -f $(if ($Key) {"set"} else {"NONE - use -Key"}))
Write-Host ("=" * 56)
Write-Host "Listening. Waiting for requests on port $Port ..."

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $stamp = (Get-Date).ToString("HH:mm:ss")
    Write-Host "[$stamp] IN  $($req.HttpMethod) $($req.Url.AbsolutePath)"
    try {
        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -like "/health*") {
            $ok1 = if (Test-Path $Tclsh) { "true" } else { "false" }
            $ok2 = if (Test-Path $Daemon) { "true" } else { "false" }
            Write-Body $ctx 200 ('{"ok":true,"tclsh":' + $ok1 + ',"daemon":' + $ok2 + '}')
            continue
        }
        if ($req.HttpMethod -ne "POST" -or $req.Url.AbsolutePath -notlike "/api/n2x/send*") {
            Write-Body $ctx 404 (ErrJson "not found")
            continue
        }
        $body = (New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)).ReadToEnd()
        $rkey   = Field $body "key"
        $server = (Field $body "server").Trim()
        $label  = (Field $body "label").Trim(); if (-not $label) { $label = "utop" }
        $cmd    = (Field $body "cmd").Trim()
        if (-not $Key)          { Write-Body $ctx 503 (ErrJson "relay has no key (-Key)"); continue }
        if ($rkey -ne $Key)     { Write-Body $ctx 403 (ErrJson "bad key"); continue }
        if (-not $server -or -not $cmd) { Write-Body $ctx 400 (ErrJson "server and cmd required"); continue }
        Write-Host "[$stamp]     -> $cmd"
        $out = Send-Cmd $server $label $cmd
        Write-Host "[$stamp]     <- $out"
        Write-Body $ctx 200 $out
    } catch {
        try { Write-Body $ctx 500 (ErrJson "$_") } catch {}
    }
}
