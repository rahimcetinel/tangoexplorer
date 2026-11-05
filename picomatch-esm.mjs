// Build-time shim: picomatch is CommonJS, and Vite's SSR module runner on
// Windows inlines it without converting `require` -> esm, so `astro sync`
// dies with "require is not defined". Aliasing the bare specifier to this ESM
// wrapper makes Vite load the real package through Node's CJS interop instead.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default require('picomatch');
