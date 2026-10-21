<script>
  // Bagikan ringkasan kost (bukan link CARKO, karena localhost tidak bisa dibuka orang lain)
  import Icon from './Icon.svelte';
  import { toast } from '$lib/dialog.svelte.js';
  import { rp, UTAMA, pisahNama } from '$lib/kost.js';

  let { k } = $props();
  let el = $state();
  const bisaShare = typeof navigator !== 'undefined' && !!navigator.share;

  // Teks siap kirim (format WhatsApp: *tebal*). Nama daerah di ujung nama kost dipindah ke baris sendiri.
  const teks = $derived.by(() => {
    const { nama, daerah } = pisahNama(k);
    const fas = k.fasilitas || [], d = k.detail_mamikos || {}, b = d.biaya || {};
    const angka = (n, des = 1) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: des });
    const IKON_TIPE = { Putri: '👩', Putra: '👨', Campur: '👥' };
    const lainnya = fas.filter(f => !UTAMA.includes(f));
    const aturan = (d.aturan || []).filter(x => /khusus|pasutri|lawan jenis|bawa anak|jam malam|tamu/i.test(x) && !/sewa harian/i.test(x)).slice(0, 4);
    const biaya = [b.dp_persen && `DP ${b.dp_persen}%`, b.min_bulan && `min. sewa ${b.min_bulan} bulan`].filter(Boolean);
    return [
      `🏠 *${nama}*`,
      daerah && `📌 ${daerah}`,
      '',
      `💰 *${rp(k.harga)}* / bulan${biaya.length ? ` (${biaya.join(', ')})` : ''}`,
      `${IKON_TIPE[k.tipe] || '🏠'} Kost ${k.tipe.toLowerCase()}${k.ukuran ? ` · kamar ${k.ukuran.replace(/x/i, '×')} m` : ''}`,
      k.kamar_tersedia > 0 ? `🟢 ${k.kamar_tersedia} kamar kosong` : k.kamar_tersedia === 0 ? '🔴 Kamar sedang penuh' : null,
      k.jarak !== '' && `📍 ${angka(k.jarak)} km ke kantor (lewat jalan)`,
      k.rating_mamikos !== '' && `⭐ ${angka(k.rating_mamikos)}/5 dari ${k.ulasan || 0} ulasan`,
      '',
      '*Fasilitas*',
      UTAMA.map(f => `${fas.includes(f) ? '✅' : '❌'} ${f}`).join('   '),
      lainnya.length && `➕ ${lainnya.join(', ')}`,
      aturan.length && '',
      aturan.length && '*Aturan*',
      ...aturan.map(a => `• ${a}`),
      '',
      k.link && `🔗 Iklan: ${k.link}`,
      k.lat !== '' && `🗺️ Lokasi: https://maps.google.com/?q=${k.lat},${k.lng}`,
      `📋 CARKO: ${location.origin}/kost/${k.id}`,
    ].filter(x => x !== false && x !== null && x !== undefined && x !== 0).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  });

  export const buka = () => el.showModal();

  async function salin(isi, pesan) {
    try { await navigator.clipboard.writeText(isi); toast(pesan); el.close(); }
    catch { toast('Gagal menyalin — pilih teks di pratinjau lalu salin manual'); }
  }
  async function bagikan() {
    try { await navigator.share({ title: k.nama, text: teks }); el.close(); } catch {}  // dibatalkan pengguna
  }
</script>

<dialog class="share-dlg" bind:this={el} onclick={e => e.target === el && el.close()}>
  <div class="dlg-head"><h2>Bagikan kost</h2><button class="btn ghost" onclick={() => el.close()} aria-label="Tutup"><Icon name="x" /></button></div>
  <div class="share-body">
    <pre class="share-teks">{teks}</pre>
    <div class="share-aksi">
      <a class="btn wa" href="https://wa.me/?text={encodeURIComponent(teks)}" target="_blank" rel="noopener" onclick={() => el.close()}>
        <Icon name="message-circle" />WhatsApp</a>
      {#if bisaShare}<button class="btn" onclick={bagikan}><Icon name="share-2" />Bagikan via…</button>{/if}
      <button class="btn" onclick={() => salin(teks, 'Ringkasan kost disalin')}><Icon name="copy" />Salin teks</button>
      {#if k.link}<button class="btn" onclick={() => salin(k.link, 'Link iklan disalin')}><Icon name="link" />Salin link iklan</button>{/if}
    </div>
  </div>
</dialog>

<style>
  .share-dlg { width: min(480px, 100% - 32px); }
  .share-body { padding: 18px 24px 22px; display: flex; flex-direction: column; gap: 16px; }
  .share-teks { margin: 0; padding: 14px 16px; border-radius: 12px; background: var(--surface-2); font: 13px/1.6 Inter, system-ui, sans-serif;
    white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow: auto; user-select: text; }
  .share-aksi { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .share-aksi :global(.btn) { justify-content: center; }
  .wa { background: #25d366; border-color: #25d366; color: #fff; grid-column: 1 / -1; }
  .wa:hover { filter: brightness(1.05); text-decoration: none; }
</style>
