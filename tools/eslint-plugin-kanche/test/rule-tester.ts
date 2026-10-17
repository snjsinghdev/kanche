import tsParser from '@typescript-eslint/parser';
import { RuleTester } from 'eslint';
import { afterAll, describe, it } from 'vitest';

// ESLint's RuleTester finds Mocha-style globals; hand it Vitest's.
Object.assign(RuleTester, { describe, it, itOnly: it.only, afterAll });

/** A RuleTester that parses TypeScript, like the repository config. */
export function tsRuleTester(): RuleTester {
  return new RuleTester({
    languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
  });
}
