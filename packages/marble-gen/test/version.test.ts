import { describe, expect, it } from 'vitest';

import { genomeVersion } from '../src/index.ts';

describe('genomeVersion', () => {
  it('is 1 in Phase 0', () => {
    expect(genomeVersion).toBe(1);
  });
});
