# Phase 1 evidence

Recorded on 2026-10-17 on the owner's Linux machine (Intel i7-5600U, 4 threads, Ubuntu 24.04) unless marked otherwise. The KPB pass marks are in [`../../kpb.md`](../../kpb.md), and the gates in [`../../gates.md`](../../gates.md).

## KPB 1–8: the analytic suite, and that it can fail

All analytic tests pass to 1e-9 (`packages/physics/test/kpb/analytic.test.ts`). To show they are not vacuous, each law was broken in a copy of the package and the suite re-run (`mutants.txt`):

| Mutation                                                | Caught by   | Failing tests |
| ------------------------------------------------------- | ----------- | ------------- |
| Sliding spin-up with 3/2 instead of 5/2 (wrong inertia) | KPB 1, 3, 5 | 10            |
| Rolling with 2/3 instead of 5/7                         | KPB 2, 6    | 6             |
| Drag pushing forward while rolling                      | KPB 2       | 3             |
| Restitution work with e instead of e²                   | KPB 3, 8    | 3             |
| Contact distance ignoring the second radius             | KPB 8       | 1             |
| Rolling resistance doubled                              | KPB 2, 6    | 9             |

## KPB 9–12: integrity

| Run                                     | Worst ledger residual | Worst marble overlap         | Worst feature overlap | Caps hit | Untyped errors |
| --------------------------------------- | --------------------- | ---------------------------- | --------------------- | -------- | -------------- |
| 1,000 shots (each PR)                   | 6.5e-10               | 5.5e-13 m                    | 1.2e-10 m             | 0        | 0              |
| 10,000 shots (`KANCHE_KPB_SHOTS=10000`) | 6.5e-10               | under 1e-9 m (KPB 11 passes) | under 1e-9 m          | 0        | 0              |

`KANCHE_KPB_SHOTS=10000 npx vitest run test/kpb --coverage.enabled=false` in `packages/physics`: **57 of 57 pass** in 177 s (2026-10-17, 22:35–22:38 IST).

The first 10,000-shot run failed KPB 9 and 11 on seven shots. These were five defects, all fixed in `6e409e8`, and each fixed shot is now a regression test (`integrity.test.ts`, "the shots the 10,000-shot survey caught"). Six of the seven fail on the previous commit.

Halving the step moves final positions by 2.0e-11 m (flat ground with drag), 1.7e-11 m (down a slope) and 1.7e-11 m (across a slope, tile, unequal sizes). The pass mark is 1e-9 m.

## KPB 13: determinism in five engines

`pnpm harness`, with the probe, the 200 golden replays, and one random shot per seed:

```text
Kanche determinism harness: 1000 seeds x 480 steps

engine    version       probe / goldens / shots                             time
--------  ------------  --------------------------------------------------  -------
node      v24.22.0      0e4d48c50528e812 727cc953980357c6 67369b3e26944067  5734 ms
deno      2.9.7         0e4d48c50528e812 727cc953980357c6 67369b3e26944067  4542 ms
chromium  156.0.8078.4  0e4d48c50528e812 727cc953980357c6 67369b3e26944067  4397 ms
webkit    27.2          0e4d48c50528e812 727cc953980357c6 67369b3e26944067  5137 ms
firefox   157.0         0e4d48c50528e812 727cc953980357c6 67369b3e26944067  9054 ms

PASS: all 5 engines agree (0e4d48c50528e812/727cc953980357c6/67369b3e26944067).
```

```text
Kanche determinism harness: 10000 seeds x 480 steps

engine    version       probe / goldens / shots                             time
--------  ------------  --------------------------------------------------  --------
node      v24.22.0      d3e8ebfbdc986614 727cc953980357c6 c610c405c294d266  35362 ms
deno      2.9.7         d3e8ebfbdc986614 727cc953980357c6 c610c405c294d266  33989 ms
chromium  156.0.8078.4  d3e8ebfbdc986614 727cc953980357c6 c610c405c294d266  33320 ms
webkit    27.2          d3e8ebfbdc986614 727cc953980357c6 c610c405c294d266  34131 ms
firefox   157.0         d3e8ebfbdc986614 727cc953980357c6 c610c405c294d266  73008 ms

PASS: all 5 engines agree (d3e8ebfbdc986614/727cc953980357c6/c610c405c294d266).
```

