import { defineConfig } from 'tsup';

export default defineConfig([
  // npm package: ESM + CJS + types. rrweb stays external (installed as a dep).
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    platform: 'browser',
    target: 'es2018',
    external: ['rrweb'],
  },
  // Single-file IIFE bundle served by the backend at /tracker.js (rrweb bundled in).
  {
    entry: { tracker: 'src/snippet.ts' },
    format: ['iife'],
    globalName: 'rrkit',
    minify: true,
    sourcemap: false,
    platform: 'browser',
    target: 'es2018',
    noExternal: ['rrweb', '@rrkit/shared'],
    clean: false,
  },
]);
