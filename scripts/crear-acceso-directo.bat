@echo off
chcp 65001 >nul
title Crear acceso directo - Sistema de Stock

cscript //nologo "%~dp0crear-acceso-directo.vbs"
if errorlevel 1 (
  echo [ERROR] No se pudo crear el acceso directo.
  if /I not "%~1"=="/nopause" pause
  exit /b 1
)

echo.
echo Listo. En el escritorio tenes "Sistema de Stock".
echo Un clic abre el navegador; el servidor arranca solo en segundo plano.
if /I not "%~1"=="/nopause" pause
