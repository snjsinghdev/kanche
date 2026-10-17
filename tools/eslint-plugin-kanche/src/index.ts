import type { ESLint, Linter } from 'eslint';

import { noBannedMath } from './rules/no-banned-math.ts';
import { noLocaleMethods } from './rules/no-locale-methods.ts';
import { noNondeterministicGlobals } from './rules/no-nondeterministic-globals.ts';
import { requireSortComparator } from './rules/require-sort-comparator.ts';

export { ALLOWED_MATH_CONSTANTS, ALLOWED_MATH_FUNCTIONS } from './rules/no-banned-math.ts';
export { NONDETERMINISTIC_GLOBALS } from './rules/no-nondeterministic-globals.ts';

const rules = {
  'no-banned-math': noBannedMath,
  'no-nondeterministic-globals': noNondeterministicGlobals,
  'no-locale-methods': noLocaleMethods,
  'require-sort-comparator': requireSortComparator,
};

const plugin = {
  meta: { name: 'eslint-plugin-kanche', version: '0.0.0' },
  rules,
} satisfies ESLint.Plugin;

/** The determinism contract as one flat-config block (ADR-0004). */
export const determinismRules: Linter.RulesRecord = {
  'kanche/no-banned-math': 'error',
  'kanche/no-nondeterministic-globals': 'error',
  'kanche/no-locale-methods': 'error',
  'kanche/require-sort-comparator': 'error',
};

export default plugin;
