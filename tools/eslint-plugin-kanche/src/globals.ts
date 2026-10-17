import type { Rule, Scope } from 'eslint';
import type { Expression, Identifier, MemberExpression, Node, Super } from 'estree';

/** Names through which code can reach the global object. */
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global', 'frames']);

type WithParent<T> = T & { parent?: Node & { parent?: Node } };

/** The static name of a member access (`a.b` or `a['b']`), or null when it is computed. */
export function memberName(node: MemberExpression): string | null {
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (
    node.computed &&
    node.property.type === 'Literal' &&
    typeof node.property.value === 'string'
  ) {
    return node.property.value;
  }
  return null;
}

export interface GlobalUse {
  /** The global's name, e.g. "Math". */
  readonly name: string;
  /** The expression whose value is the global: `Math` itself or `globalThis.Math`. */
  readonly node: WithParent<Expression | Super>;
}

/** True inside a TypeScript type query (`type T = typeof Math`), which runs no code. */
function inTypeQuery(node: WithParent<Node>): boolean {
  type Linked = { readonly type: string; readonly parent?: Linked | null };
  for (let n: Linked | null | undefined = node; n !== undefined && n !== null; n = n.parent) {
    if (n.type === 'TSTypeQuery') return true;
  }
  return false;
}

/** Value references (not type references) that were not resolved to a local declaration. */
function unresolvedReferences(globalScope: Scope.Scope): Scope.Reference[] {
  const refs: Scope.Reference[] = [...globalScope.through];
  for (const variable of globalScope.variables) {
    // A configured or built-in global (no declaration in this file).
    if (variable.defs.length === 0) refs.push(...variable.references);
  }
  return refs.filter(
    (ref) =>
      (ref as { isValueReference?: boolean }).isValueReference !== false &&
      !inTypeQuery(ref.identifier as WithParent<Identifier>),
  );
}

/**
 * Every use of the named globals in the file, including through the global object
 * (`globalThis.Date`, `window['Math']`). A local variable that shadows the name is not a use.
 */
export function findGlobalUses(context: Rule.RuleContext, names: ReadonlySet<string>): GlobalUse[] {
  const globalScope = context.sourceCode.scopeManager.globalScope;
  if (globalScope === null) return [];
  const uses: GlobalUse[] = [];
  for (const ref of unresolvedReferences(globalScope)) {
    const id = ref.identifier as WithParent<Identifier>;
    if (names.has(id.name)) {
      uses.push({ name: id.name, node: id });
      continue;
    }
    if (GLOBAL_OBJECTS.has(id.name)) {
      const parent = id.parent;
      if (parent?.type === 'MemberExpression' && parent.object === id) {
        const name = memberName(parent);
        if (name !== null && names.has(name)) uses.push({ name, node: parent });
      }
    }
  }
  return uses;
}
