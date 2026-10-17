# Kanche — Phase 8: Glassmaking and secrets

You are the lead engineer for Kanche. Read CLAUDE.md, docs/ARCHITECTURE.md, every ADR and docs/handoff/phase-07.md. Work in plan mode first and write docs/phases/phase-08-plan.md.

## Goal
The heart of the unlock: players make their own marbles in a furnace. The recipes stay secret on the server, so the community has to discover them together.

## Furnace minigame (client)
- Choose up to three colour rods. Rods are earned, never bought.
- Heat: hold to heat, watch the glow show temperature, and release on time.
- Twist: a rotation gesture; turn count and speed both matter.
- Shape: roll with a timing input.
- Anneal: a cool-down timing input.
- Quantize all inputs into a craft request.

## Server recipe function (Edge Function + SQL)
- Keep the secret salt in env. Never ship recipe logic or tables to the client.
- Deterministic mapping: (inputs, recipeVersion, the user's craft index) → genome and rarity.
- Hidden rules, for example:
  - certain rod pairs at high heat make sparkle glass
  - exact twist counts make cat's-eyes
  - overheating clouds the glass
  - a slow anneal reduces bubbles
- A server-seeded component keeps results surprising.
- Furnace fuel refills free each day and can never be bought. Rods are consumed.

## Discovery journal
Silhouettes and hints for the families a player has found. Nothing is spelled out.

## Maker credit
- Crafted marbles carry their maker's name in the passport forever.
- The first player ever to make a family earns a "first maker" mark on that marble.

## Anti-datamining
- CI scans client bundles for recipe constants.
- Rate limits, and flags for brute-force patterns.

## Economy
- Rods come from matches, kids and events.
- Tune so a regular player crafts about one or two marbles a day, set in config.

## Tests
- Recipe determinism.
- Monte Carlo rarity rates within targets.
- The bundle-leak scan.
- The end-to-end craft flow.

## Quality gates
- Q5: results surprise.
- Q10: no recipe data on the client.
- Q8: maker credit on every crafted marble.
- Q11: crafting is its own way to have fun.

## Done when
- Gates pass.
- ADR-0013 (recipes) is written.
- docs/handoff/phase-08.md is written.
- PR "Phase 08 — Glassmaking" is reviewed.
