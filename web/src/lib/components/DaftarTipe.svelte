<script>
  // Daftar tipe kamar dalam satu gedung: tersedia (titik hijau), penuh (abu), melanggar kriteria (keterangan merah).
  // Tipe yang tersimpan bisa dipilih; tipe "info Mamikos" (tidak tersimpan, mis. penuh / di atas budget) hanya informasi.
  import Icon from './Icon.svelte';
  import { rpShort } from '$lib/kost.js';
  import { ringkas, statusTipe, masalahInfo, namaTipe } from '$lib/gedung.js';

  let { anggota, crit, dipilih, onPilih, ringkasan = true } = $props();
  const r = $derived(ringkas({ anggota }));
  const kecilAwal = t => t.charAt(0).toLowerCase() + t.slice(1);  // "Lewat budget Rp …" → "lewat budget Rp …"
</script>

{#if r.total > 1}
  <div class="tipe-kamar">
    {#if ringkasan}
      <div class="tk-ringkas">
        <Icon name="layers" /><b>{r.total} tipe kamar</b><span>·</span>
        <span class:habis={!r.tersedia}>{r.tersedia ? `${r.tersedia} tersedia` : 'semua penuh'}</span>
      </div>
    {/if}
    <ul>
      {#each anggota as v (v.id)}
        {@const s = statusTipe(v, crit)}
        <li>
          <button class:on={v.id === dipilih} class:penuh={s.penuh} onclick={() => onPilih(v.id)} title={v.nama}>
            <i class="tk-dot" class:ok={!s.penuh && !s.masalah.length} class:warn={!s.penuh && s.masalah.length}></i>
            <span class="tk-nama">{namaTipe(v, anggota)}</span>
            <span class="tk-harga">{rpShort(v.harga)}</span>
            <span class="tk-kamar">{s.penuh ? 'Penuh' : v.kamar_tersedia === '' ? '—' : `${v.kamar_tersedia} kamar`}</span>
            {#if s.masalah.length}<span class="tk-masalah">{kecilAwal(s.masalah[0])}</span>{/if}
          </button>
        </li>
      {/each}
      {#each r.info as t (t.nama)}
        {@const m = masalahInfo(t, crit)}
        <li>
          <div class="tk-info" class:penuh={t.kamar === 0} title="Tipe ini tidak tersimpan di CARKO — data dari halaman Mamikos">
            <i class="tk-dot" class:ok={t.kamar !== 0 && !m.length} class:warn={t.kamar !== 0 && m.length}></i>
            <span class="tk-nama">{t.nama}<em>info</em></span>
            <span class="tk-harga">{t.harga ? rpShort(t.harga) : '—'}</span>
            <span class="tk-kamar">{t.kamar === 0 ? 'Penuh' : t.kamar ? `${t.kamar} kamar` : 'Tersedia'}</span>
            {#if m.length}<span class="tk-masalah">{kecilAwal(m[0])}</span>{/if}
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/if}
