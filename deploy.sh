#!/usr/bin/env bash
# Deploy CARKO ke server: push ke GitHub → git pull di server → install & build → pm2 restart → cek kesehatan.
#   ./deploy.sh            deploy biasa
#   ./deploy.sh --cepat    lewati npm ci (bila dependensi tidak berubah)
# Konfigurasi di .env.deploy (tidak ikut git), lihat .env.deploy.example.
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env.deploy ] || { echo "✗ .env.deploy belum ada. Salin dari .env.deploy.example lalu isi."; exit 1; }
set -a; . ./.env.deploy; set +a
: "${DEPLOY_HOST:?isi DEPLOY_HOST di .env.deploy}" "${DEPLOY_DIR:=/var/www/carko}" "${PM2_NAME:=carko-8041}" "${PORT_SERVER:=8041}"
CEPAT=false; [ "${1:-}" = "--cepat" ] && CEPAT=true

# SSH: pakai key bila ada, atau kata sandi lewat sshpass (DEPLOY_PASSWORD di .env.deploy)
if [ -n "${DEPLOY_PASSWORD:-}" ]; then
  command -v sshpass >/dev/null || { echo "✗ Perlu sshpass (brew install sshpass) atau pakai SSH key"; exit 1; }
  export SSHPASS="$DEPLOY_PASSWORD"; SSH=(sshpass -e ssh -o ConnectTimeout=15)
else
  SSH=(ssh -o ConnectTimeout=15)
fi

# 1. Pastikan semua perubahan sudah di-commit, lalu push
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Ada perubahan yang belum di-commit:"; git status --short; exit 1
fi
CABANG=$(git rev-parse --abbrev-ref HEAD)
echo "▶ Push $CABANG ke GitHub"
git push -q origin "$CABANG"
KOMIT=$(git rev-parse --short HEAD)

# 2–4. Di server: pull, install, build, restart, cek kesehatan
echo "▶ Deploy $KOMIT ke $DEPLOY_HOST:$DEPLOY_DIR"
"${SSH[@]}" "$DEPLOY_HOST" bash -s -- "$DEPLOY_DIR" "$PM2_NAME" "$PORT_SERVER" "$CEPAT" "$CABANG" <<'REMOTE'
set -euo pipefail
DIR=$1; PM2=$2; PORT=$3; CEPAT=$4; CABANG=$5
cd "$DIR"
LAMA=$(git rev-parse HEAD)
git fetch -q origin && git checkout -q "$CABANG" && git pull -q --ff-only origin "$CABANG"
echo "  • kode: $(git log --oneline -1)"
BERUBAH=$(git diff --name-only "$LAMA" HEAD)
if [ "$CEPAT" != true ] || echo "$BERUBAH" | grep -q '^package-lock.json$'; then
  echo "  • install dependensi server"; npm ci --omit=dev --no-audit --no-fund --loglevel=error
fi
if [ "$CEPAT" != true ] || echo "$BERUBAH" | grep -q '^web/package-lock.json$'; then
  echo "  • install dependensi tampilan"; (cd web && npm ci --no-audit --no-fund --loglevel=error)
fi
echo "  • build tampilan"; (cd web && npm run build >/dev/null)
echo "  • restart $PM2"; pm2 restart "$PM2" --update-env >/dev/null && pm2 save >/dev/null
for i in $(seq 1 20); do curl -fs "127.0.0.1:$PORT/api/sehat" >/dev/null && break; sleep 1; done
curl -fs "127.0.0.1:$PORT/api/sehat" >/dev/null && echo "  ✓ server sehat" || { echo "  ✗ server tidak sehat — log terakhir:"; pm2 logs "$PM2" --lines 30 --nostream; exit 1; }
REMOTE

if [ -n "${DEPLOY_URL:-}" ]; then
  KODE=$(curl -s -o /dev/null -w '%{http_code}' "$DEPLOY_URL/api/sehat")
  [ "$KODE" = 200 ] && echo "✓ $DEPLOY_URL online ($KOMIT)" || { echo "✗ $DEPLOY_URL merespons $KODE"; exit 1; }
fi
