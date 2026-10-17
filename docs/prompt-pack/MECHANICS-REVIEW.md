# Kanche — Mechanics review

Exported 17 October 2026 from the "Mechanics review" tab of the Claude Doc "Kanche — Prompt Pack".

## Verdict

The original mechanics were textbook-correct at their core but not benchmark-grade: two critical contradictions, four high-severity gaps and five smaller issues would have capped accuracy. Phase 1 is now rewritten to fix all eleven, and the Kanche Physics Benchmark (KPB v1) defines how the result is proven.

| Area | Before | After | What decides the grade |
| --- | --- | --- | --- |
| Core laws: slide, roll, spin | A− | A+ | The equations were right; they now handle slopes properly and add flight and air drag |
| Collisions | B− | A+ | Impacts are solved with the ground in the loop, a true 3D contact and no energy gain |
| Event timing and integration | C | A+ | One integrator for all motion, events located exactly inside each step, and a convergence test |
| The hole | C | A | A geometric rim and pit replace a single drop rule |
| The flick | B− | A | A finger-impact model makes shooter size a real physical trade-off |
| Determinism | A− | A+ | Orientation leaves the hash; non-finite values fail fast |
| Validation | B | A+ | A public benchmark against filmed reality, a reference simulator and an energy ledger |
| Physical audio | B | A | Click length and brightness follow Hertz contact time |

The grades are engineering judgement; the KPB scores are what prove them.

## Findings and fixes

