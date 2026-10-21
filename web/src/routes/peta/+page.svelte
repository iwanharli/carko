<script>
  import Icon from '$lib/components/Icon.svelte';
  import AdvFilter, { ADV0, lolosAdv, advAktif } from '$lib/components/AdvFilter.svelte';
  import { onMount, untrack } from 'svelte';
  import { api, rp, rpShort, hargaPendek, masalah, langgar, sesuai, fotoKost, ukuranFoto } from '$lib/kost.js';
  import { petaDasar, pin, SVG, L } from '$lib/peta.js';
  import { kelompokkan, tipeDiTab, ringkas, statusTipe, masalahInfo, namaTipe } from '$lib/gedung.js';
  import { labelVarian } from '$lib/kost.js';

  let data = $state([]), crit = $state(null), view = $state('sesuai'), dipilih = $state(null), panelBuka = $state(true);
  // Filter sama dengan halaman Daftar Kost (disimpan bersama, jadi kedua halaman selalu sinkron)
  let q = $state(''), adv = $state(ADV0()), advFilter;
  try { adv = { ...ADV0(), ...JSON.parse(localStorage.getItem('rk-adv') || '{}') }; } catch {}
  $effect(() => { const s = JSON.stringify(adv); try { localStorage.setItem('rk-adv', s); } catch {} });
  const cocokCari = k => !q || [k.nama, k.alamat, k.catatan].join(' ').toLowerCase().includes(q.toLowerCase());
  const chipAdv = $derived(advAktif(adv));
  let el, map, lapisan = $state.raw(null), penanda = {};
  try { panelBuka = localStorage.getItem('rk-panel') !== '0'; } catch {}
  $effect(() => { const v = panelBuka ? '1' : '0'; try { localStorage.setItem('rk-panel', v); } catch {} });

  // Satu pin per gedung (tipe kamar di lokasi yang sama digabung); aturan tab sama dengan halaman Daftar
  const VIEWS = { sesuai: ['Sesuai', 'sesuai'], baru: ['Baru', 'baru'], suka: ['Disukai', 'suka'], semua: ['Semua', 'semua-peta'] };
  const gedung = $derived(crit ? kelompokkan(data).filter(g => g.anggota[0].lat !== '' && g.anggota[0].pilihan !== 'skip') : []);
  const cocok = (g, a = adv) => tipeDiTab(g, VIEWS[view][1], crit).filter(k => cocokCari(k) && lolosAdv(k, a)).sort((x, y) => x.harga - y.harga);
  // rows: { k: tipe wakil (termurah yang cocok), g: gedung }
  const rows = $derived(gedung.map(g => { const c = cocok(g); return c.length ? { k: c[0], g } : null; }).filter(Boolean)
    .sort((a, b) => (a.k.jarak === '' ? 1e9 : a.k.jarak) - (b.k.jarak === '' ? 1e9 : b.k.jarak)));
  // Warna pin per gedung: disukai > tidak sesuai > baru > sesuai
  const jenis = g => g.anggota.some(k => k.pilihan === 'suka') ? 'suka' : !g.anggota.some(k => sesuai(k, crit)) ? 'tidak'
    : g.anggota.some(k => sesuai(k, crit) && !k.dilihat) ? 'baru' : 'sesuai';
  const labelPin = g => { const r = ringkas(g); return hargaPendek(r.min) + (r.max > r.min ? '+' : ''); };

  function popup(k, gd) {
    const g = fotoKost(k), mm = masalah(k, crit), lg = langgar(k, crit), e = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
    if (ringkas(gd).total > 1) {
      // Gedung dengan beberapa tipe: tampilkan daftar tipe & statusnya
      const r = ringkas(gd);
      const tipe = gd.anggota.map(v => { const st = statusTipe(v, crit);
        return `<li class="${st.penuh ? 'penuh' : ''}"><i class="tk-dot ${!st.penuh && !st.masalah.length ? 'ok' : !st.penuh ? 'warn' : ''}"></i><span>${e(namaTipe(v, gd.anggota))}</span><b>${rpShort(v.harga)}</b><em>${st.penuh ? 'Penuh' : v.kamar_tersedia === '' ? '—' : v.kamar_tersedia + ' kamar'}</em></li>`; }).join('')
        + r.info.map(t => { const m = masalahInfo(t, crit);
          return `<li class="${t.kamar === 0 ? 'penuh' : ''}"><i class="tk-dot ${t.kamar !== 0 && !m.length ? 'ok' : t.kamar !== 0 ? 'warn' : ''}"></i><span>${e(t.nama)} <small>info</small></span><b>${t.harga ? rpShort(t.harga) : '—'}</b><em>${t.kamar === 0 ? 'Penuh' : t.kamar ? t.kamar + ' kamar' : 'Tersedia'}</em></li>`; }).join('');
      return `<a class="pop" href="/kost/${k.id}">${g.length ? `<img src="${e(ukuranFoto(g[0], 'sedang'))}" alt="">` : ''}
        <div class="pop-body"><b>${e(k.nama)}</b>
          <div class="pop-meta">${r.total} tipe kamar · ${r.tersedia ? `${r.tersedia} tersedia` : '<span class="langgar">semua penuh</span>'}${k.jarak !== '' ? ` · ${merahJarak(k, lg)}` : ''}</div>
          <ul class="pop-tipe">${tipe}</ul><span class="pop-link">Lihat detail →</span></div></a>`;
    }
    const merah = (t, kena) => (kena ? `<span class="langgar">${t}</span>` : t);
    return `<a class="pop" href="/kost/${k.id}">${g.length ? `<img src="${e(ukuranFoto(g[0], 'sedang'))}" alt="">` : ''}
      <div class="pop-body"><b>${e(k.nama)}</b>
        <div class="pop-price ${lg.harga ? 'kena' : ''}">${rp(k.harga)}<small>/bln</small></div>
        <div class="pop-meta">${[merah(`<span class="tipe tipe-${e(k.tipe.toLowerCase())}">${e(k.tipe)}</span>`, lg.tipe), k.jarak !== '' && merah(`${k.jarak} km lewat jalan`, lg.jarak), k.kamar_tersedia > 0 && `${k.kamar_tersedia} kamar kosong`].filter(Boolean).join(' · ')}</div>
        ${mm.length ? `<div class="pop-warn">${e(mm.join(' · '))}</div>` : ''}<span class="pop-link">Lihat detail →</span></div></a>`;
  }

  const merahJarak = (k, lg) => (lg.jarak ? `<span class="langgar">${k.jarak} km</span>` : `${k.jarak} km`);

  onMount(() => {
    Promise.all([api('kost'), api('kriteria')]).then(([d, c]) => {
      data = d; crit = c;
      const kantor = [c.kerja_lat, c.kerja_lng];
      map = petaDasar(el).setView(kantor, 14);
      map.on('click', () => (dipilih = null));
      L.marker(kantor, { icon: pin('kerja', 'briefcase'), zIndexOffset: 1000 }).addTo(map).bindTooltip(c.kerja_nama || 'Kantor');
      if (c.jarak) L.circle(kantor, { radius: c.jarak * 1000, color: '#0f766e', weight: 1.5, dashArray: '6 6', fillOpacity: 0.04 }).addTo(map)
        .bindTooltip(`${c.jarak} km garis lurus — radius kriteria dihitung lewat jalan, jadi sebagian kost di dalam lingkaran bisa tetap di luar radius`, { sticky: true });
      lapisan = L.layerGroup().addTo(map);
    });
    return () => map?.remove();
  });

  // Gambar ulang pin setiap tab berubah
  $effect(() => {
    if (!lapisan) return;
    lapisan.clearLayers(); penanda = {};
    for (const { k, g } of rows) {
      const j = jenis(g);
      penanda[k.id] = L.marker([k.lat, k.lng], {
        icon: L.divIcon({ className: '', html: `<div class="harga-pin ${j}" data-id="${k.id}">${j === 'suka' ? SVG.heart : ''}${labelPin(g)}</div>`, iconSize: [0, 0] }),
        zIndexOffset: { suka: 500, baru: 400, sesuai: 300, tidak: 0 }[j],
      }).addTo(lapisan).bindPopup(popup(k, g), { maxWidth: 280, minWidth: 250, className: 'pop-wrap' }).on('popupopen', () => (dipilih = k.id));
    }
    if (rows.length) map.fitBounds(L.latLngBounds([[crit.kerja_lat, crit.kerja_lng], ...rows.map(({ k }) => [k.lat, k.lng])]), {
      paddingTopLeft: [40, 40], maxZoom: 15,
      paddingBottomRight: untrack(() => [panelBuka && innerWidth > 640 ? 460 : 40, panelBuka && innerWidth <= 640 ? innerHeight * 0.48 : 40]) });
  });
  $effect(() => {
    document.querySelectorAll('.harga-pin').forEach(p => p.classList.toggle('aktif', +p.dataset.id === dipilih));
    document.querySelector(`.peta-item[data-id="${dipilih}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  function fokus(k) {
    if (innerWidth <= 640) panelBuka = false;  // di HP panel menutupi peta, jadi turunkan dulu
    map.flyTo([k.lat, k.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    setTimeout(() => penanda[k.id]?.openPopup(), 650);
  }
</script>

<svelte:head><title>Peta Kost · CARKO</title></svelte:head>
<svelte:window onkeydown={e => e.key === 'Escape' && (panelBuka = false)} />

<div class="peta-page">
  <div id="petaMap" bind:this={el}></div>

  <div class="peta-filter" class:lebar={!panelBuka}>
    <div class="pf-bar">
      <label class="pf-cari"><Icon name="search" /><input placeholder="Cari nama atau daerah…" bind:value={q}>
        {#if q}<button class="pf-x" onclick={() => (q = '')} aria-label="Hapus pencarian"><Icon name="x" /></button>{/if}</label>
      <button class="pf-btn" class:on={chipAdv.length} onclick={() => advFilter.buka(adv)}>
        <Icon name="sliders-horizontal" />Filter{#if chipAdv.length}<span class="badge-n">{chipAdv.length}</span>{/if}
      </button>
    </div>
    {#if chipAdv.length}
      <div class="pf-chips">
        {#each chipAdv as [label, hapus]}<button onclick={hapus}>{label}<Icon name="x" /></button>{/each}
        {#if chipAdv.length > 1}<button class="pf-reset" onclick={() => (adv = ADV0())}>Hapus semua</button>{/if}
      </div>
    {/if}
  </div>

  <aside class="panel-kaca" class:tutup={!panelBuka}>
    <div class="pk-head">
      <div class="pk-title">
        <h2><Icon name="map-pinned" />Kost di sekitar kantor <small>{rows.length}</small></h2>
        <button class="btn btn-ikon" onclick={() => (panelBuka = false)} title="Sembunyikan panel" aria-label="Sembunyikan panel"><Icon name="panel-right-close" /></button>
      </div>
      <div class="pk-seg">
        {#each Object.entries(VIEWS) as [v, [label, f]]}
          <button class:on={v === view} onclick={() => (view = v)}><b>{gedung.filter(g => tipeDiTab(g, f, crit).length).length}</b>{label}</button>
        {/each}
      </div>
      <div class="peta-legend">
        <span><i class="dot sesuai"></i>Sesuai</span><span><i class="dot baru"></i>Baru</span>
        <span><i class="dot suka"></i>Disukai</span><span><i class="dot tidak"></i>Tidak sesuai</span>
      </div>
    </div>
    <div class="peta-list">
      {#each rows as { k, g } (g.kunci)}
        {@const lg = langgar(k, crit)}
        {@const r = ringkas(g)}
        {@const j = jenis(g)}
        {@const tag = [j === 'tidak' && ['tidak', 'Tidak sesuai'], j === 'baru' && ['baru', 'Baru'], j === 'suka' && ['suka', 'Disukai'],
          r.total > 1 ? [null, `${r.total} tipe · ${r.tersedia} tersedia`] : k.kamar_tersedia > 0 && [null, `${k.kamar_tersedia} kamar kosong`]].filter(Boolean).slice(0, 2)}
        <button class="peta-item" class:on={dipilih === k.id} data-id={k.id} onclick={() => fokus(k)}>
          <span class="pi-img">{#if fotoKost(k).length}<img src={ukuranFoto(fotoKost(k)[0], 'kecil')} alt="" loading="lazy">{:else}<Icon name="house" />{/if}</span>
          <span class="pi-txt">
            <b title={k.nama}>{k.nama.replace(/^Kost\s+/i, '')}</b>
            <span class="pi-row"><span class="harga" class:kena={lg.harga}>{r.total > 1 && r.max > r.min ? `${rpShort(r.min)} – ${rpShort(r.max)}` : rpShort(k.harga)}</span><i class="sep"></i><span class:langgar={lg.jarak}>{k.jarak !== '' ? k.jarak + ' km' : '? km'}</span><i class="sep"></i><span class="tipe tipe-{k.tipe.toLowerCase()}" class:langgar={lg.tipe}>{k.tipe}</span></span>
            <span class="pi-row pi-tags">{#each tag as [d, t], i}{#if i}<i class="sep"></i>{/if}{#if d}<i class="dot {d}"></i>{/if}{t}{/each}</span>
          </span>
        </button>
      {:else}
        {#if crit}<div class="empty"><Icon name="map-pin-off" /><p>Tidak ada kost di tampilan ini.</p></div>{/if}
      {/each}
    </div>
  </aside>
  <AdvFilter bind:this={advFilter} hitung={a => gedung.filter(g => cocok(g, a).length).length}
    onTerapkan={a => (adv = a)} />
  {#if !panelBuka}
    <button class="panel-buka" onclick={() => (panelBuka = true)}><Icon name="list" />Daftar kost<span class="n">{rows.length}</span></button>
  {/if}
</div>
