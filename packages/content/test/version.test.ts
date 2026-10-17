import { describe, expect, it } from 'vitest';

import { contentSchemaVersion } from '../src/index.ts';

describe('contentSchemaVersion', () => {
  it('is 1 in Phase 0', () => {
    expect(contentSchemaVersion).toBe(1);
  });
});
