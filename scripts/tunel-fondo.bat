@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "EXE=%~dp0bin\ngrok.exe"
set "LOG=%~dp0tunel.log"
set "CFG=%~dp0tunel-config.txt"

if not exist "%EXE%" exit /b 1
if not exist "%CFG%" exit /b 1

set "NGROK_AUTHTOKEN="
set "NGROK_DOMAIN="
for /f "usebackq tokens=1,* delims==" %%A in ("%CFG%") do (
  if /i "%%A"=="NGROK_AUTHTOKEN" set "NGROK_AUTHTOKEN=%%B"
  if /i "%%A"=="NGROK_DOMAIN" set "NGROK_DOMAIN=%%B"
)

if "%NGROK_AUTHTOKEN%"=="" exit /b 1
if "%NGROK_DOMAIN%"=="" exit /b 1

echo ---- %DATE% %TIME% ngrok ---->> "%LOG%"
"%EXE%" http --authtoken="%NGROK_AUTHTOKEN%" --url="%NGROK_DOMAIN%" 3001 >> "%LOG%" 2>&1
