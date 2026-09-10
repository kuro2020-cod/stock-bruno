@echo off
chcp 65001 >nul
title Detener Sistema de Stock

echo Cerrando procesos del servidor (puerto 3001)...
powershell -NoProfile -Command ^
  "$conns = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue; ^
   if ($conns) { $conns | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Write-Host 'Servidor detenido.' } ^
   else { Write-Host 'No habia servidor escuchando en el puerto 3001.' }"

echo Cerrando tunel...
taskkill /IM ngrok.exe /F >nul 2>&1
taskkill /IM cloudflared.exe /F >nul 2>&1
echo Tunel detenido (si estaba corriendo).

pause
