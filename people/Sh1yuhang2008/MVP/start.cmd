@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 20.19+ first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Hear Campus at http://127.0.0.1:5173 ...
start "" cmd /c "timeout /t 4 >nul & start http://127.0.0.1:5173"
call npm run dev
pause
