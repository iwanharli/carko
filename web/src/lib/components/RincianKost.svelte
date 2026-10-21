<script>
  // Rincian dari Mamikos: biaya per periode, aturan, fasilitas per kategori, deskripsi pemilik
  import Icon from './Icon.svelte';
  import { rp } from '$lib/kost.js';

  let { d } = $props();
  let deskripsiBuka = $state(false);
  const b = $derived(d.biaya || {});
  const f = $derived(d.fasilitas || {});

  // Periode sewa yang tersedia + setara per bulan & hemat dibanding sewa bulanan
  const PERIODE = [['harian', 'Per hari', 0], ['mingguan', 'Per minggu', 0], ['bulanan', 'Per bulan', 1], ['triwulan', 'Per 3 bulan', 3], ['semester', 'Per 6 bulan', 6], ['tahunan', 'Per tahun', 12]];
  const periode = $derived(PERIODE.filter(([k]) => b[k] > 0).map(([k, label, bln]) => {
    const perBulan = bln > 1 ? Math.round(b[k] / bln) : null;
    const hemat = perBulan && b.bulanan ? Math.round((1 - perBulan / b.bulanan) * 100) : 0;
    return { label, harga: b[k], perBulan, hemat };
  }));
  // "Tidak termasuk …" bisa muncul di fasilitas kamar; tampilkan di biaya agar jelas
  const tidakTermasuk = $derived(Object.values(f).flat().filter(x => /^tidak termasuk/i.test(x)));
  const KATEGORI = [['kamar', 'Kamar', 'bed-double'], ['kamar_mandi', 'Kamar mandi', 'bath'], ['bersama', 'Fasilitas bersama', 'users'], ['parkir', 'Parkir', 'map-pin'], ['sekitar', 'Sekitar kost', 'map-pinned']];
  const larangan = a => /(dilarang|tidak|maks|wajib|khusus|hanya)/i.test(a);
  const p = $derived(d.pemilik || {}), v = $derived(d.verifikasi || {}), u = $derived(d.ulasan);
  const VERIF = [['kost', 'Kost terverifikasi'], ['alamat', 'Alamat terverifikasi'], ['telepon', 'Telepon terverifikasi'], ['dikunjungi', 'Dikunjungi tim Mamikos'], ['oleh_mamikos', 'Diverifikasi Mamikos']];
  const level = $derived([v.apik && 'Apik', v.singgahsini && 'Singgahsini', v.elite && 'Elite', v.level].filter(Boolean)[0]);
  const angka = n => Number(n || 0).toLocaleString('id-ID');
  // Iklan yang lama tidak diperbarui pemilik (> 3 bulan) sering sudah tidak akurat
  const lamaUpdate = $derived(d.diperbarui_pemilik && Date.now() - new Date(d.diperbarui_pemilik.replace(' ', 'T')) > 90 * 864e5);
</script>

