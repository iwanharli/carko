<script module>
  // Filter lanjutan: nilai awal, pengecekan, dan daftar filter aktif (untuk chip yang bisa dihapus)
  import { rpShort, fotoKost } from '$lib/kost.js';
  export const ADV0 = () => ({ hMin: '', hMax: '', jarak: '', tipe: [], fas: [], rating: '', tersedia: false, kontak: false, foto: false,
    bulanan: false, tanpaJamMalam: false, bukanMahasiswa: false, ulasanBagus: false });
  // Aturan kost dari Mamikos (kost yang rinciannya belum terbaca dianggap lolos)
  const aturanKost = k => k.detail_mamikos?.aturan || [];
  const adaJamMalam = k => !aturanKost(k).some(a => /akses 24 jam/i.test(a)) && aturanKost(k).some(a => /jam malam/i.test(a) && !/tamu/i.test(a));

  export function lolosAdv(k, a) {
    if (a.hMin && k.harga < +a.hMin) return false;
    if (a.hMax && k.harga > +a.hMax) return false;
    if (a.jarak && (k.jarak === '' || k.jarak > +a.jarak)) return false;
    if (a.tipe.length && !a.tipe.includes(k.tipe)) return false;
    if (a.fas.some(f => !(k.fasilitas || []).includes(f))) return false;
    if (a.rating && (k.rating_mamikos === '' || k.rating_mamikos < +a.rating)) return false;
    if (a.tersedia && !(k.kamar_tersedia > 0)) return false;
    if (a.kontak && !k.kontak) return false;
    if (a.foto && !fotoKost(k).length) return false;
    if (a.bulanan && (k.detail_mamikos?.biaya?.min_bulan || 0) > 1) return false;
    if (a.tanpaJamMalam && adaJamMalam(k)) return false;
    if (a.bukanMahasiswa && aturanKost(k).some(x => /khusus mahasiswa/i.test(x))) return false;
    if (a.ulasanBagus && !(k.rating_mamikos >= 4.5 && k.ulasan >= 5)) return false;
    return true;
  }
  // [label, fungsi untuk menghapus filter itu]
  export function advAktif(a) {
    const out = [];
    if (a.hMin || a.hMax) out.push([a.hMin && a.hMax ? `${rpShort(+a.hMin)} – ${rpShort(+a.hMax)}` : a.hMax ? `≤ ${rpShort(+a.hMax)}` : `≥ ${rpShort(+a.hMin)}`, () => { a.hMin = a.hMax = ''; }]);
    if (a.jarak) out.push([`≤ ${a.jarak} km`, () => { a.jarak = ''; }]);
    if (a.tipe.length) out.push([a.tipe.join(' / '), () => { a.tipe = []; }]);
    a.fas.forEach(f => out.push([f, () => { a.fas = a.fas.filter(x => x !== f); }]));
    if (a.rating) out.push([`Rating ${String(a.rating).replace('.', ',')}+`, () => { a.rating = ''; }]);
    if (a.tersedia) out.push(['Ada kamar kosong', () => { a.tersedia = false; }]);
    if (a.kontak) out.push(['Ada nomor WA', () => { a.kontak = false; }]);
    if (a.foto) out.push(['Ada foto', () => { a.foto = false; }]);
    if (a.bulanan) out.push(['Bisa sewa bulanan', () => { a.bulanan = false; }]);
    if (a.tanpaJamMalam) out.push(['Tanpa jam malam', () => { a.tanpaJamMalam = false; }]);
    if (a.bukanMahasiswa) out.push(['Bukan khusus mahasiswa', () => { a.bukanMahasiswa = false; }]);
    if (a.ulasanBagus) out.push(['Ulasan bagus', () => { a.ulasanBagus = false; }]);
    return out;
  }
</script>

<script>
  import Icon from './Icon.svelte';
  import FasilitasChips from './FasilitasChips.svelte';

  // hitung(filter) → jumlah kost yang lolos, untuk tombol "Tampilkan N kost"
  let { hitung, onTerapkan } = $props();
  let el = $state(), a = $state(ADV0());
  export function buka(nilai) { a = structuredClone($state.snapshot(nilai)); el.showModal(); }
  const n = $derived(hitung(a));
  const tipeToggle = t => (a.tipe = a.tipe.includes(t) ? a.tipe.filter(x => x !== t) : [...a.tipe, t]);
