<script>
  // Status engine di header: progres saat berjalan, hitung mundur ke pencarian berikutnya saat menunggu
  import Icon from './Icon.svelte';
  import { api } from '$lib/kost.js';

  let { berikutnya, onPerubahan = () => {} } = $props();
  let job = $state({ running: false }), sekarang = $state(Date.now()), lastSaved = -1;

  async function poll() {
    const j = await api('kumpulkan').catch(() => null);
    if (!j) return;
    const selesai = job.running && !j.running, adaBaru = lastSaved !== -1 && j.saved !== lastSaved;
    job = j; lastSaved = j.saved;
    if (selesai || adaBaru) onPerubahan({ selesai });
  }
  $effect(() => {
    poll();
    const a = setInterval(poll, 3000), b = setInterval(() => (sekarang = Date.now()), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  });

  const hitung = $derived.by(() => {
    const sisa = berikutnya ? new Date(berikutnya) - sekarang : 0;
    if (sisa <= 0) return 'segera';
    const t = Math.floor(sisa / 1000), j = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, d = t % 60;
    return (j ? `${j}:${String(m).padStart(2, '0')}` : m) + ':' + String(d).padStart(2, '0');
  });
</script>

<a class="engine" class:jalan={job.running} href="/pengaturan#kumpul" title="Status engine otomatis">
  <span class="eng-ic"><Icon name="radar" /></span>
  <span class="eng-txt">
    {#if job.running}
      <span>{job.phase || 'Mengumpulkan'}</span>
      <b>{job.total ? `${job.done}/${job.total}${job.saved ? ` · +${job.saved} baru` : ''}` : 'memuat…'}</b>
    {:else}
      <span>Pencarian berikutnya</span><b>{hitung}</b>
    {/if}
  </span>
  <span class="eng-bar"><i style:width="{job.total ? job.done / job.total * 100 : 6}%"></i></span>
</a>
