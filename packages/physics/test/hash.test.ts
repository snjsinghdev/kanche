import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { Fnv64, hashFloat64s } from '../src/index.ts';

const finite = fc.double({ noNaN: true, noDefaultInfinity: true });

function bytesHash(bytes: readonly number[]): string {
  const h = new Fnv64();
  for (const b of bytes) h.addByte(b);
  return h.digest();
}

describe('Fnv64', () => {
  it('matches the published FNV-1a 64-bit test vectors', () => {
    expect(new Fnv64().digest()).toBe('cbf29ce484222325');
    expect(bytesHash([0x61])).toBe('af63dc4c8601ec8c'); // "a"
    expect(bytesHash([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72])).toBe('85944171f73967e8'); // "foobar"
  });

  it('matches an independent BigInt implementation on arbitrary bytes', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 200 }), (bytes) => {
        let h = 0xcbf29ce484222325n;
        for (const b of bytes) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
        expect(bytesHash(bytes)).toBe(h.toString(16).padStart(16, '0'));
      }),
    );
  });

  it('hashes uint32 values little-endian', () => {
    expect(new Fnv64().addUint32(0x64636261).digest()).toBe(bytesHash([0x61, 0x62, 0x63, 0x64]));
  });

  it('rejects values that are not uint32 integers', () => {
    for (const bad of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(() => new Fnv64().addUint32(bad)).toThrow(RangeError);
    }
  });
});

describe('hashFloat64s', () => {
  it('is a pure function of its input', () => {
    fc.assert(
      fc.property(fc.array(finite), (values) => {
        expect(hashFloat64s(values)).toBe(hashFloat64s([...values]));
        expect(hashFloat64s(values)).toMatch(/^[0-9a-f]{16}$/);
      }),
    );
  });

  it('changes when any single bit of any value changes', () => {
    fc.assert(
      fc.property(
        fc.array(finite, { minLength: 1 }),
        fc.nat(),
        fc.integer({ min: 0, max: 63 }),
        (values, at, bit) => {
          const i = at % values.length;
          const view = new DataView(new ArrayBuffer(8));
          view.setFloat64(0, values[i] ?? 0, true);
          const byte = bit >> 3;
          view.setUint8(byte, view.getUint8(byte) ^ (1 << (bit & 7)));
          const flipped = view.getFloat64(0, true);
          fc.pre(Number.isFinite(flipped));
          const changed = values.slice();
          changed[i] = flipped;
          expect(hashFloat64s(changed)).not.toBe(hashFloat64s(values));
        },
      ),
    );
  });

  it('tells +0 from -0', () => {
    expect(hashFloat64s([0])).not.toBe(hashFloat64s([-0]));
  });

  it('fails fast on non-finite values', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => hashFloat64s([1, bad])).toThrow(/non-finite/);
    }
  });

  it('rejects holes in sparse input', () => {
    const sparse: number[] = [];
    sparse[1] = 2;
    expect(() => hashFloat64s(sparse)).toThrow(/hole at index 0/);
  });
});
