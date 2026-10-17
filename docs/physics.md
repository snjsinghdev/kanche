# Kanche physics (physicsVersion 1)

This page covers what `packages/physics` models, and the conventions and derivations behind each law. ADR-0006 covers the integrator and ADR-0007 the model choices. The coefficients are in `packages/physics/src/params/v1/`, each with its unit and a PLACEHOLDER mark until it is fitted (`docs/physics-calibration.md`).

## Frame, units and state

```text
        y (court, up the screen)
        ^
        |      z out of the ground, towards the camera
        |     /
        |    /
        +---------> x
       ground plane z = h(x, y)
```

- **Units** are SI throughout: m, s, kg, rad, N. The fixed step is dt = 1/240 s. Positions are marble centres.
- **The state** of a marble is its position (x, y, z), velocity v, angular velocity ω, motion state and support. The state hash covers position, velocity, spin and motion in id order, plus the event count. Orientation is not authoritative: the renderer integrates it (ADR-0004).
- **Signs:**
  - ω follows the right-hand rule.
  - A marble rolling along +x has ω_y = +v/R, so topspin is positive along the direction of travel: KPB 1's (5·v0 + 2·R·ω0)/7.
  - **The slip** at the ground contact is the velocity of the contact point: u = v + ω × (−R·ẑ) = (v_x − R·ω_y, v_y + R·ω_x).
- **Mass and inertia** of a solid glass sphere: m = ρ·(4/3)·π·R³ with ρ = 2,500 kg/m³, and I = (2/5)·m·R². The size classes are r80, r95 and r110: radii of 8.0, 9.5 and 11.0 mm.

## Motion on the ground

Let g = 9.81 m/s², let a_s = −g·∇h be the small-slope acceleration, and let k_d = ½·ρ_air·C_d·π·R²/m.

**Sliding** (u ≠ 0). Friction μS·m·g acts against the slip û:

- dv/dt = −μS·g·û + a_s − k_d·|v|·v
- dω/dt = (5/2)·(μS·g/R)·(ẑ × û)
- du/dt = −(7/2)·μS·g·û + a_s − k_d·|v|·v

On flat ground with no drag, û never turns. The slide ends at t* = 2·|u0|/(7·μS·g), and the marble rolls on at (5·v0 + 2·R·ω0)/7 (KPB 1).

**Rolling** (u = 0). Rolling resistance μR(|v|)·g acts against v. Gravity and drag act through the centre, and the rolling constraint passes 5/7 of them to the centre:

- dv/dt = −μR·g·v̂ + (5/7)·(a_s − k_d·|v|·v)
- ω stays tied to v: ω = (ẑ × v)/R.

With no drag, a roll from v stops after v²/(2·μR·g). With drag, it stops after (1/(2k))·ln(1 + k·v²/(μR·g)), where k = (5/7)·k_d (KPB 2). A rolling marble's kinetic energy is (7/10)·m·|v|², so rolling resistance dissipates (7/5)·m·μR·g·|v|.

**Spin about the vertical** (ω_z) decays at (5/2)·μSp·g/R, on planes only. Spin friction on curved supports is a proposed cut, awaiting the owner (`gates.md`, Gate 5). A marble that has stopped translating but still spins is `spinning`.

**Rest.** A marble at rest starts rolling again only if the push beats rolling resistance at rest: (5/7)·|a_t| > μR(0)·N/m. Any part of the push that drives it into a wall, an edge or another marble it is touching doesn't count.

### Coulomb stops

As a slip (or a rolling speed) runs to zero on a slope, its direction turns as |u|^(c/k), which is not smooth enough for one RK4 step. Three cases (ADR-0006):

- **Nothing can turn it.** When |c × û| ≤ 10⁻¹²·k, the direction is frozen and the stop is a root of u·û₀.
- **Otherwise,** substeps shrink: h ≤ α·|u|/|du/dt|, with α = 1/32, or ½ when the side force is drag-sized (p < 3×10⁻⁴). The residual below 10⁻¹⁰ m/s is removed by the exact friction impulse P = −(2/7)·m·u, and its energy is booked to the slide term.
- **Restarting from rest on a slope,** the marble moves along the slope's direction, with one short first substep.

## Curved supports

The rim of the hole is a torus. Block edges are radius-0 tubes (lines) and block corners are points. On them the marble's centre stays at distance R (plus the fillet radius) from the support, so the support is an exact constraint.

- The normal force N comes from the constraint: gravity, drag and the centripetal term.
- Sliding has friction μS·N, and rolling needs the friction F_needed.
- **Take-off** is the event N → 0.
- **Rolling slip** is the event |F_needed| → μS·N.

Substeps are limited to h ≤ 0.004·d/|v|, where d is the radius the centre moves on.

**Stick and slip on curves.** With c = −(7/2m)·F_needed and k = (7/2)·μS·N/m, a small slip is pulled towards ĉ at the stiff rate |c|/|u|. Two outcomes follow:

- If |c| > k, the slip grows: rolling can't be held.
- If |c| < k, it shrinks.

While an explicit substep could not follow that pull (1/32·|u| < (k + |c|)·h), the slip direction is slaved to ĉ, which is smooth in the state. The slaved slip ends at u·ĉ = 0.

