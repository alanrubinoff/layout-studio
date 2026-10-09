#!/bin/sh
# Layout Studio (Mac): instala lo necesario la primera vez, arranca el editor y abre el navegador.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node.js: instalalo desde https://nodejs.org y volvé a abrir este archivo."; read -r _; exit 1
fi
if [ ! -d node_modules ]; then
  echo "Instalando dependencias, la primera vez tarda unos minutos..."
  npm install && npx playwright install chromium
fi
(sleep 2; open http://localhost:4321) &
npm start
