#!/usr/bin/env bash
# Kelola CARKO (Cari Kost) sebagai layanan macOS (launchd): menyala saat login & hidup lagi sendiri kalau crash.
#   ./service.sh install    pasang & nyalakan
#   ./service.sh restart    restart (setelah kode diubah)
#   ./service.sh status     cek jalan atau tidak
#   ./service.sh logs       lihat log terbaru
#   ./service.sh uninstall  matikan & hapus layanan
set -e
cd "$(dirname "$0")"
DIR="$PWD"
LABEL="com.rekapkost.app"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/rekap-kost.log"
DOMAIN="gui/$(id -u)"
[ -f .env ] && set -a && . ./.env && set +a
PORT="${PORT:-3000}"

case "${1:-}" in
  install)
    NODE="$(command -v node)" || { echo "✗ node tidak ditemukan"; exit 1; }
    if lsof -ti tcp:"$PORT" >/dev/null && ! launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      echo "✗ Port $PORT sedang dipakai (server yang dijalankan di terminal?). Hentikan dulu dengan Ctrl+C, lalu ulangi."
      exit 1
    fi
    [ -d node_modules ] || npm install
    ( cd web && { [ -d node_modules ] || npm install; } && npm run build >/dev/null ) || { echo "✗ Build tampilan gagal"; exit 1; }
    mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/server.js</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "✓ Terpasang. CARKO (Cari Kost) akan selalu jalan di http://localhost:$PORT (juga setelah login ulang)."
    echo "  Pastikan Postgres.app juga diset 'Start at login' (menu Postgres → Settings)."
    sleep 3; "$0" status
    ;;
  restart)
    ( cd web && npm run build >/dev/null ) || { echo "✗ Build tampilan gagal"; exit 1; }
    launchctl kickstart -k "$DOMAIN/$LABEL" && echo "✓ Direstart" ;;
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      PID=$(launchctl print "$DOMAIN/$LABEL" | awk '/pid =/ {print $3}')
      curl -s -o /dev/null -m 3 "http://localhost:$PORT/api/kriteria" && echo "✓ Jalan (pid ${PID:-?}) di http://localhost:$PORT" \
        || echo "… Layanan terpasang tapi belum merespons. Cek: ./service.sh logs"
    else
      echo "✗ Layanan belum terpasang. Jalankan: ./service.sh install"
    fi ;;
  logs)
    tail -n 60 "$LOG" ;;
  uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "✓ Layanan dihapus" ;;
  *)
    sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
