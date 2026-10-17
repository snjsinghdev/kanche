// A deliberate violation, kept as evidence that the determinism lint works (Phase 0 gate).
// The normal lint run ignores this folder; tools/eslint-plugin-kanche/test/repo-config.test.ts
// lints it with the real repository config and expects kanche/no-banned-math to fail it.
export function launchHeight(speed: number, angle: number): number {
  return speed * Math.sin(angle);
}
