import { physicsVersion } from '@kanche/physics';
import { rulesVersion } from '@kanche/rules';

/** Public, read-only data, so any origin may read it. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
} as const;

/**
 * GET /health: the versions this deployment simulates with. The server must run the same physics
 * and rules versions as the match it judges (ADR-0004, ADR-0005), so clients and monitors read them
 * here. Importing the shared core also proves it runs under Deno.
 *
 * HEAD answers uptime monitors that probe without a body. OPTIONS answers the CORS preflight
 * a browser sends before a supabase-js call (it adds authorization and apikey headers).
 */
export function handleHealth(request: Request): Response {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { ...CORS, allow: 'GET, HEAD, OPTIONS' } });
  }
  const body = JSON.stringify({ ok: true, physicsVersion, rulesVersion });
  return new Response(request.method === 'HEAD' ? null : body, {
    status: 200,
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
