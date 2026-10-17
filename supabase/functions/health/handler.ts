import { physicsVersion } from '@kanche/physics';
import { rulesVersion } from '@kanche/rules';

/**
 * GET /health: the versions this deployment simulates with. The server must run the same physics
 * and rules versions as the match it judges (ADR-0004, ADR-0005), so clients and monitors read them
 * here. Importing the shared core also proves it runs under Deno.
 */
export function handleHealth(request: Request): Response {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { allow: 'GET' } });
  }
  return Response.json(
    { ok: true, physicsVersion, rulesVersion },
    { headers: { 'cache-control': 'no-store' } },
  );
}
