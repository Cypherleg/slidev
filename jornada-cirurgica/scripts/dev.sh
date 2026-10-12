#!/usr/bin/env bash
# Ambiente local de demonstração: Postgres local + API (dev/servidor.ts) + interface (Vite).
# Uso: npm run dev   (Ctrl+C encerra a API e o Vite; o Postgres continua: npm run pg:parar)
# Variáveis úteis: JORNADA_DEV_BANCO (padrão jornada_dev), JORNADA_DEV_RECRIAR=true (banco do zero).
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/pg-local.sh iniciar

npx tsx dev/servidor.ts &
API_PID=$!

encerrar() {
  kill "$API_PID" 2>/dev/null || true
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap encerrar EXIT INT TERM

# Espera a API ficar pronta (semente concluída) antes de abrir a interface.
for _ in $(seq 1 120); do
  if curl -fsS "http://127.0.0.1:${JORNADA_DEV_PORTA:-8787}/dev/usuarios" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$API_PID" 2>/dev/null; then echo "A API local não iniciou." >&2; exit 1; fi
  sleep 1
done

npx vite --config web/vite.config.ts &
WEB_PID=$!
echo "Interface: http://127.0.0.1:5173  |  API: http://127.0.0.1:${JORNADA_DEV_PORTA:-8787}/functions/v1/"
wait "$WEB_PID"
