<script>
  import Icon from '$lib/components/Icon.svelte';
  import RouteMap from '$lib/components/RouteMap.svelte';
  import ShareKost from '$lib/components/ShareKost.svelte';
  import DaftarTipe from '$lib/components/DaftarTipe.svelte';
  import RincianKost from '$lib/components/RincianKost.svelte';
  import { kunciGedung } from '$lib/gedung.js';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { api, STATUS, UTAMA, FAS_ICON, ALASAN_SKIP, rp, waNum, masalah, langgar, fotoKost, ukuranFoto, sumberKost, teksKamar } from '$lib/kost.js';
  import { isian, konfirmasi } from '$lib/dialog.svelte.js';
  import { bukaForm } from '$lib/form.svelte.js';

  let k = $state(null), crit = $state(null), galat = $state(false), idx = $state(0), thumbs = $state(), share = $state();
  let semua = $state([]), memeriksa = $state(false);

  $effect(() => {
    const id = page.params.id;
    k = null; galat = false; idx = 0;
    Promise.all([api('kost/' + id), api('kriteria'), api('kost')]).then(([a, c, d]) => {
      k = a; crit = c; semua = d;
      if (!a.dilihat) api('dilihat', 'POST', { id: a.id });  // membuka detail = sudah dilihat
      // Rincian Mamikos (biaya, aturan, fasilitas, pemilik, ulasan) belum lengkap → ambil sekarang (±2 detik)
      if (!(a.detail_mamikos?.pemilik || a.detail_mamikos?.sumber) && /mamikos\.com\/room\/|infokost\.id\/listings\/|cove\.id\/listings\//.test(a.link || ''))
        api('segarkan/' + a.id, 'POST').then(b => { if (k?.id === b.id) k = { ...k, detail_mamikos: b.detail_mamikos }; }).catch(() => {});
      // Tipe kamar lain belum pernah dibaca dari Mamikos → baca sekarang (±10 detik)
      if (!a.tipe_lain_at && a.link?.startsWith('https://mamikos.com/room/')) {
        memeriksa = true;
        api('tipe-lain/' + a.id, 'POST').then(b => { if (k?.id === b.id) k = { ...k, tipe_lain: b.tipe_lain, tipe_lain_at: b.tipe_lain_at }; })
          .catch(() => {}).finally(() => (memeriksa = false));
      }
    }).catch(() => (galat = true));
  });

  const foto = $derived(k ? fotoKost(k) : []);
  const m = $derived(k ? masalah(k, crit) : []);
  const lg = $derived(k ? langgar(k, crit) : {});
  const fas = $derived(k?.fasilitas || []);
  // Tipe lain di gedung yang sama (koordinat sama) yang tersimpan di CARKO, termasuk kost ini
  const gedung = $derived(k ? [k, ...semua.filter(x => x.id !== k.id && x.pilihan !== 'skip' && k.lat !== '' && kunciGedung(x) === kunciGedung(k))] : []);
  const go = i => { idx = (i + foto.length) % foto.length; thumbs?.children[idx]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); };

  async function ubah(perubahan) { k = await api('kost/' + k.id, 'PUT', { ...$state.snapshot(k), ...perubahan }); }
  async function skip() {
    const alasan = await isian({ judul: 'Skip kost ini?', ikon: 'eye-off', ok: 'Skip', pilihanCepat: ALASAN_SKIP,
      pesan: `"${k.nama}" disembunyikan dari daftar dan tidak akan diambil engine lagi. Bisa dikembalikan kapan saja.`,
      isian: { placeholder: 'Alasan (opsional) — tersimpan di catatan' } });
    if (alasan === null) return;
    await ubah({ pilihan: 'skip', ...(alasan ? { catatan: [k.catatan, `Skip: ${alasan}`].filter(Boolean).join('\n') } : {}) });
  }
  async function edit() { const s = await bukaForm(k); if (s) k = s; }
  async function hapus() {
    if (!await konfirmasi({ judul: 'Hapus kost ini?', pesan: `"${k.nama}" akan dihapus permanen. Kalau hanya ingin menyembunyikan, pakai Skip.`,
      ikon: 'trash-2', ok: 'Hapus', bahaya: true })) return;
    await api('kost/' + k.id, 'DELETE'); goto('/');
  }
</script>

<svelte:head><title>{k ? `${k.nama} · CARKO` : 'Detail Kost · CARKO'}</title></svelte:head>
<svelte:window onkeydown={e => { if (!foto.length || document.querySelector('dialog[open]')) return; if (e.key === 'ArrowLeft') go(idx - 1); if (e.key === 'ArrowRight') go(idx + 1); }} />

