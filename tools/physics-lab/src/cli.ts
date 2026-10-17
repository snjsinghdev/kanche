/**
 * The Physics Lab CLI:
 *
 *   pnpm lab <scenario.json> [--params <overrides.json>] [--out <dir>]
 *
 * Writes events.json, ledger.json and timeline.csv into the output directory (by default
 * <scenario>.lab/ beside the scenario) and prints a one-line summary. --params applies extra
 * overrides on top of the scenario's own, for A/B runs of one shot.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { type ParamOverrides } from '@kanche/physics';

import { parseScenario, runLab } from './lab.ts';

export function main(argv: readonly string[]): number {
  const option = (name: string): string | undefined => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const file = argv.find(
    (a, i) => !a.startsWith('--') && !(argv[i - 1]?.startsWith('--') ?? false),
  );
  if (file === undefined) {
    console.error('usage: pnpm lab <scenario.json> [--params <overrides.json>] [--out <dir>]');
    return 2;
  }
  const scenario = parseScenario(JSON.parse(readFileSync(file, 'utf8')));
  const paramsFile = option('--params');
  const extra =
    paramsFile === undefined
      ? undefined
      : (JSON.parse(readFileSync(paramsFile, 'utf8')) as ParamOverrides);
  const out = option('--out') ?? `${file.replace(/\.json$/, '')}.lab`;
  const lab = runLab(scenario, extra);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'events.json'), `${JSON.stringify(lab.events, null, 2)}\n`);
  writeFileSync(path.join(out, 'ledger.json'), `${JSON.stringify(lab.ledger, null, 2)}\n`);
  writeFileSync(path.join(out, 'timeline.csv'), lab.csv);
  const r = lab.result;
  console.log(
    `${path.basename(file)}: ${r.duration.toFixed(3)} s, ${String(r.events.length)} events, ` +
      `ledger residual ${lab.ledger.relativeResidual.toExponential(1)}, hash ${r.hash} → ${out}`,
  );
  return 0;
}

if (process.argv[1]?.endsWith('cli.ts') === true) process.exitCode = main(process.argv.slice(2));
