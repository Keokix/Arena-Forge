@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Bitte Node.js ab Version 22 installieren.
  pause
  exit /b 1
)
if not exist node_modules\vite\bin\vite.js call npm ci
npm start
