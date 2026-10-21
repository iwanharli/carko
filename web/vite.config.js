import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Saat `npm run dev`, permintaan /api diteruskan ke server Express (port 3000)
export default defineConfig({
  plugins: [sveltekit()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3000' } },
});
