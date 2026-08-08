# N2X relay (PowerShell) - no install needed. Uses built-in .NET HttpListener.
# Run (admin PowerShell):
#   powershell -ExecutionPolicy Bypass -File n2x_relay.ps1 -Key mykey123 -Tclsh "C:\Program Files (x86)\N2xTcl85\bin\n2xtclsh85.exe"
# Keep n2x_daemon.tcl in the SAME folder. Open firewall TCP 5099 inbound.

param(
    [int]$Port = 5099,
    [string]$Key = $env:N2X_RELAY_KEY,
    [string]$Tclsh = $(if ($env:N2X_TCLSH) { $env:N2X_TCLSH } else { "C:\Program Files (x86)\N2xTcl85\bin\n2xtclsh85.exe" }),
    [string]$Daemon = ""
)

$ErrorActionPreference = "Stop"

# Resolve daemon path across PowerShell versions ($PSScriptRoot can be empty on old ones)
if (-not $Daemon) {
    $dir = $PSScriptRoot
    if (-not $dir -and $PSCommandPath) { $dir = Split-Path -Parent $PSCommandPath }
    if (-not $dir -and $MyInvocation.MyCommand.Path) { $dir = Split-Path -Parent $MyInvocation.MyCommand.Path }
    if (-not $dir) { $dir = (Get-Location).Path }
    $Daemon = Join-Path $dir "n2x_daemon.tcl"
}

$script:daemons = @{}

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
    try {
        $rj = $ready | ConvertFrom-Json
        if ($rj.ready -eq $false) {
            try { $p.Kill() } catch {}
            return @{ error = "N2X session failed: $($rj.error)" }
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
        $script:daemons.Remove("$server|$label")
        $d = Get-Daemon $server $label
        if ($d.error) { return @{ ok = $false; error = $d.error } }
        $p = $d.proc
        $p.StandardInput.WriteLine($cmd.TrimEnd())
        $p.StandardInput.Flush()
    }
    $t = $p.StandardOutput.ReadLineAsync()
    if (-not $t.Wait(150000)) {
        return @{ ok = $false; error = "N2X response timeout" }
    }
    $line = $t.Result
    try { return ($line | ConvertFrom-Json) }
    catch { return @{ ok = $false; error = "bad response: $line" } }
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
            Write-Json $ctx 200 @{ ok = $true; tclsh = (Test-Path $Tclsh); daemon = (Test-Path $Daemon) }
            continue
        }
        if ($req.HttpMethod -ne "POST" -or $req.Url.AbsolutePath -notlike "/api/n2x/send*") {
            Write-Json $ctx 404 @{ ok = $false; error = "not found" }
            continue
        }
        $body = (New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)).ReadToEnd()
        $d = $body | ConvertFrom-Json
        if (-not $Key) { Write-Json $ctx 503 @{ ok = $false; error = "relay has no key (-Key)" }; continue }
        if ("$($d.key)" -ne $Key) { Write-Json $ctx 403 @{ ok = $false; error = "bad key" }; continue }
        $server = "$($d.server)".Trim()
        $label  = if ($d.label) { "$($d.label)".Trim() } else { "utop" }
        $cmd    = "$($d.cmd)".Trim()
        if (-not $server -or -not $cmd) { Write-Json $ctx 400 @{ ok = $false; error = "server and cmd required" }; continue }
        Write-Host "[$stamp] $cmd"
        Write-Json $ctx 200 (Send-Cmd $server $label $cmd)
    } catch {
        try { Write-Json $ctx 500 @{ ok = $false; error = "$_" } } catch {}
    }
}
