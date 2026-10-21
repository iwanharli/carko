import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import pg from 'pg';
import { cariMamikos, tipeLainMamikos } from './engine.js';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { siapkanAkun, cocokSandi } from './akun.js';

// Hasil build SvelteKit (web/): halaman /, /peta, /pengaturan, /kost/:id
const WEB = fileURLToPath(new URL('./web/build', import.meta.url));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://localhost/db_rekap_kost' });

await pool.query(`
  CREATE TABLE IF NOT EXISTS kost (
    id         SERIAL PRIMARY KEY,
    nama       TEXT NOT NULL,
    alamat     TEXT DEFAULT '',
    harga      INTEGER NOT NULL,
    jarak      NUMERIC(6,2),
    tipe       TEXT DEFAULT 'Campur',
    ukuran     TEXT DEFAULT '',
    status     TEXT DEFAULT 'Belum dihubungi',
    rating     SMALLINT,
    kontak     TEXT DEFAULT '',
    link       TEXT DEFAULT '',
    fasilitas  TEXT[] DEFAULT '{}',
    catatan    TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS kriteria (
    id     INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    budget INTEGER DEFAULT 1500000,
    jarak  NUMERIC(6,2) DEFAULT 5,
    tipe   TEXT DEFAULT 'Putri,Campur', -- tipe yang diterima, dipisah koma; kosong = semua
    fas    TEXT[] DEFAULT '{}'
  );
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS gambar TEXT DEFAULT '';
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
  -- Lokasi kerja default: Farla Infinite, Jl. Cilandak Dalam No.3A, Jakarta Selatan
  ALTER TABLE kriteria ADD COLUMN IF NOT EXISTS kerja_nama TEXT DEFAULT 'Farla Infinite, Jl. Cilandak Dalam No.3A';
  ALTER TABLE kriteria ADD COLUMN IF NOT EXISTS kerja_lat DOUBLE PRECISION DEFAULT -6.2873;
  ALTER TABLE kriteria ADD COLUMN IF NOT EXISTS kerja_lng DOUBLE PRECISION DEFAULT 106.8044;
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS kamar_tersedia INTEGER;
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS dicek_ulang_at TIMESTAMPTZ;
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS galeri TEXT[] DEFAULT '{}';
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS jarak_lurus NUMERIC(6,2);
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS rating_mamikos NUMERIC(2,1);
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS ulasan INTEGER;
  -- pilihan: 'suka' / 'skip' / NULL, terpisah dari status kontak
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS pilihan TEXT;
  -- dilihat: false untuk kost temuan engine sampai detailnya dibuka (kost lama dianggap sudah dilihat)
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS dilihat BOOLEAN DEFAULT true;
  -- "Tipe kamar lainnya" dari halaman Mamikos (tipe yang tidak tersimpan, mis. penuh / di atas budget), sebagai informasi
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS tipe_lain JSONB DEFAULT '[]';
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS tipe_lain_at TIMESTAMPTZ;
  -- Rincian dari Mamikos: biaya per periode, aturan, fasilitas per kategori, deskripsi pemilik, tahun bangunan
  ALTER TABLE kost ADD COLUMN IF NOT EXISTS detail_mamikos JSONB DEFAULT '{}';
  ALTER TABLE kost ALTER COLUMN dilihat SET DEFAULT false;
  UPDATE kost SET pilihan = CASE status WHEN 'Kandidat' THEN 'suka' ELSE 'skip' END, status = 'Belum dihubungi'
    WHERE status IN ('Kandidat', 'Ditolak');
  ALTER TABLE kriteria ADD COLUMN IF NOT EXISTS auto_aktif BOOLEAN DEFAULT true;
  ALTER TABLE kriteria ADD COLUMN IF NOT EXISTS auto_jam SMALLINT DEFAULT 7;
  ALTER TABLE kriteria ADD COLUMN IF NOT EXISTS auto_maks INTEGER DEFAULT 150;
  ALTER TABLE kriteria ADD COLUMN IF NOT EXISTS auto_terakhir TIMESTAMPTZ;
  ALTER TABLE kriteria ALTER COLUMN tipe SET DEFAULT 'Putri,Campur';
  INSERT INTO kriteria (id) VALUES (1) ON CONFLICT DO NOTHING;
  -- Link yang sudah pernah dicek pengumpul (agar tidak dicek ulang tiap hari)
  CREATE TABLE IF NOT EXISTS dicek (link TEXT PRIMARY KEY, hasil TEXT, dicek_at TIMESTAMPTZ DEFAULT now());
`);

const FIELDS = ['nama', 'alamat', 'harga', 'jarak', 'tipe', 'ukuran', 'status', 'rating', 'kontak', 'link', 'fasilitas', 'catatan', 'gambar', 'lat', 'lng', 'kamar_tersedia', 'galeri', 'jarak_lurus', 'rating_mamikos', 'ulasan', 'pilihan', 'detail_mamikos'];
const NULLABLE = ['jarak', 'rating', 'lat', 'lng', 'kamar_tersedia', 'jarak_lurus', 'rating_mamikos', 'ulasan', 'pilihan'];

