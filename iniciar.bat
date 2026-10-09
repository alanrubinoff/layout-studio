@echo off
rem Layout Studio: instala lo necesario la primera vez, arranca el editor y abre el navegador.
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta Node.js: instalalo desde https://nodejs.org y volve a abrir este archivo. & pause & exit /b 1)
if not exist node_modules (
  echo Instalando dependencias, la primera vez tarda unos minutos...
  call npm install || (pause & exit /b 1)
  call npx playwright install chromium
)
start "" http://localhost:4321
call npm start
pause
