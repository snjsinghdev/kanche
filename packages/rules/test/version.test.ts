import { describe, expect, it } from 'vitest';

import { rulesVersion } from '../src/index.ts';

describe('rulesVersion', () => {
  it('is 1 in Phase 0', () => {
    expect(rulesVersion).toBe(1);
  });
});
