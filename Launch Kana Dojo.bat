@echo off
setlocal EnableExtensions
title Kana Dojo
cd /d "%~dp0"

rem ---- Is Node.js installed? -------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Kana Dojo needs Node.js 18 or newer.
  echo   Install the LTS from https://nodejs.org, then double-click this file again.
  echo.
  pause
  exit /b 1
)

rem ---- Is it new enough? ------------------------------------------------------
call node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" >nul 2>nul
if errorlevel 1 goto node_too_old

if not exist "server.js" (
  echo.
  echo   Could not find server.js next to this launcher.
  echo   Keep "Launch Kana Dojo.bat" inside the Kana Dojo folder.
  echo.
  pause
  exit /b 1
)

rem ---- Start the server (stays in this window while it runs) -----------------
echo Starting Kana Dojo... your browser will open in a moment.
echo.
call node "%~dp0server.js" --open
set "RC=%errorlevel%"

if "%RC%"=="3" goto already_running
if "%RC%"=="0" exit /b 0

echo.
echo   Kana Dojo stopped unexpectedly (exit code %RC%). See the messages above.
echo.
pause
exit /b %RC%

:already_running
set "KD_URL="
for /f "tokens=1,* delims==" %%a in ('node "%~dp0server.js" --probe') do (
  if "%%a"=="KANA_DOJO_URL" set "KD_URL=%%b"
)
if not defined KD_URL (
  if defined KANA_DOJO_PORT (set "KD_URL=http://127.0.0.1:%KANA_DOJO_PORT%/") else (set "KD_URL=http://127.0.0.1:4173/")
)
echo Kana Dojo is already running - opening %KD_URL%
start "" "%KD_URL%"
timeout /t 3 /nobreak >nul 2>nul
exit /b 0

:node_too_old
set "NODE_VER=an older version"
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo.
echo   Kana Dojo needs Node.js 18 or newer, but this computer has %NODE_VER%.
echo   Install the LTS from https://nodejs.org, then double-click this file again.
echo.
pause
exit /b 1
