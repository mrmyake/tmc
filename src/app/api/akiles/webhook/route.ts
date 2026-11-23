import { AKILES_WEBHOOK_URL } from "@/lib/access/constants";
import {
  AkilesApiError,
  createAkilesPinWebhook,
  isAkilesConfigured,
  listAkilesWebhooks,
  type AkilesWebhookSummary,
} from "@/lib/akiles";
import {
  escapeHtml,
  htmlPage,
  requireAdminGate,
  requireProductionResponse,
} from "../oauth/_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Eenmalige inrichting van de Akiles-webhook voor pincodegebruik
 * (spec-akiles-access.md, runbook "Webhook aanmaken"). Admin-only en alleen
 * op productie, zelfde poorten als /api/akiles/oauth/start: de Akiles-
 * tokenlaag werkt uitsluitend op productie, dus een lokaal script kan dit
 * niet.
 *
 *  - GET toont de stand: bestaat er al een webhook op onze URL, of een knop
 *    om hem aan te maken. GET maakt zelf niets aan.
 *  - POST maakt de webhook aan en toont het secret precies een keer, met
 *    Cache-Control: no-store. Het secret komt nergens in logs, events of
 *    ntfy; Akiles geeft het daarna nooit meer terug.
 *
 * Bestaat er al een webhook van deze app op dezelfde URL, dan komt er geen
 * tweede bij (dat zou elke push verdubbelen met een secret dat de route
 * niet kent): eerst de oude verwijderen in het Akiles Developer Center.
 *
 * De route hangt niet af van AKILES_WEBHOOK_SECRET: die variabele wordt
 * juist met de uitkomst van deze route gevuld.
 */

const PATH = "/api/akiles/webhook";

function sameUrl(a: string, b: string): boolean {
  const norm = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

type Gate =
  | { ok: true; existing: AkilesWebhookSummary[] }
  | { ok: false; response: Response };

async function gateAndList(): Promise<Gate> {
  const gate = await requireAdminGate();
  if (!gate.ok) return { ok: false, response: gate.response };
  const notProduction = requireProductionResponse();
  if (notProduction) return { ok: false, response: notProduction };
  if (!(await isAkilesConfigured())) {
    return {
      ok: false,
      response: htmlPage(
        "Akiles niet gekoppeld",
        `<p>De Akiles-koppeling is niet geconfigureerd. Voer eerst de autorisatie uit via <a href="/api/akiles/oauth/start">/api/akiles/oauth/start</a>.</p>`,
        503,
      ),
    };
  }
  try {
    const all = await listAkilesWebhooks();
    return { ok: true, existing: all.filter((w) => sameUrl(w.url, AKILES_WEBHOOK_URL)) };
  } catch (err) {
    return { ok: false, response: akilesErrorPage(err) };
  }
}

function akilesErrorPage(err: unknown): Response {
  // AkilesApiError bevat alleen status, pad en een kort foutdetail van Akiles.
  const message = err instanceof AkilesApiError ? err.message : "Onbekende fout";
  console.error("[akiles-webhook-setup] Akiles-aanroep mislukt", message);
  return htmlPage("Akiles gaf een fout", `<p>${escapeHtml(message)}</p>`, 502);
}

function existingPage(existing: AkilesWebhookSummary[], status: number): Response {
  const items = existing
    .map(
      (w) =>
        `<p><code>${escapeHtml(w.id)}</code> (${w.is_enabled ? "ingeschakeld" : "uitgeschakeld"})</p>`,
    )
    .join("");
  return htmlPage(
    "Er bestaat al een webhook",
    `<p>Deze app heeft al een webhook op <code>${escapeHtml(AKILES_WEBHOOK_URL)}</code>. Er is niets aangemaakt.</p>${items}<p>Het secret van een bestaande webhook is niet meer op te vragen. Is het secret kwijt, verwijder deze webhook dan eerst in het Akiles Developer Center en open deze pagina opnieuw.</p>`,
    status,
  );
}

export async function GET(): Promise<Response> {
  const gate = await gateAndList();
  if (!gate.ok) return gate.response;
  if (gate.existing.length > 0) return existingPage(gate.existing, 200);
  return htmlPage(
    "Akiles-webhook aanmaken",
    `<p>Er is nog geen webhook op <code>${escapeHtml(AKILES_WEBHOOK_URL)}</code>.</p><p>Na het aanmaken verschijnt het secret precies een keer. Zet het daarna als <code>AKILES_WEBHOOK_SECRET</code> in Vercel (Production) en deploy opnieuw.</p><form method="post" action="${PATH}"><button type="submit" style="font:inherit;padding:.6rem 1rem;background:#C9A86B;color:#0B0B0B;border:0;cursor:pointer">Webhook aanmaken</button></form>`,
  );
}

export async function POST(): Promise<Response> {
  const gate = await gateAndList();
  if (!gate.ok) return gate.response;
  if (gate.existing.length > 0) return existingPage(gate.existing, 409);

  let created: { id: string; secret: string };
  try {
    created = await createAkilesPinWebhook();
  } catch (err) {
    return akilesErrorPage(err);
  }
  // Alleen het id in de log; het secret staat uitsluitend in dit antwoord.
  console.info("[akiles-webhook-setup] webhook aangemaakt", { webhook_id: created.id });
  return htmlPage(
    "Webhook aangemaakt",
    `<p>Webhook <code>${escapeHtml(created.id)}</code> staat op <code>${escapeHtml(AKILES_WEBHOOK_URL)}</code>.</p><p>Secret (wordt maar een keer getoond, ververs deze pagina niet):</p><p><code style="word-break:break-all;color:#F5F2EC">${escapeHtml(created.secret)}</code></p><p>Zet dit als <code>AKILES_WEBHOOK_SECRET</code> in Vercel (Production) en deploy opnieuw. Tot die tijd antwoordt de route 200 zonder iets te doen.</p>`,
  );
}