<main class="wrap detail">
  {#if galat}
    <div class="empty"><Icon name="circle-alert" /><h2>Kost tidak ditemukan</h2><p><a href="/">Kembali ke daftar</a></p></div>
  {:else if !k}
    <div class="empty"><Icon name="loader-circle" class="spin" /><p>Memuat…</p></div>
  {:else}
    <a href="/" class="back"><Icon name="arrow-left" />Kembali ke daftar</a>
    <div class="d-grid">
      <div class="d-left">
        <div class="panel gal">
          <div class="gal-main">
            <Icon name="house" />
            {#if foto.length}<img src={ukuranFoto(foto[idx], 'besar')} alt="">{/if}
            {#if foto.length > 1}
              <button class="nav-btn l" onclick={() => go(idx - 1)} aria-label="Sebelumnya"><Icon name="chevron-left" /></button>
              <button class="nav-btn r" onclick={() => go(idx + 1)} aria-label="Berikutnya"><Icon name="chevron-right" /></button>
              <span class="count"><Icon name="images" />{idx + 1}/{foto.length}</span>
            {/if}
          </div>
          {#if foto.length > 1}
            <div class="gal-thumbs" bind:this={thumbs}>
              {#each foto as u, j}<button class="thumb-btn" onclick={() => go(j)}><img src={ukuranFoto(u, 'kecil')} class:on={j === idx} loading="lazy" alt=""></button>{/each}
            </div>
          {/if}
        </div>

        <div class="panel sec">
          <div class="d-title">
            <div>
              <h1>{k.nama}</h1>
              <div class="muted" style="margin-top:4px">
                <span class="tipe tipe-{k.tipe.toLowerCase()}" class:langgar={lg.tipe}>{k.tipe}</span>
                {#if k.jarak !== ''}{' · '}<span class:langgar={lg.jarak}>{k.jarak} km lewat jalan</span>{/if}
                {#each [k.ukuran && `Kamar ${k.ukuran}`, k.alamat].filter(Boolean) as t}{' · '}{t}{/each}
              </div>
            </div>
            <div class="d-price" class:kena={lg.harga}>{rp(k.harga)}<small>/bulan</small></div>
          </div>

          <!-- Aksi: keputusan utama di kiri, alat bantu (ikon) di kanan, status kontak di bawahnya -->
          <div class="d-aksi">
            <div class="d-aksi-utama">
              {#if k.pilihan === 'skip'}
                <span class="d-skip-label"><Icon name="eye-off" />Kost ini di-skip</span>
                <button class="btn" onclick={() => ubah({ pilihan: '' })}><Icon name="undo-2" />Kembalikan</button>
              {:else}
                <button class="btn d-suka" class:on={k.pilihan === 'suka'} onclick={() => ubah({ pilihan: k.pilihan === 'suka' ? '' : 'suka' })}>
                  <Icon name="heart" />{k.pilihan === 'suka' ? 'Disukai' : 'Suka'}</button>
                <button class="btn d-skip" onclick={skip}><Icon name="x" />Skip</button>
              {/if}
              {#if k.kontak}<a class="btn d-wa" href="https://wa.me/{waNum(k.kontak)}" target="_blank" rel="noopener"><Icon name="message-circle" />Chat {k.kontak}</a>{/if}
            </div>
            <div class="d-aksi-ikon">
              {#if k.link}<a class="ikon-btn" href={k.link} target="_blank" rel="noopener" title="Buka iklan di {sumberKost(k)}" aria-label="Buka iklan"><Icon name="external-link" /></a>{/if}
              <button class="ikon-btn" onclick={() => share.buka()} title="Bagikan" aria-label="Bagikan"><Icon name="share-2" /></button>
              <button class="ikon-btn" onclick={edit} title="Edit kost" aria-label="Edit"><Icon name="pencil" /></button>
              <button class="ikon-btn hapus" onclick={hapus} title="Hapus kost" aria-label="Hapus"><Icon name="trash-2" /></button>
            </div>
          </div>
          <div class="d-status">
            <span>Status kontak</span>
            <div class="d-seg" role="group" aria-label="Status kontak">
              {#each STATUS as st}<button class:on={k.status === st} onclick={() => k.status !== st && ubah({ status: st })}>{st}</button>{/each}
            </div>
          </div>
          <div class="chips" style="margin-top:14px">
            {#each m as i}<span class="pill bad"><Icon name="circle-x" />{i}</span>{:else}<span class="pill ok"><Icon name="circle-check" />Sesuai semua kriteria</span>{/each}
            {#if k.kamar_tersedia !== 0 && teksKamar(k)}<span class="pill ok"><Icon name="door-open" />{teksKamar(k)}</span>{/if}
            <span class="pill"><Icon name="link" />{sumberKost(k)}</span>
            {#if k.rating_mamikos !== ''}<span class="pill"><Icon name="star" class="star" />{k.rating_mamikos} · {k.ulasan || 0} ulasan</span>{/if}
          </div>

          {#if memeriksa}
            <p class="tk-cek"><Icon name="loader-circle" class="spin" />Memeriksa tipe kamar lain di Mamikos…</p>
          {:else if gedung.length > 1 || k.tipe_lain?.length}
            <h2 style="margin-top:24px"><Icon name="layers" />Tipe kamar di kost ini</h2>
            <div style="margin-top:10px"><DaftarTipe anggota={gedung} {crit} dipilih={k.id} onPilih={id => id !== k.id && goto(`/kost/${id}`)} /></div>
          {/if}

          <h2 style="margin-top:24px"><Icon name="list-checks" />Fasilitas utama</h2>
          <div class="chips" style="margin-top:10px">
            {#each UTAMA as x}
              {#if fas.includes(x)}<span class="pill ok"><Icon name={FAS_ICON[x]} />{x}</span>
              {:else}<span class="pill bad" style="text-decoration:line-through"><Icon name={FAS_ICON[x]} />{x}</span>{/if}
            {/each}
            {#each fas.filter(x => !UTAMA.includes(x)) as x}<span class="pill">{#if FAS_ICON[x]}<Icon name={FAS_ICON[x]} />{/if}{x}</span>{/each}
          </div>

          {#if k.detail_mamikos?.biaya}<RincianKost d={k.detail_mamikos} />{/if}

          {#if k.catatan}<h2 style="margin-top:24px"><Icon name="notebook-pen" />Catatan saya</h2><p style="white-space:pre-wrap;margin:10px 0 0">{k.catatan}</p>{/if}

        </div>
      </div>

      <div class="d-right">
        <div class="panel map-card">
          <div class="map-head">
            <h2><Icon name="route" />Rute ke {crit.kerja_nama || 'kantor'}</h2>
            {#if k.lat !== ''}
              <a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin={k.lat},{k.lng}&destination={crit.kerja_lat},{crit.kerja_lng}&travelmode=two-wheeler"><Icon name="navigation" />Google Maps</a>
            {/if}
          </div>
          {#if k.lat !== ''}
            {#key k.id}<RouteMap {k} {crit} />{/key}
          {:else}
            <div class="empty"><Icon name="map-pin-off" /><p>Kost ini belum punya koordinat.<br>Tambahkan lewat <button class="link-btn" onclick={edit}>Edit</button>.</p></div>
          {/if}
        </div>
      </div>
    </div>
    <ShareKost bind:this={share} {k} />
  {/if}
</main>

<style>
  .d-aksi { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
  .d-aksi-utama { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .d-aksi-utama .btn { height: 40px; padding: 0 16px; }
  .d-suka.on { color: #e11d48; border-color: #fda4af; background: #fff1f2; }
  .d-suka.on :global(svg.lucide) { fill: #e11d48; }
  .d-skip:hover { color: var(--bad); border-color: var(--bad); }
  .d-wa { background: #25d366; border-color: #25d366; color: #fff; }
  .d-wa:hover { filter: brightness(1.05); text-decoration: none; background: #25d366; }
  .d-skip-label { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--muted); margin-right: 4px; }
  .d-aksi-ikon { display: flex; gap: 4px; padding: 3px; border: 1px solid var(--line); border-radius: 12px; }
  .ikon-btn { width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 9px; background: none; color: var(--muted); cursor: pointer; }
  .ikon-btn:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
  .ikon-btn.hapus:hover { background: var(--bad-soft); color: var(--bad); }
  .ikon-btn :global(svg.lucide) { width: 18px; height: 18px; }
  .d-status { display: flex; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
  .d-status > span { font-size: 12.5px; font-weight: 600; color: var(--muted); }
  .d-seg { display: flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-2); }
  .d-seg button { font: 500 13px Inter, system-ui, sans-serif; border: 0; background: none; color: var(--muted); padding: 6px 12px; border-radius: 8px; cursor: pointer; }
  .d-seg button.on { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 3px rgb(0 0 0 / .1); }
  @media (prefers-color-scheme: dark) { .d-suka.on { background: #3b1220; border-color: #5b1a2e; color: #fb7185; } .d-suka.on :global(svg.lucide) { fill: #fb7185; } }
  @media (max-width: 560px) {
    .d-aksi-utama { flex: 1 1 100%; }
    .d-aksi-utama .btn { flex: 1; justify-content: center; }
    .d-aksi-ikon { margin-left: auto; }
    .d-status { gap: 8px; }
    .d-seg { flex: 1 1 100%; } .d-seg button { flex: 1; padding: 7px 4px; font-size: 11.5px; white-space: nowrap; }
  }
</style>
