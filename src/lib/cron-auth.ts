/**
 * Verify that an incoming cron HTTP request came from Vercel Cron and
 * carries the shared `CRON_SECRET`. Vercel sends
 * `Authorization: Bearer <CRON_SECRET>` when you configure a cron in
 * `vercel.json`. Locally, you can hit the route with the same header.
 *
 * Returns `null` on success, or a `Response` to short-circuit the handler.
 */
export function verifyCronAuth(req: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron-auth] CRON_SECRET is niet geconfigureerd");
    return new Response("Not configured", { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
