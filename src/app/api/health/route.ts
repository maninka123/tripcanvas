/** Liveness check for deploy smoke tests and the end-to-end test runner. No database access. */
export function GET() {
  return Response.json({ ok: true, service: 'tripcanvas' }, { headers: { 'cache-control': 'no-store' } });
}
