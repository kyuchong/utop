@echo off
chcp 65001 > nul
echo.
echo  NetTest Automation Server
echo  ========================
echo.

cd /d "%~dp0"

py -3.11 --version > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 3.11 not found.
    echo Run: py -3.11 --version to check
    pause
    exit /b 1
)

echo [1/3] Python 3.11 OK
py -3.11 --version

echo [2/3] Installing packages...
py -3.11 -m pip install -r requirements.txt -q
if errorlevel 1 (
    echo [ERROR] Package install failed
    pause
    exit /b 1
)

echo [3/3] Starting server...
echo.
echo  URL: http://localhost:8000
echo  Stop: Ctrl+C
echo.

cd backend
py -3.11 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

pause
