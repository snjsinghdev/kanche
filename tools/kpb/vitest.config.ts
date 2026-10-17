import { mergeConfig } from 'vitest/config';

import { packageTestConfig } from '@kanche/testkit/vitest';

// Every test here replays recordings through the simulation, so `pnpm test` runs this package
// without coverage instrumentation (which slows the simulation about tenfold); it has no gate.
export default mergeConfig(packageTestConfig({ coverageGate: false }), {
  test: { testTimeout: 60_000 },
});
