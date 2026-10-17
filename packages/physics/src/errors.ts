/**
 * The one error type the simulation throws. Callers (rules, the server) can rely on `code`
 * instead of parsing messages, and the fuzz suite checks that nothing else ever escapes.
 *
 * - invalid-input: a shot, marble or flick that breaks the contract (never clamped silently)
 * - invalid-court: court geometry that the simulation cannot honour
 * - invalid-params: a parameter set that is out of range or inconsistent
 * - non-finite: a NaN or Infinity appeared in the state; the shot is aborted
 * - internal: a broken internal invariant (a bug, not bad input)
 */
export type PhysicsErrorCode =
  'invalid-input' | 'invalid-court' | 'invalid-params' | 'non-finite' | 'internal';

export class PhysicsError extends Error {
  readonly code: PhysicsErrorCode;

  constructor(code: PhysicsErrorCode, message: string) {
    super(message);
    this.name = 'PhysicsError';
    this.code = code;
  }
}

/**
 * Unwrap an indexed read that the code's own invariants guarantee (noUncheckedIndexedAccess).
 * One shared check keeps the "can't happen" branch in one place instead of in every loop.
 */
export function defined<T>(value: T | null | undefined, what: string): T {
  if (value === undefined || value === null)
    throw new PhysicsError('internal', `${what} is missing`);
  return value;
}

/**
 * Narrow a tagged value to one of its kinds, where the code's own invariants guarantee it (like
 * `defined`, one shared check instead of a "can't happen" branch at every use).
 */
export function expectKind<T extends { readonly kind: string }, K extends T['kind']>(
  value: T | null | undefined,
  kind: K,
  what: string,
): Extract<T, { readonly kind: K }> {
  if (value === undefined || value === null || value.kind !== kind) {
    throw new PhysicsError('internal', `${what} is not a ${kind}`);
  }
  return value as Extract<T, { readonly kind: K }>;
}

/** Throw `non-finite` unless every value is a finite number. */
export function assertFinite(what: string, ...values: readonly number[]): void {
  for (const v of values) {
    if (!Number.isFinite(v)) throw new PhysicsError('non-finite', `${what} is ${String(v)}`);
  }
}

/** Throw `invalid-input` unless `value` is an integer in [min, max]. */
export function assertIntInRange(what: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new PhysicsError(
      'invalid-input',
      `${what} must be an integer in [${String(min)}, ${String(max)}], got ${String(value)}`,
    );
  }
}
