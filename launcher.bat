@echo off
cd /d "%~dp0"

REM 런처 본체는 scripts\launcher.py 에 있다 (루트에는 더블클릭 진입점만 둔다).
REM 가상환경(.venv) python 우선, 없으면 py -3.11 폴백
if exist "%~dp0.venv\Scripts\python.exe" (
    ".venv\Scripts\pythonw.exe" "scripts\launcher.py"
) else (
    py -3.11 "scripts\launcher.py"
)
