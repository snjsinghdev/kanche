import { describe } from 'vitest';

import plugin, { NONDETERMINISTIC_GLOBALS } from '../src/index.ts';
import { tsRuleTester } from './rule-tester.ts';

describe('kanche/no-nondeterministic-globals', () => {
  tsRuleTester().run('no-nondeterministic-globals', plugin.rules['no-nondeterministic-globals'], {
    valid: [
      'export const v = Number.isFinite(1) && Number.isInteger(2);',
      'export function f(now: number) { return now * 2; }',
      // Local bindings that shadow banned names are fine.
      'const Date = { now: () => 0 }; export const v = Date.now();',
      'export function f(performance: { now(): number }) { return performance.now(); }',
      'export type D = typeof Date;',
      'export const o = { Date: 1, setTimeout: 2 }; export const d = o.Date;',
    ],
    invalid: [
      ...Object.keys(NONDETERMINISTIC_GLOBALS).map((name) => ({
        code: `export const v = ${name};`,
        errors: [{ messageId: 'banned' as const }],
      })),
      { code: 'export const t = Date.now();', errors: [{ messageId: 'banned' as const }] },
      { code: 'export const t = new Date();', errors: [{ messageId: 'banned' as const }] },
      { code: 'export const t = performance.now();', errors: [{ messageId: 'banned' as const }] },
      { code: 'setTimeout(() => 0, 10);', errors: [{ messageId: 'banned' as const }] },
      {
        code: 'export const t = globalThis.Date.now();',
        errors: [{ messageId: 'banned' as const }],
      },
      {
        code: "export const t = self['performance'].now();",
        errors: [{ messageId: 'banned' as const }],
      },
      {
        code: 'export const f = new Intl.NumberFormat();',
        errors: [{ messageId: 'banned' as const }],
      },
      {
        code: 'export const r = crypto.getRandomValues(new Uint32Array(1));',
        errors: [{ messageId: 'banned' as const }],
      },
    ],
  });
});