Each finding below is fixed in the rewritten Phase 1 prompt, with matching changes in Phases 2, 3 and 11.

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| 1 | Critical | Contact times assumed constant velocity inside each 1/240 s step. Ignoring deceleration misplaces contacts by up to about 0.04 mm, 40 times the 1e-6 m tolerance the tests demanded. | Exact event location: every transition and contact is found inside its step (Hermite interpolation, conservative advancement, then bisection and Newton), and the step is split there. On drag-free flat ground the times are exact. |
| 2 | Critical | Sliding was to be integrated analytically everywhere, but on a slope the friction direction keeps turning, so no closed form exists. | One integrator for all motion: fixed-step RK4 at 1/240 s, every transition splitting the step, and a step-halving convergence test. It also carries air drag, which the closed forms couldn't. |
| 3 | High | The spec said unequal sizes tilt the contact by under 5°. An 11 mm shooter meets an 8 mm marble 9.1° below horizontal, and a 2 m/s hit lifts it about 1.5 mm. | A true 3D contact normal, plus a flight state for hops and landings. |
| 4 | High | Collision friction ignored the ground: vertical slip used the wrong effective mass, and ground impulses were thrown away. | Each impact is one multi-contact solve (marble–marble plus each marble's ground contact), integrated over impulse as in Mathavan et al. (2014), with Stronge's energetic restitution so energy can never rise. |
| 5 | High | Orientation sat in the deterministic hash, but exact rotation needs sin and cos, which the contract bans. | Orientation leaves the authoritative state; the renderer integrates it from the timeline. |
| 6 | High | Hole capture was one rule (drop if ½·g·t² ≥ κ·R), which can't produce lip-outs or rim rolls. | Three contact regions: ground, a rounded rim, and the hole wall and floor, the split Hogan and Antali (2025) use for golf lip-outs. Capture emerges from the dynamics. |
| 7 | Medium | Power mapped straight to speed per shooter class, so size trade-offs were hand-tuned. | The thumb is an impact (finger mass, finger speed, soft restitution). A heavier shooter leaves slower but carries more momentum, and offsets beyond a miscue limit slip. |
| 8 | Medium | Marbles that stay touching would trigger endless micro-collisions, caught only by a 64-event cap. | Resting-contact handling below a threshold approach speed, a 1 mm minimum gap in layouts, and a Newton's-cradle test. |
| 9 | Medium | The glass-on-glass friction placeholder (0.08) came from billiard balls, and friction and restitution were constants. | Calibrate both; speed-dependent curves are stored as committed lookup tables, so nothing calls exp at runtime. |
| 10 | Medium | Air drag was left out. On a 16 mm glass marble it shortens a roll by about 0.7–0.8% per metre, and at 2 m/s on tile it is about half the rolling resistance. | Quadratic drag with a fitted drag coefficient, carried by the same integrator. Magnus effects stay out until the side-spin reality tests show they matter. |
| 11 | Low | The audio mapping was loose. | Click length and brightness follow Hertz contact time, which scales with impact speed to the power −1/5; rolling noise scales with speed and surface roughness. |

## The Kanche Physics Benchmark (KPB v1)

KPB turns "realistic" into numbers anyone can check, and every physics version must pass it before release.

| Suite | What it checks | Pass mark |
| --- | --- | --- |
| Analytic | Settling at (5v₀ + 2Rω₀)/7, roll-out distance with and without air drag, stun, draw and follow, the 90° stun cut, the 33.7° rolling half-ball hit, (5/7)·g·sinθ on slopes, Newton's cradle, unequal-size tilt and lift | Exact to 1e-9 relative |
| Reality | Filmed shots on cement, packed dirt, tile, sand and wet cement, five repeats each: roll-out, slide time, departure angles, speed ratios, rest positions, capture boundary, bank angles | Simulation error within 1.5 × the real-world repeat scatter |
| Reference | Equal-size, flat-ground collisions compared with pooltool's Mathavan ball–ball model on post-impact velocities and spins | Within 0.5% |
| Integrity | Energy ledger, no energy gain in any impact, no interpenetration over 1e-9 m, bounded events per shot, convergence when the step is halved | Ledger closes to 1e-9; every property holds over 10,000 shots |
| Determinism | 10,000 seeded shots and 200 golden replays in Chromium, WebKit, Firefox, Node and Deno | Identical hashes |
| Performance | A 16-marble break | ≤ 5 ms on CI; ≤ 20 ms on a low-end phone |

The reality pass mark is deliberately relative: a simulation can't be more repeatable than real marbles on real dirt, so KPB asks it to stay inside reality's own scatter. The dataset, scorer and scores ship with every physics version, and any score regression blocks release.

## What changed in the prompt pack

- [Phase 1](prompts/phase-01-physics-core.md) is rewritten as v2: one RK4 integrator with events located exactly inside each step, air drag, a multi-contact impact solve with energetic restitution, the three-region hole, the finger-impact flick, an energy ledger, and the full KPB v1 suites with a calibration dataset.
- [Phase 2](prompts/phase-02-rules-and-modes.md): layouts keep at least 1 mm between marbles.
- [Phase 3](prompts/phase-03-engine-and-feel.md): the flick sets finger speed, the renderer owns orientation and lifts hopping marbles off their shadows, playback interpolates with the simulation's own curves, and clacks follow Hertz contact time.
- [Phase 11](prompts/phase-11-hardening-and-launch.md): the final audit re-runs KPB and blocks release on any regression.
- [README](README.md): the physics table, phase index and stack table describe the new models and gates.

## Sources

- [Mathavan, Jackson and Parkin (2014), Numerical simulations of the frictional collisions of solid balls on a rough surface, Sports Engineering 17](https://link.springer.com/article/10.1007/s12283-014-0158-y)
- [pooltool physics models, including frictional_mathavan](https://pooltool.readthedocs.io/en/stable/resources/custom_physics.html)
- [Hogan and Antali (2025), Mechanics of the golf lip out, Royal Society Open Science](https://pmc.ncbi.nlm.nih.gov/articles/PMC12585879)

Also relied on, from general knowledge and not linked: Stronge's energetic coefficient of restitution (W. J. Stronge, Impact Mechanics), Hertzian contact theory, and the standard drag curve for a smooth sphere (Cd about 0.4 to 0.55 at marble speeds).
