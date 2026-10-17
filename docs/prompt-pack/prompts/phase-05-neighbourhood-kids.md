# Kanche — Phase 5: Neighbourhood kids

You are the lead engineer for Kanche. Read CLAUDE.md (root and packages/ai), docs/ARCHITECTURE.md, every ADR and docs/handoff/phase-04.md. Work in plan mode first and write docs/phases/phase-05-plan.md.

## Goal
Six AI kids who play like real neighbourhood players, a ladder that gets harder at a fair pace, offline practice, and pass-and-play.

## AI (packages/ai)
Deterministic and pure. It runs in a Web Worker on the client and, from Phase 6, on the server.

For each decision:
1. Generate candidate shots:
   - ghost-ball aim lines to each target, including cut angles
   - bank shots off walls
   - several power levels and spin options
   - seeded exploration samples
2. Simulate every candidate headless with packages/physics.
3. Score each result: marbles captured (weighted by rarity), the shooter staying in the ring, how safe the leave is, and risk.
4. Choose with personality weights and a seeded softmax.
5. Add execution error to the quantized inputs, using an Irwin–Hall Gaussian (the sum of 12 uniforms minus 6). Never use Box–Muller; it needs log and cos.

Budgets are fixed candidate counts per difficulty tier, never time-based, so decisions stay deterministic. Target 300 ms or less per decision on the low-end reference device.

## Personalities (data in packages/content; names are placeholders)
- Chotu: beginner, big swings.
- Pinky: safe; sticks her shooter.
- Golu: greedy; hunts clusters and rare marbles.
- Babloo: bank shots off walls.
- Meera: spin master.
- Ustaad: the neighbourhood champion.

Each has parameters for aim and power noise, risk appetite, spin and wall preference, rarity greed, a think-time animation and an emote set.

## Ladder and onboarding
- Each kid lives on a court. Beat a kid twice to move up.
- The very first match, against Chotu, is tuned so a new player wins a marble with a satisfying capture. Players should feel "for keeps" in session one.
- Kids keep the marbles they win from you, remember them, and accept win-it-back challenges.

## Offline practice and pass-and-play
- Practice: unlimited matches against kids, with no ledger stakes. Progress (ladder, badges, trick-shot challenges) is stored locally in IndexedDB through a typed repository and synced later.
- Pass-and-play: two people on one device, friendly only.
- Trick-shot challenges, which are the game's secrets: stick the shooter after a hit, bank off the gully wall, knock two marbles out in one shot. Kids demonstrate them with wordless ghost replays.

## Tests
- AI decisions are identical across engines.
- A calibration harness simulates thousands of matches against a reference player model. Win rates must rise steadily up the ladder, and no kid may be a wall.
- Decision budgets are met on device.
- Fuzzing never crashes the AI.

## Quality gates
- Q3: fully playable offline.
- Q4: the difficulty curve is published in the handoff note.
- Q6: a kid holds your lost marble and offers a rematch.
- Q10: trick shots are shown, never explained.

## Done when
- Tests pass.
- ADR-0010 (AI design) is written.
- docs/handoff/phase-05.md is written.
- PR "Phase 05 — Neighbourhood kids" is reviewed.
