// Sumber kost selain Mamikos: Infokost (termasuk properti Rukita) dan Cove.
// Hanya membaca halaman publik yang diizinkan robots.txt: halaman area/directory & halaman kost (bukan halaman pencarian).
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unduh = async url => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'id-ID,id' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.text();
};
const km = (a, b, c, d) => {
  const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

export const sumberDari = url => (/infokost\.id\/listings\//.test(url) ? 'infokost' : /cove\.id\/listings\//.test(url) ? 'cove' : /mamikos\.com\/room\//.test(url) ? 'mamikos' : null);

// ─────────────────────────────── Infokost ───────────────────────────────
// Data halaman Next.js (RSC) dipecah di banyak self.__next_f.push([1,"…"]); gabungkan lalu ambil objek JSON di sekitar suatu kunci.
function rscInfokost(html) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map(m => JSON.parse(`"${m[1]}"`)).join('');
}
function objekInduk(teks, idx) {
  let d = 0, i = idx;
  while (i > 0) { i--; if (teks[i] === '}') d++; else if (teks[i] === '{') { if (!d) break; d--; } }
  let j = i; d = 0;
  for (; j < teks.length; j++) { if (teks[j] === '{') d++; else if (teks[j] === '}' && --d === 0) break; }
  return JSON.parse(teks.slice(i, j + 1));
}
const IK_GENDER = { '2_FEMALE': 'Putri', '1_MALE': 'Putra', '0_BOTH': 'Campur' };
// Fasilitas Infokost → label CARKO
const IK_FAS = { AIR_CONDITIONER: 'AC', PRIVATE_BATHROOM: 'KM dalam', ELECTRICITY_INCLUDED: 'Listrik termasuk', WIFI: 'WiFi', WARDROBE: 'Lemari',
  TABLE: 'Meja', PARKING_MOTORBIKE: 'Parkir motor', PARKING_CAR: 'Parkir mobil', KITCHEN_ROOM: 'Dapur', SERVICE_LAUNDRY: 'Laundry',
  WATER_HEATER: 'Air panas', CCTV: 'CCTV', '24_HOUR_ACCESS': 'Bebas jam malam' };
// Aturan Infokost (valueBool) → kalimat aturan
const IK_ATURAN = {
  '24_HOUR_ACCESS': [ 'Akses 24 Jam', null ], NO_SMOKING: [ 'Dilarang merokok', null ],
  MARRIED_COUPLE: [ 'Pasutri diperbolehkan', 'Tidak untuk pasutri' ], CHILDREN_ALLOWED: [ 'Boleh bawa anak', 'Tidak boleh bawa anak' ],
  CAN_CARRY_PETS: [ 'Boleh bawa hewan', 'Dilarang bawa hewan' ], GUEST_STAYOVER_ALLOWED: [ 'Tamu boleh menginap', 'Tamu dilarang menginap' ],
};
const KATEGORI_IK = { 'Kamar Mandi': 'kamar_mandi', 'Tempat tidur': 'kamar', Furnitur: 'kamar', 'Alat elektronik': 'kamar', 'Pemandangan Luar': 'kamar',
  'Area parkir': 'parkir', Utilities: 'bersama', Keamanan: 'bersama', Layanan: 'bersama', 'Area bersama': 'bersama', 'Dapur & Area makan': 'bersama',
  Peralatan: 'bersama', 'Ruang Tamu': 'bersama', 'Fasilitas Olahraga': 'bersama' };

export async function ambilInfokost(url) {
  const html = await unduh(url), rsc = rscInfokost(html);
  const id = url.match(/-(\d+)\/?(?:[?#].*)?$/)?.[1];
  const idx = rsc.indexOf(`"variant":{"id":${id}`);
  if (!id || idx < 0) throw new Error('Data kost Infokost tidak ditemukan');
  const o = objekInduk(rsc, idx), a = o.asset, v = o.variant;
  const attr = [...(o.assetAttributes || []), ...(o.variantAttributes || [])].filter(x => x.valueBool);
  const semuaAttr = [...(o.assetAttributes || []), ...(o.variantAttributes || [])];
  const fasilitas = [...new Set(attr.map(x => IK_FAS[x.attrId] || (/_BED/.test(x.attrId) ? 'Kasur' : null)).filter(Boolean))];
  const aturan = semuaAttr.filter(x => x.attrGroupName === 'House Rules' && IK_ATURAN[x.attrId])
    .map(x => IK_ATURAN[x.attrId][x.valueBool ? 0 : 1]).filter(Boolean);
  const kelompok = { kamar: [], kamar_mandi: [], bersama: [], parkir: [], sekitar: [] };
  for (const x of attr) if (x.attrGroupName !== 'House Rules') kelompok[KATEGORI_IK[x.attrGroupName] || 'bersama'].push(x.attrName);
  for (const k in kelompok) kelompok[k] = [...new Set(kelompok[k])];
  const galeri = [...(o.variantDisplay?.medias || []), ...(o.assetDisplay?.assetMedias || [])].filter(m => m.type === 'IMAGE').map(m => m.url);
  // AVAILABLE = ada kamar; UNKNOWN (umumnya kost mitra) = tidak diketahui, jangan dianggap penuh; selain itu penuh
  const tersedia = o.availability === 'AVAILABLE' ? true : o.availability === 'UNKNOWN' || !o.availability ? null : false;
  // Kost mitra sering menulis nama gedung lagi di nama tipe ("Kost X" + "Kost X Tipe A …")
  const nama = v.name.toLowerCase().includes(a.name.toLowerCase()) ? v.name : `${a.name} ${v.name}`;
  return {
    link: url, nama, harga: v.price, tipe: IK_GENDER[v.gender] || IK_GENDER[a.assetGender] || 'Campur',
    alamat: a.address || [o.locDisplay?.subDistrictName, o.locDisplay?.districtName, o.locDisplay?.cityName].filter(Boolean).join(', '),
    lat: +a.coordinate?.latitude || undefined, lng: +a.coordinate?.longitude || undefined,
    ukuran: v.areaSizeMeter ? `${v.areaSizeMeter} m²` : '', kamar_tersedia: tersedia === false ? 0 : null,
    gambar: galeri[0] || '', galeri, fasilitas,
    tipe_lain: (o.otherVariantsData?.list || []).filter(x => x.id !== v.id)
      .map(x => ({ nama: x.name, harga: x.price, kamar: null, status: '', ukuran: x.areaSizeMeter ? `${x.areaSizeMeter} m²` : '', gender: IK_GENDER[x.gender] || '', fasilitas: [] })),
    detail_mamikos: {
      sumber: 'infokost', tersedia,
      biaya: { bulanan: v.price, min_bulan: null, dp_persen: null, catatan: v.maxOccupancy > 1 ? `Maks. ${v.maxOccupancy} orang/kamar` : '',
        termasuk: attr.some(x => x.attrId === 'ELECTRICITY_INCLUDED') ? ['Termasuk listrik'] : [] },
      aturan, fasilitas: kelompok, deskripsi: '',
      verifikasi: { level: a.commercialType === 'INFOKOST_PRO' || a.type === '1_CO_LIVING' ? 'Rukita / Infokost Pro' : '' },
      popularitas: { disukai: o.totalFavorites || 0 },
    },
  };
}

// Kandidat kost dari halaman area Jakarta Selatan (dari sitemap); kartu sudah memuat harga, jadi yang di atas budget dilewati
export async function cariInfokost({ budget, log = () => {} }) {
  const peta = await unduh('https://infokost.id/cari-kost/sitemap_index.xml');
  const sitemaps = [...peta.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  let area = [];
  for (const s of sitemaps) { area.push(...[...(await unduh(s)).matchAll(/<loc>(https:\/\/infokost\.id\/kost\/[a-z0-9.-]+-jakarta-selatan)<\/loc>/g)].map(m => m[1])); await sleep(500); }
  area = [...new Set(area)];
  log(`Infokost: ${area.length} halaman area Jakarta Selatan`);
  const hasil = new Map();
  for (const a of area) {
    try {
      const h = await unduh(a);
      for (const [, link, harga] of h.matchAll(/href="(\/listings\/[a-z0-9-]+)"[\s\S]*?Rp([\d.]+)/g)) {
        const p = +harga.replace(/\./g, '');
        if (!hasil.has(link) && (!budget || p <= budget)) hasil.set(link, p);
      }
    } catch (e) { log(`! Infokost ${a}: ${e.message}`); }
    await sleep(1500);
  }
  return [...hasil.keys()].map(l => 'https://infokost.id' + l);
}

// ─────────────────────────────── Cove ───────────────────────────────
const nextData = html => JSON.parse(html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1] || 'null')?.props?.pageProps;
const COVE_FAS = [['ac', 'AC'], ['water_heater', 'Air panas'], ['wardrobe', 'Lemari'], ['desk', 'Meja']];

export async function ambilCove(url) {
  const pp = nextData(await unduh(url));
  if (!pp?.listing) throw new Error('Data kamar Cove tidak ditemukan');
  const L = pp.listing, P = L.property, B = P.building, H = pp.listingHome || L.homes?.[0] || {};
  const tag = (P.tags || []).map(t => `${t.slug} ${t.name?.id || ''}`.toLowerCase()).join(' ');
  const tipe = /female|women|wanita|putri/.test(tag) ? 'Putri' : /\bmale\b|\bmen\b|pria|putra/.test(tag) ? 'Putra' : 'Campur';
  const fasilitas = [...COVE_FAS.filter(([k]) => H[k]).map(([, l]) => l), H.bathroom === 'private' && 'KM dalam', H.bed_type && 'Kasur',
    P.wifi && 'WiFi', B.moto_parking && 'Parkir motor', B.car_parking && 'Parkir mobil', (P.kitchen || B.kitchen) && 'Dapur',
    (P.washer || B.laundry) && 'Laundry', B.security && 'CCTV'].filter(Boolean);
  const galeri = [...(L.media || []), ...(P.media || [])].map(m => m.large || m.medium || m.small).filter(Boolean);
  const harga = L.prices?.monthly?.[0]?.price || P.monthly_min_price;
  const tersedia = L.available_now_monthly === 1;
  return {
    link: url, nama: `${P.name} ${L.name?.id || L.name?.en || ''}`.trim(), harga, tipe, alamat: H.address || P.address || '',
    lat: B.lat, lng: B.lng, ukuran: H.size ? `${H.size} m²` : '', kamar_tersedia: tersedia ? null : 0,
    gambar: galeri[0] || '', galeri, fasilitas,
    detail_mamikos: {
      sumber: 'cove', tersedia,
      biaya: { bulanan: harga, min_bulan: P.min_monthly_stay > 1 ? P.min_monthly_stay : null, dp_persen: null,
        catatan: L.prices?.monthly?.[0]?.base_price > harga ? `Harga normal Rp ${L.prices.monthly[0].base_price.toLocaleString('id-ID')} (sedang diskon)` : '', termasuk: [] },
      aturan: (P.tags || []).map(t => t.name?.id).filter(n => n && !/^kost$/i.test(n)),
      fasilitas: { kamar: fasilitas.filter(f => ['AC', 'Air panas', 'Lemari', 'Meja', 'Kasur', 'KM dalam'].includes(f)), kamar_mandi: H.bathroom ? [H.bathroom === 'private' ? 'Kamar mandi dalam' : 'Kamar mandi bersama'] : [],
        bersama: fasilitas.filter(f => ['WiFi', 'Dapur', 'Laundry', 'CCTV'].includes(f)), parkir: fasilitas.filter(f => /Parkir/.test(f)), sekitar: (B.stations || []).map(s => s.name?.id || s.name?.en || s.name).filter(Boolean) },
      deskripsi: L.description?.id || L.description?.en || '',
      verifikasi: { level: 'Cove' },
    },
  };
}

// Kandidat dari directory Cove (Jakarta Selatan): cek satu kamar per properti untuk harga termurah & lokasi, lalu ambil semua kamarnya bila masuk
export async function cariCove({ budget, lat, lng, radius, log = () => {} }) {
  const dir = nextData(await unduh('https://cove.id/directory'));
  const jaksel = (dir?.regions || []).find(r => /jakarta selatan|south jakarta/i.test(r.name?.id || r.name?.en || ''));
  const props = (jaksel?.areas || []).flatMap(a => a.buildings.flatMap(b => b.properties));
  log(`Cove: ${props.length} properti di Jakarta Selatan`);
  const hasil = [];
  for (const p of props) {
    if (!p.listings?.length) continue;
    try {
      const pp = nextData(await unduh('https://cove.id/listings/' + p.listings[0].slug));
      const P = pp?.listing?.property;
      // Radius kriteria lewat jalan; garis lurus ≤ 1,2× radius sebagai saringan awal
      if (P && (!budget || P.monthly_min_price <= budget) && (!radius || km(lat, lng, P.building.lat, P.building.lng) <= radius * 1.2))
        hasil.push(...p.listings.map(l => 'https://cove.id/listings/' + l.slug));
    } catch (e) { log(`! Cove ${p.slug}: ${e.message}`); }
    await sleep(1200);
  }
  return hasil;
}
