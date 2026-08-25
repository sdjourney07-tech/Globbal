@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL%==0 (
  node serve-local.js
  exit /b %ERRORLEVEL%
)

if exist "%LocalAppData%\Programs\cursor\resources\app\resources\helpers\node.exe" (
  "%LocalAppData%\Programs\cursor\resources\app\resources\helpers\node.exe" serve-local.js
  exit /b %ERRORLEVEL%
)

if exist "%ProgramFiles%\cursor\resources\app\resources\helpers\node.exe" (
  "%ProgramFiles%\cursor\resources\app\resources\helpers\node.exe" serve-local.js
  exit /b %ERRORLEVEL%
)

echo Node.js was not found on PATH and Cursor's bundled node was not found.
echo Install Node from https://nodejs.org/ or open this folder in Cursor and run: node serve-local.js
exit /b 1
