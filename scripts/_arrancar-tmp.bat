@echo off
cd /d "C:\Users\kytia\Desktop\proyectos\proyecto stock\backend"
set NODE_ENV=production
"C:\Program Files\nodejs\node.exe" server.js >> "C:\Users\kytia\Desktop\proyectos\proyecto stock\scripts\servidor.log" 2>&1
