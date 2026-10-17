import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUNDLE_PATH = path.join(HARNESS_ROOT, 'dist', 'harness.mjs');
export const REPORT_PATH = path.join(HARNESS_ROOT, 'report.json');

/** Seeds per run: 1,000 on pull requests, 10,000 nightly (KANCHE_HARNESS_SEEDS). */
export const DEFAULT_SEEDS = 1000;
/** Steps per seed: 2 simulated seconds at 240 Hz. */
export const DEFAULT_STEPS = 480;

export function seedsFromEnv(env: NodeJS.ProcessEnv): number {
  const raw = env['KANCHE_HARNESS_SEEDS'];
  if (raw === undefined || raw === '') return DEFAULT_SEEDS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1)
    throw new RangeError(`KANCHE_HARNESS_SEEDS must be a positive integer, got "${raw}"`);
  return n;
}
