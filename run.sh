#!/usr/bin/env bash
# Jalankan CARKO (Cari Kost): cek Postgres, siapkan database & dependensi, lalu buka browser.
set -e
cd "$(dirname "$0")"

export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
[ -f .env ] && set -a && . ./.env && set +a
PORT="${PORT:-3000}"
DB="db_rekap_kost"

if ! pg_isready -q; then
  echo "▶ Menyalakan Postgres.app…"
  open -a Postgres
  for _ in $(seq 1 20); do pg_isready -q && break; sleep 1; done
  pg_isready -q || { echo "✗ Postgres belum jalan. Buka Postgres.app lalu coba lagi."; exit 1; }
fi

psql -lqt | cut -d'|' -f1 | grep -qw "$DB" || { echo "▶ Membuat database $DB"; createdb "$DB"; }
[ -d node_modules ] || { echo "▶ Install dependensi"; npm install; }
# Tampilan (SvelteKit di web/) dibuild ulang bila belum ada atau ada perubahan di web/src
if [ ! -f web/build/index.html ] || [ -n "$(find web/src web/static -newer web/build/index.html -print -quit)" ]; then
  echo "▶ Build tampilan"; ( cd web && { [ -d node_modules ] || npm install; } && npm run build >/dev/null ) || { echo "✗ Build tampilan gagal"; exit 1; }
fi

if lsof -ti tcp:"$PORT" >/dev/null; then
  echo "✓ Sudah jalan di http://localhost:$PORT"
  open "http://localhost:$PORT"
  exit 0
fi

(sleep 2 && open "http://localhost:$PORT") &
exec node --watch server.js
