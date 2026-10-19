import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateDataset, type Dataset } from '../src/dataset.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const STARTER = path.join(ROOT, 'packages', 'testkit', 'kpb', 'synthetic-v1.json');

let cached: Dataset | undefined;

/** The committed synthetic starter dataset. */
export function starter(): Dataset {
  cached ??= validateDataset(JSON.parse(readFileSync(STARTER, 'utf8')));
  return cached;
}
