import { build } from 'esbuild';

import { BUNDLE_PATH, HARNESS_ROOT } from './config.ts';

/** One ESM file, no minification (readable when a hash differs), no dependencies left unresolved. */
await build({
  entryPoints: [`${HARNESS_ROOT}/src/entry.ts`],
  outfile: BUNDLE_PATH,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
});
console.log(`bundled ${BUNDLE_PATH}`);
