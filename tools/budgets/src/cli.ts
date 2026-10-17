/**
 * pnpm budgets                       # web build (apps/client/dist) against budgets.json
 * pnpm budgets --android <app.apk>   # also the Android package
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { measureAndroid, measureWeb, parseBudgets, report, type Measurement } from './budgets.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { values } = parseArgs({
  options: {
    android: { type: 'string' },
    dist: { type: 'string', default: path.join(repoRoot, 'apps/client/dist') },
    budgets: { type: 'string', default: path.join(repoRoot, 'budgets.json') },
  },
});

const budgets = parseBudgets(JSON.parse(await readFile(values.budgets, 'utf8')));
const measurements: Measurement[] = await measureWeb(values.dist, budgets);
if (values.android !== undefined) measurements.push(await measureAndroid(values.android, budgets));

const { ok, text } = report(measurements);
console.log(`Kanche budgets (${path.relative(repoRoot, values.budgets)})\n${text}`);
if (!ok) {
  console.error(
    '\nA budget is exceeded. Shrink the change, or raise the budget in an ADR (CLAUDE.md).',
  );
  process.exitCode = 1;
}
