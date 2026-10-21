<script>
  // Kost dalam tampilan list: satu baris ringkas berisi foto, info utama, harga & aksi
  import Icon from './Icon.svelte';
  import DaftarTipe from './DaftarTipe.svelte';
  import { UTAMA, FAS_ICON, STATUS, rpShort, waNum, masalah, langgar, fotoKost, ukuranFoto } from '$lib/kost.js';

  let { k, crit, varian = [], onVarian, onUbah, onSkip, onEdit, onFoto } = $props();
  const foto = $derived(fotoKost(k));
  const m = $derived(masalah(k, crit));
  const lg = $derived(langgar(k, crit));
  const fas = $derived(k.fasilitas || []);
</script>

<article class="row" class:liked={k.pilihan === 'suka'}>
  <button class="row-img" onclick={() => foto.length && onFoto(foto, 0)} aria-label="Lihat foto">
    {#if foto.length}<img src={ukuranFoto(foto[0], 'kecil')} alt="" loading="lazy">{:else}<Icon name="house" />{/if}
    {#if (k.galeri_total || foto.length) > 1}<span class="row-count"><Icon name="images" />{k.galeri_total || foto.length}</span>{/if}
  </button>

  <div class="row-main">
    <div class="row-title">
      {#if !k.dilihat}<span class="pill baru"><Icon name="sparkles" />Baru</span>{/if}
      <a href="/kost/{k.id}">{k.nama}</a>
    </div>
    <div class="row-sub">
      <span class="tipe tipe-{k.tipe.toLowerCase()}" class:langgar={lg.tipe}>{k.tipe}</span>
      {#if k.ukuran}<i class="sep"></i>{k.ukuran}{/if}
      {#if k.rating_mamikos !== ''}<i class="sep"></i><span class="row-rating"><Icon name="star" class="star" />{k.rating_mamikos}</span>{/if}
      {#if k.alamat}<i class="sep"></i><span class="row-alamat">{k.alamat}</span>{/if}
    </div>
    <div class="row-fas">
      {#each UTAMA as f}<span class="fas-ic" class:ada={fas.includes(f)} title="{f}{fas.includes(f) ? '' : ' — tidak ada'}"><Icon name={FAS_ICON[f]} />{f}</span>{/each}
      {#if k.kamar_tersedia !== ''}
        <span class="fas-ic" class:ada={k.kamar_tersedia > 0}><Icon name={k.kamar_tersedia > 0 ? 'door-open' : 'door-closed'} />{k.kamar_tersedia > 0 ? `${k.kamar_tersedia} kamar kosong` : 'Penuh'}</span>
      {/if}
    </div>
    <DaftarTipe anggota={varian.length ? varian : [k]} {crit} dipilih={k.id} onPilih={onVarian} />
    {#if m.length}<div class="row-warn"><Icon name="circle-alert" />{m.join(' · ')}</div>{/if}
  </div>

  <div class="row-angka">
    <b class:langgar={lg.harga}>{rpShort(k.harga)}</b><small>/bulan</small>
    {#if k.jarak !== ''}<span class:langgar={lg.jarak}><Icon name="route" />{k.jarak} km</span>{/if}
  </div>

  <div class="row-aksi">
    <select value={k.status} onchange={e => onUbah({ status: e.target.value })} aria-label="Status kontak">{#each STATUS as s}<option>{s}</option>{/each}</select>
    <div class="row-btns">
      <button class="btn sm like" class:on={k.pilihan === 'suka'} onclick={() => onUbah({ pilihan: k.pilihan === 'suka' ? '' : 'suka' })} title={k.pilihan === 'suka' ? 'Batal suka' : 'Suka'}><Icon name="heart" /></button>
      {#if k.pilihan === 'skip'}
        <button class="btn sm" onclick={() => onUbah({ pilihan: '' })} title="Kembalikan ke daftar"><Icon name="undo-2" /></button>
      {:else}
        <button class="btn sm danger" onclick={onSkip} title="Skip — sembunyikan dari daftar"><Icon name="x" /></button>
      {/if}
      {#if k.kontak}<a class="btn sm" href="https://wa.me/{waNum(k.kontak)}" target="_blank" rel="noopener" title="WhatsApp {k.kontak}"><Icon name="message-circle" /></a>{/if}
      {#if k.link}<a class="btn sm" href={k.link} target="_blank" rel="noopener" title="Buka iklan"><Icon name="external-link" /></a>{/if}
      <button class="btn sm" onclick={onEdit} title="Edit"><Icon name="pencil" /></button>
    </div>
  </div>
</article>
