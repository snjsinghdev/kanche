/**
 * The KPB reality-suite CLI (docs/kpb.md, docs/physics-calibration.md):
 *
 *   pnpm kpb import --dataset <file> --id <id> --condition <text> --kind <kind> --surface <id>
 *                   --launch rolling|stun --shooter <id>:<size>:<tracker.csv>
 *                   [--marble <id>:<size>:<tracker.csv>]... [--unit m|cm|mm] [--court <court.json>]
 *                   [--finger-speed <m/s>]
 *   pnpm kpb fit <dataset> [--out <overrides.json>]
 *   pnpm kpb score <dataset> [--params <overrides.json>] [--strict]
 *   pnpm kpb synthetic [--out <file>]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import {
  deriveParams,
  PARAMS_V1,
  type CourtSpec,
  type ParamOverrides,
  type SizeClass,
  type SurfaceId,
} from '@kanche/physics';

import { DATASET_SCHEMA, validateDataset, type Dataset, type RecordingKind } from './dataset.ts';
import { calibrate } from './fit.ts';
import { scoreDataset } from './score.ts';
import { makeSynthetic } from './synthetic.ts';
import {
  parseTrackerCsv,
  recordingFromTracks,
  type LengthUnit,
  type TrackedMarble,
} from './tracker.ts';

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

/** One recording per line keeps a dataset's diffs readable. */
export function formatDataset(d: Dataset): string {
  const { recordings, ...head } = d;
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  const rows = recordings.map((r) => `    ${JSON.stringify(r)}`).join(',\n');
  return `${top},\n  "recordings": [\n${rows}\n  ]\n}\n`;
}

function options(argv: readonly string[]): { args: string[]; opts: Map<string, string[]> } {
  const args: string[] = [];
  const opts = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? '';
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--'))
        opts.set(a, [...(opts.get(a) ?? []), 'true']);
      else {
        opts.set(a, [...(opts.get(a) ?? []), next]);
        i += 1;
      }
    } else args.push(a);
  }
  return { args, opts };
}

function one(opts: Map<string, string[]>, name: string): string {
  const v = opts.get(name)?.[0];
  if (v === undefined) throw new Error(`missing ${name}`);
  return v;
}

function marble(spec: string, unit: LengthUnit): TrackedMarble {
  const [id, size, ...file] = spec.split(':');
  return {
    id: Number(id),
    size: size as SizeClass,
    track: parseTrackerCsv(readFileSync(file.join(':'), 'utf8'), unit),
  };
}

function importCommand(opts: Map<string, string[]>): number {
  const file = one(opts, '--dataset');
  const unit = (opts.get('--unit')?.[0] ?? 'm') as LengthUnit;
  const shooter = marble(one(opts, '--shooter'), unit);
  const others = (opts.get('--marble') ?? []).map((m) => marble(m, unit));
  const surface = one(opts, '--surface') as SurfaceId;
  const courtFile = opts.get('--court')?.[0];
  // Without a court, open ground of the surface around everything tracked, 1 m each way.
  const xs = [shooter, ...others].flatMap((m) => m.track.x);
  const ys = [shooter, ...others].flatMap((m) => m.track.y);
  const court: CourtSpec =
    courtFile === undefined
      ? {
          surface,
          bounds: {
            xMin: Math.min(...xs) - 1,
            xMax: Math.max(...xs) + 1,
            yMin: Math.min(...ys) - 1,
            yMax: Math.max(...ys) + 1,
          },
        }
      : (readJson(courtFile) as CourtSpec);
  const finger = opts.get('--finger-speed')?.[0];
  const rec = recordingFromTracks({
    id: one(opts, '--id'),
    condition: one(opts, '--condition'),
    kind: one(opts, '--kind') as RecordingKind,
    court,
    launch: one(opts, '--launch') as 'rolling' | 'stun',
    shooter,
    others,
    ...(finger === undefined ? {} : { fingerSpeed: Number(finger) }),
  });
  const base: Dataset = existsSync(file)
    ? validateDataset(readJson(file))
    : {
        schema: DATASET_SCHEMA,
        synthetic: false,
        description: 'Filmed KPB shots.',
        recordings: [],
      };
  const next = validateDataset(
    JSON.parse(JSON.stringify({ ...base, recordings: [...base.recordings, rec] })),
  );
  writeFileSync(file, formatDataset(next));
  console.log(`added ${rec.id} (${rec.kind}, ${String(rec.tracks.length)} tracks) to ${file}`);
  return 0;
}

export function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  const { args, opts } = options(rest);
  switch (command) {
    case 'import':
      return importCommand(opts);
    case 'fit': {
      const d = validateDataset(readJson(args[0] ?? ''));
      const c = calibrate(d);
      for (const e of c.estimates) {
        console.log(
          `${e.name.padEnd(26)} ${e.value.toPrecision(5)} ± ${e.sigma.toPrecision(2)} ${e.unit} (${String(e.n)} recordings)`,
        );
      }
      const out = opts.get('--out')?.[0];
      if (out !== undefined) writeFileSync(out, `${JSON.stringify(c.overrides, null, 2)}\n`);
      return 0;
    }
    case 'score': {
      const d = validateDataset(readJson(args[0] ?? ''));
      const paramsFile = opts.get('--params')?.[0];
      const params =
        paramsFile === undefined
          ? PARAMS_V1
          : deriveParams(PARAMS_V1, readJson(paramsFile) as ParamOverrides);
      const s = scoreDataset(d, params);
      if (s.synthetic)
        console.log('SYNTHETIC DATASET: these scores say nothing about real marbles.');
      for (const r of s.rows) {
        console.log(
          `${r.pass ? 'PASS' : 'FAIL'}  ${r.condition.padEnd(28)} ${r.metric.padEnd(20)} error ${r.error.toExponential(2)}  scatter ${r.scatter.toExponential(2)}`,
        );
      }
      console.log(`${String(s.passed)} of ${String(s.rows.length)} metrics within 1.5 × scatter`);
      return opts.has('--strict') && s.passed < s.rows.length ? 1 : 0;
    }
    case 'synthetic': {
      const out = opts.get('--out')?.[0] ?? 'synthetic.json';
      const d = makeSynthetic();
      writeFileSync(out, formatDataset(d));
      console.log(`wrote ${String(d.recordings.length)} synthetic recordings to ${out}`);
      return 0;
    }
    default:
      console.error('usage: pnpm kpb import|fit|score|synthetic … (see tools/kpb/src/cli.ts)');
      return 2;
  }
}

if (process.argv[1]?.endsWith('cli.ts') === true) process.exitCode = main(process.argv.slice(2));
