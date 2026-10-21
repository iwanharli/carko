// Satu gedung = beberapa tipe kamar di lokasi yang sama. Dipakai halaman Daftar & Peta agar aturannya seragam.
import { masalah, sesuai, rp, labelVarian } from '$lib/kost.js';

// Nama tipe kamar untuk daftar tipe: bagian nama yang berbeda antar tipe, atau "Tipe X" dari nama bila hanya satu tersimpan
export const namaTipe = (v, anggota) =>
  anggota.length > 1 ? labelVarian(v, anggota) : (v.nama.match(/\b(?:tipe|type)\s+\S+(?:\s+(?:AC|Non\s+AC|\d+))?/i)?.[0] || v.tipe);

export const kunciGedung = k => (k.lat !== '' ? `${(+k.lat).toFixed(4)},${(+k.lng).toFixed(4)}` : 'id' + k.id);

// Kelompokkan kost per gedung. Kost yang di-skip berdiri sendiri (hanya tampil di tab Di-skip).
export function kelompokkan(data) {
  const grup = new Map();
  for (const k of data) {
    const g = k.pilihan === 'skip' ? 'skip' + k.id : kunciGedung(k);
    grup.has(g) ? grup.get(g).push(k) : grup.set(g, [k]);
  }
  return [...grup].map(([kunci, anggota]) => ({ kunci, anggota: anggota.sort((a, b) => a.harga - b.harga) }));
}

// Penempatan tab per gedung: "Semua" bila minimal satu tipe sesuai & ada kamar; "Tidak sesuai" bila tidak ada sama sekali.
// Mengembalikan tipe-tipe yang membuat gedung masuk tab itu (dipakai untuk memilih tipe yang ditampilkan).
export function tipeDiTab(g, tab, crit) {
  const a = g.anggota, ok = a.filter(k => sesuai(k, crit));
  switch (tab) {
    case 'semua': case 'sesuai': return ok;
    case 'baru': return ok.filter(k => !k.dilihat);
    case 'suka': return a.filter(k => k.pilihan === 'suka');
    case 'tidak': return a[0].pilihan !== 'skip' && !ok.length ? a : [];
    case 'skip': return a.filter(k => k.pilihan === 'skip');
    default: return a.filter(k => k.pilihan !== 'skip');  // 'semua-peta': semua yang tidak di-skip
  }
}

// Tipe "info Mamikos": tipe lain di gedung yang tidak tersimpan di CARKO (dibaca dari halaman Mamikos).
// Tipe yang namanya sudah ada di kost tersimpan tidak diulang.
export function tipeInfo(anggota) {
  const ada = t => anggota.some(k => new RegExp(`\\b${t.nama.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(k.nama));
  const lihat = new Set();
  return anggota.flatMap(k => k.tipe_lain || []).filter(t => {
    const key = t.nama.toLowerCase();
    if (lihat.has(key) || ada(t)) return false;
    lihat.add(key); return true;
  });
}

// Ringkasan gedung: jumlah tipe (tersimpan + info Mamikos), yang masih ada kamar, dan rentang harga tipe tersedia
export function ringkas(g) {
  const info = tipeInfo(g.anggota);
  const semua = [...g.anggota.map(k => ({ harga: +k.harga, penuh: k.kamar_tersedia === 0 })), ...info.map(t => ({ harga: t.harga, penuh: t.kamar === 0 }))];
  const ada = semua.filter(t => !t.penuh), harga = (ada.length ? ada : semua).map(t => t.harga).filter(Boolean);
  return { total: semua.length, tersedia: ada.length, min: Math.min(...harga), max: Math.max(...harga), info };
}

// Masalah kriteria untuk tipe info (tanpa data lengkap): harga & gender
export function masalahInfo(t, crit) {
  const out = [];
  if (crit.budget && t.harga > +crit.budget) out.push(`Lewat budget ${rp(t.harga - crit.budget)}`);
  if (crit.tipe.length && t.gender && !crit.tipe.includes(t.gender)) out.push(`Kost ${t.gender.toLowerCase()}`);
  return out;
}

// Status satu tipe untuk daftar tipe kamar: penuh / melanggar kriteria lain / sesuai
export function statusTipe(k, crit) {
  const m = masalah(k, crit).filter(x => x !== 'Kamar penuh');
  return { penuh: k.kamar_tersedia === 0, masalah: m };
}
