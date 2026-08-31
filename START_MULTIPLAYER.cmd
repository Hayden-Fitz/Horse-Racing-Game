@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE_EXE%" (
  echo Node.js is not installed. Install Node.js LTS and try again.
  pause
  exit /b 1
)

curl.exe --silent --fail http://127.0.0.1:8080/ >nul 2>nul
if not errorlevel 1 (
  echo The local game page is already running.
  start "" "http://localhost:8080"
  exit /b 0
)

echo.
echo HOTDOG DOWNS LOCAL GAME
echo Open: http://localhost:8080
echo Firebase provides online multiplayer automatically.
echo Keep this window open while using this local address.
echo Press Ctrl+C to stop the server.
echo.

start "" "http://localhost:8080"
"%NODE_EXE%" server.js

endlocal
