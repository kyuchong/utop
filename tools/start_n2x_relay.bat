@echo off
title N2X Relay - UTOP
cd /d "%~dp0"

REM ==== Edit these to match your box ===============================
set N2X_RELAY_KEY=mykey123
set TCLSH=C:\Program Files (x86)\N2xTcl85\bin\n2xtclsh85.exe
set DAEMON=%~dp0n2x\n2x_daemon.tcl
REM ================================================================

echo ========================================================
echo  Starting N2X relay.
echo  Closing this window stops the relay. Leave it open.
echo ========================================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0n2x_relay.ps1" -Key "%N2X_RELAY_KEY%" -Tclsh "%TCLSH%" -Daemon "%DAEMON%"

echo.
echo Relay stopped. Press any key to close.
pause >nul
