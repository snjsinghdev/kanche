import type { Rule } from 'eslint';

import { memberName } from '../globals.ts';

const SORTS = new Set(['sort', 'toSorted']);

export const requireSortComparator: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require an explicit comparator for sort() and toSorted().' },
    schema: [],
    messages: {
      missing:
        '{{name}}() without a comparator sorts numbers as strings. Pass an explicit, total comparator (ADR-0004).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        const name = memberName(node.callee);
        if (name === null || !SORTS.has(name)) return;
        const first = node.arguments[0];
        const missing =
          first === undefined || (first.type === 'Identifier' && first.name === 'undefined');
        if (missing) context.report({ node, messageId: 'missing', data: { name } });
      },
    };
  },
};
