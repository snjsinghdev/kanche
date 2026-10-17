import { describe } from 'vitest';

import plugin from '../src/index.ts';
import { tsRuleTester } from './rule-tester.ts';

describe('kanche/require-sort-comparator', () => {
  tsRuleTester().run('require-sort-comparator', plugin.rules['require-sort-comparator'], {
    valid: [
      'export const v = [3, 1, 2].sort((a, b) => a - b);',
      'export const v = [3, 1, 2].toSorted((a, b) => a - b);',
      'declare const by: (a: number, b: number) => number; export const v = [1].sort(by);',
      'declare function sort(): void; sort();',
      'declare const o: { sorted(): void }; o.sorted();',
    ],
    invalid: [
      {
        code: 'export const v = [3, 1, 2].sort();',
        errors: [{ messageId: 'missing' as const, data: { name: 'sort' } }],
      },
      {
        code: 'export const v = [3, 1, 2].toSorted();',
        errors: [{ messageId: 'missing' as const, data: { name: 'toSorted' } }],
      },
      {
        code: 'export const v = [3, 1, 2].sort(undefined);',
        errors: [{ messageId: 'missing' as const }],
      },
      {
        code: "export const v = [3, 1, 2]['sort']();",
        errors: [{ messageId: 'missing' as const }],
      },
    ],
  });
});
