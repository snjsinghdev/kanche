# Kanche — Phase 4: Marbles and the jar

You are the lead engineer for Kanche. Read CLAUDE.md, docs/ARCHITECTURE.md, every ADR and docs/handoff/phase-03.md. Work in plan mode first and write docs/phases/phase-04-plan.md.

## Goal
Make every marble one of a kind and beautiful up close. Each marble is rendered from an immutable genome, and its inner pattern visibly rolls with the physics.

## Genome v1 (packages/marble-gen; deterministic and pure)
- Fields:
  - genomeVersion and seed (uint32)
  - family: clearie, swirl, cat's-eye, onyx, aggie, sparkle, two-tone
  - base glass tint
  - one to three core colours
  - pattern parameters: bands, twist turns, band width, noise scale, asymmetry
  - inclusions: bubble count and size
  - sheen
  - size class
- Rarity tiers (common, uncommon, rare, epic, legendary) are assigned by the server at mint, from distributions in packages/content. The client never rolls rarity.
- A canonical genome hash for uniqueness; the database enforces it in Phase 6.
- Colour work in OKLab. Produce a 6–8 colour ramp per marble for the pixel look. Keep contrast high, and give each family a distinct pattern so marbles can be told apart without colour.

## Glass renderer (client; PixiJS filter or shader)
- Sphere impostor: a per-pixel normal from disc coordinates.
- Sample the 3D pattern in object space by rotating with the inverse of the physics orientation quaternion. The swirl must roll with the simulated angular velocity, so players see topspin, backspin and the moment a slide turns into a roll.
- Approximate refraction (index 1.5) by bending the sample ray. Add depth shading, a Fresnel rim and a fixed specular highlight from the scene light.
- Ordered dithering at base resolution.
- Two sizes from the same genome: gameplay (12–16 px) and close-up (96–128 px).
- Wear: chips and scratches from cumulative impulse, visual only.
- Batch marbles where possible. Fallback for weak GPUs: rotation frames pre-rendered at runtime and cached.

## Jar and passport
- Jar screen: every owned marble in a glass jar with a playful settle animation (visual only; it may be non-deterministic).
- Inspect: tap a marble for the close-up and drag to rotate it.
- Name it, with filtering (Phase 9 adds the full filters).
- Protect it as a favourite, so it can't be staked.
- Passport: the marble's history as a wordless list. It shows who made or found it, every match, every owner, courts and dates. If you add a map of India, it must use the official boundaries; default to a list of courts and cities instead.
- A local share card for a marble: the close-up, its name and key history, exported as PNG. Phase 7 wires up sharing.

## Content
Marble series v1 data: families, colour palettes inspired by classic Indian kanche (bright cat's-eyes, clear tints, swirls) and rarity distributions.

## Tests
- The same seed gives the same genome in every engine.
- Screenshot tests of a fixed genome set at both sizes.
- 1M sampled genomes: hash-collision rate below the documented threshold.
- 64 marbles in the jar hold 60 fps on mid-range phones.

## Quality gates
- Q8: every marble is unique and nameable, with a passport.
- Q5: families and rare looks feel surprising.
- Q9: the share card reads without words.

## Done when
- Tests pass.
- ADR-0009 (genome and rendering) is written.
- docs/handoff/phase-04.md is written.
- PR "Phase 04 — Marbles and the jar" is reviewed.
