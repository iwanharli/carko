<script>
  import Icon from './Icon.svelte';
  import FasilitasChips from './FasilitasChips.svelte';
  import { formState } from '$lib/form.svelte.js';
  import { goto } from '$app/navigation';
  import { info, konfirmasi, toast } from '$lib/dialog.svelte.js';
  import { api, STATUS, rp, rpShort, parseKoor, ukuranFoto, masalah } from '$lib/kost.js';

  const KOSONG = { nama: '', alamat: '', harga: '', tipe: 'Campur', jarak: '', kontak: '', ukuran: '', status: STATUS[0], rating: '',
    kamar_tersedia: '', gambar: '', link: '', fasilitas: [], catatan: '', galeri: [], lat: '', lng: '' };
  let el = $state(), f = $state({ ...KOSONG }), koor = $state(''), pesan = $state(''), mengambil = $state(false), hasil = null, fotoIdx = $state(0);
  // Harga ditampilkan dengan pemisah ribuan
  const hargaTeks = $derived(f.harga ? Number(f.harga).toLocaleString('id-ID') : '');
  const setHarga = v => (f.harga = +String(v).replace(/\D/g, '') || '');

  $effect(() => {
    if (formState.buka && el && !el.open) {
      f = { ...KOSONG, ...structuredClone($state.snapshot(formState.kost) || {}) };
      koor = f.lat !== '' && f.lat != null ? `${f.lat}, ${f.lng}` : '';
      pesan = ''; hasil = null; fotoIdx = 0;
      el.showModal();
    }
  });
  const foto = $derived(f.galeri?.length ? f.galeri : f.gambar ? [f.gambar] : []);

  function gantiKoor() {
    const c = parseKoor(koor);
    f.lat = c?.[0] ?? ''; f.lng = c?.[1] ?? '';
  }

  async function ambil() {
    if (!f.link.trim()) return info({ judul: 'Link belum diisi', pesan: 'Tempel link iklan kost (misalnya dari Mamikos) dulu, lalu klik Ambil data.', ikon: 'link' });
    mengambil = true; pesan = 'Mengambil data…';
    try {
      const r = await api('ambil', 'POST', { url: f.link.trim() });
      if (r.duplikat && r.duplikat.id !== f.id) { mengambil = false; pesan = ''; return sudahAda(r.duplikat); }
      for (const k of ['nama', 'alamat', 'harga', 'tipe', 'kontak', 'gambar', 'ukuran', 'lat', 'lng', 'jarak', 'kamar_tersedia', 'jarak_lurus', 'rating_mamikos', 'ulasan', 'galeri'])
        if (r[k] !== undefined && r[k] !== '') f[k] = r[k];
      if (r.lat !== undefined) koor = `${r.lat}, ${r.lng}`;
      f.fasilitas = [...new Set([...f.fasilitas, ...(r.fasilitas || [])])];
      const kosong = [['harga', 'harga'], ['lat', 'lokasi'], ['kontak', 'kontak']].filter(([k]) => r[k] === undefined).map(([, l]) => l);
      pesan = `✓ Data terisi${r.galeri?.length ? ` (${r.galeri.length} foto)` : ''}, mohon dicek lagi.` + (kosong.length ? ` Tidak ditemukan: ${kosong.join(', ')} — isi manual.` : '');
    } catch (e) { pesan = 'Gagal ambil data, isi manual saja. (' + e.message + ')'; }
    mengambil = false;
  }

  async function simpan(e) {
    e.preventDefault();
    const k = { ...$state.snapshot(f), harga: +f.harga, jarak: f.jarak === '' ? '' : +f.jarak, rating: f.rating === '' ? '' : +f.rating,
      kamar_tersedia: f.kamar_tersedia === '' ? '' : +f.kamar_tersedia };
    const baru = !f.id;
    try {
      hasil = baru ? await api('kost', 'POST', k) : await api('kost/' + f.id, 'PUT', k);
    } catch (err) {
      if (err.status === 409 && err.data?.duplikat) return sudahAda(err.data.duplikat);
      return info({ judul: 'Gagal menyimpan', pesan: err.message, ikon: 'circle-alert', bahaya: true });
    }
    const s = hasil;
    el.close();
    dispatchEvent(new CustomEvent('kost-berubah'));  // halaman yang terbuka memuat ulang datanya
    if (!baru) return toast(`Perubahan "${s.nama}" disimpan`);

    // Ringkasan setelah menambah kost: di tab mana kost ini muncul dan kenapa
    const crit = await api('kriteria'), m = masalah(s, crit);
    const lihat = await konfirmasi({ judul: 'Kost tersimpan', ikon: 'circle-check', ok: 'Lihat detail', batal: 'Tutup',
      pesan: `"${s.nama}" sudah masuk ke CARKO.`,
      poin: [['wallet', `Harga <b>${rp(s.harga)}</b> / bulan`],
        ['route', s.jarak !== '' ? `<b>${s.jarak} km</b> lewat jalan dari kantor` : 'Jarak belum diketahui — isi koordinat agar jarak dihitung'],
        ['door-open', s.kamar_tersedia === '' ? 'Ketersediaan kamar belum diketahui' : s.kamar_tersedia > 0 ? `<b>${s.kamar_tersedia}</b> kamar tersedia` : 'Kamar sedang penuh']],
      efek: [m.length ? `Tampil di tab <b>Tidak sesuai</b> karena: ${m.join(', ').toLowerCase()}.` : 'Sesuai semua kriteria — tampil di daftar utama.',
        'Engine akan memperbarui ketersediaan kamar & harganya secara berkala.'] });
    if (lihat) goto(`/kost/${s.id}`);
  }

  async function sudahAda(dup) {
    const lihat = await konfirmasi({ judul: 'Kost ini sudah tersimpan', ikon: 'info', ok: 'Lihat kost', batal: 'Tutup',
      pesan: `"${dup.nama}" sudah ada di CARKO${dup.pilihan === 'skip' ? ' (tersimpan di tab Di-skip)' : ''}, jadi tidak perlu ditambahkan lagi.` });
    if (lihat) { el.close(); goto(`/kost/${dup.id}`); }
  }

  function onClose() {
    if (!formState.buka) return;
    formState.buka = false;
    formState.resolve?.(hasil);
  }
