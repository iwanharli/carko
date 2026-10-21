<script>
  import Icon from '$lib/components/Icon.svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';

  let pengguna = $state(''), sandi = $state(''), galat = $state(''), proses = $state(false), lihat = $state(false);
  // Hanya izinkan tujuan di dalam aplikasi ini
  const tujuan = () => { const k = page.url.searchParams.get('ke') || '/'; return k.startsWith('/') && !k.startsWith('//') ? k : '/'; };

  async function masuk(e) {
    e.preventDefault();
    proses = true; galat = '';
    const r = await fetch('/api/masuk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pengguna, sandi }) });
    proses = false;
    if (r.ok) return goto(tujuan(), { replaceState: true });
    galat = (await r.json().catch(() => ({}))).error || 'Gagal masuk';
    sandi = '';
  }
</script>

<svelte:head><title>Masuk · CARKO</title></svelte:head>

<main class="masuk">
  <form class="kotak" onsubmit={masuk}>
    <div class="logo"><span><Icon name="house" /></span><div><b>CARKO</b><small>Cari Kost</small></div></div>
    <h1>Masuk</h1>
    <p>Masukkan username dan kata sandi untuk membuka daftar kost kamu.</p>
    <label class="fld">
      <span>Username</span>
      <div class="sandi">
        <Icon name="user-round" />
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={pengguna} autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus>
      </div>
    </label>
    <label class="fld">
      <span>Kata sandi</span>
      <div class="sandi">
        <Icon name="lock-keyhole" />
        <input type={lihat ? 'text' : 'password'} bind:value={sandi} autocomplete="current-password" required>
        <button type="button" onclick={() => (lihat = !lihat)} aria-label={lihat ? 'Sembunyikan' : 'Tampilkan'}><Icon name={lihat ? 'eye-off' : 'eye'} /></button>
      </div>
    </label>
    {#if galat}<p class="galat"><Icon name="circle-alert" />{galat}</p>{/if}
    <button class="btn pri" disabled={proses || !pengguna || !sandi}>{proses ? 'Memeriksa…' : 'Masuk'}</button>
  </form>
</main>

<style>
  .masuk { min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px;
    background: radial-gradient(circle at 20% 10%, var(--pri-soft), transparent 45%), var(--bg); }
  .kotak { width: min(380px, 100%); background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 32px 28px;
    box-shadow: 0 20px 50px rgb(15 23 42 / .1); display: flex; flex-direction: column; gap: 14px; }
  .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .logo > span { width: 40px; height: 40px; border-radius: 11px; background: var(--pri); color: #fff; display: grid; place-items: center; }
  .logo div { display: flex; flex-direction: column; line-height: 1.1; }
  .logo b { font-weight: 800; letter-spacing: .04em; } .logo small { color: var(--muted); font-size: 11.5px; }
  h1 { font-size: 22px; } p { margin: -6px 0 4px; color: var(--muted); font-size: 13.5px; }
  .fld { display: flex; flex-direction: column; gap: 6px; }
  .fld > span { font-size: 12.5px; font-weight: 600; color: var(--text); }
  .sandi { position: relative; display: flex; align-items: center; color: var(--muted); }
  .sandi > :global(svg.lucide:first-child) { position: absolute; left: 12px; pointer-events: none; }
  .sandi input { padding: 0 40px; height: 44px; font-size: 15px; }
  .sandi button { position: absolute; right: 6px; width: 32px; height: 32px; border: 0; background: none; color: var(--muted); cursor: pointer; display: grid; place-items: center; border-radius: 8px; }
  .galat { display: flex; align-items: center; gap: 6px; color: var(--bad); margin: 0; font-size: 13px; }
  .btn.pri { height: 44px; justify-content: center; font-size: 15px; }
</style>
