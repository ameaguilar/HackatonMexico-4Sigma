#!/usr/bin/env bash
# Prueba las migraciones de Supabase y sus reglas de seguridad.
#
# Modo 1 (por defecto): levanta un PostgreSQL temporal, aplica el stub de Supabase, las migraciones y las pruebas.
#   Requiere los binarios de PostgreSQL 15+ (initdb, pg_ctl, psql) y la extensión unaccent (contrib).
#     Kali/Debian: sudo apt install postgresql postgresql-contrib
#     Arch:        sudo pacman -S postgresql
#
# Modo 2: contra una base existente de Supabase local (ya migrada con `supabase db reset`):
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres scripts/test-db.sh
#   Las pruebas corren dentro de una transacción y se revierten.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
TESTS="$ROOT/supabase/tests"
PSQL_OPTS=(-X -q -v ON_ERROR_STOP=1)

run_tests() {
  local url="$1"
  for test in "$TESTS"/*.test.sql; do
    echo "== $(basename "$test")"
    psql "${PSQL_OPTS[@]}" "$url" -f "$test"
  done
}

if [[ -n "${DATABASE_URL:-}" ]]; then
  run_tests "$DATABASE_URL"
  exit 0
fi

if [[ "$(id -u)" == "0" ]]; then
  echo "initdb no puede ejecutarse como root. Corre el script con tu usuario normal." >&2
  exit 1
fi

PGBIN="${PGBIN:-}"
if [[ -z "$PGBIN" ]]; then
  if command -v pg_config >/dev/null 2>&1 && [[ -x "$(pg_config --bindir)/initdb" ]]; then
    PGBIN="$(pg_config --bindir)"
  elif command -v initdb >/dev/null 2>&1; then
    PGBIN="$(dirname "$(command -v initdb)")"
  else
    PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  fi
fi
[[ -x "$PGBIN/initdb" ]] || { echo "No encontré initdb de PostgreSQL. Define PGBIN." >&2; exit 1; }

WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
cleanup() {
  "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
"$PGBIN/pg_ctl" -D "$WORK/data" -l "$WORK/postgres.log" -w \
  -o "-p $PORT -k $WORK -c listen_addresses=''" start >/dev/null

URL="postgresql://postgres@/postgres?host=$WORK&port=$PORT"

echo "== stub de Supabase"
psql "${PSQL_OPTS[@]}" "$URL" -f "$TESTS/supabase_stub.sql"
for migration in "$MIGRATIONS"/*.sql; do
  echo "== migración $(basename "$migration")"
  psql "${PSQL_OPTS[@]}" "$URL" -f "$migration"
done
run_tests "$URL"
