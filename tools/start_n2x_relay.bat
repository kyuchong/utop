@echo off
chcp 949 >nul
title N2X Relay - UTOP
cd /d "%~dp0"

REM ==== 여기만 상황에 맞게 =========================================
set N2X_RELAY_KEY=mykey123
set TCLSH=C:\Program Files (x86)\N2xTcl85\bin\n2xtclsh85.exe
set DAEMON=%~dp0n2x\n2x_daemon.tcl
REM =================================================================

echo ========================================================
echo  N2X 중계를 띄웁니다.
echo  이 창을 닫으면 중계도 꺼집니다. 그대로 두세요.
echo ========================================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0n2x_relay.ps1" -Key "%N2X_RELAY_KEY%" -Tclsh "%TCLSH%" -Daemon "%DAEMON%"

echo.
echo 중계가 멈췄습니다. 아무 키나 누르면 창을 닫습니다.
pause >nul
