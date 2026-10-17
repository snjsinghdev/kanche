# Architecture

C4-style views of Kanche: the context, the containers, then the components inside each. Decisions behind it are in `adr/`.

## 1. Context

```text
                    +-----------------------------+
   Player  ------>  |           Kanche            |  ------>  Google Play / App Store (install, unlock receipts)
 (phone or browser) |  street marbles for keeps   |  ------>  WhatsApp (share cards, challenge links)
                    +-----------------------------+  ------>  FCM (push), RevenueCat (unlock), Sentry, PostHog
```

- **Players** play offline practice against the neighbourhood kids, play for keeps against kids and friends, collect and name marbles, and craft new ones in the furnace.
- **External systems** distribute the app, verify the one unlock purchase, carry share links, send nudges, and report crashes and product metrics. Child mode limits analytics and notifications.

## 2. Containers

```text
                              shot inputs, challenges, claims
             +---------------------------------------------------------------+
             |                                                               v
+------------------------+      +------------------------+      +------------------------+
| Phone and web app      |      | Shared TypeScript core |      | Supabase backend       |
| apps/client            |      | packages/*             |      | supabase/              |
| PixiJS renderer        |----->| physics                |<-----| Edge Functions (Deno)  |
| Game app               |      | rules                  |      | Postgres + RLS         |
| AI worker              |      | ai, marble-gen         |      | Auth                   |
| Capacitor shells       |      | protocol, content      |      |                        |
+------------------------+      +------------------------+      +------------------------+
```

| Container         | Technology                                              | Responsibility                                                                                                                                  |
| ----------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone and web app | Vite, PixiJS 8 (WebGL), Capacitor 8 for Android and iOS | Rendering, input, audio, haptics. Runs offline practice and the kids in a Web Worker. Sends only shot inputs.                                   |
| Shared core       | Strict TypeScript, platform-free, deterministic         | Physics, rules, AI, genomes, wire formats and content schemas. The same source runs in browsers, WebViews, Node and Deno.                       |
| Backend           | Supabase: Postgres, Auth, Edge Functions on Deno        | Owns marbles. Re-runs every shot with the shared core at the match's pinned versions, then writes append-only ledger events in one transaction. |

The arrows mean "imports". The app sends only shot inputs, and the server re-simulates each shot before any marble changes hands (ADR-0004, ADR-0005).

## 3. Components

### Shared core (`packages/`)

| Package      | May import         | Determinism lint   | Contents (Phase 0 → later)                                                                                                                                    |
| ------------ | ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `physics`    | nothing            | yes                | `physicsVersion`, `createRng`, `Fnv64`/`hashFloat64s`, `determinismProbe` → Phase 1: the RK4 sphere-on-ground simulation, impacts, hole, flick, energy ledger |
| `rules`      | `physics`          | yes                | `rulesVersion` → Phase 2: Ring, Hit and Hole, the lag, stakes and transfers                                                                                   |
| `ai`         | `physics`, `rules` | yes                | `aiVersion` → Phase 5: six personalities, the ladder                                                                                                          |
| `protocol`   | `physics`, `rules` | no (platform-free) | `protocolVersion` → shot inputs, challenges, claims                                                                                                           |
| `marble-gen` | nothing            | `src/genome` only  | `genomeVersion` → Phase 4: genome, descriptions                                                                                                               |
| `content`    | nothing            | no (platform-free) | `contentSchemaVersion` → Phase 10: courts, series, events as data                                                                                             |
| `testkit`    | nothing            | no                 | Vitest preset (with the coverage gate), `spreadSeeds`                                                                                                         |

Three walls enforce the boundaries:

1. **Types.** Each core package's `tsconfig.lib.json` has `lib: ["ES2023"]` and `types: []`. DOM and Node globals don't exist there.
2. **Lint.** `eslint.config.js` restricts imports per package: no `pixi.js`, `@capacitor/*`, `@supabase/*`, app code, Node built-ins or unlisted `@kanche` packages. It also restricts platform globals.
3. **Determinism lint.** `tools/eslint-plugin-kanche` covers simulation code (ADR-0004).

### Phone and web app (`apps/client`)

| Component            | File(s)                                           | Notes                                                                                                 |
| -------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Boot and render loop | `src/main.ts`                                     | Pixi `Application`, `autoStart: false` while the scene is static (Phase 3 adds the loop)              |
| Viewport             | `src/viewport.ts`, `src/safe-area.ts`             | 270×480 base, integer-first scaling with the sharp-bilinear fallback, inside the safe area (ADR-0002) |
| Scene                | `src/scene.ts`, `src/layout.ts`, `src/palette.ts` | The wordless Phase 0 test scene                                                                       |
| Test hook            | `src/test-hook.ts`                                | `window.__kanche`, non-production builds only                                                         |
| Native shells        | `android/`, `ios/`                                | Capacitor 8. `MainActivity` enables edge-to-edge.                                                     |

### Backend (`supabase/`)

| Component          | Notes                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| `functions/health` | Returns `physicsVersion` and `rulesVersion`, proving the shared core runs on Deno |
| `migrations/`      | The ledger and its invariants arrive in Phase 6                                   |
| `tests/`           | pgTAP from Phase 6                                                                |

### Tooling (`tools/`)

| Tool                        | Purpose                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `eslint-plugin-kanche`      | Determinism rules, tested both ways, plus a gate test that lints the `Math.sin` fixture with the real config            |
| `determinism`               | Bundles one ESM file and runs it in 5 engines; the hashes must match                                                    |
| `budgets`                   | `budgets.json` checks: initial JS gzip, art, audio, Android download, frame times per device tier (from device reports) |
| `scripts/require-checks.sh` | Makes CI jobs required checks (needs a public repo or GitHub Pro)                                                       |

## 4. Quality gates in CI

`.github/workflows/ci.yml` runs on every PR and on `main`:

| Job                                 | Runs                                                               |
| ----------------------------------- | ------------------------------------------------------------------ |
| `verify`                            | Typecheck, lint, unit and Deno tests with coverage, build, budgets |
| `e2e (chromium / webkit / firefox)` | Playwright in its pinned container                                 |
| `determinism`                       | The 5-engine harness                                               |
| `android-debug`                     | Debug APK and its size budget                                      |

`nightly.yml` repeats all of it with 10,000 harness seeds on days `main` changed, and runs `pnpm audit` every night. `ios.yml` builds the iOS app for the simulator on demand (a PR labelled `ios`, or a manual run), because macOS minutes count 10× against the plan.
