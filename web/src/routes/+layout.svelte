<script>
  import '../app.css';
  import { page } from '$app/state';
  import Icon from '$lib/components/Icon.svelte';
  import DialogHost from '$lib/components/DialogHost.svelte';
  import KostForm from '$lib/components/KostForm.svelte';
  import { bukaForm } from '$lib/form.svelte.js';
  import { api } from '$lib/kost.js';
  import { konfirmasi } from '$lib/dialog.svelte.js';
  import { goto } from '$app/navigation';

  let { children } = $props();
  const MENU = [
    { href: '/', label: 'Daftar Kost', ikon: 'layout-grid' },
    { href: '/peta', label: 'Peta', ikon: 'map' },
    { href: '/pengaturan', label: 'Pengaturan', ikon: 'settings' },
  ];
  // Halaman detail kost termasuk menu Daftar Kost
  const aktif = href => href === '/' ? page.url.pathname === '/' || page.url.pathname.startsWith('/kost/') : page.url.pathname.startsWith(href);

  const tambah = () => bukaForm();

  // Login (aktif hanya bila server memakai APP_PASSWORD)
  let sesi = $state({ perluLogin: false, masuk: true });
  const diMasuk = $derived(page.url.pathname.startsWith('/masuk'));
  $effect(() => {
    api('sesi').then(s => {
      sesi = s;
      if (s.perluLogin && !s.masuk && !diMasuk) goto('/masuk?ke=' + encodeURIComponent(page.url.pathname));
    }).catch(() => {});
  });
  async function keluar() {
    if (!await konfirmasi({ judul: 'Keluar dari CARKO?', pesan: 'Kamu perlu memasukkan kata sandi lagi untuk membuka aplikasi.', ikon: 'log-out', ok: 'Keluar' })) return;
    await api('keluar', 'POST'); location.href = '/masuk';
  }
</script>

{#if !diMasuk}
<nav class="nav">
  <div class="wrap">
    <a class="brand" href="/"><span><Icon name="house" /></span><span class="brand-txt">CARKO<small>Cari Kost</small></span></a>
    <div class="tabs">
      {#each MENU as m}
        <a href={m.href} class:active={aktif(m.href)}><Icon name={m.ikon} />{m.label}</a>
      {/each}
    </div>
    <div class="spacer"></div>
    {#if page.url.pathname === '/'}
      <button class="btn pri" onclick={tambah}><Icon name="plus" />Tambah Kost</button>
    {/if}
    {#if sesi.perluLogin}<button class="btn ghost keluar" onclick={keluar} title="Keluar" aria-label="Keluar"><Icon name="log-out" /></button>{/if}
  </div>
</nav>
{/if}

{@render children()}

<KostForm />
<DialogHost />
