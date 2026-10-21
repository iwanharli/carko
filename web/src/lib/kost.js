// Utilitas bersama: API, format angka, dan aturan kriteria kost

export const FASILITAS = ['AC', 'KM dalam', 'Listrik termasuk', 'WiFi', 'Kasur', 'Lemari', 'Meja', 'Parkir motor', 'Parkir mobil',
  'Dapur', 'Laundry', 'Air panas', 'CCTV', 'Bebas jam malam'];
export const UTAMA = ['AC', 'KM dalam', 'Listrik termasuk'];
export const FAS_ICON = { AC: 'snowflake', 'KM dalam': 'bath', 'Listrik termasuk': 'zap', WiFi: 'wifi', Kasur: 'bed-double' };
// Status kontak; suka/skip disimpan terpisah di kolom 'pilihan'
export const STATUS = ['Belum dihubungi', 'Sudah dihubungi', 'Sudah survei'];
export const ALASAN_SKIP = ['Kamar sempit', 'Kamar gelap', 'Lingkungan kurang', 'Akses jalan sulit', 'Harga tidak sepadan', 'Foto kurang meyakinkan'];

export const api = (url, method = 'GET', body) =>
  fetch('/api/' + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
    .then(async r => {
      // Sesi habis / belum masuk (saat di-deploy dengan APP_PASSWORD) → ke halaman masuk
      if (r.status === 401 && !location.pathname.startsWith('/masuk')) {
        location.href = '/masuk?ke=' + encodeURIComponent(location.pathname + location.search);
        return new Promise(() => {});
      }
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw Object.assign(new Error(data.error || r.statusText), { status: r.status, data });
      }
      return r.status === 204 ? null : r.json();
    });

export const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
export const rpShort = n => (n >= 1e6 ? `Rp ${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 })} jt` : rp(n));
export const hargaPendek = n => (n >= 1e6 ? (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' jt' : Math.round(n / 1e3) + ' rb');
export const waNum = s => String(s).replace(/\D/g, '').replace(/^0/, '62');
export const tanggalPendek = d => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

// "lat, lng" atau link Google Maps (…@lat,lng… / ?q=lat,lng / !3dlat!4dlng) → [lat, lng]
export const parseKoor = s => {
  const m = String(s).match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || String(s).match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  return m ? [+m[1], +m[2]] : null;
};

// Daftar alasan kost tidak sesuai kriteria (kosong = sesuai)
export function masalah(k, crit) {
  const out = [];
  if (crit.budget && +k.harga > +crit.budget) out.push(`Lewat budget ${rp(k.harga - crit.budget)}`);
  if (crit.jarak && k.jarak !== '' && +k.jarak > +crit.jarak) out.push(`Di luar radius ${crit.jarak} km`);
  if (crit.tipe.length && !crit.tipe.includes(k.tipe)) out.push(`Kost ${k.tipe.toLowerCase()}`);
  if (k.kamar_tersedia === 0) out.push('Kamar penuh');
  const kurang = crit.fas.filter(f => !(k.fasilitas || []).includes(f));
  if (kurang.length) out.push('Tanpa ' + kurang.join(', '));
  return out;
}
// Tampil di daftar utama: tidak di-skip & memenuhi semua kriteria
export const sesuai = (k, crit) => k.pilihan !== 'skip' && !masalah(k, crit).length;

// Bagian spesifikasi yang melanggar kriteria → teks merah
export const langgar = (k, crit) => ({
  harga: !!crit.budget && +k.harga > +crit.budget,
  jarak: !!crit.jarak && k.jarak !== '' && +k.jarak > +crit.jarak,
  tipe: crit.tipe.length > 0 && !crit.tipe.includes(k.tipe),
});

export const fotoKost = k => (k.galeri?.length ? k.galeri : k.gambar ? [k.gambar] : []);
// Mamikos menyediakan foto dalam 3 ukuran; kartu & thumbnail cukup pakai yang kecil agar hemat kuota
const UKURAN = { kecil: '240x320', sedang: '360x480', besar: '540x720' };
// Foto Mamikos dilewatkan ke /api/foto: server menyimpan salinannya, jadi tetap tampil walau Mamikos memblokir / iklan dihapus
export const ukuranFoto = (url, u) => {
  const x = String(url).replace(/-(240x320|360x480|540x720)\.(jpe?g|png|webp)$/i, `-${UKURAN[u]}.$2`);
  return /^https:\/\/(static\.mamikos\.com|images\.rukita\.co|media\.coveliving\.io)\//.test(x) ? '/api/foto?u=' + encodeURIComponent(x) : x;
};

// Label tipe kamar: bagian nama yang berbeda antar varian, misal "Tipe A" dari "Kost D Daunan Tipe A Jagakarsa"
export function labelVarian(v, varian) {
  const kata = varian.map(x => x.nama.split(' ')), w = v.nama.split(' ');
  let a = 0, b = 0;
  while (kata.every(t => t[a] === w[a]) && a < w.length) a++;
  while (kata.every(t => t[t.length - 1 - b] === w[w.length - 1 - b]) && b < w.length - a) b++;
  if (a > 0 && /^(tipe|type|kamar|lantai)$/i.test(w[a - 1])) a--;  // "A" → "Tipe A", "Non AC" → "Tipe Non AC"
  return w.slice(a, w.length - b).join(' ') || v.tipe;
}

// Pisahkan nama kost dari nama daerah di ujungnya: "Kost Amanda Tipe A Kebayoran Baru Jakarta Selatan"
// → { nama: "Kost Amanda Tipe A", daerah: "Kebayoran Baru Jakarta Selatan" }. Label "Tipe X" tidak ikut terpotong.
export function pisahNama(k) {
  const kata = k.nama.split(' ');
  const alamat = new Set((k.alamat || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1));
  let akhir = kata.length;
  while (akhir > 2 && alamat.has(kata[akhir - 1].toLowerCase()) && !/^(tipe|type)$/i.test(kata[akhir - 2])) akhir--;
  const daerah = kata.slice(akhir).join(' ') || (k.alamat || '').split(',').slice(0, 2).join(',').trim();
  return { nama: kata.slice(0, akhir).join(' '), daerah };
}

// Situs asal iklan, dari link-nya
export const sumberKost = k => (/infokost\.id/.test(k.link || '') ? 'Infokost' : /cove\.id/.test(k.link || '') ? 'Cove' : /mamikos\.com/.test(k.link || '') ? 'Mamikos' : k.link ? 'Lainnya' : 'Manual');
// Teks ketersediaan: jumlah kamar (Mamikos) atau sekadar tersedia/penuh (Infokost, Cove)
export const teksKamar = k => k.kamar_tersedia === 0 ? 'Kamar penuh' : k.kamar_tersedia > 0 ? `${k.kamar_tersedia} kamar tersedia`
  : k.detail_mamikos?.tersedia ? 'Kamar tersedia' : null;
