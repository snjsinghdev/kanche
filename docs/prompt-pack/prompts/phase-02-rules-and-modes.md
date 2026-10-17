# Kanche — Phase 2: Rules and modes

You are the lead engineer for Kanche. Read CLAUDE.md (root and packages/rules), docs/ARCHITECTURE.md, every ADR, docs/physics.md and docs/handoff/phase-01.md. Work in plan mode first and write docs/phases/phase-02-plan.md.

## Goal
Build packages/rules: a pure, deterministic match engine for three street-marble modes and the for-keeps stake model. The client and the server must reach identical outcomes from the same inputs.

## Match model
- MatchConfig: mode, courtId, rulesVersion, physicsVersion, seed, two players, each player's staked marbles (ids and size classes), each player's shooter.
- MatchState: phase, whose turn, marble states, a captured-by map, shooter positions, turn counters.
- A reducer: (state, turnInput) → (state, ruleEvents). No I/O, no clock, and no randomness except the seeded PRNG from packages/physics.

## Who goes first: the lag
- Each player shoots once toward a lag line. The centre closest to the line goes first; ties re-lag.
- Lag shots are independent, so they work asynchronously.

## Mode 1: Ring (for keeps)
- The staked marbles form the ring layout from court data (cross or cluster) with seeded, deterministic jitter.
- Layouts keep at least 1 mm between marbles; the jitter never closes the gap.
- The opening shot starts from a point on the ring line, chosen by index into the committed unit-vector table.
- A marble is out when its centre is beyond ringRadius + its own radius.
- Knock out at least one marble while your shooter stays inside the ring, and you shoot again from where it rests.
- Otherwise your turn ends and your shooter is lifted.
- Each knocked-out marble is captured by the shooter of that shot.
- The match ends when one player holds a majority of the ring, or the ring is empty. Marbles left in the ring go back to whoever staked them.

## Mode 2: Hit (the quick duel)
- Each player stakes one marble, placed by the lag.
- Players alternate shooting their own marble at the other's, from where it rests.
- A direct hit wins the opponent's marble and ends the match.
- After maxTurns with no hit, it's a draw and both marbles go home.

## Mode 3: Hole
- The court has a hole and a throw line.
- Round one: each player shoots toward the hole. Holing, or failing that finishing closest, earns the strike.
- The striker shoots from the hole's edge at the opponent's marble; a hit wins it.
- Build this as a data-driven rule set (hole-classic), so regional variants found in playtests can ship as data.

## Rules as data
- Ring sizes, marble counts, win thresholds, maxTurns, stake limits and display names live in packages/content as zod-validated JSON.
- Display names are localisable and marked "verify with players". Ship neutral names (Ring, Hit, Hole) until regional names are confirmed.

## Stakes and outcomes
- Min and max stake per mode. Protected favourites can't be staked.
- outcome() returns a deterministic transfer list [{marbleId, from, to}]. Draws return everything.
- Provide forfeit and timeout outcomes for the server to call.
- Reject invalid inputs (a start point outside the allowed zone, out-of-range values) with typed errors. Never clamp silently.

## Rule events for the UI
Emit: keep-shooting, turn-over, captured, shooter-out, match-won, draw, and win-it-back-eligible (with the marble and its new holder).

## Tests
- Scripted scenario tests per mode, with golden final states.
- Property tests: every staked marble ends with exactly one owner; transfers only move marbles between the two players; matches always terminate within bounds.
- Fuzz random inputs: the engine never throws an untyped error.
- Cross-engine determinism through the Phase 0 harness.

## Deliverables
- packages/rules.
- docs/rules.md: plain-language rules for each mode, plus a wordless icon spec for each rule moment.
- ADR-0008: rules versioning and data-driven variants.

## Done when
- Tests and coverage pass, and goldens match across engines.
- docs/handoff/phase-02.md is written.
- PR "Phase 02 — Rules and modes" is reviewed.
