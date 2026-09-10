@echo off
chcp 65001 >nul
title Configurar tunel fijo (ngrok)

cd /d "%~dp0"
set "CFG=%~dp0tunel-config.txt"
set "EJ=%~dp0tunel-config.ejemplo.txt"

if not exist "%CFG%" (
  copy /y "%EJ%" "%CFG%" >nul
)

echo.
echo TUNEL FIJO GRATIS — ngrok
echo.
echo 1) Se va a abrir la web de ngrok. Crea una cuenta gratis
echo    (mail + clave, o Google).
echo 2) Entra a:  https://dashboard.ngrok.com/get-started/your-authtoken
echo    Copia el Authtoken.
echo 3) Entra a:  https://dashboard.ngrok.com/domains
echo    Ahi aparece tu dominio fijo, tipo:
echo       algo-raro.ngrok-free.app
echo    o tocá "New Domain" / "Create Domain" y copialo entero.
echo 4) En el Bloc de notas que se abre, pega:
echo       NGROK_AUTHTOKEN=el_token_largo
echo       NGROK_DOMAIN=algo-raro.ngrok-free.app
echo    Guardá y cerrá.
echo 5) Abri el sistema como siempre. El cliente usa:
echo       https://algo-raro.ngrok-free.app
echo.

start "" "https://dashboard.ngrok.com/signup"
timeout /t 2 /nobreak >nul
start "" "https://dashboard.ngrok.com/get-started/your-authtoken"
timeout /t 1 /nobreak >nul
start "" "https://dashboard.ngrok.com/domains"
notepad "%CFG%"

echo.
echo Si ya guardaste token y dominio, abre el Sistema de Stock.
echo La URL fija queda en scripts\tunel-url.txt
echo.
pause
