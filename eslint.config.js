// @ts-check
import { builtinModules } from 'node:module';

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import kanche, { determinismRules } from './tools/eslint-plugin-kanche/src/index.ts';

/**
 * Package boundaries (ADR-0001, docs/ARCHITECTURE.md). Each core package lists the other
 * @kanche packages it may import; everything else in @kanche is off limits to it.
 */
const CORE_MAY_IMPORT = {
  physics: [],
  rules: ['physics'],
  ai: ['physics', 'rules'],
  protocol: ['physics', 'rules'],
  content: [],
  'marble-gen': [],
};
const WORKSPACE = [...Object.keys(CORE_MAY_IMPORT), 'testkit', 'client', 'determinism', 'budgets'];

/** Simulation code: the determinism lint applies here (ADR-0004). */
const SIMULATION = [
  'packages/physics/src/**/*.ts',
  'packages/rules/src/**/*.ts',
  'packages/ai/src/**/*.ts',
  'packages/marble-gen/src/genome/**/*.ts',
  // Evidence that the lint works: linted only by tools/eslint-plugin-kanche/test/repo-config.test.ts.
  'packages/*/test/determinism-fixtures/**/*.ts',
];

/** Browser and host globals that platform-free code must not touch (no DOM, no I/O). */
const PLATFORM_GLOBALS = [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'alert',
  'console',
  'Deno',
  'Bun',
  'require',
  'module',
  '__dirname',
  '__filename',
].map((name) => ({
  name,
  message: `${name} is platform-specific. Core packages are pure TypeScript shared by app, AI and server (ADR-0004).`,
}));

/** Imports that core code must never make, whatever the package. */
const PLATFORM_IMPORTS = [
  { group: ['pixi.js', 'pixi.js/*', '@pixi/*'], message: 'Rendering belongs to apps/client.' },
  {
    group: ['@capacitor/*', '@capacitor-community/*'],
    message: 'Native shells belong to apps/client.',
  },
  { group: ['@supabase/*'], message: 'The backend belongs to supabase/ and apps/client.' },
  { group: ['@kanche/client', '@kanche/client/*'], message: 'Core packages never import the app.' },
  {
    regex:
      '^(\\.\\./){2,}(apps|tools|supabase|packages)(/|$)|^(\\.\\./){2,}(' +
      WORKSPACE.join('|') +
      ')/',
    message: 'Reach other packages through their @kanche name, never a relative path.',
  },
  {
    regex: `^(node:.*|${builtinModules
      .filter((m) => !m.startsWith('_'))
      .map((m) => m.replace('/', '\\/'))
      .join('|')})$`,
    message:
      'Node built-ins are not available in browsers and Deno. Core packages are platform-free.',
  },
];

/** @param {string} pkg @param {string[]} files */
function coreBoundary(pkg, files) {
  const allowed = CORE_MAY_IMPORT[/** @type {keyof typeof CORE_MAY_IMPORT} */ (pkg)];
  const forbidden = WORKSPACE.filter((p) => p !== pkg && !allowed.includes(p));
  return {
    files,
    rules: {
      'no-restricted-globals': ['error', ...PLATFORM_GLOBALS],
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            ...PLATFORM_IMPORTS,
            {
              group: forbidden.flatMap((p) => [`@kanche/${p}`, `@kanche/${p}/*`]),
              message: `packages/${pkg} may import only ${allowed.length ? allowed.map((p) => '@kanche/' + p).join(', ') : 'its own files'} (docs/ARCHITECTURE.md).`,
            },
          ],
        },
      ],
    },
  };
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/dist-e2e/',
      '**/dist-types/',
      '**/coverage/',
      '**/.turbo/',
      '**/playwright-report/',
      '**/test-results/',
      'apps/client/android/',
      'apps/client/ios/',
      'docs/',
      // Deno code: checked by `deno lint` and `deno check` (supabase/CLAUDE.md).
      'supabase/',
      // Deliberate violations; see SIMULATION above.
      '**/determinism-fixtures/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true, 'ts-nocheck': true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: false }],
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Run by Deno, not Node.
  {
    files: ['tools/determinism/src/deno-runner.js'],
    languageOptions: { globals: { Deno: 'readonly' } },
  },

  // Tools and tests run on Node.
  {
    files: ['tools/**', '**/test/**', '**/e2e/**', '**/scripts/**', '**/*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // Core packages: platform-free and bounded.
  ...Object.keys(CORE_MAY_IMPORT)
    .filter((p) => p !== 'marble-gen')
    .map((p) => coreBoundary(p, [`packages/${p}/src/**/*.ts`])),
  // In marble-gen only the genome is simulation code (Phase 0 prompt, item 3).
  coreBoundary('marble-gen', ['packages/marble-gen/src/genome/**/*.ts']),
  {
    files: ['packages/testkit/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@kanche/*'],
              message:
                'testkit imports no other @kanche package, so every package can test with it.',
            },
          ],
        },
      ],
    },
  },

  // The determinism contract (ADR-0004).
  {
    files: SIMULATION,
    plugins: { kanche },
    rules: determinismRules,
  },

  prettier,
);
