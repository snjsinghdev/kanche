# Phase 0 evidence

Recorded on 2026-10-17 on the owner's Linux machine (Ubuntu 24.04, 4 cores, 15 GB) unless marked CI.

## Cross-engine determinism (`pnpm harness`, 1,000 seeds × 480 steps)

```text
engine    version       combined hash     time
--------  ------------  ----------------  -------
node      v24.22.0      0e4d48c50528e812  1263 ms
deno      2.9.7         0e4d48c50528e812  640 ms
chromium  156.0.8078.4  0e4d48c50528e812  873 ms
webkit    27.2          0e4d48c50528e812  1113 ms
firefox   157.0         0e4d48c50528e812  1996 ms

PASS: all 5 engines agree (0e4d48c50528e812).
```

The probe's golden hashes (`packages/physics/test/probe.test.ts`) are reproduced under Deno by `supabase/functions/health/handler.test.ts`. The RNG and the hash match independent BigInt implementations (`rng.test.ts`, `hash.test.ts`).

## The determinism lint fails on `Math.sin` inside packages/physics

`pnpm exec eslint --no-ignore packages/physics/test/determinism-fixtures/calls-math-sin.ts` exits 1:

```text
  5:18  error  Math.sin is not exactly specified across engines. Simulation code may use only Math.sqrt/abs/min/max/floor/ceil/trunc/round/sign/imul/fround/clz32 (ADR-0004)  kanche/no-banned-math
```

`tools/eslint-plugin-kanche/test/repo-config.test.ts` runs the same check in `pnpm test`, plus RuleTester suites for every rule in both directions (120 cases).

## Gates fail when broken (checked by hand)

- Remove `packages/physics/test/probe.test.ts`, and the physics tests fail the coverage gate: lines 70.27%, branches 78.57%, statements 69.67% against 90%, exit 1. The file was restored afterwards.
- Set `web.initialJsGzipBytes` to 100,000 bytes, and `pnpm budgets` reports `FAIL ... 131.7 KiB of 97.7 KiB (135%)` and exits 1.
- Add `window`, `document`, `setTimeout` or `process` to `packages/physics/src`, and `tsc -b` fails with TS2304/TS2584/TS2591.

## Budgets (`pnpm budgets --android …`)

```text
PASS  web.initialJsGzipBytes       131.7 KiB of   166.0 KiB (79%)
PASS  assets.artBytes                    0 B of    6.00 MiB (0%)
PASS  assets.audioBytes                  0 B of    8.00 MiB (0%)
PASS  android.downloadBytes         4.74 MiB of   30.00 MiB (16%)   (debug APK, an upper bound)
```

## Web canvas (Playwright, `pnpm e2e`)

15 of 15 pass on Chromium 156, WebKit 27.2 (DPR 2) and Firefox 157. The checks cover integer 2× at 540×960, the backing size, sampled pixels (ground, shooter, chalk ring), the 9:16 fit in an 800×600 window, relayout on resize, and an empty page body. Screenshot: `web-chromium-540x960.png`.

## Android: the low-end stand-in

`fuselings_low_api30`: API 30, Google Play image, 720×1280 at 320 dpi, 2 GB, 2 cores, WebView 155.0.8059.43. Debug APK installed with `adb install -r` and launched. Screenshot: `android-api30-low-720x1280.png`.

Read from the WebView over DevTools:

```json
{
  "ua": "Chrome/155.0.8059.43",
  "dpr": 2,
  "inner": [360, 640],
  "vp": {
    "mode": "sharp",
    "scale": 2.3667,
    "resolution": 3,
    "cssLeft": 20.5,
    "cssTop": 24,
    "cssWidth": 319.5,
    "cssHeight": 568
  },
  "canvas": [810, 1440],
  "probe": "24px / 48px"
}
```

The status bar (24 CSS px) and navigation bar (48 CSS px) reach the page as safe-area insets (edge-to-edge works). Integer 2× would fill 84% < 90%, so the canvas uses sharp 2.37×, rendered at 3× and scaled down.
