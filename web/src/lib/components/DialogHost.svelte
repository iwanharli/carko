<script>
  import Icon from './Icon.svelte';
  import { dialog, toastState } from '$lib/dialog.svelte.js';

  let el = $state(), teks = $state(''), dipilih = $state([]);
  const d = $derived(dialog.aktif);

  $effect(() => {
    if (d && el && !el.open) {
      teks = d.isian?.nilai || ''; dipilih = [];
      el.showModal();
    }
  });

  let hasil;
  function tutup(nilai) { hasil = nilai; el.close(); }
  function onClose() {
    const a = dialog.aktif; if (!a) return;
    dialog.aktif = null;
    a.resolve(hasil ?? (a.jenis === 'isian' ? null : a.jenis === 'info'));
    hasil = undefined;
  }
  function pilih(p) {
    dipilih = dipilih.includes(p) ? dipilih.filter(x => x !== p) : [...dipilih, p];
    const lain = teks.split(', ').filter(x => x && !d.pilihanCepat.includes(x));
    teks = [...dipilih, ...lain].join(', ');
  }
</script>

<dialog class="mdl" bind:this={el} onclose={onClose} onclick={e => e.target === el && el.close()}>
  {#if d}
    <form method="dialog" onsubmit={e => { e.preventDefault(); tutup(d.jenis === 'isian' ? teks.trim() : true); }}>
      <div class="mdl-body">
        <div class="mdl-ic" class:bahaya={d.bahaya}><Icon name={d.ikon} /></div>
        <div class="mdl-isi">
          <h2>{d.judul}</h2>
          {#if d.pesan}<p>{d.pesan}</p>{/if}
          {#if d.poin?.length}
            <ul class="dampak">{#each d.poin as [ikon, teks]}<li><Icon name={ikon} /><span>{@html teks}</span></li>{/each}</ul>
          {/if}
          {#if d.efek?.length}
            <div class="dampak-efek"><b>Yang akan terjadi</b><ul>{#each d.efek as e}<li>{@html e}</li>{/each}</ul></div>
          {/if}
          {#if d.jenis === 'isian'}
            {#if d.pilihanCepat.length}
              <div class="mdl-quick">
                {#each d.pilihanCepat as p}
                  <button type="button" class="chip" class:on={dipilih.includes(p)} onclick={() => pilih(p)}>{p}</button>
                {/each}
              </div>
            {/if}
            <!-- svelte-ignore a11y_autofocus -->
            <textarea rows="3" placeholder={d.isian?.placeholder || ''} bind:value={teks} autofocus></textarea>
          {/if}
        </div>
      </div>
      <div class="mdl-foot">
        {#if d.jenis !== 'info'}<button type="button" class="btn" onclick={() => tutup(d.jenis === 'isian' ? null : false)}>{d.batal}</button>{/if}
        <button type="submit" class="btn {d.bahaya ? 'hapus' : 'pri'}">{d.ok}</button>
      </div>
    </form>
  {/if}
</dialog>

<div class="toast" class:show={toastState.pesan}>
  <span>{toastState.pesan}</span>
  {#if toastState.undo}
    <button class="btn sm" onclick={() => { toastState.undo(); toastState.pesan = ''; }}><Icon name="undo-2" />Batalkan</button>
  {/if}
</div>