// Jarak garis lurus (km) antara dua koordinat
const haversine = (a, b, c, d) => {
  const r = x => x * Math.PI / 180, dLat = r(c - a), dLng = r(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)) * 100) / 100;
};
// Rute dari (lat,lng) ke (lat2,lng2). Pakai Google Routes API mode motor (TWO_WHEELER) bila GOOGLE_MAPS_KEY diisi,
// selain itu OSRM (OpenStreetMap, mode mobil). Hasil: { sumber, routes: [{ km, menit, garis: [[lng,lat], ...] }] }
const decodePolyline = str => {
  const out = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, shift = 0, v = 0;
      do { b = str.charCodeAt(i++) - 63; v |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = v & 1 ? ~(v >> 1) : v >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
};
async function rute(lat, lng, lat2, lng2, { alternatif = false } = {}) {
  const km = m => Math.round(m / 10) / 100;
  if (process.env.GOOGLE_MAPS_KEY) {
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' },
      body: JSON.stringify({ origin: { location: { latLng: { latitude: lat, longitude: lng } } },
        destination: { location: { latLng: { latitude: lat2, longitude: lng2 } } },
        travelMode: 'TWO_WHEELER', computeAlternativeRoutes: alternatif, languageCode: 'id', regionCode: 'ID' }),
    });
    const j = await r.json();
    if (!r.ok || !j.routes?.length) throw new Error(j.error?.message || 'Google tidak menemukan rute');
    return { sumber: 'google', routes: j.routes.map(x => ({ km: km(x.distanceMeters), menit: Math.round(parseInt(x.duration) / 60),
      garis: decodePolyline(x.polyline.encodedPolyline) })) };
  }
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${lng},${lat};${lng2},${lat2}`
    + `?overview=${alternatif ? 'full' : 'false'}&geometries=geojson${alternatif ? '&alternatives=3' : ''}`, { signal: AbortSignal.timeout(10000) });
  const j = await r.json();
  if (j.code !== 'Ok') throw new Error(j.message || j.code);
  return { sumber: 'osrm', routes: j.routes.map(x => ({ km: km(x.distance), menit: Math.round(x.duration / 60), garis: x.geometry?.coordinates }))
    .sort((a, b) => a.km - b.km) };
}
// Jarak tempuh (km) kost → kantor; null kalau layanan gagal
const ruteKm = async (lat, lng, lat2, lng2) => {
  try { return (await rute(lat, lng, lat2, lng2)).routes[0].km; } catch { return null; }
};
const kerja = async () => (await pool.query('SELECT kerja_lat, kerja_lng FROM kriteria WHERE id=1')).rows[0];
// jarak = jarak tempuh (fallback garis lurus bila rute gagal), jarak_lurus = garis lurus
const hitungJarak = async (k, lat, lng) => {
  const lurus = haversine(k.kerja_lat, k.kerja_lng, lat, lng);
  return { jarak: (await ruteKm(lat, lng, k.kerja_lat, k.kerja_lng)) ?? lurus, jarak_lurus: lurus };
};
const withJarak = async b => {
  if (b.lat !== '' && b.lat != null && b.lng !== '' && b.lng != null) Object.assign(b, await hitungJarak(await kerja(), +b.lat, +b.lng));
  return b;
};
// Kriteria tipe disimpan sebagai teks "Putri,Campur"; API memakai array
const tipeList = t => (t || '').split(',').filter(Boolean);
const tipeTxt = t => (Array.isArray(t) ? t : tipeList(t)).join(',');
const DEFAULTS = { tipe: 'Campur', status: 'Belum dihubungi', fasilitas: [], galeri: [] };
const clean = b => FIELDS.map(f => {
  if (NULLABLE.includes(f)) return b[f] === '' || b[f] == null ? null : b[f];
  if (f === 'detail_mamikos') return JSON.stringify(b[f] || {});
  return b[f] ?? DEFAULTS[f] ?? (f === 'harga' ? null : '');
});
const row = r => ({ ...r, jarak: r.jarak === null ? '' : +r.jarak, rating: r.rating ?? '', lat: r.lat ?? '', lng: r.lng ?? '', kamar_tersedia: r.kamar_tersedia ?? '',
  jarak_lurus: r.jarak_lurus === null ? '' : +r.jarak_lurus, rating_mamikos: r.rating_mamikos === null ? '' : +r.rating_mamikos, ulasan: r.ulasan ?? '', pilihan: r.pilihan ?? '', dilihat: r.dilihat !== false, tipe_lain: r.tipe_lain || [], detail_mamikos: r.detail_mamikos || {} });

// Ambil info publik dari satu halaman iklan kost (meta og:*, JSON-LD, kata kunci)
const FAS_KEYWORDS = {
  'AC': /\bAC\b|air conditioner/,
  'KM dalam': /k(amar )?m(andi)? dalam/i,
  'Listrik termasuk': /(termasuk|include|sudah) listrik|listrik (termasuk|include|gratis)/i,
  'WiFi': /wi-?fi|internet/i,
  'Kasur': /kasur/i,
  'Parkir motor': /parkir motor/i,
};
async function ambil(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36' } });
  if (!res.ok) throw new Error(`Halaman merespons ${res.status}`);
  const html = await res.text();
  const meta = p => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']*)`, 'i'))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${p}["']`, 'i'))?.[1];
  const decode = s => s?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')) || '';
  const desc = decode(meta('og:description') || meta('description')) || '';
  const all = `${decode(meta('og:title')) || ''} ${desc} ${text}`;

  const img = decode(meta('og:image'));
  const out = { link: url, nama: decode(meta('og:title') || html.match(/<title>([^<]*)/i)?.[1]) || '', gambar: img ? new URL(img, url).href : '' };
  const price = (meta('product:price:amount') || html.match(/"price"\s*:\s*"?(\d{5,8})/)?.[1]
    || all.match(/Rp\.?\s?([\d.]{6,11})\s*(?:\/\s*)?(?:bulan|bln)/i)?.[1] || '').replace(/\./g, '');
  if (price) out.harga = +price;
  const lat = html.match(/"lat(?:itude)?"\s*:\s*"?(-?\d+\.\d+)/i)?.[1], lng = html.match(/"(?:lng|lon|longitude)"\s*:\s*"?(-?\d+\.\d+)/i)?.[1];
  if (lat && lng) Object.assign(out, { lat: +lat, lng: +lng });
  const phone = html.match(/wa\.me\/(\d{9,15})/)?.[1] || html.match(/tel:\+?(\d{9,15})/)?.[1]
    || text.match(/(?:\+62|\b0)8\d{1,3}[-\s]?\d{3,4}[-\s]?\d{3,5}/)?.[0];
  if (phone) out.kontak = phone.replace(/[-\s]/g, '');
  out.alamat = decode(html.match(/"streetAddress"\s*:\s*"([^"]+)/)?.[1]) || '';
  out.tipe = /\bputri\b/i.test(all) && !/\bcampur\b/i.test(all) ? 'Putri' : /\bputra\b/i.test(all) && !/\bcampur\b/i.test(all) ? 'Putra' : 'Campur';
  out.fasilitas = Object.entries(FAS_KEYWORDS).filter(([, re]) => re.test(all)).map(([f]) => f);
  if (/mamikos\.com\/room\//.test(url)) {
    mamikos(html, out);
    out.detail_mamikos = rincianMamikos(html);
    if (out.detail_mamikos._id) {
      out.detail_mamikos.aturan = await aturanMamikos(out.detail_mamikos._id, out.detail_mamikos.aturan);
      if (out.detail_mamikos.jumlah_ulasan) out.detail_mamikos.ulasan = await ulasanMamikos(out.detail_mamikos._id);
    }
    delete out.detail_mamikos._id;
  }
  return withJarak(out);
}

