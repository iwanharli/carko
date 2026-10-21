<script>
  // Kartu kost di daftar. `varian` = tipe kamar lain di gedung yang sama (digabung jadi satu kartu).
  import Icon from './Icon.svelte';
  import DaftarTipe from './DaftarTipe.svelte';
  import { api, UTAMA, FAS_ICON, STATUS, rpShort, waNum, tanggalPendek, masalah, langgar, fotoKost, ukuranFoto, pisahNama } from '$lib/kost.js';

  let { k, crit, varian = [], onVarian, onUbah, onSkip, onEdit, onFoto } = $props();
  let slide = $state(0), penuh = $state(null);
  // Daftar hanya membawa beberapa foto pertama; galeri lengkap diambil saat foto digeser sampai ujung
  const foto = $derived(penuh || fotoKost(k));
  const totalFoto = $derived(Math.max(k.galeri_total || 0, foto.length));
  async function muatPenuh() { if (!penuh && totalFoto > foto.length) penuh = fotoKost(await api('kost/' + k.id)); }
  const m = $derived(masalah(k, crit));
  const lg = $derived(langgar(k, crit));
  const judul = $derived(pisahNama(k));
  const fas = $derived(k.fasilitas || []);
  const lain = $derived(fas.filter(f => !UTAMA.includes(f)));
  const suka = $derived(k.pilihan === 'suka');
  $effect(() => { k.id; slide = 0; penuh = null; });
  async function geser(d) {
    if (d > 0 && slide + 1 >= foto.length) await muatPenuh();
    slide = (slide + d + totalFoto) % totalFoto;
    if (slide >= foto.length) slide = 0;
  }
</script>

