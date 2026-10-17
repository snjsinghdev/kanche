import type { Rule } from 'eslint';

import { findGlobalUses, memberName } from '../globals.ts';

/**
 * Math functions that are exactly specified by IEEE-754 (or are pure integer/bit operations), so
 * every engine returns the same bits. Everything else on Math is implementation-approximated
 * (sin, exp, pow, ...) or random, and banned in simulation code (ADR-0004).
 */
export const ALLOWED_MATH_FUNCTIONS: readonly string[] = [
  'sqrt',
  'abs',
  'min',
  'max',
  'floor',
  'ceil',
  'trunc',
  'round',
  'sign',
  'imul',
  'fround',
  'clz32',
];

/** Constants are fixed double values, identical everywhere. */
export const ALLOWED_MATH_CONSTANTS: readonly string[] = [
  'PI',
  'E',
  'LN2',
  'LN10',
  'LOG2E',
  'LOG10E',
  'SQRT1_2',
  'SQRT2',
];

const ALLOWED = new Set([...ALLOWED_MATH_FUNCTIONS, ...ALLOWED_MATH_CONSTANTS]);
const MATH = new Set(['Math']);

export const noBannedMath: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Allow only exactly-rounded Math functions and constants in simulation code; ban ** and **=.',
    },
    schema: [],
    messages: {
      banned:
        'Math.{{name}} is not exactly specified across engines. Simulation code may use only Math.{{allowed}} (ADR-0004).',
      random: 'Math.random is not seeded. Use the seeded Rng from @kanche/physics (ADR-0004).',
      computed: 'Computed access to Math hides which function is called. Name an allowed function.',
      alias:
        'Math may not be passed around, aliased or destructured in simulation code; call Math.<fn> directly.',
      power:
        'The {{operator}} operator is not exactly specified across engines. Multiply explicitly or use a lookup table (ADR-0004).',
    },
  },
  create(context) {
    const allowedList = ALLOWED_MATH_FUNCTIONS.join('/');
    return {
      BinaryExpression(node) {
        if (node.operator === '**')
          context.report({ node, messageId: 'power', data: { operator: '**' } });
      },
      AssignmentExpression(node) {
        if (node.operator === '**=')
          context.report({ node, messageId: 'power', data: { operator: '**=' } });
      },
      'Program:exit'() {
        for (const use of findGlobalUses(context, MATH)) {
          const parent = use.node.parent;
          if (parent?.type !== 'MemberExpression' || parent.object !== use.node) {
            context.report({ node: use.node, messageId: 'alias' });
            continue;
          }
          const name = memberName(parent);
          if (name === null) {
            context.report({ node: parent, messageId: 'computed' });
          } else if (name === 'random') {
            context.report({ node: parent, messageId: 'random' });
          } else if (!ALLOWED.has(name)) {
            context.report({
              node: parent,
              messageId: 'banned',
              data: { name, allowed: allowedList },
            });
          }
        }
      },
    };
  },
};
