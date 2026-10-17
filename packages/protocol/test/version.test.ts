import { describe, expect, it } from 'vitest';

import { protocolVersion } from '../src/index.ts';

describe('protocolVersion', () => {
  it('is 1 in Phase 0', () => {
    expect(protocolVersion).toBe(1);
  });
});
