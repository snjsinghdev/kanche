import type { Rule } from 'eslint';

import { findGlobalObjectReferences, findGlobalUses } from '../globals.ts';

/** Globals whose results depend on the clock, the scheduler, the locale, the GC or the OS. */
export const NONDETERMINISTIC_GLOBALS: Readonly<Record<string, string>> = {
  Date: 'reads the clock',
  performance: 'reads the clock',
  setTimeout: 'is a timer',
  clearTimeout: 'is a timer',
  setInterval: 'is a timer',
  clearInterval: 'is a timer',
  setImmediate: 'is a timer',
  clearImmediate: 'is a timer',
  requestAnimationFrame: 'is a timer',
  cancelAnimationFrame: 'is a timer',
  requestIdleCallback: 'is a timer',
  cancelIdleCallback: 'is a timer',
  queueMicrotask: 'depends on scheduling',
  Intl: 'depends on the locale',
  crypto: 'is not seeded',
  process: 'reads the host environment',
  SharedArrayBuffer: 'depends on thread timing',
  Atomics: 'depends on thread timing',
  WeakRef: 'depends on garbage collection',
  FinalizationRegistry: 'depends on garbage collection',
  Temporal: 'reads the clock',
  eval: 'runs unchecked code',
  Function: 'runs unchecked code',
};

const NAMES = new Set(Object.keys(NONDETERMINISTIC_GLOBALS));

export const noNondeterministicGlobals: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban clocks, timers, locale, platform randomness, GC-dependent globals, eval and the global object in simulation code.',
    },
    schema: [],
    messages: {
      banned:
        '{{name}} {{reason}}, so the same input could give different results. Simulation code takes time and randomness as inputs (ADR-0004).',
      globalObject:
        '{{name}} reaches every global, including the banned ones, past this lint. Simulation code names what it needs directly (ADR-0004).',
    },
  },
  create(context) {
    return {
      'Program:exit'() {
        const reported = new Set<unknown>();
        for (const use of findGlobalUses(context, NAMES)) {
          reported.add(use.node);
          context.report({
            node: use.node,
            messageId: 'banned',
            data: { name: use.name, reason: NONDETERMINISTIC_GLOBALS[use.name] ?? 'is banned' },
          });
        }
        // Any other use of the global object could reach a banned global indirectly:
        // `const g = globalThis; g.Date`, `const { Date } = globalThis`, `globalThis[k]`.
        for (const id of findGlobalObjectReferences(context)) {
          if (reported.has(id.parent)) continue;
          context.report({ node: id, messageId: 'globalObject', data: { name: id.name } });
        }
      },
    };
  },
};
