@echo off
setlocal
title CourtSide - Setup / Update
echo.
echo  ====================================
echo   CourtSide - automatic setup/update
echo  ====================================
echo.

rem --- check git ---
where git >nul 2>nul
if errorlevel 1 (
  echo [!] Git is not installed. Opening the download page...
  start https://git-scm.com/download/win
  echo     Install it with Next-Next-Next, then run this file again.
  pause
  exit /b 1
)

rem --- check node ---
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js is not installed. Opening the download page...
  start https://nodejs.org
  echo     Install the LTS version, then run this file again.
  pause
  exit /b 1
)

set "DIR=%USERPROFILE%\Documents\courtsideil"

if exist "%DIR%\.git" (
  echo [1/3] Project found - pulling the latest version...
  cd /d "%DIR%"
  git pull --ff-only origin main
  if errorlevel 1 (
    echo [!] Pull failed - you may have local edits. Ask Claude for help.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Downloading the project from GitHub...
  git clone https://github.com/agam15122003-lang/courtsideil.git "%DIR%"
  if errorlevel 1 (
    echo [!] Clone failed - check your internet connection.
    pause
    exit /b 1
  )
  cd /d "%DIR%"
)

echo [2/3] Installing dependencies (this can take a minute)...
call npm install --silent

if not exist "%DIR%\.env.local" (
  echo [3/3] Creating .env.local template...
  (
    echo VITE_SUPABASE_URL=PASTE_YOUR_SUPABASE_URL_HERE
    echo VITE_SUPABASE_ANON_KEY=PASTE_YOUR_ANON_KEY_HERE
  ) > "%DIR%\.env.local"
  echo.
  echo  [!] IMPORTANT: open .env.local and paste your two Supabase keys
  echo      ^(Supabase - Settings - API^). Without them the app shows a blank page.
) else (
  echo [3/3] .env.local already exists - keeping it.
)

echo.
echo  Done! Opening VS Code...
where code >nul 2>nul && code "%DIR%"
echo.
echo  To run the site locally: open the terminal in VS Code and type:  npm run dev
echo.
pause
