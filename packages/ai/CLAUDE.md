# packages/ai

The neighbourhood kids: six AI personalities that choose shots by searching the physics. In for-keeps matches the server runs the kid's turn itself, so a kid can't be faked offline.

## Local rules

- **Determinism lint applies to `src/`.** The search is seeded and integer-driven. Use no time budget measured by a clock: limit the search by node or rollout count, so the server and the phone choose the same shot.
- **Imports:** `@kanche/physics` and `@kanche/rules` only. The Web Worker wrapper lives in `apps/client`, not here.
- **Kids never cheat.** They use the same physics and the same shot inputs as players, with no hidden information and no outcome peeking beyond what a real kid could judge. Personalities differ in search depth, noise and preferences, all from the seed.
- **Version discipline.** Any change to how a kid chooses a shot bumps `aiVersion`.
- The ladder's difficulty must rise steadily in simulated matches (the Phase 5 gate).

## Tests

The coverage gate is 90%. Write property tests for legality (every chosen shot is a legal input), golden decisions per personality and seed, and simulated ladders.
