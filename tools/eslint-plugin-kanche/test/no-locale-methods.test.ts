import { describe } from 'vitest';

import plugin from '../src/index.ts';
import { tsRuleTester } from './rule-tester.ts';

describe('kanche/no-locale-methods', () => {
  tsRuleTester().run('no-locale-methods', plugin.rules['no-locale-methods'], {
    valid: [
      'export const s = (1.5).toString(16);',
      'export const s = (1.5).toFixed(2);',
      "export const s = 'a'.toUpperCase();",
      "export const c = 'a' < 'b';",
    ],
    invalid: [
      'toLocaleString',
      'toLocaleDateString',
      'toLocaleTimeString',
      'toLocaleUpperCase',
      'toLocaleLowerCase',
      'localeCompare',
    ].flatMap((name) => [
      {
        code: `declare const x: any; export const v = x.${name}();`,
        errors: [{ messageId: 'banned' as const, data: { name } }],
      },
      {
        code: `declare const x: any; export const v = x['${name}']();`,
        errors: [{ messageId: 'banned' as const, data: { name } }],
      },
    ]),
  });
});
