/**
 * pnpm budgets                         # web build (apps/client/dist) against budgets.json
 * pnpm budgets --android <app.apk>     # also the Android package
 * pnpm budgets --frames <report.json>  # also a device's frame times (repeatable; Phase 3 on)
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  measureAndroid,
  measureFrames,
  measureWeb,
  parseBudgets,
  parseFrameReport,
  report,
  type Measurement,
} from './budgets.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { values } = parseArgs({
  options: {
    android: { type: 'string' },
    frames: { type: 'string', multiple: true },
    dist: { type: 'string', default: path.join(repoRoot, 'apps/client/dist') },
    budgets: { type: 'string', default: path.join(repoRoot, 'budgets.json') },
  },
});

const budgets = parseBudgets(JSON.parse(await readFile(values.budgets, 'utf8')));
const measurements: Measurement[] = await measureWeb(values.dist, budgets);
if (values.android !== undefined) measurements.push(await measureAndroid(values.android, budgets));
for (const file of values.frames ?? []) {
  const r = parseFrameReport(JSON.parse(await readFile(file, 'utf8')));
  measurements.push(...measureFrames(r, budgets));
}

const { ok, text } = report(measurements);
console.log(`Kanche budgets (${path.relative(repoRoot, values.budgets)})\n${text}`);
if (!ok) {
  console.error(
    '\nA budget is exceeded. Shrink the change, or raise the budget in an ADR (CLAUDE.md).',
  );
  process.exitCode = 1;
}
