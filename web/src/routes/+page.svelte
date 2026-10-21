<script>
  import Icon from '$lib/components/Icon.svelte';
  import KostCard from '$lib/components/KostCard.svelte';
  import KostRow from '$lib/components/KostRow.svelte';
  import EngineStatus from '$lib/components/EngineStatus.svelte';
  import Lightbox from '$lib/components/Lightbox.svelte';
  import AdvFilter, { ADV0, lolosAdv, advAktif } from '$lib/components/AdvFilter.svelte';
  import { api, STATUS, FAS_ICON, ALASAN_SKIP, rpShort, masalah, sesuai, fotoKost } from '$lib/kost.js';
  import { kelompokkan, tipeDiTab } from '$lib/gedung.js';
  import { isian, toast } from '$lib/dialog.svelte.js';
  import { bukaForm } from '$lib/form.svelte.js';

  let data = $state([]), crit = $state(null), gagal = $state('');
  let view = $state('semua'), q = $state(''), kontak = $state(''), urut = $state('skor');
  let adv = $state(ADV0()), varianAktif = $state({}), lightbox, advFilter;

  let tampilan = $state('grid');  // 'grid' (kartu) atau 'list' (baris)
  try { adv = { ...ADV0(), ...JSON.parse(localStorage.getItem('rk-adv') || '{}') }; tampilan = localStorage.getItem('rk-tampilan') || 'grid'; } catch {}
  $effect(() => { const t = tampilan; try { localStorage.setItem('rk-tampilan', t); } catch {} });
  $effect(() => { const s = JSON.stringify(adv); try { localStorage.setItem('rk-adv', s); } catch {} });

  const muat = () => Promise.all([api('kost'), api('kriteria')]).then(([d, c]) => { data = d; crit = c; }).catch(e => (gagal = e.message));
  muat();
  $effect(() => { addEventListener('kost-berubah', muat); return () => removeEventListener('kost-berubah', muat); });

  // Satu kartu per gedung. "Semua": gedung dengan minimal satu tipe sesuai & ada kamar; "Tidak sesuai": tidak ada sama sekali.
  const VIEWS = { semua: ['Semua', 'layout-grid'], baru: ['Baru', 'sparkles'], suka: ['Disukai', 'heart'],
    tidak: ['Tidak sesuai', 'circle-slash'], skip: ['Di-skip', 'eye-off'] };
  const URUT = {
    harga: (a, b) => a.harga - b.harga,
    jarak: (a, b) => (a.jarak === '' ? 1e9 : a.jarak) - (b.jarak === '' ? 1e9 : b.jarak),
    rating: (a, b) => (b.rating_mamikos || b.rating || 0) - (a.rating_mamikos || a.rating || 0),
    skor: (a, b) => masalah(a, crit).length - masalah(b, crit).length || a.harga - b.harga,
    baru: (a, b) => b.id - a.id,
  };
  const cocokCari = k => !q || [k.nama, k.alamat, k.catatan].join(' ').toLowerCase().includes(q.toLowerCase());
  const lolosFilter = (k, a = adv) => cocokCari(k) && (!kontak || k.status === kontak) && lolosAdv(k, a);

  const gedung = $derived(crit ? kelompokkan(data) : []);
  // Tipe di gedung yang memenuhi tab & filter; kosong = gedung tidak ditampilkan
  const cocok = (g, tab = view, a = adv) => tipeDiTab(g, tab, crit).filter(k => lolosFilter(k, a)).sort(URUT[urut]);
  const kartu = $derived(gedung.map(g => {
    const c = cocok(g);
    if (!c.length) return null;
    const anggota = view === 'skip' ? c : g.anggota.filter(k => k.pilihan !== 'skip');
    return { kunci: g.kunci, anggota, wakil: c[0], k: anggota.find(v => v.id === varianAktif[g.kunci]) || c[0] };
  }).filter(Boolean).sort((a, b) => (b.anggota.some(k => k.pilihan === 'suka')) - (a.anggota.some(k => k.pilihan === 'suka')) || URUT[urut](a.wakil, b.wakil)));
  // Infinite scroll: render bertahap per HALAMAN kartu; kembali ke awal setiap tab/filter/urutan berubah
  const HALAMAN = 24;
  let batas = $state(HALAMAN), sentinel = $state();
  const tampil = $derived(kartu.slice(0, batas));
  $effect(() => { view; q; kontak; urut; tampilan; JSON.stringify(adv); batas = HALAMAN; });
  $effect(() => {
    if (!sentinel) return;
    batas;  // pasang ulang setiap batas bertambah, agar tetap memuat bila penanda masih terlihat
    const obs = new IntersectionObserver(e => { if (e[0].isIntersecting && batas < kartu.length) batas += HALAMAN; }, { rootMargin: '800px 0px' });
    obs.observe(sentinel);
    return () => obs.disconnect();
  });
  const jumlahTab = $derived(Object.fromEntries(Object.keys(VIEWS).map(v => [v, gedung.filter(g => tipeDiTab(g, v, crit).length).length])));
  const aktifList = $derived(crit ? data.filter(k => sesuai(k, crit)) : []);
  // Kartu statistik: [ikon, warna, label, nilai, keterangan, link kost terkait]
  const stats = $derived.by(() => {
    // Dihitung per gedung (sama dengan tab & kartu): gedung baru = punya tipe sesuai yang masuk dalam 24 jam terakhir
    const gedungSesuai = gedung.map(g => tipeDiTab(g, 'semua', crit)).filter(t => t.length);
    const baru = gedungSesuai.filter(t => t.some(k => Date.now() - new Date(k.created_at) < 864e5));
    const murah = aktifList.filter(k => k.harga).sort((a, b) => a.harga - b.harga)[0];
    const dekat = aktifList.filter(k => k.jarak !== '').sort((a, b) => a.jarak - b.jarak)[0];
    const tanpaAwalan = n => n.replace(/^Kost\s+/i, '');
    return [
      ['sparkles', 'ungu', 'Ditemukan 24 jam terakhir', baru.length, baru.length ? `dari ${gedungSesuai.length} kost yang sesuai` : 'Belum ada kost baru hari ini', null],
      ['wallet', 'hijau', 'Harga termurah', murah ? rpShort(murah.harga) : '—', murah ? tanpaAwalan(murah.nama) : 'Belum ada data', murah?.id],
      ['route', 'biru', 'Terdekat dari kantor', dekat ? `${dekat.jarak} km` : '—', dekat ? tanpaAwalan(dekat.nama) : 'Belum ada data', dekat?.id],
    ];
  });
  const chipAdv = $derived(advAktif(adv));
  const difilter = $derived(q || kontak || urut !== 'skor' || chipAdv.length);

  function resetFilter() { q = ''; kontak = ''; urut = 'skor'; adv = ADV0(); }

  async function ubah(k, perubahan) {
    const s = await api('kost/' + k.id, 'PUT', { ...$state.snapshot(k), ...perubahan });
    data = data.map(x => (x.id === s.id ? s : x));
  }
  async function skip(k) {
    const alasan = await isian({ judul: 'Skip kost ini?', ikon: 'eye-off', ok: 'Skip', pilihanCepat: ALASAN_SKIP,
      pesan: `"${k.nama}" disembunyikan dari daftar dan tidak akan diambil engine lagi. Bisa dikembalikan dari tab Di-skip.`,
      isian: { placeholder: 'Alasan (opsional) — tersimpan di catatan' } });
    if (alasan === null) return;
    const lama = { pilihan: k.pilihan, catatan: k.catatan };
    await ubah(k, { pilihan: 'skip', ...(alasan ? { catatan: [k.catatan, `Skip: ${alasan}`].filter(Boolean).join('\n') } : {}) });
    toast(`"${k.nama}" di-skip`, () => ubah(data.find(x => x.id === k.id), lama));
  }
  async function edit(k) {
    const s = await bukaForm(k);
    if (s) data = data.map(x => (x.id === s.id ? s : x));
  }
  // Lightbox selalu menampilkan galeri lengkap (daftar hanya membawa beberapa foto pertama)
  async function bukaFoto(k, foto, i) {
    if ((k.galeri_total || 0) > foto.length) foto = fotoKost(await api('kost/' + k.id));
    lightbox.buka(k.nama, foto, i);
  }
  async function tandaiDilihat() {
    await api('dilihat', 'POST', {});
    data = data.map(k => ({ ...k, dilihat: true })); view = 'semua';
  }
