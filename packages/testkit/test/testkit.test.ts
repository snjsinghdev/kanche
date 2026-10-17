import { describe, expect, it } from 'vitest';

import { spreadSeeds } from '../src/index.ts';
import {
  COVERAGE_GATE_PERCENT,
  coverageThresholds,
  packageTestConfig,
} from '../src/vitest-preset.ts';

describe('spreadSeeds', () => {
  it('gives n distinct uint32 seeds starting at 0', () => {
    const seeds = spreadSeeds(1000);
    expect(seeds).toHaveLength(1000);
    expect(seeds[0]).toBe(0);
    expect(new Set(seeds).size).toBe(1000);
    for (const s of seeds) {
      expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff).toBe(true);
    }
  });

  it('is stable across runs (seed choice is part of golden files)', () => {
    expect(spreadSeeds(3)).toEqual([0, 0x9e3779b9, 0x3c6ef372]);
  });

  it('rejects a bad count', () => {
    expect(() => spreadSeeds(-1)).toThrow(RangeError);
    expect(() => spreadSeeds(1.5)).toThrow(RangeError);
  });
});

describe('the coverage gate', () => {
  it('is 90% on all four measures for gated packages', () => {
    expect(COVERAGE_GATE_PERCENT).toBe(90);
    expect(coverageThresholds({ coverageGate: true })).toEqual({
      lines: 90,
      branches: 90,
      functions: 90,
      statements: 90,
    });
  });

  it('is off for other packages', () => {
    expect(coverageThresholds({ coverageGate: false })).toEqual({});
  });

  it('is wired into the package config', () => {
    const config = packageTestConfig({ coverageGate: true });
    expect(config.test?.coverage).toMatchObject({
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: { lines: 90, branches: 90 },
    });
  });
});
