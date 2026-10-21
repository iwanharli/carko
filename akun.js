// Akun CARKO: tabel `pengguna` (kata sandi di-hash scrypt) + kunci sesi tersimpan di database.
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);
const AKUN_AWAL = { username: 'dinda', sandi: 'dandiluv' };  // dibuat sekali bila belum ada akun sama sekali

export async function hashSandi(sandi) {
  const garam = randomBytes(16);
  const h = await scrypt(String(sandi), garam, 64);
  return `scrypt$${garam.toString('hex')}$${h.toString('hex')}`;
}
export async function cocokSandi(sandi, tersimpan) {
  const [, garam, hash] = String(tersimpan).split('$');
  if (!garam || !hash) return false;
  const h = await scrypt(String(sandi), Buffer.from(garam, 'hex'), 64);
  const b = Buffer.from(hash, 'hex');
  return b.length === h.length && timingSafeEqual(b, h);
}

export async function siapkanAkun(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pengguna (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      sandi_hash TEXT NOT NULL,
      dibuat TIMESTAMPTZ DEFAULT now(),
      terakhir_masuk TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS pengaturan_app (kunci TEXT PRIMARY KEY, nilai TEXT NOT NULL);`);
  const { rows: [{ n }] } = await pool.query('SELECT count(*)::int n FROM pengguna');
  if (!n) {
    await pool.query('INSERT INTO pengguna (username, sandi_hash) VALUES ($1, $2)', [AKUN_AWAL.username, await hashSandi(AKUN_AWAL.sandi)]);
    console.log(`Akun awal dibuat: ${AKUN_AWAL.username} (ganti kata sandi dengan: npm run akun -- sandi ${AKUN_AWAL.username})`);
  }
  // Kunci tanda tangan sesi: dibuat acak sekali, disimpan agar sesi tetap berlaku setelah server restart
  await pool.query(`INSERT INTO pengaturan_app (kunci, nilai) VALUES ('session_secret', $1) ON CONFLICT (kunci) DO NOTHING`, [randomBytes(32).toString('hex')]);
  const { rows: [r] } = await pool.query(`SELECT nilai FROM pengaturan_app WHERE kunci = 'session_secret'`);
  return r.nilai;
}
