@echo off
chcp 65001 >nul
title Diagnostico - Sistema de Stock
cd /d "%~dp0.."
set "PROYECTO=%CD%"

echo ========================================
echo  DIAGNOSTICO SISTEMA DE STOCK
echo  %PROYECTO%
echo ========================================
echo.

echo [1] Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo    FALLO: Node.js no esta instalado o no esta en el PATH.
) else (
  for /f "delims=" %%v in ('node -v') do echo    OK: %%v
)

echo.
echo [2] PostgreSQL (servicio)
sc query postgresql-x64-17 | findstr RUNNING >nul 2>&1 && echo    OK: postgresql-x64-17 Running && goto pg_ok
sc query postgresql-x64-16 | findstr RUNNING >nul 2>&1 && echo    OK: postgresql-x64-16 Running && goto pg_ok
sc query postgresql-x64-15 | findstr RUNNING >nul 2>&1 && echo    OK: postgresql-x64-15 Running && goto pg_ok
sc query postgresql-x64-14 | findstr RUNNING >nul 2>&1 && echo    OK: postgresql-x64-14 Running && goto pg_ok
echo    FALLO: no se detecto PostgreSQL en ejecucion.
:pg_ok

echo.
echo [3] Archivo backend\.env
if exist "backend\.env" (
  echo    OK: existe backend\.env
) else (
  echo    FALLO: falta backend\.env
)

echo.
echo [4] Frontend compilado
if exist "frontend\dist\index.html" (
  echo    OK: existe frontend\dist\index.html
) else (
  echo    FALLO: falta frontend\dist. Ejecuta scripts\instalar-dependencias.bat
)

echo.
echo [5] Dependencias backend
if exist "backend\node_modules\express" (
  echo    OK: express
) else (
  echo    FALLO: falta npm install en backend
)
if exist "backend\node_modules\nodemailer" (
  echo    OK: nodemailer
) else (
  echo    FALLO: falta nodemailer - ejecuta scripts\actualizar-sistema.bat
)
if exist "backend\node_modules\pdfkit" (
  echo    OK: pdfkit
) else (
  echo    FALLO: falta pdfkit - ejecuta scripts\actualizar-sistema.bat
)
if exist "backend\node_modules\node-cron" (
  echo    OK: node-cron
) else (
  echo    FALLO: falta node-cron - ejecuta scripts\actualizar-sistema.bat
)

echo.
echo [6] Puerto 3001
netstat -ano | findstr :3001 | findstr LISTENING >nul 2>&1
if errorlevel 1 (
  echo    AVISO: nadie escucha en el puerto 3001 ^(servidor apagado^)
) else (
  echo    OK: hay un proceso escuchando en 3001
  netstat -ano | findstr :3001 | findstr LISTENING
)

echo.
echo [7] Tarea automatica SistemaStock
schtasks /Query /TN SistemaStock >nul 2>&1
if errorlevel 1 (
  echo    FALLO: la tarea no existe. Ejecuta scripts\registrar-inicio-automatico.bat
) else (
  echo    OK: tarea SistemaStock registrada
  schtasks /Query /TN SistemaStock /FO LIST | findstr /I "Estado Status Nombre"
)

echo.
echo [8] Acceso directo escritorio
if exist "%USERPROFILE%\Desktop\Sistema de Stock.lnk" (
  echo    OK: Desktop\Sistema de Stock.lnk
) else if exist "%USERPROFILE%\Escritorio\Sistema de Stock.lnk" (
  echo    OK: Escritorio\Sistema de Stock.lnk
) else (
  echo    FALLO: no hay acceso directo. Ejecuta scripts\crear-acceso-directo.bat
)

echo.
echo [9] Probando arranque rapido del servidor...
if exist "scripts\servidor.log" del /q "scripts\servidor.log" >nul 2>&1
cscript //nologo "scripts\servidor-oculto.vbs"
timeout /t 3 /nobreak >nul
netstat -ano | findstr :3001 | findstr LISTENING >nul 2>&1
if errorlevel 1 (
  echo    FALLO: el servidor no quedo escuchando.
  echo    Abriendo scripts\servidor.log ...
  if exist "scripts\servidor.log" (
    echo.
    echo ---- contenido de servidor.log ----
    type "scripts\servidor.log"
    echo -----------------------------------
  ) else (
    echo    No se genero servidor.log
  )
) else (
  echo    OK: servidor arranco en http://localhost:3001
  echo    Abriendo navegador...
  start "" "http://localhost:3001"
)

echo.
echo ========================================
echo Si sigue fallando, copia TODO este texto y envialo.
echo ========================================
pause
