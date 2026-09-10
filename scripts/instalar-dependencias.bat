@echo off
chcp 65001 >nul
title Instalar dependencias - Sistema de Stock

cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Instala Node.js LTS desde https://nodejs.org y volve a ejecutar este script.
  pause
  exit /b 1
)

echo Instalando dependencias del backend...
pushd backend
call npm install
if errorlevel 1 goto error
popd

echo.
echo Instalando dependencias del frontend...
pushd frontend
call npm install
if errorlevel 1 goto error
popd

echo.
echo Compilando frontend para uso local...
pushd frontend
call npm run build
if errorlevel 1 goto error
popd

echo.
echo Listo. Ahora configura backend\.env y ejecuta scripts\iniciar-stock.bat
pause
exit /b 0

:error
echo [ERROR] Hubo un problema durante la instalacion.
pause
exit /b 1
