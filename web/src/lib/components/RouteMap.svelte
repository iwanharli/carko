<script>
  // Peta rute kost → kantor beserta rute alternatif (dari /api/rute/:id)
  import Icon from './Icon.svelte';
  import { onMount } from 'svelte';
  import { api } from '$lib/kost.js';
  import { petaDasar, pin, L } from '$lib/peta.js';

  let { k, crit } = $props();
  let el, map, garis = [];
  let rute = $state([]), sumber = $state(''), galat = $state(''), dipilih = $state(0);

  onMount(() => {
    map = petaDasar(el, { scrollWheelZoom: false });
    const a = [k.lat, k.lng], b = [crit.kerja_lat, crit.kerja_lng];
    L.marker(a, { icon: pin('kost', 'house') }).addTo(map).bindTooltip(k.nama);
    L.marker(b, { icon: pin('kerja', 'briefcase') }).addTo(map).bindTooltip(crit.kerja_nama || 'Kantor');
    const lurus = L.polyline([a, b], { color: '#6b7280', weight: 2, dashArray: '6 6' }).addTo(map);
    map.fitBounds(L.latLngBounds([a, b]).pad(0.25));
    api('rute/' + k.id).then(r => {
      sumber = r.sumber; rute = r.routes;
      garis = rute.map((x, i) => L.polyline(x.garis.map(([lng, lat]) => [lat, lng]), { color: i ? '#94a3b8' : '#0f766e', weight: i ? 4 : 6, opacity: i ? 0.7 : 0.95 }).addTo(map));
      garis[0]?.bringToFront();
      map.fitBounds(L.featureGroup([...garis, lurus]).getBounds().pad(0.12));
    }).catch(e => (galat = e.message));
    return () => map.remove();
  });

  function pilih(i) {
    dipilih = i;
    garis.forEach((g, j) => g.setStyle({ color: j === i ? '#0f766e' : '#94a3b8', weight: j === i ? 6 : 4, opacity: j === i ? 0.95 : 0.7 }));
    garis[i].bringToFront();
  }
</script>

<div id="map" bind:this={el}></div>
<div class="routes">
  {#if galat}
    <span class="pill bad"><Icon name="circle-alert" />{galat}</span>
  {:else if !rute.length}
    <span class="muted">Menghitung rute…</span>
  {:else}
    {#each rute as r, i}
      <button class="route" class:on={i === dipilih} onclick={() => pilih(i)}>
        <span class="r-ic"><Icon name={i ? 'git-branch' : 'route'} /></span>
        <span><b>{r.km} km</b> · ±{r.menit} menit<br>
          <span class="muted">{i ? `Alternatif ${i}` : sumber === 'google' ? 'Rute utama (sama dengan Google Maps)' : 'Rute terpendek'}</span></span>
      </button>
    {/each}
    <div class="muted r-note"><Icon name="info" />Garis putus-putus = jarak lurus {k.jarak_lurus || '?'} km.
      {sumber === 'google' ? 'Rute motor dari Google Maps.' : 'Rute dari OpenStreetMap, perkiraan waktu tanpa macet.'}</div>
  {/if}
</div>
