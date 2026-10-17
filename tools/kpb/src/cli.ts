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
  SIZE_CLASSES,
  SURFACES,
  type CourtSpec,
  type ParamOverrides,
} from '@kanche/physics';

import { DATASET_SCHEMA, RECORDING_KINDS, validateDataset, type Dataset } from './dataset.ts';
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

/** Flags that take no value: they never swallow the argument after them. */
const SWITCHES = new Set(['--strict']);

function options(argv: readonly string[]): { args: string[]; opts: Map<string, string[]> } {
  const args: string[] = [];
  const opts = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? '';
    if (!a.startsWith('--')) {
      args.push(a);
      continue;
    }
    if (SWITCHES.has(a)) {
      opts.set(a, ['true']);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`${a} needs a value`);
    opts.set(a, [...(opts.get(a) ?? []), next]);
    i += 1;
  }
  return { args, opts };
}

function choice<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join(', ')}, got "${value}"`);
  }
  return value as T;
}

/** The dataset file a command reads, named in the error when it's missing. */
function datasetFile(command: string, args: readonly string[]): string {
  const file = args[0];
  if (file === undefined) throw new Error(`${command} needs a dataset file`);
  return file;
}

function one(opts: Map<string, string[]>, name: string): string {
  const v = opts.get(name)?.[0];
  if (v === undefined) throw new Error(`missing ${name}`);
  return v;
}

interface MarbleSpec {
  readonly id: number;
  readonly size: (typeof SIZE_CLASSES)[number];
  readonly file: string;
}

function marbleSpec(spec: string): MarbleSpec {
  const [id, size, ...file] = spec.split(':');
  const n = Number(id);
  if (!Number.isInteger(n) || n < 0 || file.length === 0) {
    throw new Error(`a marble is <id>:<size>:<tracker.csv>, got "${spec}"`);
  }
  return { id: n, size: choice('a marble size', size ?? '', SIZE_CLASSES), file: file.join(':') };
}

function marble(spec: MarbleSpec, unit: LengthUnit): TrackedMarble {
  return {
    id: spec.id,
    size: spec.size,
    track: parseTrackerCsv(readFileSync(spec.file, 'utf8'), unit),
  };
}

function importCommand(opts: Map<string, string[]>): number {
  // Every argument is checked before any file is read.
  const file = one(opts, '--dataset');
  const id = one(opts, '--id');
  const condition = one(opts, '--condition');
  const kind = choice('--kind', one(opts, '--kind'), RECORDING_KINDS);
  const surface = choice('--surface', one(opts, '--surface'), SURFACES);
  const launch = choice('--launch', one(opts, '--launch'), ['rolling', 'stun'] as const);
  const unit = choice('--unit', opts.get('--unit')?.[0] ?? 'm', ['m', 'cm', 'mm'] as const);
  const finger = opts.get('--finger-speed')?.[0];
  const fingerSpeed = finger === undefined ? undefined : positive('--finger-speed', finger);
  const shooterSpec = marbleSpec(one(opts, '--shooter'));
  const otherSpecs = (opts.get('--marble') ?? []).map(marbleSpec);
  const courtFile = opts.get('--court')?.[0];

  const shooter = marble(shooterSpec, unit);
  const others = otherSpecs.map((m) => marble(m, unit));
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
  const rec = recordingFromTracks({
    id,
    condition,
    kind,
    court,
    launch,
    shooter,
    others,
    ...(fingerSpeed === undefined ? {} : { fingerSpeed }),
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

function positive(name: string, value: string): number {
  const n = Number(value);
  if (!(Number.isFinite(n) && n > 0)) throw new Error(`${name} must be a positive number`);
  return n;
}

export function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  const { args, opts } = options(rest);
  switch (command) {
    case 'import':
      return importCommand(opts);
    case 'fit': {
      const d = validateDataset(readJson(datasetFile('fit', args)));
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
      const d = validateDataset(readJson(datasetFile('score', args)));
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
