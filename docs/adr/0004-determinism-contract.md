---
status: accepted
date: 2026-10-17
decision-makers: owner (prompt pack), agent
consulted: ECMAScript spec (Number arithmetic and Math.sqrt are correctly rounded; Math.sin/exp/pow are "implementation-approximated"); MECHANICS-REVIEW findings 5 and 9; Phase 0 harness run
informed: physics, rules, ai, marble-gen and supabase work in every phase
---

# The determinism contract: exact arithmetic, seeded randomness, integer inputs, versions

## Context and problem statement

Marbles change hands on the outcome of a shot. The phone simulates it for display, and the server re-simulates it to decide. The AI's choice is re-run on the server in for-keeps matches. Replays and share links must play the same everywhere. If any engine (V8 on Android and in Deno, JavaScriptCore on iOS, SpiderMonkey in Firefox) computes one bit differently, the outcome can differ and the game is unfair.

ECMAScript requires `+ - * /` and `Math.sqrt` to be correctly rounded IEEE-754 double operations, so they're identical everywhere. `Math.sin`, `exp`, `pow`, `log`, `atan2`, `hypot`, `cbrt` and the rest are "implementation-approximated" and do differ between engines and versions. `**` is defined through the same approximated power. Clocks, timers, locale, `Math.random`, `crypto` and GC-dependent APIs add nondeterminism from outside.

## Decision drivers

- Fair by construction: the same input gives the same result on every device
- Verifiable automatically, in CI, on every PR
- Readable simulation code (doubles, not fixed-point)

## Considered options

- **Doubles with an arithmetic allowlist, enforced by lint and types, proven by a cross-engine harness**
- Fixed-point integer arithmetic throughout
- Trust the engines and compare outcomes only on the server

## Decision outcome

Chosen option: **doubles with an allowlist**. The rules:

1. **Allowed in simulation code:** `+ - * /`, `Math.sqrt`, `abs`, `min`, `max`, `floor`, `ceil`, `trunc`, `round`, `sign`, `imul`, `fround`, `clz32`, the `Math` constants, and integer and bitwise operators.
2. **Banned:**
   - every other `Math` function, plus `Math.random`, `**` and `**=`
   - `Date`, `performance`, all timers, `queueMicrotask`, `Intl`, `toLocale*`, `localeCompare`
   - `crypto`, `process`, `SharedArrayBuffer`, `Atomics`, `WeakRef`, `FinalizationRegistry`
   - `sort()` and `toSorted()` without a comparator
   - computed access to, aliasing of, or destructuring of `Math`, and reaching any of these through `globalThis`, `window` or `self`

   Curves that need transcendental functions are committed lookup tables, or series written in allowed arithmetic.

3. **Where:** `packages/physics/src`, `packages/rules/src`, `packages/ai/src` and `packages/marble-gen/src/genome`. Enforced by `tools/eslint-plugin-kanche` (`no-banned-math`, `no-nondeterministic-globals`, `no-locale-methods`, `require-sort-comparator`), plus a type wall: those packages compile with `lib: ["ES2023"]` and no DOM or Node types.
4. **Inputs are integers** (shot inputs, seeds). **Randomness** comes only from `createRng(seed)`: xoshiro128** seeded by splitmix32, integer-only, frozen by golden tests and cross-checked against a BigInt reference.
5. **The state hash** is 64-bit FNV-1a over the little-endian bytes of every double in the authoritative state, computed in 16-bit limbs so every step is exact. +0 and −0 differ. **Non-finite values throw** rather than being hashed.
6. **Orientation is not authoritative state.** The renderer integrates it (MECHANICS-REVIEW finding 5).
7. **Versions:** `physicsVersion`, `rulesVersion`, `aiVersion` and `genomeVersion` (all 1) bump with any outcome-changing change. A match stays on the versions it started with, and the server runs the same versions (ADR-0005; OTA gating in Phase 10).
8. **Proof:** `tools/determinism` bundles one ESM file and runs it in Node, Deno, Chromium, WebKit and Firefox. Every hash must match: 1,000 seeds on PRs and 10,000 nightly. Phase 1 adds 10,000 seeded shots and 200 golden replays (KPB v1).

### Consequences

- Good, because fairness is checked mechanically on every PR, not hoped for.
- Good, because the simulation code stays ordinary floating-point TypeScript.
- Bad, because there are no trig functions at runtime. Angles come in as integer inputs mapped through tables, and directions are carried as unit vectors.
- Bad, because the allowlist depends on engines not contracting `a*b+c` into fused multiply-add and not using extended precision. Current JS engines do neither, and the harness would catch a change.

### Confirmation

- RuleTester suites test every rule in both directions.
- A gate test runs the real ESLint CLI on `packages/physics/test/determinism-fixtures/calls-math-sin.ts` and requires `kanche/no-banned-math` to fail it.
- `pnpm harness` on 2026-10-17: Node 24.22.0, Deno 2.9.7, Chromium 156, WebKit 27.2 and Firefox 157 all gave `0e4d48c50528e812` over 1,000 seeds × 480 steps.
- The Deno test in `supabase/functions` reproduces the Node golden hash.

## Pros and cons of the options

### Fixed-point integers

- Good, because they're deterministic by construction.
- Bad, because a 32-bit range forces scaling gymnastics for millimetres to metres and microseconds to seconds, `Math.imul` arithmetic is unreadable, and BigInt is slow. The physics review's models would be much harder to verify.

### Trust the engines, compare on the server

- Bad, because the client would show outcomes the server overrules. Players would see a shot drop and then lose the marble.

## More information

`docs/prompt-pack/MECHANICS-REVIEW.md`; `packages/physics/CLAUDE.md`. Revisit if the harness ever reports a mismatch on an allowed operation.
