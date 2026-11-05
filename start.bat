@echo off
setlocal
cd /d "%~dp0"
title Freedom for Democracy

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (where python >nul 2>nul && set "PY=python")
if not defined PY (
  if exist "%USERPROFILE%\anaconda3\python.exe" set "PY=%USERPROFILE%\anaconda3\python.exe"
)
if not defined PY (
  if exist "%USERPROFILE%\.anaconda\python.exe" set "PY=%USERPROFILE%\.anaconda\python.exe"
)
if not defined PY (
  echo Den vrethike Python. Egkatastiste to apo https://www.python.org/downloads/
  goto fail
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/3] Proti fora: dimiourgia periballontos...
  %PY% -m venv .venv || goto fail
)
set "VPY=.venv\Scripts\python.exe"

echo [2/3] Egkatastasi vivliothikon kai proetoimasia vasis...
"%VPY%" -m pip install -q -r requirements.txt || goto fail
"%VPY%" manage.py migrate --noinput -v0 || goto fail
"%VPY%" manage.py seed_demo --if-empty || goto fail
"%VPY%" manage.py ensure_admin || goto fail

echo [3/3] Ekkinisi sto parask inio (xoris parathyro cmd).
"%VPY%" launch.py || goto fail
goto end

:fail
echo.
echo Kati pige strava (dite to minyma apo pano kai to launcher.log).
pause

:end
endlocal
