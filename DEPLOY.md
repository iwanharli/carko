# Deploy CARKO (tanpa Docker)

CARKO butuh **Node.js 22**, **PostgreSQL**, dan **Chromium** (untuk engine). Panduan ini untuk VPS Ubuntu/Debian.

## Kebutuhan server

- Ubuntu 22.04/24.04 atau Debian 12
- RAM minimal **2 GB** (engine menjalankan Chromium setiap 30 menit)
- Domain (disarankan, untuk HTTPS)

## 1. Pasang Node.js, PostgreSQL, Caddy

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs postgresql caddy
```

## 2. Buat database

```bash
sudo -u postgres psql -c "CREATE USER carko WITH PASSWORD 'GANTI_KATA_SANDI_DB';"
sudo -u postgres psql -c "CREATE DATABASE carko OWNER carko;"
```

Tabel dibuat otomatis saat CARKO pertama kali jalan.

## 3. Pasang aplikasi

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin carko
sudo mkdir -p /opt/carko && sudo chown carko: /opt/carko
# salin isi proyek ke /opt/carko (git clone / rsync), lalu:
cd /opt/carko
sudo -u carko npm ci --omit=dev
sudo -u carko npm --prefix web ci && sudo -u carko npm run build     # build tampilan → web/build
sudo npx playwright install-deps chromium                            # library sistem untuk Chromium
sudo -u carko npx playwright install chromium                        # Chromium untuk engine
```

## 4. Konfigurasi

```bash
sudo -u carko cp .env.example .env
sudo -u carko nano .env
```

| Variabel | Isi |
|---|---|
| `DATABASE_URL` | `postgres://carko:GANTI_KATA_SANDI_DB@localhost:5432/carko` |
| `PORT` | `3000` |
| `GOOGLE_MAPS_KEY` | Opsional, agar jarak sama dengan Google Maps motor |

Biarkan `HOST` kosong (default `127.0.0.1`): CARKO hanya menerima koneksi dari Caddy di server yang sama.

## 5. Akun login

Akun disimpan di database. Saat pertama kali jalan, CARKO membuat akun awal **dinda / dandiluv**. Setelah online, ganti kata sandinya:

```bash
cd /opt/carko
sudo -u carko npm run akun -- sandi dinda       # ganti kata sandi (diketik tersembunyi)
sudo -u carko npm run akun -- daftar            # lihat semua akun
sudo -u carko npm run akun -- tambah budi       # tambah akun
sudo -u carko npm run akun -- hapus budi        # hapus akun (sesinya ikut berakhir)
```

## 6. Jalankan sebagai layanan

```bash
sudo cp deploy/carko.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now carko
sudo journalctl -u carko -f        # log; engine mulai ±1 menit setelah server menyala
```

## 7. HTTPS dengan domain

Arahkan DNS domain (A record) ke IP server, lalu isi `/etc/caddy/Caddyfile`:

```
carko.domainkamu.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Caddy mengurus sertifikat HTTPS otomatis. Buka `https://carko.domainkamu.com` dan masuk dengan username & kata sandi.

## 8. Pindahkan data dari laptop

Di laptop:

```bash
pg_dump --no-owner --no-acl db_rekap_kost > carko.sql
```

Kirim `carko.sql` ke server, lalu:

```bash
sudo systemctl stop carko
psql "postgres://carko:GANTI_KATA_SANDI_DB@localhost:5432/carko" < carko.sql
sudo systemctl start carko
```

## Perintah sehari-hari

```bash
# Update ke versi terbaru
cd /opt/carko && sudo -u carko git pull && sudo -u carko npm ci --omit=dev && sudo -u carko npm run build && sudo systemctl restart carko

# Backup database
pg_dump "postgres://carko:GANTI_KATA_SANDI_DB@localhost:5432/carko" > backup-$(date +%F).sql

# Status & log
sudo systemctl status carko
sudo journalctl -u carko -n 100
```

## Catatan

- **Engine & IP server**: Mamikos bisa lebih ketat terhadap akses dari IP pusat data (VPS) dibanding IP rumah. Kalau log berisi "Engine gagal" berulang, server mungkin dibatasi; data yang sudah tersimpan tetap aman.
- **Zona waktu** layanan diset `Asia/Jakarta` lewat `deploy/carko.service`.
- Link "📋 CARKO" di teks bagikan otomatis memakai alamat domain tempat CARKO dibuka.
- Cek kesehatan: `curl http://127.0.0.1:3000/api/sehat` → `{"ok":true}`.
- **Salinan foto** disimpan di `/opt/carko/data/foto` (ubah lewat `FOTO_DIR` di `.env`). Folder ini perlu ikut di-backup kalau ingin foto tetap ada walau iklan Mamikos dihapus.
