<script>
  import Icon from '$lib/components/Icon.svelte';
  import FasilitasChips from '$lib/components/FasilitasChips.svelte';
  import LokasiPicker from '$lib/components/LokasiPicker.svelte';
  import { beforeNavigate } from '$app/navigation';
  import { api, rp, parseKoor, masalah } from '$lib/kost.js';
  import { info, konfirmasi } from '$lib/dialog.svelte.js';

  let crit = $state(null), semua = [], job = $state({}), aktif = $state('kriteria'), sekarang = $state(Date.now()), logBuka = $state(false);
  // Isian form; disimpan hanya lewat tombol Simpan setelah melihat dampaknya
  let f = $state({ budget: '', jarak: '', tipe: [], fas: [], kerja_nama: '', koor: '' });

  const dariCrit = c => ({ budget: c.budget, jarak: c.jarak, tipe: [...c.tipe], fas: [...c.fas], kerja_nama: c.kerja_nama || '', koor: `${c.kerja_lat}, ${c.kerja_lng}` });
  const keCrit = () => {
    const kk = parseKoor(f.koor);
    return { ...$state.snapshot(crit), budget: +f.budget || '', jarak: +f.jarak || '', tipe: [...f.tipe], fas: [...f.fas],
      kerja_nama: f.kerja_nama.trim(), kerja_lat: kk?.[0] ?? crit.kerja_lat, kerja_lng: kk?.[1] ?? crit.kerja_lng };
  };
  const KUNCI = ['budget', 'jarak', 'tipe', 'fas', 'kerja_nama', 'kerja_lat', 'kerja_lng'];
  const beda = (a, b) => KUNCI.filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  const ubah = $derived(crit ? beda(keCrit(), crit) : []);
  Promise.all([api('kriteria'), api('kost')]).then(([c, d]) => { crit = c; semua = d; f = dariCrit(c); });

  // Budget ditampilkan dengan pemisah ribuan
  const budgetTeks = $derived(f.budget ? Number(f.budget).toLocaleString('id-ID') : '');
  const setBudget = v => (f.budget = +String(v).replace(/\D/g, '') || '');
  const BAGIAN = [['kriteria', 'wallet', 'Budget & Radius'], ['fasilitas', 'list-checks', 'Fasilitas wajib'],
    ['kantor', 'map-pin', 'Lokasi kerja'], ['kumpul', 'radar', 'Engine otomatis']];
  // Menu aktif = bagian terakhir yang judulnya sudah berada di 45% atas layar (yang sedang dibaca); di dasar halaman → bagian terakhir
  let klik = 0;
  function cekAktif() {
    if (Date.now() - klik < 800) return;  // jangan menimpa pilihan saat halaman sedang meluncur karena menu diklik
    const el = BAGIAN.map(([id]) => document.getElementById(id)).filter(Boolean);
    if (!el.length) return;
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) { aktif = el.at(-1).id; return; }  // dasar halaman
    aktif = (el.filter(e => e.getBoundingClientRect().top <= innerHeight * 0.45).at(-1) || el[0]).id;
  }
  $effect(() => { if (crit) requestAnimationFrame(cekAktif); });
  const pilihMenu = id => { aktif = id; klik = Date.now(); };
  $effect(() => { const t = setInterval(() => (sekarang = Date.now()), 1000); return () => clearInterval(t); });
  const mundur = $derived.by(() => {
    const sisa = crit?.berikutnya ? new Date(crit.berikutnya) - sekarang : 0;
    if (sisa <= 0) return 'segera';
    const t = Math.floor(sisa / 1000);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  });

  const tipeToggle = t => (f.tipe = f.tipe.includes(t) ? f.tipe.filter(x => x !== t) : [...f.tipe, t]);

  // Ringkasan dampak perubahan untuk modal konfirmasi
  function dampak(lama, baru) {
    const u = beda(baru, lama), poin = [], efek = [];
    const km = v => (v ? `${v} km` : 'tanpa batas'), uang = v => (v ? rp(v) : 'tanpa batas');
    if (u.includes('budget')) poin.push(['wallet', `Budget ${uang(lama.budget)} → <b>${uang(baru.budget)}</b>`]);
    if (u.includes('jarak')) poin.push(['route', `Radius ${km(lama.jarak)} → <b>${km(baru.jarak)}</b> lewat jalan`]);
    if (u.includes('tipe')) poin.push(['users', `Tipe ${lama.tipe.join(' / ') || 'semua'} → <b>${baru.tipe.join(' / ') || 'semua'}</b>`]);
    if (u.includes('fas')) poin.push(['list-checks', `Fasilitas wajib: <b>${baru.fas.join(', ') || 'tidak ada'}</b>`]);
    const pindah = u.includes('kerja_lat') || u.includes('kerja_lng');
    if (pindah || u.includes('kerja_nama')) poin.push(['map-pin', `Lokasi kerja: <b>${baru.kerja_nama || 'kantor'}</b>`]);

    const aktif = semua.filter(k => k.pilihan !== 'skip'), ok = c => k => !masalah(k, c).length;
    const keluar = aktif.filter(k => ok(lama)(k) && !ok(baru)(k)).length, masuk = aktif.filter(k => !ok(lama)(k) && ok(baru)(k)).length;
    if (!pindah && keluar) efek.push(`<b>${keluar} kost</b> pindah ke tab "Tidak sesuai" (tidak dihapus).`);
    if (!pindah && masuk) efek.push(`<b>${masuk} kost</b> kembali muncul di daftar utama.`);
    if (!pindah && !keluar && !masuk && u.some(k => ['budget', 'jarak', 'tipe', 'fas'].includes(k))) efek.push('Daftar kost yang sudah tersimpan tidak berubah.');
    if (pindah) efek.push('Jarak semua kost dihitung ulang dari lokasi kerja baru (±1 menit), lalu daftar menyesuaikan.');
    if (['budget', 'jarak', 'tipe'].some(k => u.includes(k)) || pindah)
      efek.push(`Engine mengecek ulang kost yang dulu ditolak${u.includes('jarak') && +baru.jarak > +lama.jarak ? ` dan memperluas area pencarian ke ${baru.jarak} km` : ''} pada pencarian berikutnya.`);
    if (u.includes('fas')) efek.push('Fasilitas wajib hanya menyaring tampilan. Engine tetap menyimpan semua kost, jadi tidak ada yang hilang kalau syaratnya dilonggarkan.');
    return { poin, efek };
  }

  async function simpan() {
    const baru = keCrit();
    if (f.jarak !== '' && +f.jarak <= 0) return info({ judul: 'Radius tidak valid', pesan: 'Isi radius lebih dari 0 km, atau kosongkan untuk tanpa batas.', ikon: 'circle-alert', bahaya: true });
    if (!parseKoor(f.koor)) return info({ judul: 'Koordinat tidak dikenali', pesan: 'Tempel koordinat seperti "-6.2873, 106.8044" atau link Google Maps yang memuat koordinat.', ikon: 'map-pin-off', bahaya: true });
    if (!await konfirmasi({ judul: 'Simpan perubahan?', ikon: 'save', ok: 'Simpan', ...dampak($state.snapshot(crit), baru) })) return;
    try {
      const pindah = baru.kerja_lat !== crit.kerja_lat || baru.kerja_lng !== crit.kerja_lng;
      await api('kriteria', 'PUT', baru);
      crit = await api('kriteria'); f = dariCrit(crit);
      info({ judul: 'Pengaturan disimpan', ikon: 'circle-check', pesan: pindah
        ? 'Jarak semua kost sedang dihitung ulang di latar belakang. Daftar kost akan menyesuaikan dalam ±1 menit.'
        : 'Daftar kost sudah memakai kriteria baru. Engine memakainya mulai pencarian berikutnya.' });
    } catch (e) { info({ judul: 'Gagal menyimpan', pesan: e.message, ikon: 'circle-alert', bahaya: true }); }
  }

  // Peringatan bila meninggalkan halaman dengan perubahan yang belum disimpan
  beforeNavigate(async nav => {
    if (!ubah.length || nav.type === 'leave') return;
    nav.cancel();
    if (await konfirmasi({ judul: 'Tinggalkan tanpa menyimpan?', pesan: 'Perubahan pengaturan yang belum disimpan akan hilang.', ikon: 'circle-alert', ok: 'Tinggalkan', bahaya: true })) {
      f = dariCrit(crit); location.href = nav.to.url.href;
    }
  });

  // Status engine
  const jam = d => new Date(d).toLocaleString('id-ID', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  async function poll() {
    const j = await api('kumpulkan').catch(() => null);
    if (!j) return;
    if (job.running && !j.running) crit = { ...crit, ...(await api('kriteria')) };
    job = j;
  }
  $effect(() => { poll(); const t = setInterval(poll, 2500); return () => clearInterval(t); });
  const mulai = async url => { try { await api(url, 'POST'); poll(); } catch (e) { info({ judul: 'Belum bisa dijalankan', pesan: e.message, ikon: 'clock' }); } };
</script>

<svelte:head><title>Pengaturan · CARKO</title></svelte:head>
<svelte:window onscroll={cekAktif} onresize={cekAktif} onbeforeunload={e => { if (ubah.length) { e.preventDefault(); e.returnValue = ''; } }} />

<main class="pg">
  <header class="pg-head">
    <div>
      <h1>Pengaturan</h1>
      <p>Atur kriteria kost yang kamu cari. Engine memakai pengaturan ini untuk mengumpulkan kost secara otomatis.</p>
    </div>
    <button class="btn pri" disabled={!ubah.length} onclick={simpan}><Icon name="save" />Simpan</button>
  </header>

  <div class="pg-grid">
    <nav class="pg-nav">
      {#each BAGIAN as [id, ikon, label]}
        <a href="#{id}" class:on={aktif === id} onclick={() => pilihMenu(id)}><Icon name={ikon} />{label}</a>
      {/each}
    </nav>

    <div class="pg-isi">
      {#if !crit}
        <div class="empty"><Icon name="loader-circle" class="spin" /><p>Memuat…</p></div>
      {:else}
        <section class="pg-sec" id="kriteria">
          <div class="sec-head">
            <span class="sec-ic hijau"><Icon name="wallet" /></span>
            <div><h2>Budget & Radius</h2><p>Kost di atas budget, di luar radius, atau tipenya tidak sesuai disembunyikan dari daftar utama dan tidak disimpan engine.</p></div>
          </div>
          <div class="sec-body">
            <div class="fld">
              <span class="fld-l">Budget maksimal per bulan</span>
              <div class="prefix"><span>Rp</span><input inputmode="numeric" placeholder="1.500.000" value={budgetTeks} oninput={e => setBudget(e.target.value)}></div>
              <div class="quick">
                {#each [[1000000, '1 jt'], [1250000, '1,25 jt'], [1500000, '1,5 jt'], [2000000, '2 jt']] as [v, l]}
                  <button type="button" class:on={+f.budget === v} onclick={() => (f.budget = v)}>{l}</button>
                {/each}
              </div>
            </div>
            <div class="fld">
              <span class="fld-l">Radius maksimal dari kantor <small>lewat jalan</small></span>
              <div class="radius">
                <input type="range" min="1" max="15" step="0.5" bind:value={f.jarak}>
                <div class="suffix"><input type="number" min="0.5" step="0.5" bind:value={f.jarak}><span>km</span></div>
              </div>
              <span class="fld-hint">Jarak tempuh dihitung lewat jalan (OpenStreetMap), mirip Google Maps.</span>
            </div>
            <div class="fld">
              <span class="fld-l">Tipe kost yang dikumpulkan</span>
              <div class="tipe-pilih">
                {#each [['Putri', 'Putri'], ['Campur', 'Campur (bebas)'], ['Putra', 'Putra']] as [v, l]}
                  <label class="tp tp-{v.toLowerCase()}" class:on={f.tipe.includes(v)}>
                    <input type="checkbox" checked={f.tipe.includes(v)} onchange={() => tipeToggle(v)}><i></i>{l}
                  </label>
                {/each}
              </div>
            </div>
          </div>
        </section>

        <section class="pg-sec" id="fasilitas">
          <div class="sec-head">
            <span class="sec-ic ungu"><Icon name="list-checks" /></span>
            <div><h2>Fasilitas wajib {#if f.fas.length}<span class="cnt">{f.fas.length} dipilih</span>{/if}</h2>
              <p>Kost tanpa fasilitas ini pindah ke tab "Tidak sesuai". Kosongkan kalau tidak ada yang wajib.</p></div>
          </div>
          <div class="sec-body"><FasilitasChips bind:value={f.fas} /></div>
        </section>

        <section class="pg-sec" id="kantor">
          <div class="sec-head">
            <span class="sec-ic merah"><Icon name="map-pin" /></span>
            <div><h2>Lokasi kerja</h2><p>Titik acuan jarak. Klik peta atau geser pin untuk memindahkan, atau tempel koordinat / link Google Maps.</p></div>
          </div>
          <div class="sec-body">
            <div class="fld-2">
              <label class="fld"><span class="fld-l">Nama tempat</span><input bind:value={f.kerja_nama}></label>
              <label class="fld"><span class="fld-l">Koordinat atau link Google Maps</span><input placeholder="-6.2873, 106.8044" bind:value={f.koor}></label>
            </div>
            <LokasiPicker bind:koor={f.koor} radius={f.jarak} />
          </div>
        </section>

        <section class="pg-sec" id="kumpul">
          <div class="sec-head">
            <span class="sec-ic biru"><Icon name="radar" /></span>
            <div><h2>Engine otomatis
              <span class="status" class:jalan={job.running}><i></i>{job.running ? 'Sedang berjalan' : 'Aktif'}</span></h2>
              <p>Selalu aktif selama aplikasi berjalan. Mencari kost di Mamikos sesuai kriteria di atas, lalu memperbarui kamar kosong & harga kost tersimpan.</p></div>
          </div>
          <div class="sec-body">
            <div class="tiles">
              <div class="tile"><Icon name="repeat" /><span>Siklus</span><b>{crit.siklus_menit} menit</b></div>
              <div class="tile"><Icon name="history" /><span>Terakhir</span><b>{crit.auto_terakhir ? jam(crit.auto_terakhir) : '—'}</b></div>
              <div class="tile"><Icon name="clock" /><span>Pencarian berikutnya</span><b>{job.running ? 'berjalan…' : mundur}</b></div>
              <div class="tile"><Icon name="scan-search" /><span>Sudah dicek</span><b>{(crit.dicek ?? 0).toLocaleString('id-ID')} kost</b></div>
            </div>
            {#if job.running}
              <div class="progres">
                <div class="progres-t"><span>{job.phase}</span><span>{job.total ? `${job.done}/${job.total}` : 'memuat…'}{job.saved ? ` · +${job.saved} baru` : ''}</span></div>
                <div class="bar"><i style:width="{job.total ? job.done / job.total * 100 : 5}%"></i></div>
              </div>
            {:else if job.phase}
              <p class="fld-hint">Terakhir: {job.done}/{job.total} dicek · {job.saved} disimpan · {job.skipped} dilewati{job.failed ? ` · ${job.failed} gagal` : ''} · {job.phase}</p>
            {/if}
            <div class="aksi">
              <button class="btn pri" disabled={job.running} onclick={() => mulai('engine')}><Icon name="play" />Jalankan sekarang</button>
              <button class="btn" disabled={job.running} onclick={() => mulai('perbarui')}><Icon name="refresh-cw" />Cek ulang kost tersimpan</button>
              {#if job.log?.length}<button class="btn ghost" onclick={() => (logBuka = !logBuka)}><Icon name="list" />{logBuka ? 'Sembunyikan log' : 'Lihat log'}</button>{/if}
            </div>
            {#if logBuka && job.log?.length}<pre class="log">{job.log.join('\n')}</pre>{/if}
          </div>
        </section>

      {/if}
    </div>
  </div>
</main>

<!-- Bilah aksi selalu tampil: status perubahan + tombol Simpan -->
{#if crit}
  <div class="aksibar" class:ubah={ubah.length}>
    <span class="ab-status">
      {#if ubah.length}<Icon name="circle-dot" />{ubah.length} perubahan belum disimpan
      {:else}<Icon name="circle-check" />Semua pengaturan tersimpan{/if}
    </span>
    <button class="btn" disabled={!ubah.length} onclick={() => (f = dariCrit(crit))}>Batalkan</button>
    <button class="btn pri" disabled={!ubah.length} onclick={simpan}><Icon name="save" />Simpan</button>
  </div>
{/if}

<style>
  .pg { max-width: 1120px; margin: 0 auto; padding: 32px 32px 120px; }
  .pg-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
  .pg-head h1 { font-size: 28px; }
  .aksibar { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 40; display: flex; align-items: center; gap: 10px;
    padding: 10px 10px 10px 18px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line);
    box-shadow: 0 12px 36px rgb(0 0 0 / .14); max-width: calc(100% - 32px); transition: background .2s, color .2s; }
  .ab-status { display: inline-flex; align-items: center; gap: 8px; font-weight: 500; margin-right: 8px; color: var(--muted); font-size: 13.5px; }
  .ab-status :global(svg.lucide) { color: var(--ok); }
  .aksibar.ubah { background: var(--text); border-color: transparent; }
  .aksibar.ubah .ab-status { color: var(--bg); }
  .aksibar.ubah .ab-status :global(svg.lucide) { color: #fbbf24; }
  .aksibar.ubah .btn:not(.pri) { background: transparent; color: var(--bg); border-color: color-mix(in srgb, var(--bg) 30%, transparent); }
  @media (max-width: 640px) { .aksibar { left: 16px; right: 16px; transform: none; } .ab-status { flex: 1; font-size: 12.5px; margin: 0; } .pg-head .btn { display: none; } }
  .pg-head p { margin: 6px 0 0; color: var(--muted); }
  .pg-grid { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 28px; margin-top: 28px; }
  .pg-nav { position: sticky; top: 88px; align-self: start; display: flex; flex-direction: column; gap: 2px; padding: 8px;
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
  .pg-nav a { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 9px; color: var(--muted); font-weight: 500; font-size: 13.5px; }
  .pg-nav a:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
  .pg-nav a.on { background: var(--pri-soft); color: var(--pri); }
  .pg-isi { display: flex; flex-direction: column; gap: 20px; min-width: 0; }

  .pg-sec { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); scroll-margin-top: 88px; overflow: hidden; }
  .sec-head { display: flex; gap: 14px; align-items: flex-start; padding: 20px 22px; }
  .sec-head > div { flex: 1; min-width: 0; }
  .sec-head h2 { font-size: 16px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .sec-head p { margin: 4px 0 0; color: var(--muted); font-size: 13.5px; line-height: 1.55; }
  .sec-ic { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; }
  .sec-ic.hijau { background: #e6f4f2; color: #0f766e; } .sec-ic.ungu { background: #f3efff; color: #6d28d9; }
  .sec-ic.merah { background: #fdecef; color: #e11d48; } .sec-ic.biru { background: #eaf1ff; color: #1d4ed8; }
  .sec-ic.abu { background: var(--surface-2); color: var(--muted); }
  @media (prefers-color-scheme: dark) {
    .sec-ic.hijau { background: #12302d; color: #2dd4bf; } .sec-ic.ungu { background: #241b3d; color: #a78bfa; }
    .sec-ic.merah { background: #3b1220; color: #fb7185; } .sec-ic.biru { background: #172540; color: #60a5fa; }
  }
  .sec-body { padding: 20px 22px 22px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 22px; }
  .cnt { font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 99px; background: #f3efff; color: #6d28d9; }

  .fld { display: flex; flex-direction: column; gap: 8px; }
  .fld-l { font-size: 13px; font-weight: 600; color: var(--text); }
  .fld-l small { font-weight: 500; color: var(--muted); margin-left: 4px; }
  .fld-hint { font-size: 12.5px; color: var(--muted); margin: 0; }
  .fld-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .prefix input { font-size: 16px; font-weight: 600; max-width: 260px; }
  .quick { display: flex; gap: 6px; flex-wrap: wrap; }
  .quick button { font: inherit; font-size: 12.5px; padding: 5px 12px; border-radius: 99px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); cursor: pointer; }
  .quick button:hover { border-color: var(--pri); color: var(--pri); }
  .quick button.on { background: var(--pri-soft); border-color: var(--pri); color: var(--pri); font-weight: 600; }
  .radius { display: flex; align-items: center; gap: 16px; }
  .radius input[type=range] { flex: 1; accent-color: var(--pri); padding: 0; border: 0; height: 6px; max-width: 420px; }
  .radius .suffix { width: 110px; }
  .radius .suffix input { font-weight: 600; }
  .tipe-pilih { display: flex; gap: 8px; flex-wrap: wrap; }
  .tp { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer;
    font-weight: 600; font-size: 13.5px; color: var(--muted); background: var(--surface); flex-direction: row; user-select: none; }
  .tp input { display: none; }
  .tp i { width: 10px; height: 10px; border-radius: 50%; background: var(--line); }
  .tp-putri.on { border-color: #db2777; color: #db2777; background: #fdf2f8; } .tp-putri.on i { background: #db2777; }
  .tp-campur.on { border-color: #7c3aed; color: #7c3aed; background: #f5f3ff; } .tp-campur.on i { background: #7c3aed; }
  .tp-putra.on { border-color: #2563eb; color: #2563eb; background: #eff6ff; } .tp-putra.on i { background: #2563eb; }
  @media (prefers-color-scheme: dark) { .tp-putri.on { background: #3b1228; } .tp-campur.on { background: #241b3d; } .tp-putra.on { background: #172540; } }

  :global(.lokasi-peta) { height: 300px; border-radius: 12px; border: 1px solid var(--line); z-index: 0; }

  .status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 99px; background: var(--ok-soft); color: var(--ok); }
  .status i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 25%, transparent); }
  .status.jalan { background: var(--warn-soft); color: var(--warn); }
  .status.jalan i { animation: kedip 1s ease-in-out infinite; }
  @keyframes kedip { 50% { opacity: .3; } }
  .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .tile { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 12px; background: var(--surface-2); min-width: 0; }
  .tile :global(svg.lucide) { width: 16px; height: 16px; color: var(--muted); margin-bottom: 6px; }
  .tile span { font-size: 11.5px; color: var(--muted); font-weight: 500; }
  .tile b { font-size: 15px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .progres { display: flex; flex-direction: column; gap: 6px; }
  .progres-t { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--muted); font-weight: 500; }
  .bar { height: 6px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--pri); transition: width .4s; }
  .aksi { display: flex; gap: 10px; flex-wrap: wrap; }
  .log { margin: 0; }

  @media (max-width: 860px) {
    .pg { padding: 20px 16px 120px; }
    .pg-grid { grid-template-columns: minmax(0, 1fr); gap: 16px; margin-top: 16px; }
    .pg-nav { position: static; flex-direction: row; overflow-x: auto; scrollbar-width: none; padding: 6px; }
    .pg-nav a { white-space: nowrap; }
    .fld-2 { grid-template-columns: 1fr; }
    .tiles { grid-template-columns: 1fr 1fr; }
    .sec-head, .sec-body { padding-left: 16px; padding-right: 16px; }
  }
</style>
