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
    // Playback advances the time slider, and the table has rows of values under its header.
    await expect.poll(() => page.locator('#time').inputValue()).not.toBe('0');
    await expect(page.locator('#values tr:has(td)')).not.toHaveCount(0);
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

  test('overlays footage under the simulation, in step with it', async ({ page, browserName }) => {
    // The test makes its clip with MediaRecorder's WebM, which Chromium writes; the overlay
    // itself is plain <video> drawing, the same in every engine.
    test.skip(browserName !== 'chromium', 'the clip is recorded with Chromium');
    await page.setViewportSize({ width: 1200, height: 800 });
    await ready(page);
    const clip = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const g = c.getContext('2d');
      if (g === null) throw new Error('no 2D context');
      const stream = c.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const parts: Blob[] = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      const done = new Promise((resolve) => (rec.onstop = resolve));
      rec.start();
      const until = performance.now() + 600;
      while (performance.now() < until) {
        g.fillStyle = '#ff0000';
        g.fillRect(0, 0, 64, 64);
        await new Promise((r) => setTimeout(r, 30));
      }
      rec.stop();
      await done;
      const bytes = new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer());
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    });
    // Frame the footage over the whole view, so the centre pixel shows it.
    await page.locator('#videoRect').fill('-5,-5,5,5');
    await page.locator('#video').setInputFiles({
      name: 'clip.webm',
      mimeType: 'video/webm',
      buffer: Buffer.from(clip, 'base64'),
    });
    await expect.poll(() => page.evaluate(() => window.__kancheLab?.videoReady())).toBe(true);
    const red = await page.locator('#view').evaluate((c: HTMLCanvasElement) => {
      const g = c.getContext('2d');
      return g?.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data[0];
    });
    // Footage at 60% over the dark ground: red well above the background's 0x15.
    expect(red).toBeGreaterThan(100);
  });
});
