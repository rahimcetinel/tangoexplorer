// @ts-check
import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Both packages ship CommonJS entry points. Vite's SSR module runner inlines
// them on Windows without the CJS->ESM conversion, so `astro sync` fails with
// "require is not defined". Point Vite at ESM wrappers instead.
const picomatchEsm = fileURLToPath(new URL('./picomatch-esm.mjs', import.meta.url));
const yamlEsm = fileURLToPath(new URL('./yaml-esm.mjs', import.meta.url));

export default defineConfig({
  site: 'https://tangoexplorer.com',
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/fragments/') &&
        !page.includes('/search-index') &&
        !page.includes('/hoy-milongas.json') &&
        !page.includes('/404'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: [
        { find: /^yaml$/, replacement: yamlEsm },
        { find: /^picomatch$/, replacement: picomatchEsm },
      ],
    },
  },
});