## Air

Drag is quadratic, F = −½·ρ_air·C_d·A·|v|·v, with ρ_air = 1.2 kg/m³ and C_d = 0.5 (PLACEHOLDER). An airborne marble feels gravity and drag. It lands on whatever ground, top, floor or rim it reaches, as an impact.

## Impacts

```text
      shooter a          n (from b towards a's centre)
         ( )  <----------  ( )  b, or a wall, edge, rim or the ground
          |                 |
        support           support      each support reacts only if pressed
```

An impact is one solve over the primary normal impulse P, in 256 steps (ADR-0007). Each step does three things in order:

1. It applies ΔP along the true 3D normal.
2. It applies Coulomb friction μ·ΔP at the primary contact, against its slip. If that would reverse the slip, it applies only what stops it, so the contact sticks.
3. For each supported marble, the support pushes just enough to stop the marble moving into it (never pulling), then applies its own friction.

- **Compression** ends where the normal relative velocity reaches zero.
- **Restitution** ends where its work reaches e²·(compression work), Stronge's energetic coefficient.

The separation is linear in P within a step, so both ends are solved exactly. The frictionless closed forms of KPB 3, 4, 7 and 8 therefore hold to 1e-9. An impact never adds energy.

**After the impact:**

- A marble now leaving its support faster than 1 mm/s takes off.
- Slower than that, the separation is removed and booked.
- A marble meeting a feature that can carry it lands on it.
- A supported marble separating from a feature slower than v_hop stays against it, and the separation is removed. On a plane this is the plane's part of the normal speed, v_h·(n_h + n_z·∇h), because the plane carries no vertical velocity.
- Contacts slower than v_rest = 1 mm/s are perfectly inelastic and are then **held**.

## Held contacts

A resting contact (marble–marble, or marble and wall, pit wall, edge or corner) is held. A frictionless constraint force λ ≥ 0 keeps the gap from closing, as part of the derivative.

- Marbles joined by holds advance together as one group.
- With several holds, λ solves a small linear complementarity problem exactly (up to six contacts, by active-set enumeration).
- A hold releases when λ would turn negative, or when the gap opens beyond 1 nm.
- On a sloped plane a hold acts through the generalised force Q = F_h + F_z·∇h, because the marble's height follows the ground.

## The hole

```text
   ground  ________        ________  zTop
                   \      /           rim: torus, fillet radius rF
                    |    |            wall: radius Rh
                    |____|            floor at zFloor
```

There are three regions, entered and left at the circle ρ = Rh + rF:

- the flat surround;
- the rim, where the centre rides a torus;
- the pit, made of the wall (a vertical cylinder taking impacts) and the floor (a plane).

A marble is **pocketed** once its centre is below ground level and its total energy is below m·g·(zTop + R). Energy never rises, so it can never climb out. Lip-outs, rim rolls and capture emerge from the dynamics.

## Blocks: steps and curbs

A block is a raised convex polygon, 0 < height < 8 mm, with flat ground around it.

- Its top is a plane, its top edges are tubes, and its top corners are points. Marbles hit them, pivot over them and hop them.
- Its vertical faces are lower than any marble's centre, so they are never touched.
- Cracks (lowered blocks) are not modelled. The Phase 1 prompt names them, so this is a proposed cut, awaiting the owner (`gates.md`, Gate 5).

## The flick

The finger is a mass m_F = 6 g hitting with restitution e_F = 0.5 (both PLACEHOLDERs) at speed v_F, where v_F runs from 0.2 to 3.0 m/s as `fingerSpeed` runs from 0 to 1000.

- **The impulse:** J = (1 + e_F)·v_F / (1/m_F + 1/m_eff), with 1/m_eff = 1/m + |offset|²/I.
- **The offsets** come from the integer inputs: `spin` b = (spin/1000)·R above or below the centre, and `side` c = (side/1000)·R left or right of it.
- **The launch:** v0 = J/m along the aim, and ω0 = (J/I)·(b·ŝ − c·z′).
- **A miscue:** an offset beyond 0.6·R keeps 20% of the impulse.

The aim is an int16 vector (dirX, dirY), normalised with `sqrt`. Inputs that are angles go through `unitVector(index)` instead: a committed table of 1,024 exact directions, with the first octant stored (generated with BigInt series) and symmetry giving the rest. Phase 2's start points are such inputs.

## The energy ledger

Every shot reports initial = final + slide + roll + spin + drag + impact + removed + forced, and residual is the difference.

- **Slide, roll, spin and drag** are integrated as extra RK4 states.
- **Impact** is the kinetic energy lost in impacts and in support hand-overs.
- **Removed** is the kinetic energy of pocketed marbles and marbles that leave the court.
- **Forced** is what tMax (20 s) or the event caps stop.

The residual closes to 1e-9 of the energy the shot converts (KPB 9).

## Events

The simulation reports:

- **impacts**, with the time, the marbles or feature, the impulse, the approach speed, the contact point and normal, and the energy lost;
- **transitions:** slide-roll, roll-slide, roll-rest, spin-rest, roll-start, take-off, hole-enter, hole-leave, support (a hand-over), pocketed and out.

Phase 3 drives audio, effects and haptics from these, and Phase 2's rules read them.
