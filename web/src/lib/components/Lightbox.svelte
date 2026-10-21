<script>
  // Galeri layar penuh: buka(judul, foto, indeks)
  import Icon from './Icon.svelte';
  import { ukuranFoto } from '$lib/kost.js';

  let el = $state(), judul = $state(''), foto = $state([]), i = $state(0), thumbs = $state();
  export function buka(j, f, idx = 0) { judul = j; foto = f; i = idx; el.showModal(); }
  const geser = d => (i = (i + d + foto.length) % foto.length);
  $effect(() => { thumbs?.children[i]?.scrollIntoView({ block: 'nearest', inline: 'center' }); });
</script>

<svelte:window onkeydown={e => { if (!el?.open) return; if (e.key === 'ArrowLeft') geser(-1); if (e.key === 'ArrowRight') geser(1); }} />

<dialog id="lb" bind:this={el} onclick={e => e.target === el && el.close()}>
  <div class="top">
    <strong>{judul}</strong>
    <span style="display:flex;gap:10px;align-items:center"><span class="muted">{i + 1} / {foto.length}</span>
      <button class="btn sm" onclick={() => el.close()}><Icon name="x" /></button></span>
  </div>
  <div class="stage">
    {#if foto.length}<img src={ukuranFoto(foto[i], 'besar')} alt="">{/if}
    <button class="nav-btn l" onclick={() => geser(-1)} aria-label="Sebelumnya"><Icon name="chevron-left" /></button>
    <button class="nav-btn r" onclick={() => geser(1)} aria-label="Berikutnya"><Icon name="chevron-right" /></button>
  </div>
  <div class="thumbs" bind:this={thumbs}>
    {#each foto as u, j}
      <button class="thumb-btn" onclick={() => (i = j)}><img src={ukuranFoto(u, 'kecil')} class:on={j === i} loading="lazy" alt=""></button>
    {/each}
  </div>
</dialog>
