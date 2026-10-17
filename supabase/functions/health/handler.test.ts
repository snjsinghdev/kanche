import { assertEquals } from '@std/assert';

import { handleHealth } from './handler.ts';

Deno.test('GET /health reports the shared core versions', async () => {
  const res = handleHealth(new Request('http://localhost/health'));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('cache-control'), 'no-store');
  assertEquals(await res.json(), { ok: true, physicsVersion: 1, rulesVersion: 1 });
});

Deno.test('other methods are refused', () => {
  const res = handleHealth(new Request('http://localhost/health', { method: 'POST' }));
  assertEquals(res.status, 405);
  assertEquals(res.headers.get('allow'), 'GET');
});

Deno.test('the shared physics core runs under Deno with the same hash as Node', async () => {
  const { determinismProbe } = await import('@kanche/physics');
  // The same frozen value as packages/physics/test/probe.test.ts.
  assertEquals(determinismProbe(0, 240).hash, GOLDEN_PROBE_0_240);
});

const GOLDEN_PROBE_0_240 = '5dc166db27469e9b';