// Ambil satu nilai JSON dari teks objek JS (kunci boleh berkutip atau tidak). pilih(v) → true untuk menerima nilai itu.
function nilaiJs(seg, kunci, pilih = () => true) {
  const re = new RegExp(`(?:"${kunci}"|\\b${kunci})\\s*:\\s*`, 'g');
  for (let m; (m = re.exec(seg));) {
    let i = m.index + m[0].length, j = i;
    const c = seg[i];
    if (c === '"' ) { for (j = i + 1; j < seg.length && seg[j] !== '"'; j++) if (seg[j] === '\\') j++; j++; }
    else if (c === '[' || c === '{') {
      let d = 0, str = false;
      for (; j < seg.length; j++) {
        const ch = seg[j];
        if (str) { if (ch === '\\') j++; else if (ch === '"') str = false; continue; }
        if (ch === '"') str = true; else if (ch === '[' || ch === '{') d++; else if ((ch === ']' || ch === '}') && --d === 0) { j++; break; }
      }
    } else { while (j < seg.length && !/[,}\n]/.test(seg[j])) j++; }
    try { const v = JSON.parse(seg.slice(i, j).trim()); if (pilih(v)) return v; } catch {}
  }
  return undefined;
}

// Rincian kost dari data halaman Mamikos: biaya, aturan dasar, fasilitas per kategori, deskripsi
function rincianMamikos(html) {
  const mulai = html.indexOf('var detail = {');
  if (mulai < 0) return {};
  const seg = html.slice(mulai, mulai + 200000);
  const angka = k => nilaiJs(seg, k, v => typeof v === 'number') || 0;
  const daftar = k => (nilaiJs(seg, k, Array.isArray) || []).filter(x => typeof x === 'string' && x.trim());
  const teks = k => { const v = nilaiJs(seg, k, x => typeof x === 'string'); return v ? v.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() : ''; };
  const lain = k => teks(k).split(/[,\n]/).map(x => x.trim()).filter(Boolean);
  const bool = k => nilaiJs(seg, k, v => typeof v === 'boolean');
  const dpAktif = bool('down_payment_is_active'), dp = angka('dp_percentage');
  const aturan = [bool('only_employee') && 'Khusus karyawan', bool('only_student') && 'Khusus mahasiswa'].filter(Boolean);
  return {
    _id: angka('_id'),
    biaya: {
      harian: angka('price_daily'), mingguan: angka('price_weekly'), bulanan: angka('price_monthly'),
      triwulan: angka('price_quarterly'), semester: angka('price_semiannualy') || angka('price_semiannually'), tahunan: angka('price_yearly'),
      min_bulan: angka('min_month') || null, dp_persen: dpAktif && dp ? dp : null,
      catatan: teks('price_remark'), termasuk: daftar('fac_price'),
    },
    aturan,
    fasilitas: {
      kamar: [...daftar('fac_room'), ...lain('fac_room_other')], kamar_mandi: [...daftar('fac_bath'), ...lain('fac_bath_other')],
      bersama: [...daftar('fac_share'), ...lain('fac_share_other')], parkir: daftar('fac_park'), sekitar: [...daftar('fac_near'), ...lain('fac_near_other')],
    },
    deskripsi: teks('description'),
    tahun_bangunan: angka('building_year') || null,
    diperbarui_pemilik: teks('updated_at') || null,
    pemilik: { nama: teks('owner_name'), online: teks('online'), top: bool('is_top_owner') || false, lambat: bool('is_slow_response_owner') || false,
      terima_persen: angka('accepted_rate') || null, waktu_balas: teks('average_time') || null },
    verifikasi: { kost: bool('is_verified_kost') || false, alamat: bool('is_verified_address') || false, telepon: bool('is_verified_phone') || false,
      dikunjungi: bool('is_visited_kost') || false, oleh_mamikos: bool('is_verified_by_mamikos') || false, level: teks('level_name'),
      apik: bool('is_apik') || false, singgahsini: bool('is_singgahsini') || false, elite: bool('is_elite') || false },
    kamar: { kosong_gedung: angka('total_available_room') || null, jumlah_tipe: angka('type_count') || null },
    popularitas: { disukai: angka('love_count'), dilihat: angka('view_count') },
    jumlah_ulasan: angka('review_count'),
  };
}