</script>

<dialog class="kf" bind:this={el} onclose={onClose}>
  <form onsubmit={simpan}>
    <div class="kf-head">
      <span class="kf-ic"><Icon name={f.id ? 'pencil' : 'plus'} /></span>
      <div><h2>{f.id ? 'Edit kost' : 'Tambah kost'}</h2><p>{f.id ? f.nama : 'Tempel link iklan untuk mengisi otomatis, atau isi manual.'}</p></div>
      <button type="button" class="btn ghost" onclick={() => el.close()} aria-label="Tutup"><Icon name="x" /></button>
    </div>

    <div class="kf-body">
      <!-- Kiri: pratinjau foto & ringkasan -->
      <aside class="kf-side">
        <div class="kf-foto">
          {#if foto.length}<img src={ukuranFoto(foto[fotoIdx] || foto[0], 'sedang')} alt="">
          {:else}<div class="kf-foto-kosong"><Icon name="images" /><span>Belum ada foto</span></div>{/if}
          {#if foto.length > 1}<span class="kf-count">{fotoIdx + 1}/{foto.length}</span>{/if}
        </div>
        {#if foto.length > 1}
          <div class="kf-thumbs">
            {#each foto as u, i}<button type="button" class:on={i === fotoIdx} onclick={() => (fotoIdx = i)}><img src={ukuranFoto(u, 'kecil')} alt="" loading="lazy"></button>{/each}
          </div>
        {/if}
        <div class="kf-ringkas">
          <b>{f.nama || 'Nama kost'}</b>
          <span class="kf-harga">{f.harga ? `${rpShort(f.harga)} / bulan` : 'Harga belum diisi'}</span>
          <span class="kf-meta">
            <span class="tipe tipe-{f.tipe.toLowerCase()}">{f.tipe}</span>
            {#if f.jarak !== ''} · {f.jarak} km{/if}
            {#if f.kamar_tersedia !== ''} · {+f.kamar_tersedia > 0 ? `${f.kamar_tersedia} kamar kosong` : 'penuh'}{/if}
          </span>
        </div>
        <label class="kf-fld"><span>URL foto utama</span><input placeholder="https://…" bind:value={f.gambar}></label>
      </aside>

      <!-- Kanan: isian per bagian -->
      <div class="kf-main">
        <section class="kf-sumber">
          <span class="kf-sec"><Icon name="link" />Sumber iklan</span>
          <div class="kf-ambil">
            <input type="url" placeholder="Tempel link Mamikos, mis. https://mamikos.com/room/…" bind:value={f.link}>
            <button type="button" class="btn pri" disabled={mengambil} onclick={ambil}>
              <Icon name={mengambil ? 'loader-circle' : 'download'} class={mengambil ? 'spin' : ''} />{mengambil ? 'Mengambil…' : 'Ambil data'}</button>
          </div>
          {#if pesan}<p class="kf-pesan" class:gagal={pesan.startsWith('Gagal')}>{pesan}</p>{/if}
        </section>

        <section>
          <span class="kf-sec"><Icon name="house" />Info utama</span>
          <label class="kf-fld"><span>Nama kost <i>*</i></span><input required placeholder="Kost Melati Tipe A" bind:value={f.nama}></label>
          <label class="kf-fld"><span>Alamat</span><input placeholder="Cilandak, Jakarta Selatan" bind:value={f.alamat}></label>
          <div class="kf-2">
            <label class="kf-fld"><span>Harga per bulan <i>*</i></span>
              <div class="prefix"><span>Rp</span><input required inputmode="numeric" placeholder="1.500.000" value={hargaTeks} oninput={e => setHarga(e.target.value)}></div></label>
            <div class="kf-fld"><span>Tipe kost</span>
              <div class="kf-tipe">
                {#each ['Putri', 'Campur', 'Putra'] as t}
                  <button type="button" class="tp-{t.toLowerCase()}" class:on={f.tipe === t} onclick={() => (f.tipe = t)}><i></i>{t}</button>
                {/each}
              </div>
            </div>
          </div>
        </section>

        <section>
          <span class="kf-sec"><Icon name="map-pin" />Lokasi & kamar</span>
          <div class="kf-2">
            <label class="kf-fld"><span>Koordinat / link Google Maps</span><input placeholder="-6.29, 106.80" bind:value={koor} oninput={gantiKoor}></label>
            <label class="kf-fld"><span>Jarak ke kantor</span>
              <div class="suffix"><input type="number" step="0.01" placeholder="otomatis" bind:value={f.jarak}><span>km</span></div></label>
            <label class="kf-fld"><span>Ukuran kamar</span><input placeholder="3x4" bind:value={f.ukuran}></label>
            <label class="kf-fld"><span>Kamar tersedia</span><input type="number" min="0" placeholder="otomatis dari Mamikos" bind:value={f.kamar_tersedia}></label>
          </div>
          <p class="kf-hint">Jarak dihitung otomatis lewat jalan saat koordinat diisi.</p>
        </section>

        <section>
          <span class="kf-sec"><Icon name="message-circle" />Kontak & penilaian</span>
          <div class="kf-2">
            <label class="kf-fld"><span>Kontak pemilik / WA</span><input inputmode="tel" placeholder="08xxxxxxxxxx" bind:value={f.kontak}></label>
            <div class="kf-fld"><span>Nilai saya</span>
              <div class="kf-bintang">
                {#each [1, 2, 3, 4, 5] as n}
                  <button type="button" class:on={+f.rating >= n} onclick={() => (f.rating = +f.rating === n ? '' : n)} aria-label="{n} bintang"><Icon name="star" /></button>
                {/each}
                <small>{f.rating ? `${f.rating}/5` : 'belum dinilai'}</small>
              </div>
            </div>
          </div>
          <div class="kf-fld"><span>Status kontak</span>
            <div class="kf-seg">{#each STATUS as st}<button type="button" class:on={f.status === st} onclick={() => (f.status = st)}>{st}</button>{/each}</div>
          </div>
        </section>

        <section>
          <span class="kf-sec"><Icon name="list-checks" />Fasilitas {#if f.fasilitas.length}<em>{f.fasilitas.length}</em>{/if}</span>
          <FasilitasChips bind:value={f.fasilitas} />
        </section>

        <section>
          <span class="kf-sec"><Icon name="notebook-pen" />Catatan</span>
          <textarea rows="3" placeholder="Plus/minus, aturan kost, hasil survei…" bind:value={f.catatan}></textarea>
        </section>
      </div>
    </div>

    <div class="kf-foot">
      <span class="kf-wajib"><i>*</i> wajib diisi</span>
      <button type="button" class="btn" onclick={() => el.close()}>Batal</button>
      <button class="btn pri" type="submit"><Icon name="save" />{f.id ? 'Simpan perubahan' : 'Simpan kost'}</button>
    </div>
  </form>
</dialog>

<style>
  .kf { width: min(980px, 100% - 32px); max-height: calc(100dvh - 40px); }
  .kf form { display: flex; flex-direction: column; max-height: calc(100dvh - 40px); }
  .kf-head { display: flex; align-items: center; gap: 14px; padding: 18px 22px; border-bottom: 1px solid var(--line); }
  .kf-head > div { flex: 1; min-width: 0; }
  .kf-head h2 { font-size: 17px; }
  .kf-head p { margin: 2px 0 0; color: var(--muted); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kf-ic { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; background: var(--pri-soft); color: var(--pri); flex-shrink: 0; }

  .kf-body { display: grid; grid-template-columns: 300px minmax(0, 1fr); overflow: hidden; flex: 1; min-height: 0; }
  .kf-side { padding: 20px; background: var(--surface-2); border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
  .kf-foto { position: relative; aspect-ratio: 4 / 3; border-radius: 12px; overflow: hidden; background: var(--surface); border: 1px solid var(--line); }
  .kf-foto img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .kf-foto-kosong { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--muted); font-size: 12.5px; }
  .kf-foto-kosong :global(svg.lucide) { width: 30px; height: 30px; stroke-width: 1.5; }
  .kf-count { position: absolute; right: 8px; bottom: 8px; font-size: 11.5px; font-weight: 600; color: #fff; background: rgb(0 0 0 / .6); padding: 2px 8px; border-radius: 99px; }
  .kf-thumbs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; max-height: 120px; overflow-y: auto; }
  .kf-thumbs button { padding: 0; border: 2px solid transparent; border-radius: 8px; overflow: hidden; aspect-ratio: 1; cursor: pointer; background: none; opacity: .6; }
  .kf-thumbs button.on { border-color: var(--pri); opacity: 1; }
  .kf-thumbs img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .kf-ringkas { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); }
  .kf-ringkas b { font-size: 14px; line-height: 1.35; }
  .kf-harga { color: var(--pri); font-weight: 700; font-size: 15px; }
  .kf-meta { font-size: 12.5px; color: var(--muted); }

  .kf-main { padding: 4px 22px 20px; overflow-y: auto; }
  .kf-main section { padding: 18px 0; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 12px; }
  .kf-main section:last-child { border-bottom: 0; }
  .kf-sec { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
  .kf-sec :global(svg.lucide) { width: 15px; height: 15px; color: var(--pri); }
  .kf-sec em { font-style: normal; font-size: 11px; background: var(--pri-soft); color: var(--pri); padding: 1px 7px; border-radius: 99px; letter-spacing: 0; }
  .kf-sumber { gap: 10px !important; }
  .kf-ambil { display: flex; gap: 8px; padding: 6px; border-radius: 12px; background: var(--pri-soft); }
  .kf-ambil input { border-color: transparent; background: var(--surface); }
  .kf-pesan { margin: 0; font-size: 12.5px; color: var(--ok); }
  .kf-pesan.gagal { color: var(--bad); }
  .kf-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px; }
  .kf-fld { display: flex; flex-direction: column; gap: 6px; }
  .kf-fld > span { font-size: 12.5px; font-weight: 600; color: var(--text); }
  .kf-fld i, .kf-wajib i { color: var(--bad); font-style: normal; }
  .kf-hint { margin: -4px 0 0; font-size: 12px; color: var(--muted); }
  .prefix input { font-weight: 600; }

  .kf-tipe, .kf-seg { display: flex; gap: 6px; flex-wrap: wrap; }
  .kf-tipe button, .kf-seg button { font: 600 13px Inter, system-ui, sans-serif; height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line);
    background: var(--surface); color: var(--muted); cursor: pointer; display: inline-flex; align-items: center; gap: 7px; flex: 1; justify-content: center; }
  .kf-tipe i { width: 9px; height: 9px; border-radius: 50%; background: var(--line); }
  .kf-tipe .tp-putri.on { border-color: #db2777; color: #db2777; background: #fdf2f8; } .kf-tipe .tp-putri.on i { background: #db2777; }
  .kf-tipe .tp-campur.on { border-color: #7c3aed; color: #7c3aed; background: #f5f3ff; } .kf-tipe .tp-campur.on i { background: #7c3aed; }
  .kf-tipe .tp-putra.on { border-color: #2563eb; color: #2563eb; background: #eff6ff; } .kf-tipe .tp-putra.on i { background: #2563eb; }
  .kf-seg { background: var(--surface-2); padding: 3px; border-radius: 11px; gap: 2px; }
  .kf-seg button { border-color: transparent; background: none; height: 34px; font-weight: 500; }
  .kf-seg button.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgb(0 0 0 / .1); font-weight: 600; }
  @media (prefers-color-scheme: dark) { .kf-tipe .tp-putri.on { background: #3b1228; } .kf-tipe .tp-campur.on { background: #241b3d; } .kf-tipe .tp-putra.on { background: #172540; } }
  .kf-bintang { display: flex; align-items: center; gap: 2px; height: 40px; }
  .kf-bintang button { border: 0; background: none; padding: 4px; cursor: pointer; color: var(--line); display: grid; }
  .kf-bintang button :global(svg.lucide) { width: 22px; height: 22px; }
  .kf-bintang button.on { color: #f59e0b; }
  .kf-bintang button.on :global(svg.lucide) { fill: #f59e0b; }
  .kf-bintang small { margin-left: 8px; color: var(--muted); font-size: 12.5px; }

  .kf-foot { display: flex; align-items: center; gap: 8px; padding: 14px 22px; border-top: 1px solid var(--line); background: var(--surface); }
  .kf-wajib { margin-right: auto; font-size: 12px; color: var(--muted); }

  @media (max-width: 760px) {
    .kf { width: 100%; max-width: 100%; max-height: 100dvh; height: 100dvh; border-radius: 0; margin: 0; }
    .kf form { max-height: 100dvh; height: 100%; }
    .kf-body { grid-template-columns: minmax(0, 1fr); overflow-y: auto; }
    .kf-side { order: 2; border-right: 0; border-top: 1px solid var(--line); overflow: visible; }  /* isian dulu, pratinjau di bawah */
    .kf-foto { aspect-ratio: 16 / 9; }
    .kf-main { overflow: visible; padding: 0 16px 16px; }
    .kf-2 { grid-template-columns: 1fr; }
    .kf-head, .kf-foot { padding-left: 16px; padding-right: 16px; }
    .kf-wajib { display: none; }
  }
</style>
