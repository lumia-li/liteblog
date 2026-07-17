@echo off
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\repair-after-unzip.ps1"
if errorlevel 1 (
  echo.
  echo Repair failed. See logs above.
  exit /b 1
)
echo.
echo Repair completed.
