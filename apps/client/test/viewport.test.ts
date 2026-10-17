import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  BASE_HEIGHT,
  BASE_WIDTH,
  computeViewport,
  INTEGER_FILL_THRESHOLD,
  ZERO_INSETS,
  type ViewportInput,
} from '../src/viewport.ts';

function phone(
  widthPx: number,
  heightPx: number,
  dpr: number,
  insets = ZERO_INSETS,
): ViewportInput {
  return { cssWidth: widthPx / dpr, cssHeight: heightPx / dpr, devicePixelRatio: dpr, insets };
}

describe('computeViewport on real screens', () => {
  it('uses a crisp 4x on a 1080x2400 phone', () => {
    const vp = computeViewport(phone(1080, 2400, 2.625));
    expect(vp).toMatchObject({ mode: 'integer', scale: 4, resolution: 4 });
    expect(vp.cssWidth * 2.625).toBeCloseTo(1080, 9);
  });

  it('uses sharp scaling on a 720x1600 phone instead of a 75% letterbox', () => {
    const vp = computeViewport(phone(720, 1600, 2));
    expect(vp.mode).toBe('sharp');
    expect(vp.scale).toBeCloseTo(720 / 270, 12);
    expect(vp.resolution).toBe(3);
    expect(vp.cssWidth).toBeCloseTo(360, 9);
  });

  it('uses exact 2x on a 540x960 window', () => {
    expect(computeViewport(phone(540, 960, 1))).toMatchObject({
      mode: 'integer',
      scale: 2,
      cssWidth: 540,
      cssHeight: 960,
      cssLeft: 0,
      cssTop: 0,
    });
  });

  it('keeps out of a notch and the gesture bar', () => {
    const insets = { top: 32, right: 0, bottom: 24, left: 0 };
    const vp = computeViewport(phone(1080, 2400, 2.625, insets));
    expect(vp.cssTop).toBeGreaterThanOrEqual(32);
    expect(vp.cssTop + vp.cssHeight).toBeLessThanOrEqual(2400 / 2.625 - 24 + 1e-9);
  });

  it('shrinks smoothly below 1x on a tiny window', () => {
    const vp = computeViewport(phone(135, 240, 1));
    expect(vp).toMatchObject({ mode: 'sharp', scale: 0.5, resolution: 1 });
  });

  it('survives a zero-size or broken window', () => {
    expect(computeViewport(phone(0, 0, 1)).cssWidth).toBe(0);
    const broken = computeViewport({
      cssWidth: Number.NaN,
      cssHeight: 100,
      devicePixelRatio: 0,
      insets: ZERO_INSETS,
    });
    expect(broken).toMatchObject({ scale: 0, resolution: 1, cssWidth: 0 });
  });

  it('treats a broken devicePixelRatio as 1', () => {
    expect(
      computeViewport({
        cssWidth: 540,
        cssHeight: 960,
        devicePixelRatio: Number.NaN,
        insets: ZERO_INSETS,
      }),
    ).toMatchObject({
      mode: 'integer',
      scale: 2,
    });
  });
});

describe('computeViewport properties', () => {
  const input = fc.record({
    cssWidth: fc.double({ min: 100, max: 3000, noNaN: true }),
    cssHeight: fc.double({ min: 100, max: 3000, noNaN: true }),
    devicePixelRatio: fc.constantFrom(1, 1.5, 2, 2.625, 2.75, 3, 3.5, 4),
    insets: fc.record({
      top: fc.double({ min: 0, max: 48, noNaN: true }),
      right: fc.double({ min: 0, max: 48, noNaN: true }),
      bottom: fc.double({ min: 0, max: 48, noNaN: true }),
      left: fc.double({ min: 0, max: 48, noNaN: true }),
    }),
  });

  it('always fits inside the safe area, centred, with the 9:16 aspect kept', () => {
    fc.assert(
      fc.property(input, (i) => {
        const vp = computeViewport(i);
        const px = 1 / i.devicePixelRatio; // corner snapping may move the box by under a device pixel
        expect(vp.cssLeft).toBeGreaterThanOrEqual(i.insets.left - px);
        expect(vp.cssTop).toBeGreaterThanOrEqual(i.insets.top - px);
        expect(vp.cssLeft + vp.cssWidth).toBeLessThanOrEqual(i.cssWidth - i.insets.right + px);
        expect(vp.cssTop + vp.cssHeight).toBeLessThanOrEqual(i.cssHeight - i.insets.bottom + px);
        expect(vp.cssWidth * BASE_HEIGHT).toBeCloseTo(vp.cssHeight * BASE_WIDTH, 6);
      }),
    );
  });

  it('is integer when that fills enough, and otherwise fills exactly', () => {
    fc.assert(
      fc.property(input, (i) => {
        const vp = computeViewport(i);
        const availW = (i.cssWidth - i.insets.left - i.insets.right) * i.devicePixelRatio;
        const availH = (i.cssHeight - i.insets.top - i.insets.bottom) * i.devicePixelRatio;
        const fit = Math.min(availW / BASE_WIDTH, availH / BASE_HEIGHT);
        if (vp.mode === 'integer') {
          expect(Number.isInteger(vp.scale)).toBe(true);
          expect(vp.scale).toBe(Math.floor(fit));
          expect(vp.scale / fit).toBeGreaterThanOrEqual(INTEGER_FILL_THRESHOLD);
          expect(vp.resolution).toBe(vp.scale);
        } else {
          expect(vp.scale).toBeCloseTo(fit, 9);
          expect(Math.floor(fit) / fit).toBeLessThan(INTEGER_FILL_THRESHOLD);
          // Render at or above display size, so the browser only ever scales down.
          expect(vp.resolution).toBeGreaterThanOrEqual(Math.min(vp.scale, 1));
          expect(vp.resolution).toBe(Math.max(1, Math.ceil(fit)));
        }
      }),
    );
  });

  it('puts the canvas corner on a whole device pixel', () => {
    fc.assert(
      fc.property(input, (i) => {
        const vp = computeViewport(i);
        const left = vp.cssLeft * i.devicePixelRatio;
        const top = vp.cssTop * i.devicePixelRatio;
        expect(Math.abs(left - Math.round(left))).toBeLessThan(1e-6);
        expect(Math.abs(top - Math.round(top))).toBeLessThan(1e-6);
      }),
    );
  });
});