{#if periode.length || b.min_bulan || b.dp_persen || b.termasuk?.length || tidakTermasuk.length}
  <section class="rk">
    <h2><Icon name="wallet" />Biaya</h2>
    {#if periode.length}
      <div class="rk-harga">
        {#each periode as p}
          <div class="rk-h">
            <span>{p.label}</span><b>{rp(p.harga)}</b>
            {#if p.perBulan}<small>≈ {rp(p.perBulan)}/bln{#if p.hemat > 0} · <em>hemat {p.hemat}%</em>{/if}</small>{/if}
          </div>
        {/each}
      </div>
    {/if}
    <div class="rk-chips">
      {#each b.termasuk || [] as t}<span class="pill ok"><Icon name="circle-check" />{t}</span>{/each}
      {#each tidakTermasuk as t}<span class="pill bad"><Icon name="circle-x" />{t}</span>{/each}
      {#if b.min_bulan}<span class="pill"><Icon name="clock" />Minimal sewa {b.min_bulan} bulan</span>{/if}
      {#if b.dp_persen}<span class="pill"><Icon name="wallet" />DP {b.dp_persen}%</span>{/if}
    </div>
    {#if b.catatan}<p class="rk-catatan">{b.catatan}</p>{/if}
  </section>
{/if}

{#if d.aturan?.length}
  <section class="rk">
    <h2><Icon name="list-checks" />Aturan kost</h2>
    <ul class="rk-aturan">
      {#each d.aturan as a}<li class:larangan={larangan(a)}><Icon name={larangan(a) ? 'circle-alert' : 'circle-check'} />{a}</li>{/each}
    </ul>
  </section>
{/if}

{#if Object.values(f).some(x => x?.length)}
  <section class="rk">
    <h2><Icon name="layers" />Fasilitas lengkap</h2>
    <div class="rk-fas">
      {#each KATEGORI as [k, label, ikon]}
        {#if f[k]?.length}
          <div><span class="rk-fas-l"><Icon name={ikon} />{label}</span>
            <div class="chips">{#each f[k].filter(x => !/^tidak termasuk/i.test(x)) as x}<span class="pill">{x}</span>{/each}</div></div>
        {/if}
      {/each}
    </div>
  </section>
{/if}

{#if d.deskripsi}
  <section class="rk">
    <h2><Icon name="notebook-pen" />Deskripsi dari pemilik</h2>
    <p class="rk-desk" class:buka={deskripsiBuka}>{d.deskripsi}</p>
    {#if d.deskripsi.length > 260}<button class="link-btn" onclick={() => (deskripsiBuka = !deskripsiBuka)}>{deskripsiBuka ? 'Tutup' : 'Selengkapnya'}</button>{/if}
  </section>
{/if}

{#if p.nama || VERIF.some(([k]) => v[k]) || level}
  <section class="rk">
    <h2><Icon name="shield-check" />Pemilik & verifikasi</h2>
    <div class="rk-pemilik">
      {#if p.nama}
        <div class="rk-owner">
          <span class="rk-avatar"><Icon name="user-round" /></span>
          <div><b>{p.nama}</b>
            <span class="rk-online" class:lama={/lama/i.test(p.online)}>{p.online || 'Pemilik kos'}</span></div>
          <div class="rk-owner-tag">
            {#if p.top}<span class="pill ok"><Icon name="star" />Pemilik teratas</span>{/if}
            {#if p.lambat}<span class="pill warn"><Icon name="clock" />Lambat membalas</span>{/if}
            {#if p.terima_persen}<span class="pill">Menerima {p.terima_persen}% booking</span>{/if}
            {#if p.waktu_balas}<span class="pill"><Icon name="message-square" />Membalas {p.waktu_balas}</span>{/if}
          </div>
        </div>
      {/if}
      <div class="chips">
        {#if level}<span class="pill rk-level">{level}</span>{/if}
        {#each VERIF.filter(([k]) => v[k]) as [, l]}<span class="pill ok"><Icon name="circle-check" />{l}</span>{/each}
      </div>
    </div>
  </section>
{/if}

{#if u?.jumlah}
  <section class="rk">
    <h2><Icon name="star" />Ulasan penghuni</h2>
    <div class="rk-ulasan">
      <div class="rk-skor"><b>{u.rating?.toLocaleString('id-ID', { minimumFractionDigits: 1 })}</b><span>dari 5</span><small>{u.jumlah} ulasan</small></div>
      <div class="rk-aspek">
        {#each Object.entries(u.aspek || {}).filter(([, n]) => n) as [l, n]}
          <div><span>{l}</span><i><em style:width="{n / 5 * 100}%"></em></i><b>{n.toLocaleString('id-ID', { minimumFractionDigits: 1 })}</b></div>
        {/each}
      </div>
    </div>
    {#if u.data?.length}
      <ul class="rk-review">
        {#each u.data as r}
          <li>
            <div class="rk-r-head"><b>{r.nama}</b><span class="rk-r-bintang"><Icon name="star" />{r.rating.toLocaleString('id-ID', { minimumFractionDigits: 1 })}</span><small>{r.tanggal}</small></div>
            {#if r.isi && !/^[\s\-–.]*$/.test(r.isi)}<p>{r.isi}</p>{/if}
            {#if r.balasan}<p class="rk-balas"><b>Balasan pemilik:</b> {r.balasan}</p>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

{#if d.tahun_bangunan || d.diperbarui_pemilik || d.popularitas?.dilihat || d.kamar?.jumlah_tipe}
  <p class="rk-meta">
    {#if d.tahun_bangunan}<span><Icon name="building-2" />Dibangun {d.tahun_bangunan}</span>{/if}
    {#if d.kamar?.kosong_gedung}<span><Icon name="door-open" />{d.kamar.kosong_gedung} kamar kosong di gedung ini</span>{/if}
    {#if d.popularitas?.disukai}<span><Icon name="heart" />Disukai {angka(d.popularitas.disukai)} orang</span>{/if}
    {#if d.popularitas?.dilihat}<span><Icon name="eye" />Dilihat {angka(d.popularitas.dilihat)} kali</span>{/if}
    {#if d.diperbarui_pemilik}<span class:rk-lama={lamaUpdate}><Icon name="history" />{lamaUpdate ? 'Iklan lama tidak diperbarui — ' : ''}Iklan diperbarui pemilik {new Date(d.diperbarui_pemilik.replace(' ', 'T')).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>{/if}
  </p>
{/if}

<style>
  .rk { margin-top: 24px; }
  .rk h2 { display: flex; align-items: center; gap: 6px; }
  .rk-harga { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; }
  .rk-h { display: flex; flex-direction: column; gap: 1px; padding: 10px 12px; border-radius: 10px; background: var(--surface-2); }
  .rk-h span { font-size: 12px; color: var(--muted); }
  .rk-h b { font-size: 15px; font-variant-numeric: tabular-nums; }
  .rk-h small { font-size: 11.5px; color: var(--muted); }
  .rk-h em { font-style: normal; color: var(--ok); font-weight: 600; }
  .rk-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .rk-chips:empty { display: none; }
  .rk-catatan { margin: 10px 0 0; font-size: 13px; color: var(--muted); white-space: pre-wrap; }
  .rk-aturan { list-style: none; padding: 0; margin: 12px 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px 16px; }
  .rk-aturan li { display: flex; align-items: flex-start; gap: 8px; font-size: 13.5px; }
  .rk-aturan li :global(svg.lucide) { width: 16px; height: 16px; color: var(--ok); margin-top: 2px; }
  .rk-aturan li.larangan :global(svg.lucide) { color: var(--warn); }
  .rk-fas { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
  .rk-fas-l { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
  .rk-fas-l :global(svg.lucide) { width: 14px; height: 14px; }
  .rk-desk { margin: 10px 0 4px; font-size: 13.5px; line-height: 1.6; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .rk-desk.buka { display: block; }
  .rk-meta { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 20px 0 0; font-size: 12.5px; color: var(--muted); }
  .rk-meta span { display: inline-flex; align-items: center; gap: 6px; }
  .rk-meta :global(svg.lucide) { width: 14px; height: 14px; }
  .rk-meta .rk-lama { color: var(--warn); font-weight: 600; }
  .rk-pemilik { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
  .rk-owner { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 14px; border-radius: 12px; background: var(--surface-2); }
  .rk-avatar { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--surface); color: var(--muted); }
  .rk-owner > div:nth-child(2) { display: flex; flex-direction: column; }
  .rk-online { font-size: 12.5px; color: var(--ok); }
  .rk-online.lama { color: var(--warn); }
  .rk-owner-tag { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
  .rk-level { background: #fef3c7; color: #92400e; font-weight: 600; }
  @media (prefers-color-scheme: dark) { .rk-level { background: #3a2a0a; color: #fbbf24; } }
  .rk-ulasan { display: flex; gap: 20px; align-items: center; margin-top: 12px; padding: 14px 16px; border-radius: 12px; background: var(--surface-2); flex-wrap: wrap; }
  .rk-skor { display: flex; flex-direction: column; align-items: center; min-width: 84px; }
  .rk-skor b { font-size: 34px; line-height: 1; letter-spacing: -.02em; }
  .rk-skor span { font-size: 12px; color: var(--muted); }
  .rk-skor small { font-size: 12px; color: var(--muted); margin-top: 4px; }
  .rk-aspek { flex: 1; min-width: 220px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
  .rk-aspek div { display: grid; grid-template-columns: 96px 1fr 28px; align-items: center; gap: 8px; font-size: 12.5px; }
  .rk-aspek span { color: var(--muted); }
  .rk-aspek i { height: 6px; border-radius: 99px; background: var(--line); overflow: hidden; }
  .rk-aspek em { display: block; height: 100%; background: #f59e0b; border-radius: 99px; }
  .rk-aspek b { text-align: right; font-variant-numeric: tabular-nums; }
  .rk-review { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 10px; }
  .rk-review li { padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; }
  .rk-r-head { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .rk-r-bintang { display: inline-flex; align-items: center; gap: 3px; font-weight: 600; }
  .rk-r-bintang :global(svg.lucide) { width: 13px; height: 13px; color: #f59e0b; fill: #f59e0b; }
  .rk-r-head small { margin-left: auto; color: var(--muted); }
  .rk-review p { margin: 6px 0 0; font-size: 13.5px; line-height: 1.55; }
  .rk-balas { padding: 8px 10px; border-radius: 8px; background: var(--surface-2); color: var(--muted); font-size: 12.5px !important; }
  @media (max-width: 560px) { .rk-aspek { grid-template-columns: 1fr; } .rk-owner-tag { margin-left: 0; } }
</style>
