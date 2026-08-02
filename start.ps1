# UTOP 실행 스크립트 (Windows)
#
#   .\start.ps1
#
# 하는 일:
#   1. 최신 소스 받기 (git pull)
#   2. .env 가 없으면 만들고 비밀번호 자동 생성
#   3. 도커 이미지 빌드 + 기동
#   4. 뜰 때까지 기다렸다가 브라우저 열기
#
# 몇 번을 실행해도 안전하다 (데이터는 도커 볼륨에 그대로 남는다).

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Write-Step($n, $msg) { Write-Host ""; Write-Host "[$n] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)       { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn2($msg)    { Write-Host "    $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "  UTOP" -ForegroundColor White
Write-Host "  ====" -ForegroundColor White

# ── 0. 사전 확인 ────────────────────────────────────────────────
Write-Step 0 "도커 확인"
try {
    docker version --format '{{.Server.Version}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw }
} catch {
    Write-Host ""
    Write-Host "  [오류] Docker 가 실행 중이 아닙니다." -ForegroundColor Red
    Write-Host "         Docker Desktop 을 먼저 켜고 다시 실행하세요." -ForegroundColor Red
    Write-Host ""
    exit 1
}
Write-Ok "Docker 실행 중"

# ── 1. 최신 소스 ────────────────────────────────────────────────
Write-Step 1 "최신 소스 받기"
if (Test-Path ".git") {
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) {
        Write-Warn2 "git pull 실패 — 현재 소스로 계속 진행합니다."
    } else {
        Write-Ok "최신 상태"
    }
} else {
    Write-Warn2 "git 저장소가 아닙니다 — 현재 소스로 진행합니다."
}

# ── 2. .env ─────────────────────────────────────────────────────
Write-Step 2 "설정 파일(.env) 확인"
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"

    # 비밀번호는 손으로 넣게 하지 않는다 — 약한 비번이 그대로 굳는 걸 막는다.
    $bytes = New-Object 'System.Byte[]' 18
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $pw = [Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', ''

    $txt = [System.IO.File]::ReadAllText("$PWD\.env", [System.Text.Encoding]::UTF8)
    $txt = $txt -replace 'POSTGRES_PASSWORD=.*', "POSTGRES_PASSWORD=$pw"
    # BOM 없는 UTF-8 로 써야 한다. Set-Content -Encoding UTF8 은 BOM 을 붙이는데,
    # docker compose 가 첫 줄 키를 "﻿POSTGRES_DB" 로 읽어 설정이 통째로 어긋난다.
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText("$PWD\.env", $txt, $utf8NoBom)

    Write-Ok ".env 생성 · DB 비밀번호 자동 생성"
} else {
    Write-Ok ".env 이미 있음 (건드리지 않음)"
}

# 접속 포트 읽기
$port = 9000
$m = Select-String -Path ".env" -Pattern '^\s*WEB_PORT\s*=\s*(\d+)' | Select-Object -First 1
if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }

# ── 3. 빌드 + 기동 ──────────────────────────────────────────────
Write-Step 3 "빌드 및 기동 (처음이면 몇 분 걸립니다)"
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  [오류] 기동 실패. 아래로 원인을 확인하세요:" -ForegroundColor Red
    Write-Host "         docker compose logs api" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ── 4. 준비될 때까지 대기 ───────────────────────────────────────
Write-Step 4 "서버가 응답할 때까지 대기"
$url = "http://localhost:$port"
$ready = $false
foreach ($i in 1..60) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {
        Start-Sleep -Seconds 2
    }
}

Write-Host ""
if ($ready) {
    Write-Host "  준비 완료 →  $url" -ForegroundColor Green
    Write-Host ""
    Start-Process $url
} else {
    # 흔한 실패 하나는 원인을 짚어준다.
    # PostgreSQL 은 POSTGRES_PASSWORD 를 볼륨 최초 생성 때만 적용한다.
    # 그래서 "DB 볼륨은 이미 있는데 .env 를 새로 만든" 경우 비밀번호가 어긋나
    # api 가 무한 재시작한다. 로그를 보고 바로 알려준다.
    $apiLog = ""
    try { $apiLog = (docker compose logs api --tail 50 2>&1) -join "`n" } catch { }

    Write-Host "  서버가 응답하지 않습니다." -ForegroundColor Yellow
    if ($apiLog -match 'InvalidPasswordError|password authentication failed') {
        Write-Host ""
        Write-Host "  원인: DB 비밀번호가 맞지 않습니다." -ForegroundColor Red
        Write-Host "        이미 만들어진 DB 볼륨의 비밀번호와 .env 의 값이 다릅니다." -ForegroundColor Red
        Write-Host "        (PostgreSQL 은 볼륨을 처음 만들 때의 비밀번호를 계속 씁니다)" -ForegroundColor Red
        Write-Host ""
        Write-Host "  해결 1) 기존 데이터를 버려도 되면 — DB 를 지우고 다시 만든다:" -ForegroundColor White
        Write-Host "           docker compose down -v" -ForegroundColor White
        Write-Host "           .\start.ps1" -ForegroundColor White
        Write-Host ""
        Write-Host "  해결 2) 데이터를 지켜야 하면 — .env 의 POSTGRES_PASSWORD 를" -ForegroundColor White
        Write-Host "           예전에 쓰던 값으로 되돌린 뒤 다시 실행한다." -ForegroundColor White
    } else {
        Write-Host "  로그 확인:  docker compose logs -f api" -ForegroundColor Yellow
    }
    Write-Host ""
}

Write-Host "  정지:      docker compose down"
Write-Host "  로그:      docker compose logs -f api"
Write-Host "  데이터삭제: docker compose down -v"
Write-Host ""
