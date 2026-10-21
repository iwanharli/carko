<script>
  // Pilihan fasilitas berbentuk chip; value = daftar fasilitas terpilih
  import { FASILITAS } from '$lib/kost.js';
  let { value = $bindable([]), pilihan = FASILITAS } = $props();
  const toggle = f => (value = value.includes(f) ? value.filter(x => x !== f) : [...value, f]);
</script>

<div class="chips">
  {#each pilihan as f}
    <label class="chip"><input type="checkbox" checked={value.includes(f)} onchange={() => toggle(f)}>{f}</label>
  {/each}
</div>
