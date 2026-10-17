/**
 * How the 270x480 portrait game is placed on a screen (ADR-0002).
 *
 * Integer first: if a whole number of device pixels per game pixel fills at least 90% of what
 * fits, use it, and every game pixel is a crisp k x k square. Otherwise (common on 720x1600
 * phones, where 2x would leave a quarter of the width empty) render at the next integer up and
 * let the browser scale down smoothly: "sharp bilinear", only slightly soft at pixel edges.
 */

export const BASE_WIDTH = 270;
export const BASE_HEIGHT = 480;
/** Integer scaling must fill at least this share of the fractional fit. */
export const INTEGER_FILL_THRESHOLD = 0.9;

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ViewportInput {
  /** Layout viewport in CSS pixels. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  /** Safe-area insets in CSS pixels (notches, rounded corners, system bars). */
  readonly insets: Insets;
}

export interface Viewport {
  readonly mode: 'integer' | 'sharp';
  /** Device pixels per game pixel on screen. */
  readonly scale: number;
  /** Backing-store pixels per game pixel: the renderer's resolution. Always >= scale or 1. */
  readonly resolution: number;
  /** The canvas box in CSS pixels, centred in the safe area and aligned to device pixels. */
  readonly cssLeft: number;
  readonly cssTop: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
}

export const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

function finiteNonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function computeViewport(input: ViewportInput): Viewport {
  const dpr =
    Number.isFinite(input.devicePixelRatio) && input.devicePixelRatio > 0
      ? input.devicePixelRatio
      : 1;
  const insets = input.insets;
  const left = finiteNonNegative(insets.left);
  const top = finiteNonNegative(insets.top);
  // Work in device pixels so that integer scaling means integer device pixels.
  const availW =
    Math.max(0, finiteNonNegative(input.cssWidth) - left - finiteNonNegative(insets.right)) * dpr;
  const availH =
    Math.max(0, finiteNonNegative(input.cssHeight) - top - finiteNonNegative(insets.bottom)) * dpr;
  const fit = Math.min(availW / BASE_WIDTH, availH / BASE_HEIGHT);

  if (!(fit > 0)) {
    return {
      mode: 'sharp',
      scale: 0,
      resolution: 1,
      cssLeft: left,
      cssTop: top,
      cssWidth: 0,
      cssHeight: 0,
    };
  }

  const k = Math.floor(fit);
  const integer = k >= 1 && k / fit >= INTEGER_FILL_THRESHOLD;
  const scale = integer ? k : fit;
  const resolution = integer ? k : Math.max(1, Math.ceil(fit));
  const devW = BASE_WIDTH * scale;
  const devH = BASE_HEIGHT * scale;
  // Centre, then snap the corner to a whole device pixel so integer mode never straddles pixels.
  const devLeft = Math.round(left * dpr + (availW - devW) / 2);
  const devTop = Math.round(top * dpr + (availH - devH) / 2);
  return {
    mode: integer ? 'integer' : 'sharp',
    scale,
    resolution,
    cssLeft: devLeft / dpr,
    cssTop: devTop / dpr,
    cssWidth: devW / dpr,
    cssHeight: devH / dpr,
  };
}
