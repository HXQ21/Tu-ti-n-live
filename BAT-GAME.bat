@echo off
rem Bam dup file nay de bat game. Luon chay trong chinh thu muc chua file nay,
rem nen khong bi nham sang thu muc/o dia khac co cung ten.
rem Khong dung khoi lenh ( ... ) co duong dan ben trong: ten thu muc kieu
rem "Tu-ti-n-live-master (1)" co dau ngoac se lam hong file.

rem Mo lai trong cua so "cmd /k" de cua so khong tu tat, ke ca khi co loi.
if not "%~1"=="--chay" cmd /k call "%~f0" --chay & exit /b

cd /d "%~dp0"
title Tien Mon Van Dao
echo Thu muc game: "%CD%"
echo.

if not exist "server\server.js" goto loi_thu_muc

where node >nul 2>nul
if errorlevel 1 goto loi_node

if exist "node_modules\" goto bat_game
echo Lan dau chay: dang cai thu vien, cho vai phut...
call npm.cmd install
if errorlevel 1 goto loi_cai

:bat_game
echo Giu cua so nay mo khi dang choi. Tat game: bam Ctrl+C.
echo.
call npm.cmd start
echo.
echo Game da dung. Dong cua so nay, hoac bam dup lai BAT-GAME.bat de bat lai.
goto :eof

:loi_thu_muc
echo [LOI] File BAT-GAME.bat phai nam ngay trong thu muc game, canh file package.json.
goto :eof

:loi_node
echo [LOI] Chua cai Node.js. Cai Node.js 24 tro len tu nodejs.org, khoi dong lai may roi bam lai file nay.
goto :eof

:loi_cai
echo [LOI] Cai thu vien that bai. Chup lai man hinh nay de duoc ho tro.
goto :eof
