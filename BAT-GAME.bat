@echo off
rem Bam dup file nay de bat game. Luon chay trong chinh thu muc chua file nay,
rem nen khong bi nham sang thu muc/o dia khac co cung ten.
cd /d "%~dp0"
title Tien Mon Van Dao - %CD%

if not exist "server\server.js" (
  echo [LOI] File BAT-GAME.bat phai nam ngay trong thu muc game, canh file package.json.
  echo Thu muc hien tai: %CD%
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Cai Node.js 24 tro len tu nodejs.org, khoi dong lai may roi bam lai file nay.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Lan dau chay: dang cai thu vien, cho vai phut...
  call npm.cmd install
  if errorlevel 1 (
    echo [LOI] Cai thu vien that bai. Chup lai man hinh nay de duoc ho tro.
    pause
    exit /b 1
  )
)

echo Dang bat game tu thu muc: %CD%
echo Giu cua so nay mo khi dang choi. Tat game: bam Ctrl+C.
call npm.cmd start
pause
