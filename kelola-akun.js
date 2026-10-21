// Kelola akun CARKO dari terminal:
//   npm run akun -- daftar
//   npm run akun -- tambah <username>
//   npm run akun -- sandi <username>      (ganti kata sandi)
//   npm run akun -- hapus <username>
import 'dotenv/config';
import pg from 'pg';
import { siapkanAkun, hashSandi } from './akun.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://localhost/db_rekap_kost' });

// Ketik kata sandi tanpa ditampilkan di layar
function tanyaSandi(label) {
  return new Promise(resolve => {
    process.stdout.write(label);
    const stdin = process.stdin;
    let isi = '';
    stdin.setRawMode?.(true); stdin.resume(); stdin.setEncoding('utf8');
    const ketik = c => {
      if (c === '\r' || c === '\n' || c === '\u0004') { stdin.setRawMode?.(false); stdin.pause(); stdin.off('data', ketik); process.stdout.write('\n'); resolve(isi); }
      else if (c === '\u0003') process.exit(1);
      else if (c === '\u007f') isi = isi.slice(0, -1);
      else isi += c;
    };
    stdin.on('data', ketik);
  });
}
async function sandiBaru() {
  const a = await tanyaSandi('Kata sandi baru: ');
  if (a.length < 6) throw new Error('Kata sandi minimal 6 karakter');
  if (a !== await tanyaSandi('Ulangi kata sandi: ')) throw new Error('Kata sandi tidak sama');
  return hashSandi(a);
}

const [perintah, nama] = process.argv.slice(2);
const u = String(nama || '').trim().toLowerCase();
try {
  await siapkanAkun(pool);
  if (perintah === 'daftar') {
    const { rows } = await pool.query('SELECT username, dibuat, terakhir_masuk FROM pengguna ORDER BY id');
    for (const r of rows) console.log(`• ${r.username}  (terakhir masuk: ${r.terakhir_masuk ? r.terakhir_masuk.toLocaleString('id-ID') : 'belum pernah'})`);
  } else if (perintah === 'tambah' && u) {
    await pool.query('INSERT INTO pengguna (username, sandi_hash) VALUES ($1, $2)', [u, await sandiBaru()]);
    console.log(`✓ Akun "${u}" ditambahkan`);
  } else if (perintah === 'sandi' && u) {
    const h = await sandiBaru();
    const { rowCount } = await pool.query('UPDATE pengguna SET sandi_hash = $1 WHERE username = $2', [h, u]);
    console.log(rowCount ? `✓ Kata sandi "${u}" diganti` : `✗ Akun "${u}" tidak ada`);
  } else if (perintah === 'hapus' && u) {
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int n FROM pengguna');
    if (n <= 1) throw new Error('Tidak bisa menghapus akun terakhir');
    const { rowCount } = await pool.query('DELETE FROM pengguna WHERE username = $1', [u]);
    console.log(rowCount ? `✓ Akun "${u}" dihapus (sesinya otomatis berakhir)` : `✗ Akun "${u}" tidak ada`);
  } else {
    console.log('Pemakaian: npm run akun -- daftar | tambah <username> | sandi <username> | hapus <username>');
  }
} catch (e) {
  console.error('✗', e.code === '23505' ? 'Username sudah dipakai' : e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
