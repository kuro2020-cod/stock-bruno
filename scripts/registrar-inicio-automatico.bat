@echo off
chcp 65001 >nul
title Inicio automatico - Sistema de Stock

cd /d "%~dp0.."
set "PROYECTO=%CD%"
set "SCRIPT=%PROYECTO%\scripts\servidor-oculto.vbs"
set "TAREA=SistemaStock"

echo Este script configura el inicio automatico SIN ventana negra.
echo Al iniciar sesion en Windows, el servidor arranca en segundo plano.
echo El usuario solo usa el acceso directo "Sistema de Stock" del escritorio.
echo.
echo Proyecto: %PROYECTO%
echo.

if not exist "%SCRIPT%" (
  echo [ERROR] No se encontro: %SCRIPT%
  pause
  exit /b 1
)

schtasks /Delete /TN "%TAREA%" /F >nul 2>&1

schtasks /Create /TN "%TAREA%" /TR "wscript.exe \"%SCRIPT%\"" /SC ONLOGON /RL LIMITED /F
if errorlevel 1 (
  echo [ERROR] No se pudo crear la tarea.
  echo Probá ejecutar este archivo como Administrador ^(clic derecho^).
  pause
  exit /b 1
)

echo.
echo Tarea "%TAREA%" creada.
echo.

REM Crear tambien el acceso directo en el escritorio
call "%~dp0crear-acceso-directo.bat" /nopause

echo.
echo ========================================
echo Listo para el usuario final:
echo  1. Al prender la PC e iniciar sesion, el sistema arranca solo.
echo  2. Abrir el icono "Sistema de Stock" del escritorio.
echo  3. No hay que tocar ninguna consola negra.
echo ========================================
echo.
echo Para detener el servidor a mano: scripts\detener-stock.bat
echo Para quitar el inicio automatico:
echo   schtasks /Delete /TN "%TAREA%" /F
echo.
pause
