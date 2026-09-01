@echo off
setlocal
cd /d %~dp0\..
echo === SoWork Cloudflare Free Setup ===
echo.
echo [1/4] Install dependency
call npm.cmd install || goto :err
echo.
echo [2/4] Login Cloudflare
call npm.cmd run cf:login || goto :err
echo.
echo [3/4] Create D1 database
call npm.cmd run cf:create-db || goto :err
echo.
echo [4/4] Initialize D1 schema
call npm.cmd run cf:init-db || goto :err
echo.
echo Setup dasar selesai.
echo Berikutnya jalankan: npm.cmd run cf:deploy
echo Lalu set TELEGRAM_BOT_TOKEN dan TELEGRAM_WEBHOOK_SECRET sesuai TELEGRAM_SETUP.md
exit /b 0
:err
echo.
echo Setup berhenti karena error. Baca pesan di atas.
exit /b 1