// Aturan kost dimuat terpisah oleh halaman Mamikos (JSON biasa)
async function aturanMamikos(id, dasar = []) {
  try {
    const r = await fetch(`https://mamikos.com/garuda/stories/${id}/rules`, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36', Referer: 'https://mamikos.com/' }, signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    return [...new Set([...dasar, ...(j.rules || []).map(x => x.name).filter(n => n && !/^kriteria umum$/i.test(n))])];
  } catch { return dasar; }
}

// Ulasan penghuni: rating per aspek + 5 ulasan terbaru beserta balasan pemilik
async function ulasanMamikos(id) {
  try {
    const r = await fetch(`https://mamikos.com/garuda/stories/${id}/reviews?sort=new&limit=5`, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36', Referer: 'https://mamikos.com/' }, signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    const a = j.all_rating || {};
    return {
      rating: +j.rating || null, jumlah: +j.data_count || 0,
      aspek: { Kebersihan: a.clean, Kenyamanan: a.happy, Keamanan: a.safe, Harga: a.pricing, 'Fasilitas kamar': a.room_facilities, 'Fasilitas umum': a.public_facilities },
      data: (j.data || []).map(u => ({ nama: u.name, rating: +u.rating, isi: u.content, tanggal: u.tanggal,
        balasan: u.reply_owner?.is_show ? u.reply_owner.reply : null })),
    };
  } catch { return null; }
}

// Halaman kamar Mamikos menyimpan data terstruktur di JSON inline (var detail = {...})
const MAMI_FAS = {
  'AC': /^AC$/i, 'KM dalam': /mandi dalam/i, 'Listrik termasuk': /termasuk listrik/i, 'WiFi': /wifi/i,
  'Kasur': /kasur/i, 'Lemari': /lemari/i, 'Meja': /^meja/i, 'Parkir motor': /parkir motor/i, 'Parkir mobil': /parkir mobil/i,
  'Dapur': /dapur/i, 'Laundry': /laundry|cuci/i, 'Air panas': /air panas|water heater/i, 'CCTV': /cctv/i, 'Bebas jam malam': /akses 24 jam/i,
};
// Ambil array JSON "cards" (foto-foto kost ini) dengan mencocokkan kurung, lalu pakai ukuran besar
function fotoMamikos(html) {
  const start = html.indexOf('"cards":[{"id"');
  if (start < 0) return [];
  let i = start + 8, depth = 0, inStr = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (inStr) { if (ch === '\\') i++; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '[' || ch === '{') depth++;
    else if ((ch === ']' || ch === '}') && --depth === 0) break;
  }
  try {
    const cards = JSON.parse(html.slice(start + 8, i + 1));
    return [...new Set(cards.filter(c => c.type === 'image').map(c => c.photo_url?.large || c.photo_url?.medium).filter(Boolean))];
  } catch { return []; }
}
function mamikos(html, out) {
  const json = re => { try { return JSON.parse(html.match(re)?.[1] ?? 'null'); } catch { return null; } };
  const harga = html.match(/"price_monthly":(\d+)/)?.[1];
  if (harga) out.harga = +harga;
  const gender = html.match(/"gender":(\d)/)?.[1];
  if (gender) out.tipe = { 0: 'Campur', 1: 'Putra', 2: 'Putri' }[gender];
  const title = json(/"room_title":("(?:[^"\\]|\\.)*")/);
  if (title) out.nama = title;
  const lat = html.match(/"latitude":(-?\d+\.\d+)/)?.[1], lng = html.match(/"longitude":(-?\d+\.\d+)/)?.[1];
  if (lat && lng) Object.assign(out, { lat: +lat, lng: +lng });
  const fac = ['room', 'bath', 'share', 'park', 'price'].flatMap(k => json(new RegExp(`"fac_${k}":(\\[[^\\]]*\\])`)) || []);
  if (fac.length) out.fasilitas = Object.entries(MAMI_FAS).filter(([, re]) => fac.some(f => re.test(f))).map(([f]) => f);
  const galeri = fotoMamikos(html);
  if (galeri.length) { out.galeri = galeri; out.gambar = galeri[0]; }
  const tersedia = html.match(/"available_room":(\d+)/)?.[1];
  if (tersedia !== undefined) out.kamar_tersedia = +tersedia;
  const rating = html.match(/"rating":(\d(?:\.\d+)?)\b/)?.[1], ulasan = html.match(/"review_count":(\d+)/)?.[1];
  if (rating && +rating > 0) out.rating_mamikos = Math.round(+rating * 10) / 10;
  if (ulasan) out.ulasan = +ulasan;
  out.ukuran = json(/"size":("(?:[^"\\]|\\.)*")/) || '';
}

// Pengumpul otomatis: proses daftar link satu per satu (dengan jeda), simpan yang sesuai budget & radius
const job = { running: false, total: 0, done: 0, saved: 0, skipped: 0, failed: 0, log: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const normLink = u => u.split('?')[0].replace(/\/$/, '');
const note = s => { job.log.unshift(`${new Date().toLocaleTimeString('id-ID')}  ${s}`); job.log.length = Math.min(job.log.length, 80); };
const rpTxt = n => `Rp ${n.toLocaleString('id-ID')}`;
async function kumpulkan(links, { reset = true, finish = true } = {}) {
  if (reset) Object.assign(job, { running: true, phase: 'Mengecek kost', total: 0, done: 0, saved: 0, skipped: 0, failed: 0, log: [] });
  Object.assign(job, { phase: 'Mengecek kost', total: links.length, done: 0 });
  const { rows: [c] } = await pool.query('SELECT budget, jarak, tipe FROM kriteria WHERE id=1');
  const tipeOk = tipeList(c.tipe);
  const { rows: ada } = await pool.query('SELECT link FROM kost');
  const sudah = new Set(ada.map(r => normLink(r.link)));
  for (const link of links) {
    try {
      if (sudah.has(normLink(link))) { job.skipped++; note(`= sudah ada: ${link}`); continue; }
      const k = await ambil(normLink(link));
      const lewatBudget = c.budget && k.harga > c.budget, lewatJarak = c.jarak && k.jarak !== undefined && k.jarak > +c.jarak;
      let hasil;
      const penuh = k.kamar_tersedia === 0, salahTipe = tipeOk.length && !tipeOk.includes(k.tipe);
      if (!k.harga || lewatBudget || lewatJarak || penuh || salahTipe) {
        job.skipped++;
        hasil = !k.harga ? 'harga tidak terbaca' : lewatBudget ? rpTxt(k.harga) : lewatJarak ? `${k.jarak} km` : salahTipe ? `kost ${k.tipe.toLowerCase()}` : 'kamar penuh';
        note(`✗ ${k.nama} — ${hasil}`);
      } else {
        await pool.query(`INSERT INTO kost (${FIELDS}) VALUES (${FIELDS.map((_, i) => '$' + (i + 1))})`, clean(k));
        sudah.add(normLink(link)); job.saved++; hasil = 'disimpan';
        note(`✓ ${k.nama} — ${rpTxt(k.harga)}, ${k.jarak ?? '?'} km`);
      }
      await pool.query('INSERT INTO dicek (link, hasil) VALUES ($1,$2) ON CONFLICT (link) DO UPDATE SET hasil=$2, dicek_at=now()', [normLink(link), hasil]);
    } catch (e) { job.failed++; note(`! gagal: ${link} (${e.message})`); }
    finally { job.done++; await sleep(2000); }
  }
  if (finish) { job.running = false; job.phase = 'Selesai'; }
}

// Cek ulang kost Mamikos yang sudah tersimpan: perbarui kamar tersedia & harga
async function perbarui() {
  const { rows } = await pool.query(`SELECT id, nama, link, harga, kamar_tersedia FROM kost
    WHERE link LIKE 'https://mamikos.com/room/%' AND pilihan IS DISTINCT FROM 'skip' ORDER BY dicek_ulang_at NULLS FIRST`);
  Object.assign(job, { phase: 'Cek ulang kost tersimpan', total: rows.length, done: 0 });
  for (const k of rows) {
    try {
      const b = await ambil(normLink(k.link));
      const tersedia = b.kamar_tersedia ?? k.kamar_tersedia, harga = b.harga || k.harga;
      if (k.kamar_tersedia > 0 && tersedia === 0) note(`🔴 ${k.nama} sekarang penuh`);
      else if (k.kamar_tersedia === 0 && tersedia > 0) note(`🟢 ${k.nama} ada ${tersedia} kamar kosong lagi`);
      if (harga !== k.harga) note(`💰 ${k.nama}: ${rpTxt(k.harga)} → ${rpTxt(harga)}`);
      await pool.query(`UPDATE kost SET kamar_tersedia=$1, harga=$2, dicek_ulang_at=now(),
        galeri=CASE WHEN cardinality(galeri)=0 THEN $4 ELSE galeri END,
        rating_mamikos=COALESCE($5, rating_mamikos), ulasan=COALESCE($6, ulasan),
        detail_mamikos=CASE WHEN $7::jsonb ? 'biaya' THEN $7::jsonb ELSE detail_mamikos END WHERE id=$3`,
        [tersedia, harga, k.id, b.galeri || [], b.rating_mamikos ?? null, b.ulasan ?? null, JSON.stringify(b.detail_mamikos || {})]);
    } catch (e) { job.failed++; note(`! gagal cek ulang: ${k.nama} (${e.message})`); }
    finally { job.done++; await sleep(2000); }
  }
  await perbaruiTipeLain();
  await simpanSampul();
}

// Simpan salinan foto sampul (ukuran kartu) semua kost tersimpan yang belum punya salinan
async function simpanSampul() {
  const { rows } = await pool.query(`SELECT coalesce(nullif(galeri[1], ''), gambar) AS u FROM kost WHERE pilihan IS DISTINCT FROM 'skip'`);
  let baru = 0;
  for (const { u } of rows) {
    if (!u || !fotoBoleh(u)) continue;
    const s = ukuranSedang(u);
    try { await stat(fotoBerkas(s)); continue; } catch {}
    if (await salinanFoto(s)) baru++;
    await sleep(300);
  }
  if (baru) note(`📷 ${baru} foto sampul disalin ke server`);
}

// Baca "Tipe kamar lainnya" per kost: sekali sehari, maksimal 40 kost per putaran (pakai browser, jadi lebih lambat)
async function perbaruiTipeLain(ids = null) {
  const { rows } = await pool.query(`SELECT id, link FROM kost WHERE link LIKE 'https://mamikos.com/room/%' AND pilihan IS DISTINCT FROM 'skip'
    AND ${ids ? 'id = ANY($1)' : "(tipe_lain_at IS NULL OR tipe_lain_at < now() - interval '1 day')"} ORDER BY tipe_lain_at NULLS FIRST LIMIT 40`, ids ? [ids] : []);
  if (!rows.length) return;
  if (!ids) Object.assign(job, { phase: 'Membaca tipe kamar lain', total: rows.length, done: 0 });
  const peta = await tipeLainMamikos(rows.map(r => normLink(r.link)), { log: ids ? () => {} : note });
  for (const r of rows) {
    const t = peta.get(normLink(r.link));
    if (t) await pool.query('UPDATE kost SET tipe_lain=$1, tipe_lain_at=now() WHERE id=$2', [JSON.stringify(t), r.id]);
    if (!ids) job.done++;
  }
}

// Engine otomatis: cari di Mamikos dengan browser tersembunyi, lalu cek kost yang belum pernah dicek
async function jalankanEngine() {
  if (job.running) throw new Error('Pengumpul sedang berjalan');
  Object.assign(job, { running: true, phase: 'Mencari di Mamikos', total: 0, done: 0, saved: 0, skipped: 0, failed: 0, log: [] });
  try {
    const { rows: [c] } = await pool.query('SELECT * FROM kriteria WHERE id=1');
    const { total, kotak, terpotong, rooms } = await cariMamikos({ lat: c.kerja_lat, lng: c.kerja_lng, km: +c.jarak || 5,
      budget: c.budget || 15000000, tipe: tipeList(c.tipe), log: note });
    const { rows: cek } = await pool.query("SELECT link FROM dicek WHERE hasil <> 'kamar penuh' OR dicek_at > now() - interval '7 days' UNION SELECT link FROM kost");
    const skip = new Set(cek.map(r => normLink(r.link)));
    const baru = [...new Set(rooms.filter(r => r.url && r.tersedia > 0 && (!c.budget || !r.harga || r.harga <= c.budget)).map(r => normLink(r.url)))]
      .filter(u => !skip.has(u));
    note(`Mamikos: ${kotak} kotak area dicari${terpotong ? ` (${terpotong} terpotong)` : ''}, ${rooms.length} kost unik, ${rooms.filter(r => r.tersedia > 0).length} ada kamar kosong, ${baru.length} belum pernah dicek` + (baru.length > c.auto_maks ? ` (dicek ${c.auto_maks} dulu)` : ''));
    await kumpulkan(baru.slice(0, c.auto_maks), { reset: false, finish: false });
    await perbarui();
    // Dicatat hanya bila selesai: kalau terputus (server restart), engine jalan lagi saat server menyala
    await pool.query('UPDATE kriteria SET auto_terakhir=now() WHERE id=1');
    note('Selesai'); job.running = false; job.phase = 'Selesai';
  } catch (e) {
    // Gagal → coba lagi ±15 menit lagi, bukan menunggu siklus penuh
    await pool.query(`UPDATE kriteria SET auto_terakhir = now() - make_interval(mins => $1) WHERE id=1`, [SIKLUS_MENIT - 15]).catch(() => {});
    note(`! Engine gagal: ${e.message} — dicoba lagi ±15 menit`); job.running = false; job.phase = 'Gagal';
  }
}

// Engine selalu aktif: jalan 1 menit setelah server menyala, lalu tiap SIKLUS_MENIT sejak jalan terakhir
const SIKLUS_MENIT = 30;
const cekJadwal = async () => {
  const { rows: [c] } = await pool.query('SELECT auto_terakhir FROM kriteria WHERE id=1');
  const jatuhTempo = !c.auto_terakhir || Date.now() - new Date(c.auto_terakhir) >= SIKLUS_MENIT * 60e3;
  if (jatuhTempo && !job.running && !process.env.NO_ENGINE) jalankanEngine();
};
setTimeout(cekJadwal, 60 * 1000);
setInterval(cekJadwal, 5 * 60 * 1000);

const app = express();
app.set('trust proxy', 1);  // di belakang reverse proxy (HTTPS) saat di-deploy
app.use(compression());     // gzip: data daftar kost jauh lebih kecil saat dikirim
app.use(express.json());

// ── Login: akun disimpan di tabel `pengguna` (kelola dengan `npm run akun`) ──
const RAHASIA = process.env.SESSION_SECRET || await siapkanAkun(pool);
if (process.env.SESSION_SECRET) await siapkanAkun(pool);
const SESI_HARI = 30, COOKIE = 'carko_sesi';
// Token sesi: username.kedaluwarsa.tanda-tangan
const tanda = (u, exp) => createHmac('sha256', RAHASIA).update(`${u}.${exp}`).digest('hex');
const buatSesi = u => { const exp = Date.now() + SESI_HARI * 864e5; return `${encodeURIComponent(u)}.${exp}.${tanda(u, exp)}`; };
// Akun yang sudah dihapus tidak bisa memakai sesinya lagi (dicek ke database, di-cache 30 detik)
const cacheAkun = new Map();
async function akunAda(u) {
  const c = cacheAkun.get(u);
  if (c && Date.now() - c.t < 30e3) return c.ada;
  const { rowCount } = await pool.query('SELECT 1 FROM pengguna WHERE username = $1', [u]);
  cacheAkun.set(u, { ada: rowCount > 0, t: Date.now() });
  return rowCount > 0;
}
async function sesiValid(req) {
  const c = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  const [uEnc, exp, sig] = (c?.slice(COOKIE.length + 1) || '').split('.');
  if (!uEnc || !exp || !sig || +exp < Date.now()) return null;
  const u = decodeURIComponent(uEnc), a = Buffer.from(sig), b = Buffer.from(tanda(u, exp));
  return a.length === b.length && timingSafeEqual(a, b) && (await akunAda(u)) ? u : null;
}
// Batasi percobaan login: 8 kali gagal per 15 menit per IP
const gagalLogin = new Map();

app.get('/api/sehat', async (_, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});
app.get('/api/sesi', async (req, res) => { const u = await sesiValid(req); res.json({ perluLogin: true, masuk: !!u, pengguna: u }); });
app.post('/api/masuk', async (req, res) => {
  const ip = req.ip, g = gagalLogin.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - g.t > 15 * 60e3) Object.assign(g, { n: 0, t: Date.now() });
  if (g.n >= 8) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
  const u = String(req.body?.pengguna || '').trim().toLowerCase();
  const { rows: [akun] } = await pool.query('SELECT username, sandi_hash FROM pengguna WHERE lower(username) = $1', [u]);
  if (!akun || !(await cocokSandi(req.body?.sandi || '', akun.sandi_hash))) {
    g.n++; gagalLogin.set(ip, g);
    return res.status(401).json({ error: 'Username atau kata sandi salah' });
  }
  gagalLogin.delete(ip);
  await pool.query('UPDATE pengguna SET terakhir_masuk = now() WHERE username = $1', [akun.username]);
  res.cookie(COOKIE, buatSesi(akun.username), { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESI_HARI * 864e5, path: '/' });
  res.json({ ok: true });
});
app.post('/api/keluar', (_, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });
// Semua API lain wajib login (halaman SPA tetap dilayani; halaman itu yang mengarahkan ke /masuk)
app.use('/api', async (req, res, next) => ((await sesiValid(req)) ? next() : res.status(401).json({ error: 'Silakan masuk dulu' })));
// URL lama (sebelum SvelteKit) dialihkan ke URL baru
app.get('/settings.html', (_, res) => res.redirect(301, '/pengaturan'));
app.get('/peta.html', (_, res) => res.redirect(301, '/peta'));
app.get('/detail.html', (req, res) => res.redirect(301, req.query.id ? `/kost/${encodeURIComponent(req.query.id)}` : '/'));
app.get('/index.html', (_, res) => res.redirect(301, '/'));
app.use(express.static(WEB, { index: false }))

app.post('/api/kumpulkan', (req, res) => {
  if (job.running) return res.status(409).json({ error: 'Masih memproses daftar sebelumnya' });
  const links = [...new Set((req.body.links || []).filter(l => /^https:\/\/mamikos\.com\/room\//.test(l)).map(normLink))];
  if (!links.length) return res.status(400).json({ error: 'Tidak ada link kamar Mamikos' });
  kumpulkan(links);
  res.json({ total: links.length });
});
app.get('/api/kumpulkan', (_, res) => res.json(job));
app.post('/api/perbarui', async (_, res) => {
  if (job.running) return res.status(409).json({ error: 'Pengumpul sedang berjalan' });
  Object.assign(job, { running: true, total: 0, done: 0, saved: 0, skipped: 0, failed: 0, log: [] });
  perbarui().finally(() => { job.running = false; job.phase = 'Selesai'; });
  res.json({ ok: true });
});
app.post('/api/engine', (_, res) => {
  if (job.running) return res.status(409).json({ error: 'Pengumpul sedang berjalan' });
  jalankanEngine(); res.json({ ok: true });
});

// ── Salinan foto: foto Mamikos disimpan di disk saat pertama dibuka, agar tetap tampil walau Mamikos memblokir / iklan dihapus ──
const FOTO_DIR = path.resolve(process.env.FOTO_DIR || fileURLToPath(new URL('./data/foto', import.meta.url)));
await mkdir(FOTO_DIR, { recursive: true });
const fotoBoleh = u => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'static.mamikos.com'; } catch { return false; } };
const fotoBerkas = u => path.join(FOTO_DIR, createHash('sha1').update(u).digest('hex') + (path.extname(new URL(u).pathname).toLowerCase().match(/^\.(jpe?g|png|webp)$/) ? path.extname(new URL(u).pathname).toLowerCase() : '.jpg'));
// Kembalikan path berkas salinan (unduh dulu bila belum ada); null bila gagal dan belum ada salinan
async function salinanFoto(u) {
  const f = fotoBerkas(u);
  try { await stat(f); return f; } catch {}
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36', Referer: 'https://mamikos.com/' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) return null;
    await writeFile(f, Buffer.from(await r.arrayBuffer()));
    return f;
  } catch { return null; }
}
const ukuranSedang = u => String(u).replace(/-(240x320|360x480|540x720)\.(jpe?g|png|webp)$/i, '-360x480.$2');

// Daftar kost versi ringkas: rincian Mamikos (deskripsi, ulasan, fasilitas lengkap, dll.) hanya dikirim di /api/kost/:id.
// Galeri dipotong 3 foto pertama; jumlah aslinya di galeri_total (galeri lengkap diambil saat dibutuhkan).
const FOTO_DAFTAR = 3;
const ringkasDaftar = r => {
  const k = row(r), d = k.detail_mamikos || {};
  return { ...k, galeri: (k.galeri || []).slice(0, FOTO_DAFTAR), galeri_total: (k.galeri || []).length,
    detail_mamikos: { aturan: d.aturan || [], biaya: { min_bulan: d.biaya?.min_bulan ?? null, termasuk: d.biaya?.termasuk || [] }, jumlah_ulasan: d.jumlah_ulasan || 0 } };
};
app.get('/api/kost', async (_, res) => {
  const { rows } = await pool.query('SELECT * FROM kost ORDER BY id');
  res.json(rows.map(ringkasDaftar));
});

// Kost yang sudah tersimpan: link sama, atau nama sama di lokasi yang sama (±50 m)
async function cariDuplikat({ link, nama, lat, lng }, kecuali = null) {
  const { rows } = await pool.query(`SELECT id, nama, pilihan FROM kost WHERE id IS DISTINCT FROM $5 AND (
      ($1 <> '' AND split_part(rtrim(link, '/'), '?', 1) = $1)
      OR (lower(trim(nama)) = lower(trim($2)) AND lat IS NOT NULL AND $3::float IS NOT NULL
          AND abs(lat - $3::float) < 0.0005 AND abs(lng - $4::float) < 0.0005)) LIMIT 1`,
    [link ? normLink(link) : '', nama || '', lat === '' || lat == null ? null : +lat, lng === '' || lng == null ? null : +lng, kecuali]);
  return rows[0] || null;
}

app.post('/api/kost', async (req, res) => {
  const duplikat = await cariDuplikat(req.body);
  if (duplikat) return res.status(409).json({ error: 'Kost ini sudah tersimpan', duplikat });
  const { rows } = await pool.query(
    `INSERT INTO kost (${FIELDS}, dilihat) VALUES (${FIELDS.map((_, i) => '$' + (i + 1))}, true) RETURNING *`, clean(await withJarak(req.body)));
  res.status(201).json(row(rows[0]));
});

// Tandai kost sudah dilihat: { id } untuk satu kost, tanpa id = semua
app.post('/api/dilihat', async (req, res) => {
  if (req.body.id) await pool.query('UPDATE kost SET dilihat=true WHERE id=$1', [req.body.id]);
  else await pool.query('UPDATE kost SET dilihat=true WHERE NOT dilihat');
  res.sendStatus(204);
});

app.put('/api/kost/:id', async (req, res) => {
  // Rute hanya dihitung ulang bila koordinat berubah (ganti status/catatan harus cepat)
  const { rows: [old] } = await pool.query('SELECT lat, lng, jarak FROM kost WHERE id=$1', [req.params.id]);
  const b = req.body, sama = old && old.jarak !== null && +b.lat === old.lat && +b.lng === old.lng;
  const { rows } = await pool.query(
    `UPDATE kost SET ${FIELDS.map((f, i) => `${f}=$${i + 1}`)}, updated_at=now() WHERE id=$${FIELDS.length + 1} RETURNING *`,
    [...clean(sama ? b : await withJarak(b)), req.params.id]);
  rows[0] ? res.json(row(rows[0])) : res.sendStatus(404);
});

app.delete('/api/kost/:id', async (req, res) => {
  await pool.query('DELETE FROM kost WHERE id=$1', [req.params.id]);
  res.sendStatus(204);
});

app.post('/api/ambil', async (req, res) => {
  try {
    const k = await ambil(req.body.url);
    res.json({ ...k, duplikat: await cariDuplikat(k) });
  }
  catch (e) { res.status(422).json({ error: e.message }); }
});

app.get('/api/kriteria', async (_, res) => {
  const { rows: [c] } = await pool.query('SELECT * FROM kriteria WHERE id=1');
  res.json({ budget: c.budget ?? '', jarak: c.jarak === null ? '' : +c.jarak, tipe: tipeList(c.tipe), fas: c.fas,
    kerja_nama: c.kerja_nama, kerja_lat: c.kerja_lat, kerja_lng: c.kerja_lng,
    auto_terakhir: c.auto_terakhir, siklus_menit: SIKLUS_MENIT,
    berikutnya: c.auto_terakhir ? new Date(+new Date(c.auto_terakhir) + SIKLUS_MENIT * 60e3) : null,
    dicek: +(await pool.query('SELECT count(*) FROM dicek')).rows[0].count });
});

app.put('/api/kriteria', async (req, res) => {
  const { budget, jarak, tipe, fas, kerja_nama, kerja_lat, kerja_lng } = req.body;
  const { rows: [old] } = await pool.query('SELECT kerja_lat, kerja_lng, budget, jarak, tipe FROM kriteria WHERE id=1');
  await pool.query(`UPDATE kriteria SET budget=$1, jarak=$2, tipe=$3, fas=$4,
    kerja_nama=COALESCE($5, kerja_nama), kerja_lat=COALESCE($6, kerja_lat), kerja_lng=COALESCE($7, kerja_lng) WHERE id=1`,
    [budget || null, jarak || null, tipeTxt(tipe), fas || [], kerja_nama || null, kerja_lat || null, kerja_lng || null]);
  const pindah = kerja_lat && kerja_lng && (+kerja_lat !== old.kerja_lat || +kerja_lng !== old.kerja_lng);
  // Kriteria berubah → kost yang dulu ditolak boleh dicek ulang oleh engine dengan kriteria baru
  if (pindah || (+budget || null) !== old.budget || (+jarak || null) !== (old.jarak === null ? null : +old.jarak) || tipeTxt(tipe) !== (old.tipe || ''))
    await pool.query("DELETE FROM dicek WHERE hasil <> 'disimpan'");
  res.sendStatus(204);
  // Lokasi kerja pindah → hitung ulang jarak semua kost yang punya koordinat (di latar belakang)
  if (pindah) hitungUlangJarak();
});

async function hitungUlangJarak() {
  const k = await kerja();
  const { rows } = await pool.query('SELECT id, lat, lng FROM kost WHERE lat IS NOT NULL AND lng IS NOT NULL');
  for (const r of rows) {
    const j = await hitungJarak(k, r.lat, r.lng);
    await pool.query('UPDATE kost SET jarak=$1, jarak_lurus=$2 WHERE id=$3', [j.jarak, j.jarak_lurus, r.id]);
    await sleep(300);
  }
}
app.post('/api/hitung-jarak', (_, res) => { hitungUlangJarak(); res.json({ ok: true }); });

// Segarkan rincian Mamikos satu kost (dipakai halaman detail bila belum pernah dibaca)
app.post('/api/segarkan/:id', async (req, res) => {
  const { rows: [k] } = await pool.query('SELECT * FROM kost WHERE id=$1', [req.params.id]);
  if (!k) return res.sendStatus(404);
  if (!/^https:\/\/mamikos\.com\/room\//.test(k.link || '')) return res.json(row(k));
  try {
    const b = await ambil(normLink(k.link));
    const { rows: [s] } = await pool.query(`UPDATE kost SET detail_mamikos=$1, kamar_tersedia=COALESCE($2, kamar_tersedia) WHERE id=$3 RETURNING *`,
      [JSON.stringify(b.detail_mamikos || {}), b.kamar_tersedia ?? null, k.id]);
    res.json(row(s));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Baca ulang "Tipe kamar lainnya" satu kost (dipakai halaman detail bila belum pernah dibaca)
app.post('/api/tipe-lain/:id', async (req, res) => {
  try {
    await perbaruiTipeLain([+req.params.id]);
    const { rows: [k] } = await pool.query('SELECT * FROM kost WHERE id=$1', [req.params.id]);
    k ? res.json(row(k)) : res.sendStatus(404);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/foto', async (req, res) => {
  const u = String(req.query.u || '');
  if (!fotoBoleh(u)) return res.status(400).json({ error: 'Alamat foto tidak diizinkan' });
  const f = await salinanFoto(u);
  if (!f) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=2592000, immutable').sendFile(f);
});

app.get('/api/kost/:id', async (req, res) => {
  const { rows: [k] } = await pool.query('SELECT * FROM kost WHERE id=$1', [req.params.id]);
  k ? res.json(row(k)) : res.sendStatus(404);
});

// Rute kost → kantor beserta alternatif, untuk peta di halaman detail
app.get('/api/rute/:id', async (req, res) => {
  const { rows: [k] } = await pool.query('SELECT lat, lng FROM kost WHERE id=$1', [req.params.id]);
  if (!k?.lat) return res.status(404).json({ error: 'Kost belum punya koordinat' });
  const c = await kerja();
  try { res.json(await rute(k.lat, k.lng, c.kerja_lat, c.kerja_lng, { alternatif: true })); }
  catch (e) { res.status(502).json({ error: 'Layanan rute gagal: ' + e.message }); }
});

// Clean routing: semua URL non-API dilayani aplikasi SvelteKit (SPA)
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile('index.html', { root: WEB });
});

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: err.message }); });

const port = process.env.PORT || 3000;
// Lokal: hanya dari laptop ini. Di server, CARKO berada di belakang Caddy (127.0.0.1) atau diset HOST=0.0.0.0.
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`CARKO - Cari Kost jalan di http://localhost:${port}`));
