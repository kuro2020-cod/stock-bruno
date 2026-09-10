@echo off
chcp 65001 >nul
title Permitir acceso en red - Sistema de Stock

:: Requiere ejecutar como Administrador (clic derecho ^> Ejecutar como administrador)
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] Ejecutá este archivo como Administrador:
  echo   Clic derecho en "permitir-acceso-red.bat" ^> Ejecutar como administrador
  echo.
  pause
  exit /b 1
)

set PORT=3001
if exist "%~dp0..\backend\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /i /b "PORT=" "%~dp0..\backend\.env"`) do (
    set PORT=%%B
  )
)

echo Agregando regla en el Firewall de Windows para el puerto %PORT%...
netsh advfirewall firewall delete rule name="Sistema Stock" >nul 2>&1
netsh advfirewall firewall add rule name="Sistema Stock" dir=in action=allow protocol=TCP localport=%PORT%

if errorlevel 1 (
  echo [ERROR] No se pudo crear la regla del firewall.
  pause
  exit /b 1
)

echo.
echo Listo. Otras PCs en la misma red pueden conectarse al puerto %PORT%.
echo.
echo En la PC del servidor, al iniciar el sistema verás las URLs con IP, por ejemplo:
echo   http://192.168.0.50:%PORT%
echo.
echo Abrí esa dirección en el navegador de la otra computadora.
echo.
pause
