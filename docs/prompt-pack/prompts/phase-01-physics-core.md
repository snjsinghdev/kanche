# Kanche — Phase 1: Physics core (v2, benchmark grade)

You are the lead engineer for Kanche. Read CLAUDE.md (root and packages/physics), docs/ARCHITECTURE.md, every ADR and docs/handoff/phase-00.md. Work in plan mode first and write docs/phases/phase-01-plan.md.

## Goal
Build packages/physics: a deterministic simulation of solid glass marbles on real ground, accurate enough to set a public benchmark, the Kanche Physics Benchmark (KPB v1). The same code runs in the app, the AI worker and on the server.

## Units, frame and parameters
- SI units only: metres, seconds, kilograms, radians.
- Ground plane z = 0; x right, y up the screen, z up out of the ground; g = 9.81 m/s².
- Every constant lives in a versioned params module (params/v1) with a source note. Unmeasured values are marked PLACEHOLDER.
- Speed-dependent coefficients (restitution, friction, rolling resistance) are committed piecewise-linear lookup tables. Never evaluate exp, pow or other transcendental functions at runtime.

## Bodies and state
- Solid soda-lime glass spheres, density rho = 2500 kg/m³. Standard radius 8.0 mm; shooter classes 8.0, 9.5 and 11.0 mm.
- m = rho·(4/3)·pi·R³ and I = (2/5)·m·R².
- Authoritative state per marble: stable integer id; centre position (x, y, z); velocity (vx, vy, vz); angular velocity (wx, wy, wz); motion state (sliding, rolling, spinning, airborne, resting, pocketed, out); cumulative wear (visual only).
- Orientation is not authoritative. Exact rotation needs sin and cos, so the renderer integrates orientation from the angular-velocity timeline.

## Forces and motion
Contact slip velocity on the ground: u = (vx − R·wy, vy + R·wx). Write u_hat = u/|u| and v_hat = v/|v|.

Air drag acts on every moving marble: F = −cD·|v|·v, with cD = (1/2)·rhoAir·Cd·pi·R² and rhoAir = 1.2 kg/m³. On a 16 mm glass marble it shortens a roll by about 0.7–0.8% per metre, and at 2 m/s on tile it is about half the rolling resistance, so it is modelled. Magnus and other spin-aerodynamic effects are left out of v1; the reality suite's side-spin shots will show whether they're needed.

Sliding (|u| > epsU):
- dv/dt = −muS·g·u_hat + aSlope − (cD/m)·|v|·v
- dwx/dt = −(5·muS·g / (2R))·u_hat.y
- dwy/dt = +(5·muS·g / (2R))·u_hat.x
- Check: with drag off on flat ground, u shrinks at (7/2)·muS·g in a fixed direction, and sliding ends at t* = 2|u0| / (7·muS·g).

Rolling (|u| ≤ epsU):
- Keep wx = −vy/R and wy = vx/R.
- dv/dt = −muR·g·v_hat + (5/7)·(aSlope − (cD/m)·|v|·v), where muR is defined by the measured deceleration of a rolling marble.
- A resting marble starts rolling only if (5/7)·|aSlope| > muR·g.

Spin about the vertical: dwz/dt = −(5·muSp·g / (2R))·sign(wz), clamped at zero.

Airborne: gravity and drag; spin stays constant.

Terrain: a heightfield grid h(x, y) with a bilinear gradient and aSlope = −g·grad(h); slopes stay under 3%. Steep features (the hole, rims, steps) are analytic geometry, not heightfield.

Integration:
- All motion uses one fixed-step RK4 integrator at dt = 1/240 s (versioned).
- Every transition is an event that splits the step, so forces are smooth inside each step.
- With drag off on flat ground, motion is polynomial and RK4 reproduces it exactly, so the analytic suite can demand exact answers.

