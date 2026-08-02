# ═══════════════════════════════════════════════════════════════════════
# UTOP 신규 PC 셋업 스크립트
# ═══════════════════════════════════════════════════════════════════════
# 실행 전 사전 조건:
#   1) PostgreSQL 17 이 이미 설치되어 있어야 함
#   2) 저장소 폴더가 소스 PC 에서 통째 복사되어 있어야 함 (위치는 어디든 상관없음)
#   3) postgres superuser 비밀번호를 알고 있어야 함
#
# 필요한 환경변수(선택):
#   $env:UTOP_PW = "..."            # 미설정 시 프롬프트로 입력 받음
#   $env:PG_PORT = 5433             # 미설정 시 스크립트 기본값(5433) 사용
#   $env:PG_BIN  = "C:\...\bin"     # 미설정 시 기본값 사용
#
# 실행 방법:
#   PowerShell 관리자 아니어도 OK
#   powershell -ExecutionPolicy Bypass -File <저장소>\scripts\setup-on-new-pc.ps1
# ═══════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

# ── 사용자 설정 (env var 우선, 없으면 기본/프롬프트) ──────────────────
$PG_PORT       = if ($env:PG_PORT) { [int]$env:PG_PORT } else { 5433 }
$POSTGRES_PW   = Read-Host "postgres superuser 비밀번호" -AsSecureString
if ($env:UTOP_PW) {
    $UTOP_PW = $env:UTOP_PW
} else {
    $_utopSec = Read-Host "utop 앱 계정 비밀번호 (신규 생성 시 사용)" -AsSecureString
    $_utopBstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($_utopSec)
    $UTOP_PW  = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($_utopBstr)
}
$PG_BIN        = if ($env:PG_BIN) { $env:PG_BIN } else { "C:\Program Files\PostgreSQL\17\bin" }
# 저장소 루트 = 이 스크립트의 부모의 부모(scripts/ 아래에 있으므로).
# 예전엔 "C:\utop" 로 하드코딩돼 있어서, 다른 경로에 복사한 저장소에서 실행하면
# 없는 폴더를 보고 바로 종료했다. 이제 실행한 그 저장소를 셋업한다.
$UTOP_ROOT     = Split-Path -Parent $PSScriptRoot

# ── PostgreSQL 존재 확인 ───────────────────────────────────────────────
if (-not (Test-Path (Join-Path $PG_BIN "psql.exe"))) {
    Write-Host "[!!] PostgreSQL 17 이 $PG_BIN 에 설치되어 있지 않습니다." -ForegroundColor Red
    Write-Host "     postgresql.org 에서 인스톨러 받아 먼저 설치하세요." -ForegroundColor Red
    exit 1
}

# ── UTOP 폴더 확인 ────────────────────────────────────────────────────
if (-not (Test-Path $UTOP_ROOT)) {
    Write-Host "[!!] $UTOP_ROOT 폴더가 없습니다. 소스 PC 에서 폴더 통째 복사 후 실행하세요." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $UTOP_ROOT "db\utop-seed.dump"))) {
    Write-Host "[!!] DB 덤프 파일 없음: $UTOP_ROOT\db\utop-seed.dump" -ForegroundColor Red
    Write-Host "     소스 PC 에서 pg_dump 실행 후 덤프 파일 포함해서 복사하세요." -ForegroundColor Red
    exit 1
}

# 비밀번호 SecureString → 평문
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($POSTGRES_PW)
$POSTGRES_PW_PLAIN = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# ── 1. postgres 접속 확인 ─────────────────────────────────────────────
Write-Host ""
Write-Host "[1/5] PostgreSQL 접속 확인..." -ForegroundColor Cyan
$env:PGPASSWORD = $POSTGRES_PW_PLAIN
$ver = & (Join-Path $PG_BIN "psql.exe") -h localhost -p $PG_PORT -U postgres -d postgres -tAc "SELECT version();"
if (-not $ver) {
    Write-Host "[!!] postgres 접속 실패. 비밀번호·포트 확인." -ForegroundColor Red
    exit 1
}
Write-Host "  $ver"

# ── 2. utop 계정·DB 생성 (이미 있으면 skip) ─────────────────────────
Write-Host ""
Write-Host "[2/5] utop 계정·DB 생성..." -ForegroundColor Cyan
$hasUser = & (Join-Path $PG_BIN "psql.exe") -h localhost -p $PG_PORT -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='utop';"
if ($hasUser -ne "1") {
    & (Join-Path $PG_BIN "psql.exe") -h localhost -p $PG_PORT -U postgres -d postgres -c "CREATE USER utop WITH PASSWORD '$UTOP_PW' CREATEDB;"
    Write-Host "  [OK] utop 계정 생성"
} else { Write-Host "  [SKIP] utop 계정 이미 존재" }

$hasDb = & (Join-Path $PG_BIN "psql.exe") -h localhost -p $PG_PORT -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='utop';"
if ($hasDb -ne "1") {
    & (Join-Path $PG_BIN "psql.exe") -h localhost -p $PG_PORT -U postgres -d postgres -c "CREATE DATABASE utop OWNER utop ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';"
    Write-Host "  [OK] utop DB 생성"
} else { Write-Host "  [SKIP] utop DB 이미 존재" }

# ── 3. DB 덤프 복원 ───────────────────────────────────────────────────
Write-Host ""
Write-Host "[3/5] DB 덤프 복원 (기존 데이터 있으면 덮어씀)..." -ForegroundColor Cyan
$env:PGPASSWORD = $UTOP_PW
& (Join-Path $PG_BIN "pg_restore.exe") -h localhost -p $PG_PORT -U utop -d utop --clean --if-exists (Join-Path $UTOP_ROOT "db\utop-seed.dump") 2>&1 | ForEach-Object { Write-Host "    $_" }
Write-Host "  [OK] 복원 완료"

# ── 4. .env 파일 확인 ────────────────────────────────────────────────
Write-Host ""
Write-Host "[4/5] .env 확인..." -ForegroundColor Cyan
$envFile = Join-Path $UTOP_ROOT ".env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "PGPORT=$PG_PORT" -and $envContent -match "PGPASSWORD=$UTOP_PW") {
        Write-Host "  [OK] .env 설정 일치"
    } else {
        Write-Host "  [!!] .env 의 포트·비밀번호가 이 스크립트 값과 다릅니다:" -ForegroundColor Yellow
        Write-Host "       PGPORT=$PG_PORT, PGPASSWORD=$UTOP_PW 로 수정 필요할 수 있음"
    }
} else {
    Write-Host "  [!!] .env 없음 — 수동 생성 필요" -ForegroundColor Red
}

# ── 5. DB 접속 최종 검증 ─────────────────────────────────────────────
Write-Host ""
Write-Host "[5/5] utop 계정으로 DB 접속 검증..." -ForegroundColor Cyan
$env:PGPASSWORD = $UTOP_PW
$counts = & (Join-Path $PG_BIN "psql.exe") -h localhost -p $PG_PORT -U utop -d utop -tAc "SELECT 'tc:' || count(*) FROM tc UNION ALL SELECT 'cycle:' || count(*) FROM cycle UNION ALL SELECT 'req:' || count(*) FROM req UNION ALL SELECT 'manuals:' || count(*) FROM manuals;"
Write-Host "  DB row counts:"
$counts | ForEach-Object { Write-Host "    $_" }

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host "  셋업 완료. Launcher 실행:" -ForegroundColor Green
Write-Host "    $UTOP_ROOT\launcher.bat 더블클릭" -ForegroundColor Green
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
