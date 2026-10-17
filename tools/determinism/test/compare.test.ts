import { describe, expect, it } from 'vitest';

import { compareRuns, formatTable, type EngineRun } from '../src/compare.ts';
import { DEFAULT_SEEDS, seedsFromEnv } from '../src/config.ts';
import { runHarness } from '../src/entry.ts';

function ok(engine: string, combined: string): EngineRun {
  return {
    engine,
    version: '1',
    result: { physicsVersion: 1, seeds: 1, steps: 1, combined, sample: [] },
    ms: 1,
  };
}

describe('compareRuns', () => {
  it('passes when every engine agrees', () => {
    expect(compareRuns([ok('node', 'aa'), ok('deno', 'aa'), ok('webkit', 'aa')])).toEqual({
      ok: true,
      reference: 'aa',
      mismatched: [],
      failed: [],
    });
  });

  it('fails on any mismatch and names the engine', () => {
    const v = compareRuns([ok('node', 'aa'), ok('firefox', 'ab')]);
    expect(v.ok).toBe(false);
    expect(v.mismatched).toEqual(['firefox']);
  });

  it('fails when an engine did not run', () => {
    const v = compareRuns([
      ok('node', 'aa'),
      { engine: 'webkit', version: '?', error: 'boom', ms: 0 },
    ]);
    expect(v.ok).toBe(false);
    expect(v.failed).toEqual(['webkit']);
  });

  it('fails on no runs at all', () => {
    expect(compareRuns([]).ok).toBe(false);
  });

  it('formats a table with every engine', () => {
    const table = formatTable([
      ok('node', 'aa'),
      { engine: 'deno', version: '2', error: 'x', ms: 3 },
    ]);
    expect(table).toContain('node');
    expect(table).toContain('ERROR: x');
  });
});

describe('runHarness', () => {
  it('is reproducible in-process and reports its inputs', () => {
    const a = runHarness(5, 10);
    expect(runHarness(5, 10)).toEqual(a);
    expect(a).toMatchObject({ physicsVersion: 1, seeds: 5, steps: 10 });
    expect(a.sample).toHaveLength(4);
    expect(a.combined).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('seedsFromEnv', () => {
  it('defaults to 1,000 seeds', () => {
    expect(seedsFromEnv({})).toBe(DEFAULT_SEEDS);
    expect(seedsFromEnv({ KANCHE_HARNESS_SEEDS: '' })).toBe(DEFAULT_SEEDS);
  });

  it('reads the nightly override', () => {
    expect(seedsFromEnv({ KANCHE_HARNESS_SEEDS: '10000' })).toBe(10000);
  });

  it('rejects nonsense', () => {
    expect(() => seedsFromEnv({ KANCHE_HARNESS_SEEDS: 'many' })).toThrow(RangeError);
    expect(() => seedsFromEnv({ KANCHE_HARNESS_SEEDS: '0' })).toThrow(RangeError);
  });
});
