@echo off
chcp 65001 >NUL
cd /d "%~dp0"
py -m pip install -r requirements.txt
if errorlevel 1 (
  echo Python 3 with pip is required.
  pause
  exit /b 1
)
py run_local.py
pause