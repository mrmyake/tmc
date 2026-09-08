import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Gedeeld door /api/akiles/oauth/start en /callback. Adminpoort met echte
 * HTTP-statussen, hetzelfde patroon als
 * src/app/api/admin/trainers/[id]/invoice/route.ts: cookie-client,
 * auth.getUser(), daarna profiles.role via dezelfde RLS-client.
 */
export const OAUTH_STATE_COOKIE = "tmc_akiles_oauth_state";
/** De autorisatiecode van Akiles verloopt na 15 minuten; de state-cookie ook. */
export const OAUTH_STATE_MAX_AGE_SECONDS = 15 * 60;
export const OAUTH_COOKIE_PATH = "/api/akiles/oauth";

export type AdminGate = { ok: true; userId: string } | { ok: false; response: Response };

export async function requireAdminGate(): Promise<AdminGate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (callerProfile?.role !== "admin") {
    return { ok: false, response: new Response("Forbidden", { status: 403 }) };
  }
  return { ok: true, userId: user.id };
}

/**
 * Een OAuth-applicatie voor alle omgevingen met een vaste productie-
 * redirect_uri: buiten productie kan de flow niet afgerond worden en mag
 * hij ook niet starten (previews delen het Supabase-project en zouden het
 * productie-refreshtoken overschrijven).
 */
export function requireProductionResponse(): Response | null {
  if (process.env.VERCEL_ENV === "production") return null;
  return new Response(
    "Akiles-autorisatie kan alleen op productie (www.themovementclub.nl) worden uitgevoerd.",
    { status: 409 },
  );
}

/** Kleine HTML-pagina voor de bevestiging of de foutmelding in de callback. */
export function htmlPage(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#0B0B0B;color:#F5F2EC;font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}main{max-width:32rem;padding:2rem}h1{font-weight:500;font-size:1.5rem;margin:0 0 .75rem}p{margin:0 0 .75rem;color:#B9B3A9}a{color:#C9A86B}</style></head><body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