<article class="panel card kc" class:liked={suka}>
  <div class="kc-foto">
    <Icon name="house" />
    {#if foto.length}
      <button class="kc-img" onclick={() => onFoto(foto, slide)} aria-label="Lihat foto"><img src={ukuranFoto(foto[slide], 'sedang')} alt="" loading="lazy"></button>
    {/if}
    {#if totalFoto > 1}
      <button class="nav-btn l" onclick={() => geser(-1)} aria-label="Foto sebelumnya"><Icon name="chevron-left" /></button>
      <button class="nav-btn r" onclick={() => geser(1)} aria-label="Foto berikutnya"><Icon name="chevron-right" /></button>
      <span class="kc-count">{slide + 1}/{totalFoto}</span>
    {/if}
    <span class="kc-status" class:ok={!m.length}><Icon name={m.length ? 'circle-x' : 'circle-check'} />{m.length ? m[0] : 'Sesuai kriteria'}</span>
    <button class="kc-suka" class:on={suka} onclick={() => onUbah({ pilihan: suka ? '' : 'suka' })} title={suka ? 'Batal suka' : 'Suka'} aria-label="Suka"><Icon name="heart" /></button>
    <span class="kc-harga" class:kena={lg.harga}>{rpShort(k.harga)}<small>/bln</small></span>
    {#if k.jarak !== ''}<span class="kc-jarak" class:kena={lg.jarak}><Icon name="route" />{String(k.jarak).replace('.', ',')} km</span>{/if}
  </div>

  <div class="kc-body">
    <div class="kc-meta">
      <span class="kc-tipe tipe-{k.tipe.toLowerCase()}" class:langgar={lg.tipe}>{k.tipe}</span>
      {#if k.rating_mamikos !== ''}<span class="kc-rating"><Icon name="star" />{k.rating_mamikos.toLocaleString('id-ID', { minimumFractionDigits: 1 })}<small>({k.ulasan || 0})</small></span>{/if}
      {#if !k.dilihat}<span class="pill baru"><Icon name="sparkles" />Baru</span>{/if}
    </div>

    <h3><a href="/kost/{k.id}" title={k.nama}>{judul.nama}</a></h3>
    <p class="kc-daerah">{[judul.daerah, k.ukuran && `kamar ${k.ukuran.replace(/x/i, '×')}`].filter(Boolean).join(' · ')}</p>

    <div class="kc-fas">
      {#each UTAMA as f}<span class:ada={fas.includes(f)} title="{f}{fas.includes(f) ? '' : ' — tidak ada'}"><Icon name={FAS_ICON[f]} />{f}</span>{/each}
    </div>

    {#if k.kamar_tersedia !== ''}
      <p class="kc-kamar" class:penuh={k.kamar_tersedia === 0}>
        <Icon name={k.kamar_tersedia > 0 ? 'door-open' : 'door-closed'} />{k.kamar_tersedia > 0 ? `${k.kamar_tersedia} kamar tersedia` : 'Kamar penuh'}
        {#if k.dicek_ulang_at}<small>· dicek {tanggalPendek(k.dicek_ulang_at)}</small>{/if}
      </p>
    {/if}

    {#if lain.length}
      <p class="kc-lain">{lain.slice(0, 3).join(' · ')}{#if lain.length > 3}{' '}<span>+{lain.length - 3} lainnya</span>{/if}</p>
    {/if}

    <DaftarTipe anggota={varian.length ? varian : [k]} {crit} dipilih={k.id} onPilih={onVarian} />
    {#if m.length > 1}<p class="kc-masalah"><Icon name="circle-alert" />{m.slice(1).join(' · ')}</p>{/if}
    {#if k.catatan}<p class="kc-catatan">{k.catatan}</p>{/if}
  </div>

  <div class="kc-foot">
    <select value={k.status} onchange={e => onUbah({ status: e.target.value })} aria-label="Status kontak">{#each STATUS as s}<option>{s}</option>{/each}</select>
    {#if k.pilihan === 'skip'}
      <button class="kc-btn" onclick={() => onUbah({ pilihan: '' })} title="Kembalikan ke daftar" aria-label="Kembalikan"><Icon name="undo-2" /></button>
    {:else}
      <button class="kc-btn skip" onclick={onSkip} title="Skip — sembunyikan dari daftar" aria-label="Skip"><Icon name="x" /></button>
    {/if}
    {#if k.kontak}<a class="kc-btn wa" href="https://wa.me/{waNum(k.kontak)}" target="_blank" rel="noopener" title="WhatsApp {k.kontak}" aria-label="WhatsApp"><Icon name="message-circle" /></a>{/if}
    {#if k.link}<a class="kc-btn" href={k.link} target="_blank" rel="noopener" title="Buka iklan" aria-label="Buka iklan"><Icon name="external-link" /></a>{/if}
    <button class="kc-btn" onclick={onEdit} title="Edit" aria-label="Edit"><Icon name="pencil" /></button>
  </div>
</article>

<style>
  .kc { overflow: hidden; display: flex; flex-direction: column; }
  .kc-foto { position: relative; aspect-ratio: 4 / 3; background: var(--surface-2); display: grid; place-items: center; color: var(--muted); }
  .kc-foto > :global(svg.lucide) { width: 40px; height: 40px; stroke-width: 1.5; }
  .kc-img { position: absolute; inset: 0; padding: 0; border: 0; background: none; cursor: zoom-in; }
  .kc-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .kc-foto::after { content: ''; position: absolute; inset: auto 0 0 0; height: 45%; background: linear-gradient(transparent, rgb(0 0 0 / .45)); pointer-events: none; }
  .kc-foto:hover :global(.nav-btn) { opacity: 1; }

  .kc-status { position: absolute; top: 10px; left: 10px; z-index: 2; display: inline-flex; align-items: center; gap: 5px; max-width: calc(100% - 70px);
    padding: 4px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 600; background: var(--bad-soft); color: var(--bad);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kc-status.ok { background: var(--ok-soft); color: var(--ok); }
  .kc-status :global(svg.lucide) { width: 13px; height: 13px; }
  .kc-suka { position: absolute; top: 8px; right: 8px; z-index: 2; width: 34px; height: 34px; border-radius: 50%; border: 0; display: grid; place-items: center;
    background: rgb(255 255 255 / .9); color: #374151; cursor: pointer; box-shadow: 0 2px 8px rgb(0 0 0 / .15); transition: transform .12s; }
  .kc-suka:hover { transform: scale(1.08); }
  .kc-suka :global(svg.lucide) { width: 17px; height: 17px; }
  .kc-suka.on { color: #e11d48; }
  .kc-suka.on :global(svg.lucide) { fill: #e11d48; }
  .kc-harga { position: absolute; left: 12px; bottom: 10px; z-index: 2; color: #fff; font-weight: 800; font-size: 18px; letter-spacing: -.01em; text-shadow: 0 1px 4px rgb(0 0 0 / .4); }
  .kc-harga small { font-size: 12px; font-weight: 500; opacity: .85; margin-left: 2px; }
  .kc-harga.kena { color: #fecaca; }
  .kc-jarak { position: absolute; right: 10px; bottom: 10px; z-index: 2; display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; border-radius: 99px;
    background: rgb(255 255 255 / .92); color: #16181d; font-size: 12px; font-weight: 600; }
  .kc-jarak :global(svg.lucide) { width: 13px; height: 13px; }
  .kc-jarak.kena { background: var(--bad); color: #fff; }
  .kc-count { position: absolute; top: 14px; right: 50px; z-index: 2; font-size: 11px; font-weight: 600; color: #fff; padding: 2px 7px; border-radius: 99px; background: rgb(0 0 0 / .45); }

  .kc-body { padding: 14px 16px 12px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
  .kc-meta { display: flex; align-items: center; gap: 10px; font-size: 12.5px; }
  .kc-tipe { font-weight: 700; text-transform: uppercase; letter-spacing: .04em; font-size: 11px; }
  .kc-rating { display: inline-flex; align-items: center; gap: 3px; font-weight: 600; }
  .kc-rating :global(svg.lucide) { width: 13px; height: 13px; color: #f59e0b; fill: #f59e0b; }
  .kc-rating small { color: var(--muted); font-weight: 400; margin-left: 1px; }
  .kc-meta :global(.pill.baru) { margin: 0 0 0 auto; }
  h3 { margin: 0; font-size: 15.5px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  h3 a { color: var(--text); }
  h3 a:hover { color: var(--pri); text-decoration: none; }
  .kc-daerah { margin: -4px 0 0; font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .kc-fas { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12.5px; }
  .kc-fas span { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); opacity: .6; text-decoration: line-through; }
  .kc-fas span.ada { color: var(--ok); opacity: 1; text-decoration: none; font-weight: 500; }
  .kc-fas :global(svg.lucide) { width: 14px; height: 14px; }
  .kc-kamar { margin: 0; display: flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--ok); }
  .kc-kamar.penuh { color: var(--bad); }
  .kc-kamar small { font-weight: 400; color: var(--muted); }
  .kc-kamar :global(svg.lucide) { width: 14px; height: 14px; flex-shrink: 0; }
  .kc-masalah { margin: 0; font-size: 12px; line-height: 1.45; color: var(--bad);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .kc-masalah :global(svg.lucide) { width: 13px; height: 13px; vertical-align: -2px; margin-right: 4px; }
  .kc-lain { margin: 0; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kc-lain span { color: var(--pri); font-weight: 500; }
  .kc-catatan { margin: 0; font-size: 12.5px; color: var(--muted); padding: 8px 10px; border-radius: 8px; background: var(--surface-2);
    white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

  .kc-foot { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--line); }
  .kc-foot select { flex: 1; min-width: 0; height: 34px; padding: 0 8px; font-size: 12.5px; }
  .kc-btn { width: 34px; height: 34px; flex-shrink: 0; display: grid; place-items: center; border-radius: 9px; border: 1px solid var(--line);
    background: var(--surface); color: var(--muted); cursor: pointer; }
  .kc-btn:hover { color: var(--text); background: var(--surface-2); text-decoration: none; }
  .kc-btn :global(svg.lucide) { width: 16px; height: 16px; }
  .kc-btn.skip:hover { color: var(--bad); border-color: var(--bad); }
  .kc-btn.wa { color: #16a34a; }
</style>
