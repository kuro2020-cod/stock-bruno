@echo off
REM Compila el frontend si falta dist o si el codigo fuente es mas nuevo.
REM Usado por servidor-oculto.vbs (sin pausas).
cd /d "%~dp0.."
if not exist "frontend\node_modules\" exit /b 1
if not exist "frontend\dist\index.html" goto build
node "scripts\check-frontend-build.mjs"
if errorlevel 1 exit /b 0
:build
pushd frontend
call npm run build
set ERR=%ERRORLEVEL%
popd
exit /b %ERR%
