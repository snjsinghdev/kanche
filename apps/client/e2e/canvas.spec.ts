import { expect, test, type Page } from '@playwright/test';

import { PALETTE } from '../src/palette.ts';
import { RING, SHOOTER } from '../src/layout.ts';

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__kanche?.ready === true);
}

function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

test.describe('the Phase 0 canvas', () => {
  test('renders the 270x480 scene with crisp integer pixels in a 540x960 window', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 540, height: 960 });
    await ready(page);
    // Desktop Safari runs at devicePixelRatio 2, the others at 1: 2 CSS px per game px either way.
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('data-mode', 'integer');
    await expect(canvas).toHaveAttribute('data-scale', String(2 * dpr));
    await expect(canvas).toHaveAttribute('data-physics-version', '1');
    await expect(canvas).toHaveAttribute('data-rules-version', '1');
    const box = await canvas.boundingBox();
    expect(box).toEqual({ x: 0, y: 0, width: 540, height: 960 });
    const size = await canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
    expect(size).toEqual([540 * dpr, 960 * dpr]);
  });

  test('draws the ground, the shooter and the chalk ring', async ({ page }) => {
    await page.setViewportSize({ width: 540, height: 960 });
    await ready(page);
    const at = (x: number, y: number) =>
      page.evaluate(([px, py]) => window.__kanche?.sample(px, py), [x, y] as const);
    const near = (actual: readonly number[] | undefined, ...hexes: number[]): void => {
      expect(hexes.map(rgb)).toContainEqual(actual?.slice(0, 3));
    };
    near(await at(2, 470), PALETTE.dirt, PALETTE.dirtDark, PALETTE.dirtLight);
    near(await at(SHOOTER.x, SHOOTER.y), PALETTE.shooter);
    near(await at(RING.x, RING.y - RING.r), PALETTE.chalk);
  });

  test('keeps the 9:16 game inside odd window shapes', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await ready(page);
    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;
    expect(box.height).toBeLessThanOrEqual(600);
    expect(box.width / box.height).toBeCloseTo(270 / 480, 3);
    expect(box.x + box.width / 2).toBeCloseTo(400, 0);
  });

  test('re-lays out when the window turns', async ({ page }) => {
    await page.setViewportSize({ width: 540, height: 960 });
    await ready(page);
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    await page.setViewportSize({ width: 1080, height: 1920 });
    await expect(page.locator('canvas')).toHaveAttribute('data-scale', String(4 * dpr));
  });

  test('re-lays out when the safe area changes without a resize event', async ({ page }) => {
    await page.setViewportSize({ width: 540, height: 960 });
    await ready(page);
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('data-mode', 'integer');
    // What Capacitor's SystemBars plugin does when the insets arrive after the first layout.
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-area-inset-top', '48px');
    });
    // 912 px tall leaves fit 1.9: integer 1x would fill 53%, so the canvas goes sharp.
    await expect(canvas).toHaveAttribute('data-mode', 'sharp');
    const box = await canvas.boundingBox();
    expect(box?.y).toBeGreaterThanOrEqual(48 - 1);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(960 + 1);
  });

  test('shows no words on screen (wordless first)', async ({ page }) => {
    await ready(page);
    expect((await page.locator('body').innerText()).trim()).toBe('');
  });
});
