@echo off
chcp 65001 >nul
title Tunel fijo (ngrok)

cd /d "%~dp0"
set "BIN=%~dp0bin"
set "EXE=%BIN%\ngrok.exe"
set "CFG=%~dp0tunel-config.txt"

if not exist "%CFG%" (
  echo Falta configurar el tunel.
  echo Ejecuta primero: scripts\configurar-tunel.bat
  pause
  exit /b 1
)

if not exist "%BIN%" mkdir "%BIN%"
if not exist "%EXE%" (
  echo Descargando ngrok...
  powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip' -OutFile '%BIN%\ngrok.zip' -UseBasicParsing; Expand-Archive -Path '%BIN%\ngrok.zip' -DestinationPath '%BIN%' -Force"
  if not exist "%EXE%" (
    echo [ERROR] No se pudo descargar ngrok.
    pause
    exit /b 1
  )
)

echo.
echo Tunel FIJO y gratis. Deja esta ventana abierta.
echo La URL del cliente es la de NGROK_DOMAIN en tunel-config.txt
echo.
call "%~dp0tunel-fondo.bat"
echo.
echo El tunel se corto.
pause
