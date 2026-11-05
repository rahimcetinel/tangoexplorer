// @ts-check
import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// picomatch ships as CommonJS; Vite's SSR module runner inlines it on Windows
// without the CJS->ESM conversion and `astro sync` fails. See picomatch-esm.mjs.
const picomatchEsm = fileURLToPath(new URL('./picomatch-esm.mjs', import.meta.url));

export default defineConfig({
  site: 'https://tangoexplorer.com',
  i18n: {
    locales: ['en', 'tr'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/fragments/') &&
        !page.includes('/search-index/') &&
        !page.includes('/hoy-milongas.json') &&
        !page.includes('/404'),
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en',
          tr: 'tr',
        },
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: [{ find: /^picomatch$/, replacement: picomatchEsm }],
    },
  },
});
