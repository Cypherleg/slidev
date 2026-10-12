#!/usr/bin/env bash
# Postgres local para testes e demonstração (dados fictícios). Não é usado em produção.
# Uso: bash scripts/pg-local.sh iniciar|parar|status
set -euo pipefail
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGDATA_DIR="${JC_PGDATA:-/tmp/jornada-cirurgica-pg}"
PORTA="${JC_PG_PORTA:-54329}"
USUARIO_SO="${JC_PG_USUARIO_SO:-postgres}"

executar() {
  if [ "$(id -u)" = "0" ]; then
    su "$USUARIO_SO" -s /bin/bash -c "$*"
  else
    bash -c "$*"
  fi
}

case "${1:-status}" in
  iniciar)
    if [ ! -f "$PGDATA_DIR/PG_VERSION" ]; then
      mkdir -p "$PGDATA_DIR"
      [ "$(id -u)" = "0" ] && chown "$USUARIO_SO" "$PGDATA_DIR"
      executar "$PGBIN/initdb -D $PGDATA_DIR -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null"
    fi
    if executar "$PGBIN/pg_ctl -D $PGDATA_DIR status" >/dev/null 2>&1; then
      echo "Postgres já em execução na porta $PORTA"
    else
      executar "$PGBIN/pg_ctl -D $PGDATA_DIR -l $PGDATA_DIR/log.txt -o \"-p $PORTA -k /tmp -c max_connections=200\" start -w" >/dev/null
      echo "Postgres iniciado na porta $PORTA"
    fi
    echo "URL: postgres://postgres@127.0.0.1:$PORTA/postgres"
    ;;
  parar)
    executar "$PGBIN/pg_ctl -D $PGDATA_DIR stop -m fast" || true
    ;;
  status)
    executar "$PGBIN/pg_ctl -D $PGDATA_DIR status" || true
    ;;
esac