</script>

<dialog class="adv-dlg" bind:this={el} onclick={e => e.target === el && el.close()}>
  <form onsubmit={e => { e.preventDefault(); onTerapkan($state.snapshot(a)); el.close(); }}>
    <div class="dlg-head"><h2>Filter lanjutan</h2><button type="button" class="btn ghost" onclick={() => el.close()}><Icon name="x" /></button></div>
    <div class="adv-body">
      <section>
        <h3>Harga per bulan</h3>
        <div class="range2">
          <div class="prefix"><span>Rp</span><input type="number" placeholder="Minimum" step="50000" min="0" bind:value={a.hMin}></div>
          <span class="muted">–</span>
          <div class="prefix"><span>Rp</span><input type="number" placeholder="Maksimum" step="50000" min="0" bind:value={a.hMax}></div>
        </div>
        <div class="chips quick">
          {#each [[1000000, '≤ 1 jt'], [1250000, '≤ 1,25 jt'], [1500000, '≤ 1,5 jt']] as [v, l]}
            <button type="button" onclick={() => (a.hMax = v)}>{l}</button>
          {/each}
        </div>
      </section>
      <section>
        <h3>Jarak tempuh ke kantor</h3>
        <div class="chips">
          {#each [['', 'Semua'], ['2', '≤ 2 km'], ['3', '≤ 3 km'], ['4', '≤ 4 km'], ['5', '≤ 5 km']] as [v, l]}
            <label class="chip"><input type="radio" value={v} bind:group={a.jarak}>{l}</label>
          {/each}
        </div>
      </section>
      <section>
        <h3>Tipe kost</h3>
        <div class="chips">
          {#each ['Putri', 'Campur', 'Putra'] as t}
            <label class="chip"><input type="checkbox" checked={a.tipe.includes(t)} onchange={() => tipeToggle(t)}>{t}</label>
          {/each}
        </div>
      </section>
      <section><h3>Fasilitas harus ada</h3><FasilitasChips bind:value={a.fas} /></section>
      <section>
        <h3>Rating Mamikos</h3>
        <div class="chips">
          <label class="chip"><input type="radio" value="" bind:group={a.rating}>Semua</label>
          <label class="chip"><input type="radio" value="4" bind:group={a.rating}><Icon name="star" />4,0+</label>
          <label class="chip"><input type="radio" value="4.5" bind:group={a.rating}><Icon name="star" />4,5+</label>
        </div>
      </section>
      <section class="adv-toggles">
        <h3>Aturan, biaya & ulasan</h3>
        <label class="switch"><input type="checkbox" bind:checked={a.bulanan}><span class="track"></span>Bisa sewa bulanan (tanpa minimal sewa panjang)</label>
        <label class="switch"><input type="checkbox" bind:checked={a.tanpaJamMalam}><span class="track"></span>Tanpa jam malam</label>
        <label class="switch"><input type="checkbox" bind:checked={a.bukanMahasiswa}><span class="track"></span>Sembunyikan kost khusus mahasiswa</label>
        <label class="switch"><input type="checkbox" bind:checked={a.ulasanBagus}><span class="track"></span>Ulasan bagus (rating ≥ 4,5 dari minimal 5 ulasan)</label>
      </section>
      <section class="adv-toggles">
        <h3>Lainnya</h3>
        <label class="switch"><input type="checkbox" bind:checked={a.tersedia}><span class="track"></span>Hanya yang masih ada kamar kosong</label>
        <label class="switch"><input type="checkbox" bind:checked={a.kontak}><span class="track"></span>Hanya yang ada nomor WA</label>
        <label class="switch"><input type="checkbox" bind:checked={a.foto}><span class="track"></span>Hanya yang ada foto</label>
      </section>
    </div>
    <div class="dlg-foot">
      <button type="button" class="btn ghost" style="margin-right:auto" onclick={() => (a = ADV0())}>Reset</button>
      <button type="submit" class="btn pri">Tampilkan {n} kost</button>
    </div>
  </form>
</dialog>
