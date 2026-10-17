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
      // Local bindings named like the global object are not the global object.
      'const self = { a: 1 }; export const v = self.a;',
      'export function f(window: { x: number }) { return window.x; }',
      'export type G = typeof globalThis;',
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
      {
        code: 'export const t = Temporal.Now.instant();',
        errors: [{ messageId: 'banned' as const }],
      },
      { code: "export const v = eval('1 + 1');", errors: [{ messageId: 'banned' as const }] },
      {
        code: "export const f = new Function('return 1');",
        errors: [{ messageId: 'banned' as const }],
      },
      // Ways round the ban through the global object (CodeRabbit on PR #1).
      {
        code: 'const g = globalThis; export const t = g.Date.now();',
        errors: [{ messageId: 'globalObject' as const, data: { name: 'globalThis' } }],
      },
      {
        code: 'const { Date: D } = globalThis; export const t = D.now();',
        errors: [{ messageId: 'globalObject' as const }],
      },
      {
        code: "const k = 'Date'; export const t = globalThis[k].now();",
        errors: [{ messageId: 'globalObject' as const }],
      },
      {
        code: 'export const t = globalThis.window.Date.now();',
        errors: [{ messageId: 'globalObject' as const }],
      },
      {
        code: 'export const v = self.Math.sqrt(2);',
        errors: [{ messageId: 'globalObject' as const, data: { name: 'self' } }],
      },
      {
        code: 'declare function use(x: unknown): void; use(window);',
        errors: [{ messageId: 'globalObject' as const }],
      },
    ],
  });
});
