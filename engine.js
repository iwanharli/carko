// Browser tersembunyi: buka pencarian Mamikos di sekitar kantor, kumpulkan link kamar dari daftar yang dirender halaman.
// Mamikos hanya memuat ±1.000 kost per pencarian, jadi area dibagi menjadi kotak-kotak kecil yang dicari bergantian;
// kotak yang masih terlalu padat dipecah lagi menjadi 4.
import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BATAS_KOTAK = 900;   // kotak dengan hasil lebih dari ini dipecah
const SISI_AWAL_KM = 4;    // ukuran kotak awal
const KEDALAMAN_MAKS = 3;  // 4 km → 2 km → 1 km → 0,5 km

// Cari satu kotak lewat state pencarian halaman Mamikos sendiri. Kalau terlalu padat, kembalikan { pecah: true } tanpa memuat daftar.
function cariKotak({ sw, ne, budget, gender, boleh, batas }) {
  const s = [...document.querySelectorAll('*')].map(e => e.__vue__).find(v => v?.$store?.state?.kosList).$store;
  s.state.params.location = [sw, ne];
  s.state.params.filters.price_range = [10000, budget];
  s.state.params.filters.is_available = true;
  s.state.params.filters.gender = gender;
  return (async () => {
    await s.dispatch('fetchRooms');
    const total = s.state.totalRooms;
    if (boleh && total > batas) return { total, pecah: true };
    for (let i = 0; s.state.hasMore && i < 60; i++) {
      await s.dispatch('fetchRooms', { loadingMore: true });
      await new Promise(r => setTimeout(r, 700));
    }
    return { total, terpotong: s.state.hasMore, rooms: s.state.kosList.map(k => ({ url: k.share_url, nama: k['room-title'],
      harga: +String(k.price_title_format?.price || '').replace(/\D/g, '') || null, tersedia: k.available_room ?? 0 })) };
  })();
}

export async function cariMamikos({ lat, lng, km, budget, tipe, log = () => {} }) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ userAgent: UA, viewport: { width: 1400, height: 900 }, locale: 'id-ID' });
    log('Membuka Mamikos…');
    await page.goto('https://mamikos.com/cari/jakarta-selatan/all/bulanan/0-' + budget, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForFunction(() => [...document.querySelectorAll('*')].some(e => e.__vue__?.$store?.state?.kosList), null, { timeout: 30000 });

    // Kode gender Mamikos: 0 = campur, 1 = putra, 2 = putri
    const gender = tipe.map(t => ({ Campur: 0, Putra: 1, Putri: 2 })[t]).filter(x => x !== undefined);
    const kmLat = 1 / 111, kmLng = 1 / (111 * Math.cos(lat * Math.PI / 180));
    const n = Math.max(1, Math.ceil((2 * km) / SISI_AWAL_KM)), sisi = (2 * km) / n;

    // Kotak awal: grid n×n menutupi lingkaran radius km; kotak yang seluruhnya di luar lingkaran dilewati
    let antre = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) antre.push({ x: -km + i * sisi, y: -km + j * sisi, s: sisi, d: 0 });
    const diLuar = k => Math.hypot(Math.max(k.x, 0, -(k.x + k.s)), Math.max(k.y, 0, -(k.y + k.s))) > km;
    antre = antre.filter(k => !diLuar(k));

    const hasil = new Map();
    let total = 0, selesai = 0, terpotong = 0;
    while (antre.length) {
      const k = antre.shift();
      const sw = [lng + k.x * kmLng, lat + k.y * kmLat], ne = [lng + (k.x + k.s) * kmLng, lat + (k.y + k.s) * kmLat];
      const r = await page.evaluate(cariKotak, { sw, ne, budget, gender, boleh: k.d < KEDALAMAN_MAKS, batas: BATAS_KOTAK });
      if (r.pecah) {
        const h = k.s / 2;
        antre.push(...[[0, 0], [h, 0], [0, h], [h, h]].map(([dx, dy]) => ({ x: k.x + dx, y: k.y + dy, s: h, d: k.d + 1 })).filter(c => !diLuar(c)));
        continue;
      }
      total += r.total; selesai++; if (r.terpotong) terpotong++;
      for (const room of r.rooms) if (room.url) hasil.set(room.url, room);
      log(`Kotak ${selesai} (${k.s.toFixed(1)} km): ${r.total} kost${r.terpotong ? ' — terpotong' : ''} · ${hasil.size} unik terkumpul`);
    }
    return { total, kotak: selesai, terpotong, rooms: [...hasil.values()] };
  } finally {
    await browser.close();
  }
}

// Baca bagian "Tipe kamar lainnya" di halaman kamar Mamikos (dimuat setelah halaman digulir).
// links: [url] → Map(url → [{ nama, harga, kamar, ukuran, fasilitas, foto, gender }])
export async function tipeLainMamikos(links, { log = () => {} } = {}) {
  const hasil = new Map();
  if (!links.length) return hasil;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ userAgent: UA, viewport: { width: 1400, height: 900 }, locale: 'id-ID' });
    for (const url of links) {
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        for (let y = 0; y < 9000; y += 900) { await page.evaluate(y => scrollTo(0, y), y); await page.waitForTimeout(200); }
        await page.waitForTimeout(800);
        const tipe = await page.evaluate(() => [...document.querySelectorAll('[data-testid=roomTypeCards]')].map(el => {
          let vm = el.__vue__, c = el;
          while (!vm && c.parentElement) { c = c.parentElement; vm = c.__vue__; }
          const p = vm?.$props || {};
          const angka = s => +String(s || '').replace(/\D/g, '') || null;
          const tersedia = String(p.roomAvailability || '');
          return { nama: p.roomTypeName || '', harga: angka(p.roomFinalPrice), ukuran: p.roomSize || '', gender: p.roomGender || '',
            kamar: /penuh/i.test(tersedia) ? 0 : angka(tersedia) ?? null, status: tersedia, foto: p.photoCoverUrl || '',
            fasilitas: [...(p.topFacilities || []), ...(p.roomFacilities || []).map(f => f.name)] };
        }).filter(t => t.nama));
        hasil.set(url, tipe);
        if (tipe.length) log(`↳ ${tipe.length} tipe lain: ${tipe.map(t => `${t.nama} (${t.kamar === 0 ? 'penuh' : t.status || '?'})`).join(', ')}`);
      } catch (e) { log(`! gagal baca tipe lain: ${url} (${e.message})`); }
    }
  } finally {
    await browser.close();
  }
  return hasil;
}
