// Bundles the command-line entry points (migrate, seed, worker) into single
// files under dist/, so the production image runs them with plain `node`
// and no TypeScript toolchain.
import { build } from 'esbuild';

await build({
  entryPoints: { migrate: 'scripts/migrate.ts', seed: 'scripts/seed.ts', worker: 'worker/index.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  tsconfig: 'tsconfig.json',
  external: ['pg-native'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
