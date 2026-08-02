# restart-server.ps1 — PostgreSQL 백엔드를 "단일 인스턴스 + 백그라운드 + --reload 없이"로 재기동
# 사용법(관리자 PowerShell):
#   powershell -ExecutionPolicy Bypass -File "<저장소>\scripts\restart-server.ps1"
# 포트: 8000

$ErrorActionPreference = "SilentlyContinue"
# 저장소 루트 = 이 스크립트의 부모의 부모(scripts/ 아래에 있으므로).
# 예전엔 "C:\utop" 로 하드코딩돼 있어서 저장소를 다른 위치로 복사하면
# 없는 경로의 venv 를 찾다가 조용히 실패했다.
$root = Split-Path -Parent $PSScriptRoot
$py   = Join-Path $root ".venv\Scripts\python.exe"
$port = 8000

Write-Host "[1/3] 기존 uvicorn / $port 리스너 정리..." -ForegroundColor Cyan

# (a) $port 리스너
$listeners = (Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess | Select-Object -Unique
foreach ($p in $listeners) { Stop-Process -Id $p -Force }

# (b) 이 저장소 venv 의 uvicorn / spawn 워커만 정리 (Spirent, 다른 체크아웃의 워커는 건드리지 않음)
Get-CimInstance Win32_Process -Filter "name='python.exe'" | Where-Object {
    $_.ExecutablePath -like ($root + '\.venv\*') -and
    ($_.CommandLine -like '*uvicorn*main:app*' -or $_.CommandLine -like '*spawn_main*')
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Start-Sleep -Seconds 2

$held = (Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess | Select-Object -Unique
if ($held) {
    Write-Host "[!] $port 이 아직 점유 중(PID $held). 관리자 권한 확인 후 재시도." -ForegroundColor Red
    exit 1
}

Write-Host "[2/3] 단일 인스턴스 기동(백그라운드, --reload 없이)..." -ForegroundColor Cyan
Start-Process -FilePath $py `
    -ArgumentList "-m","uvicorn","main:app","--host","0.0.0.0","--port","$port" `
    -WorkingDirectory (Join-Path $root "backend") -WindowStyle Hidden

Start-Sleep -Seconds 6

Write-Host "[3/3] 헬스 체크..." -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest "http://localhost:$port/api/device-catalog" -UseBasicParsing -TimeoutSec 6
    $now = (Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess | Select-Object -Unique
    Write-Host ("[OK] 서버 정상 — HTTP " + $r.StatusCode + " · $port 리스너 PID " + ($now -join ',') + " (단일)") -ForegroundColor Green
} catch {
    Write-Host ("[!] 서버 확인 실패: " + $_.Exception.Message) -ForegroundColor Red
}
