<script>
  // Peta untuk memilih lokasi kerja: klik peta atau geser pin; `koor` berisi "lat, lng"
  import { onMount } from 'svelte';
  import { parseKoor } from '$lib/kost.js';
  import { petaDasar, pin, L } from '$lib/peta.js';

  let { koor = $bindable(''), radius = 0 } = $props();
  let el, map, penanda, lingkaran;
  const tulis = ll => (koor = `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`);

  onMount(() => {
    const awal = parseKoor(koor) || [-6.2873, 106.8044];
    map = petaDasar(el, { scrollWheelZoom: false }).setView(awal, 14);
    penanda = L.marker(awal, { icon: pin('kerja', 'briefcase'), draggable: true, autoPan: true }).addTo(map)
      .on('dragend', () => tulis(penanda.getLatLng()));
    lingkaran = L.circle(awal, { radius: 0, color: '#0f766e', weight: 1.5, dashArray: '6 6', fillOpacity: 0.05, interactive: false }).addTo(map);
    map.on('click', e => { penanda.setLatLng(e.latlng); tulis(e.latlng); });
    return () => map.remove();
  });

  // Ikuti perubahan dari input teks & radius
  $effect(() => {
    const c = parseKoor(koor);
    if (!map || !c) return;
    if (penanda.getLatLng().distanceTo(c) > 1) { penanda.setLatLng(c); map.panTo(c); }
    lingkaran.setLatLng(c);
  });
  $effect(() => {
    if (!lingkaran) return;
    lingkaran.setRadius((+radius || 0) * 1000);
    if (+radius) map.fitBounds(lingkaran.getBounds(), { padding: [20, 20] });
  });
</script>

<div class="lokasi-peta" bind:this={el}></div>
