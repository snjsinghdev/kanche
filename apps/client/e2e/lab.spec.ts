import { expect, test, type Page } from '@playwright/test';

/** The Physics Lab route: in e2e and debug builds only (vite.config.ts). */
async function ready(page: Page): Promise<void> {
  await page.goto('/lab.html');
  await page.waitForFunction(() => window.__kancheLab?.ready === true);
}

test.describe('the Physics Lab', () => {
  test('simulates the KPB 16 break with the same hash as Node', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await ready(page);
    const runs = await page.evaluate(() => window.__kancheLab?.runs());
    // packages/physics/scripts/bench.ts reports this hash for the break in Node.
    expect(runs?.a?.hash).toBe('b2396155f54ebc61');
    expect(runs?.b).toBeNull();
    const size = await page
      .locator('#view')
      .evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
    expect(size[0]).toBeGreaterThan(100);
    await page.locator('#play').click();
    await expect(page.locator('#values tr')).not.toHaveCount(0);
  });

  test('runs a second parameter set over the first, and overlays a tracked CSV', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await ready(page);
    await page.locator('#scenario').selectOption('roll-out');
    await page.locator('#overrides').fill('{ "surfaces": { "cement": { "muR": 0.012 } } }');
    await page.locator('#run').click();
    const runs = await page.evaluate(() => window.__kancheLab?.runs());
    expect(runs?.b?.hash).toBeDefined();
    expect(runs?.b?.hash).not.toBe(runs?.a?.hash);
    expect(runs?.b?.duration).toBeLessThan(runs?.a?.duration ?? 0);
    const rows = Array.from({ length: 50 }, (_, k) => `${String(k / 30)}\t${String(0.02 * k)}\t0`);
    await page.locator('#overlay').setInputFiles({
      name: 'tracked.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(['mass A', 't\tx\ty', ...rows].join('\n')),
    });
    await expect.poll(() => page.evaluate(() => window.__kancheLab?.overlayPoints())).toBe(50);
    await page.locator('#overrides').fill('{ "nonsense": 1 }');
    await page.locator('#run').click();
    expect(await page.evaluate(() => window.__kancheLab?.error())).toMatch(/unknown key/);
  });
});
