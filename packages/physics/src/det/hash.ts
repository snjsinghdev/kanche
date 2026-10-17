/**
 * 64-bit FNV-1a over the exact bytes of IEEE-754 doubles (little-endian), computed with four
 * 16-bit limbs so every intermediate value is an exact small integer in any engine.
 *
 * The hash is the determinism contract's witness: two engines agree on a simulation only if they
 * agree on every bit of its state. Non-finite values are a bug in the simulation, so they throw
 * instead of being hashed (MECHANICS-REVIEW finding 5). +0 and -0 hash differently on purpose.
 */

// FNV-64 offset basis 0xcbf29ce484222325, as 16-bit limbs, least significant first.
const OFFSET_BASIS: readonly [number, number, number, number] = [0x2325, 0x8422, 0x9ce4, 0xcbf2];

export class Fnv64 {
  #h0 = OFFSET_BASIS[0];
  #h1 = OFFSET_BASIS[1];
  #h2 = OFFSET_BASIS[2];
  #h3 = OFFSET_BASIS[3];
  readonly #view = new DataView(new ArrayBuffer(8));

  /** Mix one byte (0-255). */
  addByte(byte: number): this {
    this.#h0 ^= byte & 0xff;
    // Multiply by the FNV-64 prime 0x100000001b3 = 2^40 + 0x1b3, modulo 2^64.
    // In 16-bit limbs the prime is [0x01b3, 0, 0x0100, 0]; every partial product is < 2^26.
    const r0 = this.#h0 * 0x1b3;
    const r1 = this.#h1 * 0x1b3 + (r0 >>> 16);
    const r2 = this.#h2 * 0x1b3 + this.#h0 * 0x100 + (r1 >>> 16);
    const r3 = this.#h3 * 0x1b3 + this.#h1 * 0x100 + (r2 >>> 16);
    this.#h0 = r0 & 0xffff;
    this.#h1 = r1 & 0xffff;
    this.#h2 = r2 & 0xffff;
    this.#h3 = r3 & 0xffff;
    return this;
  }

  /** Mix an unsigned 32-bit integer, little-endian. */
  addUint32(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new RangeError(`addUint32 needs an integer in [0, 2^32 - 1], got ${String(value)}`);
    }
    this.#view.setUint32(0, value, true);
    for (let i = 0; i < 4; i += 1) this.addByte(this.#view.getUint8(i));
    return this;
  }

  /** Mix the 8 bytes of a finite double, little-endian. */
  addFloat64(value: number): this {
    if (!Number.isFinite(value)) {
      throw new RangeError(`non-finite value in simulation state: ${String(value)}`);
    }
    this.#view.setFloat64(0, value, true);
    for (let i = 0; i < 8; i += 1) this.addByte(this.#view.getUint8(i));
    return this;
  }

  /** The hash as 16 lowercase hex digits. */
  digest(): string {
    return [this.#h3, this.#h2, this.#h1, this.#h0]
      .map((limb) => limb.toString(16).padStart(4, '0'))
      .join('');
  }
}

/** Hash a list of finite doubles. */
export function hashFloat64s(values: ArrayLike<number>): string {
  const h = new Fnv64();
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === undefined) throw new RangeError(`hole at index ${String(i)}`);
    h.addFloat64(v);
  }
  return h.digest();
}
