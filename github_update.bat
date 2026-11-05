@echo off
chcp 65001 >NUL
cd /d "%~dp0"
set REPO=https://github.com/mike000123/Freedom_for_Democracy.git

where git >NUL 2>&1
if errorlevel 1 (
  echo Git is not installed. Download it from https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist ".git" (
  echo First run: setting up the repository...
  git init
  git branch -M main
  git remote add origin %REPO%
)

git add -A

rem Safety check: never upload the database, logs or documents with credentials
git diff --cached --name-only | findstr /i /r "\.sqlite3 \.docx launcher\.log \.env" >NUL
if not errorlevel 1 (
  echo.
  echo STOP: a private file is about to be uploaded:
  git diff --cached --name-only | findstr /i /r "\.sqlite3 \.docx launcher\.log \.env"
  echo Add it to .gitignore and run again.
  git reset >NUL
  pause
  exit /b 1
)

git diff --cached --quiet
if not errorlevel 1 (
  echo No changes to upload.
  pause
  exit /b 0
)

echo.
echo Changes to upload:
git status --short
echo.
set MSG=
set /p MSG=Short description of the change (Enter = "Update"): 
if "%MSG%"=="" set MSG=Update

git commit -m "%MSG%"
git push -u origin main
if errorlevel 1 (
  echo.
  echo Push was rejected. Trying to merge with what is on GitHub...
  git pull --rebase --allow-unrelated-histories origin main
  git push -u origin main
)

echo.
if errorlevel 1 (echo Something went wrong. Copy the messages above and send them to Claude.) else (echo Done. Repository updated.)
pause
