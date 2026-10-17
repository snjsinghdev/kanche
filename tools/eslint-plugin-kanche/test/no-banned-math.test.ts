import { describe } from 'vitest';

import plugin, { ALLOWED_MATH_CONSTANTS, ALLOWED_MATH_FUNCTIONS } from '../src/index.ts';
import { tsRuleTester } from './rule-tester.ts';

const BANNED_FUNCTIONS = [
  'pow',
  'exp',
  'expm1',
  'log',
  'log2',
  'log10',
  'log1p',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'cbrt',
  'hypot',
];

describe('kanche/no-banned-math', () => {
  tsRuleTester().run('no-banned-math', plugin.rules['no-banned-math'], {
    valid: [
      ...ALLOWED_MATH_FUNCTIONS.map((fn) => `export const v = Math.${fn}(4, 2);`),
      ...ALLOWED_MATH_CONSTANTS.map((c) => `export const v = Math.${c} * 2;`),
      `export const v = Math['sqrt'](2);`,
      'export const v = 3 * 3 * 3;',
      'let x = 2; x *= x; export { x };',
      // A local binding named Math is not the global.
      'const Math = { sin: (x: number) => x }; export const v = Math.sin(1);',
      'export function f(Math: { exp(x: number): number }) { return Math.exp(1); }',
      // Type positions are not value uses.
      'export type M = typeof Math;',
    ],
    invalid: [
      ...BANNED_FUNCTIONS.map((fn) => ({
        code: `export const v = Math.${fn}(1, 2);`,
        errors: [
          {
            messageId: 'banned' as const,
            data: { name: fn, allowed: ALLOWED_MATH_FUNCTIONS.join('/') },
          },
        ],
      })),
      { code: 'export const v = Math.random();', errors: [{ messageId: 'random' as const }] },
      { code: "export const v = Math['sin'](1);", errors: [{ messageId: 'banned' as const }] },
      {
        code: 'const k = "sin"; export const v = Math[k](1);',
        errors: [{ messageId: 'computed' as const }],
      },
      {
        code: 'export const v = globalThis.Math.sin(1);',
        errors: [{ messageId: 'banned' as const }],
      },
      {
        code: "export const v = window['Math'].exp(1);",
        errors: [{ messageId: 'banned' as const }],
      },
      { code: 'export const M = Math;', errors: [{ messageId: 'alias' as const }] },
      {
        code: 'const { sin } = Math; export const v = sin(1);',
        errors: [{ messageId: 'alias' as const }],
      },
      {
        code: 'declare function use(m: unknown): void; use(Math);',
        errors: [{ messageId: 'alias' as const }],
      },
      {
        code: 'export const v = 2 ** 10;',
        errors: [{ messageId: 'power' as const, data: { operator: '**' } }],
      },
      {
        code: 'let x = 2; x **= 3; export { x };',
        errors: [{ messageId: 'power' as const, data: { operator: '**=' } }],
      },
    ],
  });
});