The break's hash is `b2396155f54ebc61` in Node, in Chromium, WebKit and Firefox (`pnpm e2e`, the lab test), and in Chrome 155 on the owner's OnePlus (ARM).

## KPB 14: the pooltool reference

```text
KPB 14: worst 0.242% over 60 shots                (pooltool as shipped: no draws, no head-on returns)
KPB 14: worst 0.245% over 75 shots                (pooltool with its ball–table slip sign corrected: all cuts)
KPB 14 open: 21 of 81 miss; draws up to 12.97% (shipped), head-on returns up to 5.49% (corrected)
```

`tools/kpb/reference/pooltool_mathavan.py --wheel` confirmed that the vendored `_collide_balls` matches `pooltool_billiards-0.6.0-py3-none-any.whl` (SHA-256 `c47a46ae…7b3bd5`) byte for byte.

Holding the lifted marble on the ground in a scratch copy of Kanche cut the head-on-return difference from 5.5% to 0.87%. That is evidence that the vertical velocity explains most of it.

## KPB 15: the reality tools, on synthetic data

`kpb15-synthetic.json` has every metric's error and scatter for the true, fitted and v1 parameters, plus the fitted estimates. Its summary is in `kpb.md`: true and fitted 48 of 48, v1 35 of 48. **The data is synthetic**, so the reality gate stays open.

## KPB 16: the break

```text
KPB 16 (16-marble break): median 25.04 ms, fastest 21.10 ms, p90 32.49 ms over 300 runs   (6e409e8)
KPB 16 (16-marble break): median 23.22 ms, fastest 19.39 ms, p90 32.30 ms over 200 runs   (b62bc08, the same minutes)
```

`kpb16-laptop.json` has the run's details. On the phone (the lab page's bench hook in Chrome, served from this machine over `adb reverse`, 100 warm runs):

```text
OnePlus CPH2467 (Snapdragon 695, Android 15), Chrome 155: median 29.6 ms, fastest 24.3 ms, p90 31.2 ms over 100 runs; hash b2396155f54ebc61
```

The break went from 38 ms to 21 ms (12,488 substeps to 6,004) when commits became local (`192a24e`), measured within minutes of each other. The five fixes in `6e409e8` cost about 6% (6,182 substeps). The machine itself varies by about 10% across the day: the previous commit measured 20.8 ms earlier and 23.3 ms here.

### The first optimisation, for Gate 6 (2026-10-18)

Three commits (`1df2705`, `66707b6`, `376210f`) that change no result. After each edit, the break's hash and substeps, all 200 golden replays and 300 random shots (`randomShot(i·7919 + 1)`) were checked against the baseline `0d03e7e`: none differed.

The Unity editor was running on this machine throughout, at a load average of 4–7, and separate runs of the baseline varied from 24 to 46 ms. So the speed-ups are measured interleaved: the baseline and the working tree are loaded into one Node process and alternate shot by shot, and the figure is the median of the per-pair ratios.

```text
load average: 6.56, 6.90, 5.24
break: base 32.64 ms, new 25.34 ms, median speed-up 1.308x (400 pairs; hashes equal)
lone1: base 12.43 ms, new 9.12 ms, median speed-up 1.358x (200 pairs; hashes equal)
lone16: base 27.73 ms, new 16.13 ms, median speed-up 1.791x (200 pairs; hashes equal)
```

