# Calibrating the physics: filming and fitting

Every coefficient in `PARAMS_V1` is a PLACEHOLDER until real marbles are filmed and the KPB fits are run on the footage. This page is the protocol. It is the owner's task, because it needs real marbles, real ground and a phone on a tripod. The tools are in `tools/kpb` (ADR-0007), and the scores go in [`kpb.md`](kpb.md).

## Equipment

- A phone that films **240 fps** (slow motion). Use higher for impacts if it allows. Fix the exposure, keep the shutter fast, and light the ground well.
- A **tripod or overhead rig**, so the camera looks straight down. Tilt turns distances into errors that vary across the frame.
- A **ruler** (1 m) and a **grid** (chalk or tape, 10 cm squares) on the ground in frame, to calibrate the scale and check for lens distortion.
- Marbles of each size class (16, 19 and 22 mm), each with **a line drawn round it**, so spin shows.
- A **ramp** for repeatable launches: a grooved board at a fixed height and angle. A marble leaving it is rolling, and the ramp's height sets its speed. For stunned launches, a striker that hits the marble at centre height.
- **Tracker** (Open Source Physics, physlets.org/tracker) to track the marbles frame by frame.

## Surfaces and repeats

Film on smooth cement, packed dirt, ceramic tile, sand and wet cement. Repeat **every condition at least five times**, because the repeats' spread is the scatter the pass mark is measured against. Film ten repeats where you can for the slides and impacts (`kpb.md`, "The pass mark with five repeats"). Keep a note of each surface: its temperature, how damp it is, and what it is made of.

| Kind (dataset `kind`) | Set-up                                                                                                                                         | Fits                              | Scored on                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------- |
| `roll`                | Off the ramp on open ground at two speeds (about 0.6 and 1.0 m/s); film until the marble stops. Long rolls on tile and cement show drag        | μR per surface, and Cd            | roll-out, rest position                        |
| `stun`                | Struck at centre height, so it slides with no spin, at about 1.2 m/s                                                                           | μS per surface                    | slide time, roll-out, rest position            |
| `head-on`             | Off the ramp into a still marble 0.25 m away, dead centre, at three speeds (0.5, 1 and 2 m/s)                                                  | e(v), glass on glass              | speed ratios, rest positions                   |
| `cut`                 | Off the ramp into a still marble 0.3 m away, offset for 30° and 45° cuts                                                                       | μBB, glass on glass               | departure angles, speed ratios, rest positions |
| `bank`                | Off the ramp at 45° into a wall                                                                                                                | (wall e and μ, later)             | bank angle, rest position                      |
| `hole`                | Off the ramp at the hole, dead centre and offset by 0.8 and 1.0 of its radius                                                                  | (the rim model, later)            | capture                                        |
| `flick`               | A real finger flick, centred, of each marble size at a soft and a hard setting. Track the fingertip too: its speed at contact is `fingerSpeed` | the finger's mass and restitution | (fit only)                                     |

### Filming for an accurate launch

The simulation replays each filmed shot from its measured launch, so the launch must be measured well.

- **Track the approach.** The launch is fitted from the first frames, over up to 0.3 s for a rolling marble and 0.06 s for a stunned one, and never past the moment another marble starts to move.
- **A cut magnifies any error in the aim about tenfold.** Put the target at least 0.3 m from the ramp, and let the marble roll at least that far in frame.
- Keep the ramp's position and aim fixed between repeats. The repeats' spread should come from the marbles and the ground, not from the set-up.

## Tracking

1. Open the clip in Tracker and set the frame rate. Calibrate the scale with the ruler, in metres. Put the origin and axes on the grid, with x along the shot.
2. Add one point mass per marble and mark its centre on every frame you can. Short gaps of up to three frames are filled by interpolation. Longer gaps are refused.
3. Export each marble as its own file: File → Export → Data, columns t, x and y, with tab, comma or semicolon delimiters. The importer reads units in the header (for example `x (cm)`) and a decimal comma.

## Building the dataset

Add each recording to `packages/testkit/kpb/filmed-v1.json`, which is created on the first import:

```sh
pnpm kpb import --dataset packages/testkit/kpb/filmed-v1.json \
  --id "roll tile 0.6 #1" --condition "roll tile 0.6 m/s" --kind roll --surface tile \
  --launch rolling --shooter 1:r80:exports/roll-tile-06-1.txt [--unit cm] [--court court.json]

pnpm kpb import ... --kind head-on --launch rolling \
  --shooter 1:r80:exports/head-1-shooter.txt --marble 2:r80:exports/head-1-target.txt

pnpm kpb import ... --kind flick --launch stun --shooter 1:r95:exports/flick-1.txt --finger-speed 1.83
```

- Repeats share `--condition`.
- `--court` gives a `CourtSpec` (walls, the hole, the surface). Without one, the court is open ground of `--surface` around the tracks.
- The importer measures each launch, and writes the dataset with `synthetic: false`.

## Fitting and scoring

```sh
pnpm kpb fit packages/testkit/kpb/filmed-v1.json --out fitted.json   # estimates ± errors
pnpm kpb score packages/testkit/kpb/filmed-v1.json                    # v1 as it stands
pnpm kpb score packages/testkit/kpb/filmed-v1.json --params fitted.json --strict
```

**How the fits work.** They replay every recording through the simulation with candidate coefficients and compare frame by frame, each recording fitting its own launch. They run in order, each using the ones before it:

1. μR and Cd;
2. μS;
3. e(v) and μBB together;
4. the finger.

**Reading the errors.** They are cluster-robust over recordings. With few recordings, read them with Student's t at (recordings − 1) degrees of freedom; `t3()` in `tools/kpb/src/fit.ts` gives the ±3σ-equivalent factor.

**The score.** A metric passes when the RMS of simulated minus filmed, over the repeats, is at most 1.5 times the filmed repeats' own scatter.

## From fitted values to a physics version

Fitted values change outcomes, so they ship as a new physics version: `PARAMS_V2` with `physicsVersion` 2. v1 stays runnable for live matches (ADR-0006). The new version's scores are recorded in `kpb.md`. A coefficient loses its PLACEHOLDER mark only when it was fitted to footage, and its comment names the dataset.
