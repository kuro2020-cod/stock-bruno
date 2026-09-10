@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "EXE=%~dp0bin\ngrok.exe"
set "LOG=%~dp0tunel.log"
set "CFG=%~dp0tunel-config.txt"

if not exist "%EXE%" (
  echo ---- %DATE% %TIME% ERROR: falta bin\ngrok.exe ---->> "%LOG%"
  exit /b 1
)
if not exist "%CFG%" (
  echo ---- %DATE% %TIME% ERROR: falta tunel-config.txt ---->> "%LOG%"
  exit /b 1
)

set "NGROK_AUTHTOKEN="
set "NGROK_DOMAIN="
for /f "usebackq tokens=1,* delims==" %%A in ("%CFG%") do (
  if /i "%%A"=="NGROK_AUTHTOKEN" set "NGROK_AUTHTOKEN=%%B"
  if /i "%%A"=="NGROK_DOMAIN" set "NGROK_DOMAIN=%%B"
)

if "%NGROK_AUTHTOKEN%"=="" (
  echo ---- %DATE% %TIME% ERROR: NGROK_AUTHTOKEN vacio ---->> "%LOG%"
  exit /b 1
)
if "%NGROK_DOMAIN%"=="" (
  echo ---- %DATE% %TIME% ERROR: NGROK_DOMAIN vacio ---->> "%LOG%"
  exit /b 1
)

set "NGROK_DOMAIN=%NGROK_DOMAIN:https://=%"
set "NGROK_DOMAIN=%NGROK_DOMAIN:http://=%"
if "%NGROK_DOMAIN:~-1%"=="/" set "NGROK_DOMAIN=%NGROK_DOMAIN:~0,-1%"
if "%NGROK_DOMAIN:~-1%"=="/" set "NGROK_DOMAIN=%NGROK_DOMAIN:~0,-1%"

echo ---- %DATE% %TIME% ngrok %NGROK_DOMAIN% ---->> "%LOG%"
"%EXE%" http --authtoken="%NGROK_AUTHTOKEN%" --url="%NGROK_DOMAIN%" 3001 >> "%LOG%" 2>&1
