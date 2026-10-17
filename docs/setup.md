# Local setup

Everything needed to run `pnpm verify`, the e2e tests, the determinism harness and the Android debug build on a fresh machine. The versions are pins, and ADR-0001 records why each was chosen.

## 1. Prerequisites

| Tool                | Version                        | Install                                                                                                                                                           |
| ------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node                | 24.22.0 (LTS, `.nvmrc`)        | `nvm install` in the repo root                                                                                                                                    |
| pnpm                | 12.11.2 (`packageManager`)     | `corepack enable` (corepack ships with Node 24)                                                                                                                   |
| Deno                | 2.9.7                          | `curl -fsSL https://dl.deno.land/release/v2.9.7/deno-x86_64-unknown-linux-gnu.zip -o deno.zip && unzip deno.zip -d ~/.deno/bin`, then add `~/.deno/bin` to `PATH` |
| Playwright browsers | from `@playwright/test` 1.64.0 | `pnpm exec playwright install chromium webkit firefox`                                                                                                            |
| JDK                 | 21                             | e.g. `apt install openjdk-21-jdk`; set `JAVA_HOME`                                                                                                                |
| Android SDK         | platform 36, build-tools 35+   | Android Studio or the command-line tools. `export ANDROID_HOME=$HOME/Android/Sdk`                                                                                 |
| Xcode (macOS only)  | 26                             | iOS builds; on Linux, CI's on-demand `ios-simulator` job (`ios.yml`) covers this                                                                                  |

`package.json` pins the Node and pnpm versions under `engines`, and `engineStrict` makes a mismatch fail the install.

## 2. Install and verify

```sh
corepack enable
pnpm install
pnpm verify        # typecheck, lint, test, build, budgets
pnpm e2e           # Playwright: Chromium, WebKit, Firefox
pnpm harness       # cross-engine determinism: Node, Deno, Chromium, WebKit, Firefox
```

The install refuses any dependency version published less than 7 days ago (`minimumReleaseAge`), and runs install scripts only for packages listed under `allowBuilds` (esbuild). pnpm also lists "agent skills awaiting approval" for `pixi.js`. They're left unapproved; nothing in the build needs them.

### Optional: the KPB 14 reference script

`tools/kpb/reference/pooltool_mathavan.py` regenerates the pooltool reference values. It needs `python3` with numpy, and the pooltool 0.6.0 wheel if you want `--wheel` to check the vendored source. It is never part of `pnpm verify` or CI, because its output is committed (ADR-0007).

### WebKit on Ubuntu without sudo

Playwright's WebKit needs `libavif16`, which isn't installed by default. With sudo, run `sudo pnpm exec playwright install-deps webkit`. Without sudo, put the libraries into WebKit's own bundled library folder:

```sh
mkdir -p /tmp/webkit-deps && cd /tmp/webkit-deps
apt-get download libavif16 libgav1-1 libyuv0
for f in *.deb; do dpkg-deb -x "$f" x; done
cp -a x/usr/lib/x86_64-linux-gnu/*.so* ~/.cache/ms-playwright/webkit-*/minibrowser-wpe/sys/lib/
```

Repeat this after Playwright installs a new WebKit revision. CI is unaffected, because it runs in Playwright's own container image.

## 3. Environment and secrets

- `.env.example` (repository root) lists the **public** client keys (`VITE_*`). Copy it to `.env.local` and fill it in; Vite reads it because `envDir` is the repo root. Anything prefixed `VITE_` ships to every player, so never put a secret there.
- `supabase/functions/.env.example` lists the custom server secrets (none yet). The Edge Runtime injects the `SUPABASE_*` keys itself. Copy it to `supabase/functions/.env`, which is git-ignored. Production secrets are set with `supabase secrets set`.
- `.gitignore` excludes every `.env*` except the examples. No secrets are in git.

## 4. Android debug build

```sh
export ANDROID_HOME=$HOME/Android/Sdk
echo "sdk.dir=$ANDROID_HOME" > apps/client/android/local.properties   # git-ignored
pnpm android:debug
```

This builds `--mode debug`, runs `cap sync android`, then `gradlew assembleDebug`. The APK is `apps/client/android/app/build/outputs/apk/debug/app-debug.apk` (app ID `com.jupiterlabtech.kanche.dev`).

Install it and launch it on a device or emulator:

```sh
ADB=$ANDROID_HOME/platform-tools/adb
$ADB -s <serial> install -r apps/client/android/app/build/outputs/apk/debug/app-debug.apk
$ADB -s <serial> shell monkey -p com.jupiterlabtech.kanche.dev -c android.intent.category.LAUNCHER 1
$ADB -s <serial> exec-out screencap -p > screen.png
```

- `cap run android --target` rejects emulator serials. Build with Gradle and install with adb as above.
- **The low-end stand-in** is an API 30 Google Play image at 720×1280 with 2 GB and two cores. Boot it headless with `$ANDROID_HOME/emulator/emulator -avd <name> -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -port 5558`. Its stock WebView (83) is too old: the build targets Chrome 111+ (ADR-0002), so update the WebView through Play first.
- **Debugging the WebView** of a debug build works without Chrome:
  1. Find the socket with `adb shell cat /proc/net/unix | grep webview_devtools_remote`.
  2. Forward it with `adb forward tcp:9333 localabstract:<name>`.
  3. Open `http://127.0.0.1:9333/json` to get a DevTools WebSocket. `window.__kanche.viewport()` is available in debug builds.
- Some phones (OnePlus/ColorOS, Xiaomi) ask you to confirm USB installs on the unlocked screen. An `adb install` waits until you do.

## 5. iOS

`apps/client/ios` was generated by `cap add ios` and uses Swift Package Manager. On a Mac, run `pnpm --filter @kanche/client ios:sync`, then open `apps/client/ios/App/App.xcodeproj`. CI's `ios-simulator` job (`.github/workflows/ios.yml`) builds it unsigned for the simulator, on demand: label a PR `ios`, or run the workflow by hand. Device builds need signing (Phase 11).
