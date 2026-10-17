import type { Rule } from 'eslint';

import { memberName } from '../globals.ts';

const LOCALE_METHOD = /^(toLocale\w*|localeCompare)$/;

export const noLocaleMethods: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban toLocale* methods and localeCompare in simulation code.' },
    schema: [],
    messages: {
      banned:
        '{{name}} depends on the device locale. Compare and format with locale-free code (ADR-0004).',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const name = memberName(node);
        if (name !== null && LOCALE_METHOD.test(name)) {
          context.report({ node, messageId: 'banned', data: { name } });
        }
      },
    };
  },
};
