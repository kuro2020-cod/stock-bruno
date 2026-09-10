@echo off
chcp 65001 >nul
title Actualizar Sistema de Stock

cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Instala Node.js LTS desde https://nodejs.org
  pause
  exit /b 1
)

echo ========================================
echo  Actualizar Sistema de Stock
echo  Usa esto DESPUES de pegar codigo nuevo
echo  (sin pisar backend\.env ni la base)
echo ========================================
echo.

echo Instalando / actualizando dependencias del backend...
pushd backend
call npm install
if errorlevel 1 goto error
popd

echo.
echo Instalando / actualizando dependencias del frontend...
pushd frontend
call npm install
if errorlevel 1 goto error
popd

echo.
echo Compilando interfaz (frontend)...
pushd frontend
call npm run build
if errorlevel 1 goto error
popd

echo.
echo Listo. La interfaz nueva ya esta compilada.
echo Ahora cierra el sistema si estaba abierto y ejecuta
echo el acceso directo "Sistema de Stock" o iniciar-stock.bat
echo.
echo Si no abre, ejecuta scripts\diagnosticar.bat y revisa servidor.log
echo.
pause
exit /b 0

:error
echo.
echo [ERROR] Fallo la actualizacion. Revisa el mensaje de arriba.
pause
exit /b 1