## Events and exact timing
- Event kinds: marble–marble, marble–wall and marble–edge contact; slide→roll; roll→rest; spin→rest; take-off and landing; crossing a terrain-cell boundary; entering or leaving the hole region.
- Broadphase: sort-and-sweep over each step's swept bounds, ties broken by id.
- Locate events inside a step on cubic Hermite interpolants of the step's start and end states (exact for drag-free flat motion). For contacts, find the earliest root of the gap function by conservative advancement (advance by the gap divided by a bound on closing speed, so no contact is ever skipped), then refine with bisection and Newton steps. Iteration caps are fixed and versioned, and only + − × ÷ and sqrt are used.
- Re-integrate from the step start to the event time, so every event state is an RK4 state. Resolve the event, then continue the step.
- Order simultaneous events by (time, kind, lower id, higher id).
- Resting contact: when two marbles meet below vRest (1 mm/s, versioned), resolve the normal motion as perfectly inelastic and hold them in contact until they separate, instead of re-colliding forever.
- Layouts never place marbles closer than 1 mm. Truly simultaneous impacts resolve as sequential impulses in event order.
- Cap events per step and per shot (versioned), with a deterministic fallback and a logged metric.
- A shot ends when every marble is resting, pocketed or out, or at tMax = 20 s (force rest and flag it).

## Shot result
Simulate the whole shot at once and return a ShotResult:
- the final state
- the event list: impacts with impulses and positions, transitions, pockets and outs
- the energy ledger
- a timeline of RK4 states at every step and event, which the renderer interpolates with the same cubic Hermite curves

## Impacts: one multi-contact solve
Treat each impact as a single event involving the marble–marble (or marble–wall or marble–edge) contact and every involved marble's ground contact while it is grounded.
1. Use the true 3D contact normal from centre to centre. Unequal radii tilt it: 4.9° for 9.5 mm on 8 mm, 9.1° for 11 mm on 8 mm.
2. Integrate the impact over normal impulse in a fixed number of steps (versioned, for example 256), as in Mathavan, Jackson and Parkin (2014). At each step, compute the slip velocity at every contact and apply Coulomb friction along the instantaneous slip direction; a contact sticks when its slip reaches zero.
3. Ground contacts are unilateral: they push and never pull. A marble whose ground impulse would go negative lifts off and becomes airborne.
4. Use Stronge's energetic coefficient of restitution (restitution work = −e² × compression work), so an impact can never add energy.
5. Restitution e and friction coefficients come from speed-dependent lookup tables per material pair.
6. Report each impact's impulse and position for audio, effects and rules.

Walls (taller than R) are contacted at centre height. Edges (steps, curbs and cracks lower than R) use the true contact normal, so marbles can climb, hop or pivot over them.

## The hole: three regions
- Court data gives the hole radius Rh, depth D, a rounded rim of fillet radius rF, and the floor.
- Model three contact regions: the ground, the rounded rim (a sphere on a torus), and the hole wall and floor. Hogan and Antali (2025) use the same split for golf lip-outs.
- Capture emerges from the dynamics: a marble is pocketed when its centre is below ground level and it can't climb out. Lip-outs and rim rolls happen naturally.

## The flick: a finger impact
Inputs are integers, quantized on the client and validated on the server:
- dirX, dirY: int16, normalised inside the sim with sqrt.
- fingerSpeed: 0–1000 → vF from vFMin to vFMax.
- spin: −600…600 → vertical contact offset b = (spin/1000)·R.
- side: −300…300 → sideways offset c = (side/1000)·R.
- start point: an index into a committed table of unit vectors generated offline.

Model the finger as a body of effective mass mF striking the marble at offset r = (b, c) with soft restitution eF:
- 1/mEff = 1/m + |r|²/I
- J = (1 + eF)·vF / (1/mF + 1/mEff)
- v0 = J/m along the aim, and w0 = (r × J)/I.

Offsets beyond a miscue limit (|r| > 0.6·R, versioned) slip and lose most of the impulse. Calibrate mF and eF from filmed flicks of all three shooter sizes, so size trade-offs come from physics, not tuning.

Ship an optional lofted shot (a lift-angle input that launches the marble airborne) behind a rule-variant flag. Keep it off until players confirm it's part of how they play.

Document every sign convention with diagrams in docs/physics.md.

## Determinism contract
- Use only + − × ÷ and Math.sqrt/abs/min/max/floor/ceil/trunc/sign/imul/fround. No transcendental functions, no **, no wall-clock reads.
- Total ordering everywhere; ties broken by id.
- Any NaN or Infinity aborts the shot with a typed error.
- State hash: FNV-1a or xxHash32 over the Float64 bit patterns (via DataView) of the authoritative state in id order, plus motion states and the event count.
- Golden replays live in packages/testkit. Any change that alters a golden hash requires a physicsVersion bump, and old versions stay runnable for live matches.

## Energy ledger
Every shot keeps a ledger: initial kinetic and rotational energy; work by sliding friction, rolling resistance, spin friction and air drag; impact losses; and potential-energy change on slopes and in the hole. Integrate each term's power as an extra RK4 state. The ledger must close to 1e-9 relative; any gap is a bug.

