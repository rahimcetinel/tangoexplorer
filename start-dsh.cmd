@echo off
rem Tek komut: Playwright tarayici sunucusunu (arka planda) + DSH'i baslatir.
rem
rem Kullanim:
rem   start-dsh.cmd                 -> dsh web
rem   start-dsh.cmd web --port 3081 -> argumanlar dsh'a aynen gecer
rem
rem Sunucu ayri ve kucultulmus bir pencerede calisir; DSH kapaninca da acik
rem kalir, sonraki acilista yeniden kullanilir. Uc nokta:
rem   .logs\playwright-server.log  ->  "Listening on ws://[::1]:PORT/"

setlocal
set "ROOT=%~dp0"
set "LOG=%ROOT%.logs\playwright-server.log"

if not exist "%ROOT%.logs" mkdir "%ROOT%.logs"

if not exist "%ROOT%node_modules\.bin\playwright.cmd" (
  echo [browser] playwright bulunamadi - tarayici destegi olmadan devam.
  goto :launch
)

rem Onceki sunucu hala dinliyorsa yenisini acma.
powershell -NoProfile -Command "$m=Select-String -Path '%LOG%' -Pattern 'Listening on ws://' -ErrorAction SilentlyContinue | Select-Object -Last 1; if (-not $m) { exit 1 }; $u=($m.Line -split 'Listening on ')[1].Trim(); if ($u -notmatch ':(\d+)/?$') { exit 1 }; $p=[int]$Matches[1]; try { $c=[Net.Sockets.TcpClient]::new(); $c.Connect('::1',$p); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo [browser] mevcut sunucu kullanilacak.
  goto :launch
)

echo [browser] sunucu baslatiliyor...
start "playwright-server" /min cmd /c ""%ROOT%node_modules\.bin\playwright.cmd" run-server > "%LOG%" 2>&1"
rem timeout yerine ping: stdin yonlendirilmis ortamlarda da calisir.
ping -n 5 127.0.0.1 >nul

:launch
if defined DSH_CMD (
  call "%DSH_CMD%" %*
) else (
  call "C:\Projects\dsh\dsh.cmd" %*
)
exit /b %errorlevel%
