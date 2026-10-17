# packages/rules

Game rules for the three modes (Ring, Hit and Hole): turns, the lag, fouls, stakes and transfers. The server re-runs them to decide who owns which marble, so they're simulation code (ADR-0004).

## Local rules

- **Determinism lint applies to `src/`.** The same rules as `packages/physics` apply: no clock, no platform randomness, no locale, and no `sort()` without a comparator.
- **Imports:** `@kanche/physics` only. No DOM, Node, PixiJS, Capacitor or Supabase.
- **Ownership is conserved.** Every staked marble ends with exactly one owner in every test (the Phase 2 gate). Express stakes and transfers as pure functions that return events. Rules never write ownership; the server's ledger does (`supabase/CLAUDE.md`).
- **Layouts keep at least 1 mm between marbles** (MECHANICS-REVIEW finding 8).
- **Version discipline.** Any change that can alter who wins or what changes hands bumps `rulesVersion`. A match stays on the version it started with.
- **Wordless.** Rules expose state and events, never strings for players.

## Tests

The coverage gate is 90%. Write property tests over random matches (ownership conservation, turn order, termination), plus golden matches replayed from seeds.