`lone1` is one marble rolling alone on open cement for 4,005 steps; `lone16` is the same with fifteen marbles resting nearby. The lone marble costs about 1.8 µs a step at the baseline, of which the physics itself (the rolling derivative and RK4's arithmetic) is about a fifth in the profile; the rest is the engine's bookkeeping.

The changes:

- the broadphase order is kept between searches and updated by insertion sort;
- boxes are found through a slot map, not `indexOf`;
- the event search fills one reused object instead of allocating per candidate;
- the step loop, the commits and the hold sweep use plain loops, not closures;
- `finishState` builds its error message only on failure;
- array lengths are written only when they change, and the rolling-segment probes read no index outside the array;
- the hold multipliers are cleared with a loop, not `fill`.

The OnePlus wasn't attached, so the phone figure is still the 29.6 ms above.

## The Physics Lab

- `pnpm lab tools/physics-lab/scenarios/{roll-out,bank,hole,break}.json` writes `events.json`, `ledger.json` and `timeline.csv`. Every ledger closes to 1e-14 or better (the worst is −3.1e-15, the bank shot).
- `lab-chromium.png` shows the lab page with the break, A (v1, gold) and B (`{ "glass": { "mu": 0.2 } }`, blue) overlaid.
- `pnpm e2e` covers the lab in three engines, and the production build is byte-identical (same chunk hashes, 131.7 KiB of 166 KiB initial JS).

## The 1,000-shot survey (each PR)

A survey script (kept out of the repository; the suites check the same properties) over `randomShot(i·7919 + 1)` for i < 1,000, with keyframes: worst ledger 6.5e-10 (shot 575), worst marble overlap 5.5e-13 m, worst feature overlap 1.2e-10 m, no caps, no errors, 3.3 ms per shot on average (71.5 ms at most), and at most 43 events in a shot.

## The retrofit (2026-10-17 and 18)

After the owner's review, the branch closed the Phase 1 gaps and CodeRabbit's eleven comments (`handoff/phase-01.md`). No outcome changed. Each commit passed `pnpm verify` on its own staged tree, and on the combined tree:

```text
packages/physics, vitest --coverage   17 files, 260 tests pass; 96.3% statements, 91.8% branches, 99.1% functions, 97.1% lines
tools/kpb, vitest                      6 files, 49 tests pass
pnpm e2e                               28 passed, 2 skipped (the footage test runs in Chromium only)
pnpm harness                           PASS: all 5 engines agree (0e4d48c50528e812/727cc953980357c6/67369b3e26944067)
```

- **The harness hashes are the ones above,** so restoring the sort-and-sweep broadphase changed nothing. The break still hashes `b2396155f54ebc61` in 6,182 substeps.
- **KPB 8** passes at 4.9° (9.5 mm on 8 mm) and 9.1° (11 mm on 8 mm).
- **The synthetic dataset was regenerated** with the rim's truth (e = 0.4, μ = 0.25). `kpb15-synthetic.json` is rewritten from it: the true and fitted coefficients pass 48 of 48, v1 35 of 48, and there are 15 estimates.
- **The rim fit, from tracking noise alone:**

  | Fit                                      | edge.e          | edge.mu         |
  | ---------------------------------------- | --------------- | --------------- |
  | Full calibration, 5 repeats              | 0.4083 ± 0.0010 | 0.2534 ± 0.0051 |
  | Full calibration, 2 repeats (the test's) | 0.4036 ± 0.0024 | 0.2484 ± 0.0025 |
  | The rim alone, from v1's 0.5 and 0.3     | 0.3931 ± 0.0006 | 0.2387 ± 0.0042 |
  | The starter set, with natural variation  | 0.420 ± 0.026   | 0.255 ± 0.006   |

  Without variation, e lands up to 11σ from the truth, so the noise-only test holds the rim to 5%. With variation, both are within 1σ.

## A fresh clone

`git clone --branch phase-01-physics-core` of `3c7cf00` into a scratch folder, with Deno on PATH:

```text
pnpm install --frozen-lockfile   exit 0    1 s (from the local pnpm store)
pnpm verify                      exit 0  218 s
pnpm e2e                         exit 0   37 s  (27 passed)
pnpm harness                     exit 0   53 s  (PASS: all 5 engines agree, 0e4d48c50528e812/727cc953980357c6/67369b3e26944067)
```

And again after the retrofit, of `490ecd6`:

```text
pnpm install --frozen-lockfile   exit 0    1 s (from the local pnpm store)
pnpm verify                      exit 0  217 s
pnpm e2e                         exit 0   30 s  (28 passed, 2 skipped: the footage test runs in Chromium only)
pnpm harness                     exit 0   35 s  (PASS: all 5 engines agree, 0e4d48c50528e812/727cc953980357c6/67369b3e26944067)
```
