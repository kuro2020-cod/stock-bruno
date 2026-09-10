@echo off
chcp 65001 >nul
title Sistema de Stock (modo visible - solo diagnostico)

cd /d "%~dp0.."
set NODE_ENV=production

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado. Instalalo desde https://nodejs.org
  pause
  exit /b 1
)

echo Modo diagnostico: se ve la ventana del servidor.
echo Para uso diario del negocio usa el acceso directo "Sistema de Stock".
echo.

set NEED_BUILD=0
if not exist "frontend\dist\index.html" set NEED_BUILD=1
if "%NEED_BUILD%"=="0" (
  node "scripts\check-frontend-build.mjs"
  if not errorlevel 1 set NEED_BUILD=1
)

if "%NEED_BUILD%"=="1" (
  echo Compilando frontend (hay cambios nuevos)...
  pushd frontend
  call npm run build
  if errorlevel 1 (
    echo [ERROR] Fallo la compilacion del frontend.
    popd
    pause
    exit /b 1
  )
  popd
) else (
  echo Frontend ya esta actualizado.
)

echo Iniciando en http://localhost:3001
echo (Otras PCs en la red: mirá la IP que muestra el servidor al arrancar)
echo Si no conecta desde otra PC, ejecutá scripts\permitir-acceso-red.bat como Administrador.
echo.
pushd backend
node server.js
popd
if errorlevel 1 pause
