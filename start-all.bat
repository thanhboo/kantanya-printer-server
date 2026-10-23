@echo off
setlocal EnableExtensions

REM ============================================================
REM  Kantanya printer server launcher
REM  1) Start node server.js (port 5123)
REM  2) Wait until the port is ready
REM  3) Open a second window and run ngrok on the static domain
REM
REM  Note: if your ngrok version does not accept --url, replace
REM        --url=... with --domain=... in the ngrok line below.
REM ============================================================

REM ---- Config (edit here if needed) ----
set "PORT=5123"
set "NGROK_URL=https://lina-nonbilious-superadaptably.ngrok-free.dev"
set "NGROK_EXE=ngrok"
REM --------------------------------------

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] node not found in PATH. Install Node.js first.
  pause
  exit /b 1
)

where %NGROK_EXE% >nul 2>&1
if errorlevel 1 (
  echo [ERROR] "%NGROK_EXE%" not found in PATH.
  echo         Install ngrok or set NGROK_EXE to its full path in this file.
  pause
  exit /b 1
)

echo [1/3] Checking port %PORT% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $c=New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',%PORT%); $c.Close(); exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo       Port %PORT% is already in use - assuming server.js is running.
) else (
  echo       Starting node server.js ...
  start "Kantanya Printer Server" cmd /k node server.js
)

echo [2/3] Waiting for the server to accept connections ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(30); while((Get-Date) -lt $deadline){ try { $c=New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',%PORT%); $c.Close(); exit 0 } catch { Start-Sleep -Milliseconds 300 } }; exit 1"
if errorlevel 1 (
  echo [ERROR] Server did not start within 30 seconds.
  echo         Check the "Kantanya Printer Server" window for details.
  pause
  exit /b 1
)

echo [3/3] Starting ngrok: %NGROK_URL%
start "Kantanya ngrok" cmd /k %NGROK_EXE% http %PORT% --url=%NGROK_URL%

echo.
echo Done. Two windows are running:
echo   - Kantanya Printer Server  (node server.js on port %PORT%)
echo   - Kantanya ngrok            (%NGROK_URL%)
echo You can close this launcher window.
timeout /t 3 >nul
endlocal
exit /b 0
