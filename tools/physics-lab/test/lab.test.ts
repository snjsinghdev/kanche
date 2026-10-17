import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { PhysicsError, type ParamOverrides } from '@kanche/physics';

import { main } from '../src/cli.ts';
import { CSV_HEADER, parseScenario, runLab, scenarioParams, type Scenario } from '../src/lab.ts';

const SCENARIOS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scenarios');
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
const load = (name: string): Scenario => parseScenario(readJson(path.join(SCENARIOS, name)));
const shots = readdirSync(SCENARIOS).filter((f) => f !== 'stickier-cement.json');

describe('the sample scenarios', () => {
  it.each(shots)('%s runs, closes its ledger and lays out every keyframe', (name) => {
    const lab = runLab(load(name));
    expect(Math.abs(lab.ledger.relativeResidual)).toBeLessThan(1e-9);
    const lines = lab.csv.trimEnd().split('\n');
    expect(lines[0]).toBe(CSV_HEADER);
    const keyframes = (lab.result.timeline ?? []).reduce((n, tl) => n + tl.keyframes.length, 0);
    expect(lines).toHaveLength(keyframes + 1);
    expect(lab.events).toMatchObject({ physicsVersion: 1, hash: lab.result.hash });
  });

  it('reports |v|, |u| and |ω|: a roll-out slides, then rolls with no slip', () => {
    const rows = runLab(load('roll-out.json'))
      .csv.trimEnd()
      .split('\n')
      .slice(1)
      .map((l) => l.split(','));
    const col = (name: string): number => CSV_HEADER.split(',').indexOf(name);
    const sliding = rows.filter((r) => r[col('motion')] === 'sliding');
    const rolling = rows.filter((r) => r[col('motion')] === 'rolling');
    expect(sliding.length).toBeGreaterThan(0);
    expect(rolling.length).toBeGreaterThan(0);
    expect(Number(sliding[0]?.[col('slip')])).toBeGreaterThan(0.1);
    for (const r of rolling) expect(Number(r[col('slip')])).toBeLessThan(1e-9);
    const last = rows.at(-1);
    expect(last?.[col('motion')]).toBe('resting');
    expect(Number(last?.[col('speed')])).toBe(0);
  });

  it('runs one shot with two parameter sets (A/B)', () => {
    const scenario = load('roll-out.json');
    const extra = readJson(path.join(SCENARIOS, 'stickier-cement.json')) as ParamOverrides;
    const a = runLab(scenario);
    const b = runLab(scenario, extra);
    expect(scenarioParams(scenario, extra).surfaces.cement.muR.data.y).toEqual([0.012]);
    expect(b.result.final[0]?.x).toBeLessThan(a.result.final[0]?.x ?? NaN);
  });
});

describe('parseScenario', () => {
  it.each([
    ['an array', []],
    ['null', null],
    ['an unknown key', { court: {}, marbles: [], speed: 1 }],
    ['no court', { marbles: [] }],
    ['no marbles', { court: {} }],
  ])('rejects %s with a typed error', (_, json) => {
    expect(() => parseScenario(json)).toThrow(PhysicsError);
  });
});

describe('the CLI', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kanche-lab-'));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes events.json, ledger.json and timeline.csv', () => {
    const out = path.join(dir, 'bank');
    const args = [path.join(SCENARIOS, 'bank.json'), '--out', out];
    expect(main(args)).toBe(0);
    expect(readdirSync(out).sort()).toEqual(['events.json', 'ledger.json', 'timeline.csv']);
    const events = readJson(path.join(out, 'events.json')) as { events: { kind: string }[] };
    expect(events.events.some((e) => e.kind === 'impact')).toBe(true);
    const ledger = readJson(path.join(out, 'ledger.json')) as { relativeResidual: number };
    expect(Math.abs(ledger.relativeResidual)).toBeLessThan(1e-9);
  });

  it('applies --params on top of the scenario', () => {
    const out = path.join(dir, 'ab');
    const args = [
      path.join(SCENARIOS, 'roll-out.json'),
      '--params',
      path.join(SCENARIOS, 'stickier-cement.json'),
      '--out',
      out,
    ];
    expect(main(args)).toBe(0);
    const plain = runLab(load('roll-out.json'));
    const events = readJson(path.join(out, 'events.json')) as { hash: string };
    expect(events.hash).not.toBe(plain.result.hash);
  });

  it('prints its usage without a scenario', () => {
    expect(main([])).toBe(2);
  });
});
