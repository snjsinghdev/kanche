import { describe, expect, it } from 'vitest';

import { aiVersion } from '../src/index.ts';

describe('aiVersion', () => {
  it('is 1 in Phase 0', () => {
    expect(aiVersion).toBe(1);
  });
});
