import { assertEquals } from '@std/assert';

import { handleHealth } from './handler.ts';

const url = 'http://localhost/health';

Deno.test('GET /health reports the shared core versions', async () => {
  const res = handleHealth(new Request(url));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('cache-control'), 'no-store');
  assertEquals(res.headers.get('content-type'), 'application/json');
  assertEquals(res.headers.get('access-control-allow-origin'), '*');
  assertEquals(await res.json(), { ok: true, physicsVersion: 1, rulesVersion: 1 });
});

Deno.test('HEAD /health answers uptime probes with the same status and no body', async () => {
  const res = handleHealth(new Request(url, { method: 'HEAD' }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('content-type'), 'application/json');
  assertEquals(res.body, null);
  assertEquals(await res.text(), '');
});

Deno.test('OPTIONS /health answers the CORS preflight a supabase-js call sends', () => {
  const res = handleHealth(new Request(url, { method: 'OPTIONS' }));
  assertEquals(res.status, 204);
  assertEquals(res.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');
  assertEquals(
    res.headers.get('access-control-allow-headers'),
    'authorization, apikey, content-type, x-client-info',
  );
});

Deno.test('other methods are refused', () => {
  const res = handleHealth(new Request(url, { method: 'POST' }));
  assertEquals(res.status, 405);
  assertEquals(res.headers.get('allow'), 'GET, HEAD, OPTIONS');
});

Deno.test('the shared physics core runs under Deno with the same hash as Node', async () => {
  const { determinismProbe } = await import('@kanche/physics');
  // The same frozen value as packages/physics/test/probe.test.ts.
  assertEquals(determinismProbe(0, 240).hash, GOLDEN_PROBE_0_240);
});

const GOLDEN_PROBE_0_240 = '5dc166db27469e9b';
