import adapter from '@sveltejs/adapter-static';

// SPA: semua halaman dirender di browser; Express melayani build/ dengan fallback ke index.html
export default {
  kit: { adapter: adapter({ fallback: 'index.html' }) },
};