## Tests: the Kanche Physics Benchmark (KPB v1)
Analytic suite, exact to 1e-9 relative (drag off unless stated):
1. Settling: the final rolling speed is (5·v0 + 2·R·w0)/7 (topspin positive); a spinless slide settles at (5/7)·v0 at t* = 2·v0/(7·muS·g).
2. Rolling stop distance d = v²/(2·muR·g). With drag on, d = (1/(2k))·ln(1 + k·v²/(muR·g)), where k = (5/7)·cD/m. Tests may use log; the sim may not.
3. Head-on, equal masses, frictionless contact: the shooter keeps ((1 − e)/2)·v and the target leaves at ((1 + e)/2)·v. Backspin draws back; topspin follows through.
4. Stun cut, e = 1, frictionless: the marbles leave 90° apart. Tests may use atan2; the sim may not.
5. Rolling half-ball hit, e = 1, frictionless: once rolling again, the shooter has deflected 33.7° ± 0.5°.
6. A uniform slope gives rolling acceleration (5/7)·g·sin(theta).
7. Newton's cradle: a shooter fired into a line of marbles 1 mm apart passes its motion down the line (e = 1, frictionless, ground friction off).
8. Unequal sizes: 11 mm on 8 mm meets at 9.1°, and the shooter's lift matches the frictionless closed form.

Integrity suite:
9. The energy ledger closes on 10,000 random shots, and no impact ever adds energy.
10. Momentum is conserved in frictionless impacts with the ground removed.
11. No interpenetration beyond 1e-9 m, no tunnelling at maximum speed, and bounded event counts per shot.
12. Convergence: halving the step moves final positions by under 1e-9 m on single-impact scenarios with drag and slopes on.

Determinism suite:
13. 10,000 seeded shots repeat bit for bit, and 200 golden replays match across Chromium, WebKit, Firefox, Node and Deno.

Reference suite:
14. Equal-size, flat-ground collisions agree with pooltool's frictional_mathavan model on post-impact velocities and spins, scaled to marble parameters, within 0.5%.

Reality suite (tools/kpb):
15. A scorer compares simulated shots with the filmed dataset on roll-out distance, slide time, departure angles, speed ratios, rest positions, capture boundary and bank angles. Each metric passes when the simulation error is within 1.5 × the real-world repeat scatter.

Performance:
16. A 16-marble break simulates in ≤ 5 ms on CI. Record the number.

## Physics Lab
- tools/physics-lab CLI: runs a scenario JSON and writes the event log, the energy ledger and CSV of |v|, |u| and w over time.
- A client debug route that draws velocity, slip and spin vectors, trails and live values, compares two parameter sets, and overlays tracked real-world footage on the simulation.

## Calibration and the KPB dataset (docs/physics-calibration.md, docs/kpb.md)
- Film real marbles overhead from a tripod at 240 fps (higher for impacts if the phone allows), with a ruler and grid in frame and a line drawn on each marble so spin shows.
- Surfaces: smooth cement, packed dirt, ceramic tile, sand and wet cement. Repeat each condition five times to measure real-world scatter.
- Track positions with Tracker (Open Source Physics) or an OpenCV script in tools/kpb. Fit parameters with uncertainty, and store the dataset with metadata in packages/testkit/kpb.
- Fit muR and Cd together from the deceleration curves of long rolls on tile and cement, where drag shows most; muS from slide times; e(v) from head-on hits; muBB from cut-shot throw; mF and eF from flicks; and the rim model from hole approaches.
- Placeholders until measured: muS 0.25–0.5; muR 0.008 cement, 0.03 dirt, 0.006 tile, 0.12 sand; muSp 0.01; e 0.93; muBB 0.08 (borrowed from billiard balls; glass may differ); eW 0.6; muW 0.2; Cd 0.5.

## Done when
- The analytic, integrity, determinism and reference suites pass, and the coverage gate holds.
- The KPB scorer runs on the starter dataset, and scores are recorded in docs/kpb.md.
- docs/physics.md holds derivations, sign conventions and diagrams.
- ADR-0006 (one RK4 integrator with exact event location) and ADR-0007 (impact, hole, flick and drag models) are written.
- Golden replays are committed.
- docs/handoff/phase-01.md records performance numbers, KPB scores and open questions.
- PR "Phase 01 — Physics core" is reviewed.