</script>

<svelte:head><title>CARKO · Cari Kost</title></svelte:head>

<main class="wrap">
  <div class="head">
    <div>
      <h1>Daftar Kost</h1>
      {#if crit}
        <div class="crit-line">
          {#if crit.budget}<span class="pill"><Icon name="wallet" />≤ {rpShort(crit.budget)}</span>{/if}
          {#if crit.jarak}<span class="pill"><Icon name="map-pin" />≤ {crit.jarak} km dari kantor</span>{/if}
          {#if crit.tipe.length}<span class="pill"><Icon name="users" />{crit.tipe.join(' / ')}</span>{/if}
          {#each crit.fas as f}<span class="pill"><Icon name={FAS_ICON[f] || 'check'} />{f}</span>{/each}
          <a href="/pengaturan#kriteria" style="font-size:13px">Ubah kriteria →</a>
        </div>
      {/if}
    </div>
    {#if crit}<EngineStatus berikutnya={crit.berikutnya} onPerubahan={muat} />{/if}
  </div>

  <div class="stats">
    {#each stats as [ikon, warna, label, nilai, ket, id]}
      <div class="panel stat {warna}">
        <span class="stat-ic"><Icon name={ikon} /></span>
        <div class="stat-isi">
          <span class="l">{label}</span>
          <span class="v">{nilai}</span>
          {#if id}<a class="ket" href="/kost/{id}" title={ket}>{ket}<Icon name="chevron-right" /></a>{:else}<span class="ket">{ket}</span>{/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="filters">
    <div class="tabs-line">
      {#each Object.entries(VIEWS) as [v, [label, ikon]]}
        {@const n = jumlahTab[v] || 0}
        <button class:on={v === view} class:ada-baru={v === 'baru' && n > 0} onclick={() => (view = v)}><Icon name={ikon} />{label}<span class="n">{n}</span></button>
      {/each}
    </div>
    <div class="filter-bar">
      <label class="f-search"><Icon name="search" /><input placeholder="Cari nama atau daerah…" bind:value={q}></label>
      <label class="f-select"><Icon name="phone" /><select bind:value={kontak}><option value="">Semua kontak</option>{#each STATUS as s}<option>{s}</option>{/each}</select></label>
      <label class="f-select"><Icon name="arrow-up-down" /><select bind:value={urut}>
        <option value="skor">Paling cocok</option><option value="harga">Harga termurah</option><option value="jarak">Terdekat</option>
        <option value="rating">Rating tertinggi</option><option value="baru">Terbaru</option>
      </select></label>
      <button class="btn adv-btn" class:on={chipAdv.length} type="button" onclick={() => advFilter.buka(adv)}>
        <Icon name="sliders-horizontal" />Filter{#if chipAdv.length}<span class="badge-n">{chipAdv.length}</span>{/if}
      </button>
      <div class="view-toggle" role="group" aria-label="Tampilan">
        <button class:on={tampilan === 'grid'} onclick={() => (tampilan = 'grid')} title="Tampilan kartu" aria-label="Tampilan kartu"><Icon name="layout-grid" /></button>
        <button class:on={tampilan === 'list'} onclick={() => (tampilan = 'list')} title="Tampilan list" aria-label="Tampilan list"><Icon name="list" /></button>
      </div>
    </div>
    {#if chipAdv.length}
      <div class="adv-chips">
        {#each chipAdv as [label, hapus]}<button class="pill" onclick={hapus}>{label}<Icon name="x" /></button>{/each}
        {#if chipAdv.length > 1}<button class="link-btn" onclick={() => (adv = ADV0())}>Hapus semua</button>{/if}
      </div>
    {/if}
    <div class="result-line">
      <span>Menampilkan {kartu.length} kost</span>
      {#if difilter}<button class="link-btn" onclick={resetFilter}>Reset filter</button>{/if}
      {#if view === 'baru' && kartu.length}<button class="link-btn" onclick={tandaiDilihat}>Tandai semua sudah dilihat</button>{/if}
    </div>
  </div>

  <div class={tampilan === 'list' ? 'list-view' : 'grid'}>
    {#if gagal}
      <div class="empty panel"><Icon name="wifi-off" /><h2>Gagal konek ke server</h2><p>{gagal} — jalankan <code>./run.sh</code></p></div>
    {:else}
      {#each tampil as { k, anggota, kunci } (kunci)}
        {@const Item = tampilan === 'list' ? KostRow : KostCard}
        <Item {k} {crit} varian={anggota} onVarian={id => (varianAktif[kunci] = id)} onUbah={p => ubah(k, p)} onSkip={() => skip(k)}
          onEdit={() => edit(k)} onFoto={(foto, i) => bukaFoto(k, foto, i)} />
      {:else}
        {#if crit}
          <div class="empty"><Icon name="building-2" /><h2>{data.length ? 'Tidak ada kost yang cocok dengan filter' : 'Belum ada kost'}</h2>
            <p>Engine mengumpulkan kost otomatis, atau tambahkan lewat tombol <b>Tambah Kost</b>.</p></div>
        {/if}
      {/each}
    {/if}
  </div>
  {#if batas < kartu.length}
    <div class="muat-lagi" bind:this={sentinel}><Icon name="loader-circle" class="spin" />Memuat kost berikutnya… ({tampil.length} dari {kartu.length})</div>
  {:else if kartu.length > HALAMAN}
    <div class="muat-lagi selesai">Semua {kartu.length} kost sudah ditampilkan</div>
  {/if}
</main>

<Lightbox bind:this={lightbox} />
<AdvFilter bind:this={advFilter} hitung={a => (crit ? gedung.filter(g => cocok(g, view, a).length).length : 0)} onTerapkan={a => (adv = a)} />
