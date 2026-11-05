@echo off
cd /d "%~dp0"
".venv\Scripts\python.exe" launch.py --stop
timeout /t 2 >nul
