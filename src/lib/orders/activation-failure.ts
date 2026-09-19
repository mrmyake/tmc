import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import type { MollieMode } from "@/lib/mollie";

/**
 * Foutafhandeling van de orderactivatie, gedeeld door de Mollie-webhook en
 * (vanaf PR 3b) de reconciliatie-cron. Uit route.ts getild in PR 3a zonder
 * gedragswijziging; de geschiedenis staat in spec-facturatie.md 6.5 en in
 * de ledger (PR #192, #193).
 *
 * Mollie's retry-gedrag, geverifieerd op https://docs.mollie.com/reference/webhooks:
 * alleen een 200 telt als succes; een antwoord dat langer dan 15 seconden
 * duurt telt als mislukt; na een niet-200 herhaalt Mollie op 1, 2, 4, 8, 16
 * en 29 minuten en daarna op 1, 2 en 22 uur, tien pogingen in totaal,
 * cumulatief 26 uur, daarna stopt Mollie definitief.
 *
 * Classificatie: een TRANSIENTE fout (netwerk, Mollie 5xx of timeout,
 * Supabase- of PostgREST-fout) krijgt in de webhook een 500, zodat Mollie
 * herhaalt. Een PERMANENTE fout (Mollie 404 door modus-mismatch of onbekende
 * payment, onparseerbare body, integriteits- of programmeerfout in SQL)
 * blijft een 200 met een luide log en een webhook.failed-event: herhalen
 * geeft per definitie dezelfde uitkomst. Onbekende fouten gaan naar 500. De
 * kosten zijn asymmetrisch: 26 uur herhalen met wat ruis is goedkoper dan
 * een betaling definitief kwijtraken, en de reconciliatie (PR 3b) vangt op
 * wat na 26 uur nog openstaat. Voor een cron-aanroeper betekent "transient"
 * niet 500 maar "volgende run opnieuw"; de classificatie zelf is dezelfde.
 *
 * Registratie: elke mislukte verwerking wordt persistent vastgelegd als
 * tmc.events-type webhook.failed (Vercel-logs zijn vluchtig, tmc.events
 * niet). Het event mag herhalen, elke poging is een feit. De ntfy niet:
 * per (pad, mollie_payment_id) gaat er hooguit een melding uit binnen het
 * retry-venster van 26 uur, met de al geschreven webhook.failed-rijen als
 * bron van waarheid. Bewust geen dedupe_key in de payload: dit is geen
 * money-fact. Registratie throwt nooit (emitEvent vangt alles); valt
 * Supabase zelf weg, dan blijft alleen de console-log over.
 */

/**
 * Wie de activatie aanroept. Beide zijn geautomatiseerd, dus actor_type op
 * de events is altijd "system"; het onderscheid zit in payload.source van
 * webhook.failed (en straks in de cron zijn eigen events), niet in
 * actor_type. Zelfde patroon als `via: "cron_reconcile"` op de
 * trial-reconciliatie in expire-orders.
 */
export type ActivationSource = "mollie_webhook" | "expire_orders_cron";

export type FailurePath =
  | "malformed_body"
  | "payments_get"
  | "activate_order"
  | "subscription_create"
  | "subscription_link_write"
  | "unhandled";

export type FailureClass = "transient" | "permanent";

/** Mollie's retry-venster: tien pogingen, cumulatief 26 uur (zie docblock). */
export const MOLLIE_RETRY_WINDOW_MS = 26 * 60 * 60 * 1000;

/**
 * SQLSTATE-klassen waarvan een herhaling een andere uitkomst kan geven:
 * 08 connection, 40 transaction rollback (serialization, deadlock),
 * 53 insufficient resources, 55 object not in prerequisite state (locks),
 * 57 operator intervention (statement timeout 57014, shutdown),
 * 58 system error, XX internal error.
 */
const TRANSIENT_SQLSTATE_CLASSES = new Set(["08", "40", "53", "55", "57", "58", "XX"]);

/** Throwt nooit: ook een object met een gooiende getter of toString levert een beschrijving op. */
export function describeError(err: unknown): { code: string | null; message: string } {
  try {
    if (err && typeof err === "object") {
      const e = err as {
        code?: unknown; // PostgrestError (SQLSTATE of PGRSTxxx), Node-systeemcode
        statusCode?: unknown; // Mollie ApiError
        title?: unknown; // Mollie ApiError
        name?: unknown;
        message?: unknown;
      };
      const code =
        typeof e.code === "string" && e.code !== ""
          ? e.code
          : typeof e.statusCode === "number"
            ? String(e.statusCode)
            : typeof e.title === "string"
              ? e.title
              : typeof e.name === "string"
                ? e.name
                : null;
      const message = typeof e.message === "string" ? e.message : String(err);
      return { code, message: message.slice(0, 500) };
    }
    return { code: null, message: String(err).slice(0, 500) };
  } catch {
    return { code: null, message: "(fout niet te beschrijven)" };
  }
}

/**
 * Transiënt of permanent, zie het docblock hierboven. Volgorde van de
 * checks volgt de bron van de fout:
 *  - Mollie ApiError met statusCode: 5xx en 429 transiënt; 401 en 403 ook,
 *    want dat is sleutel of configuratie en het precedent is de 500 op
 *    mollie_not_configured (spec-facturatie.md 6.5: herhalen tot de
 *    configuratie klopt); 400, 404, 422 en overige 4xx permanent. Een
 *    ApiError zonder statusCode is een netwerkfout of een onparseerbaar
 *    antwoord (mollie.cjs.js throwApiError, processFetchResponse): transiënt.
 *  - Supabase/PostgREST-fout met code: lege code is een fetch-fout uit
 *    supabase-js (PostgrestBuilder, "code/hint niet gevuld voor client-side
 *    netwerkfouten"): transiënt. PGRST1xx is een API-request-fout (client):
 *    permanent; overige PGRST (connection 0xx, schema cache 2xx, JWT 3xx,
 *    internal X00): transiënt. SQLSTATE: alleen de klassen hierboven
 *    transiënt; 22 data, 23 integriteit, 42 syntax/rechten en P0 (plpgsql
 *    raise) permanent, dezelfde invoer geeft dezelfde uitkomst.
 *  - Alles zonder herkenbare code (TypeError, AbortError, onbekend): transiënt,
 *    dus 500. Asymmetrische kosten, zie docblock.
 * Throwt nooit.
 */
export function classifyFailure(err: unknown): FailureClass {
  try {
    if (!err || typeof err !== "object") return "transient";
    const e = err as { code?: unknown; statusCode?: unknown; name?: unknown };
    if (typeof e.statusCode === "number") {
      const status = e.statusCode;
      if (status >= 500 || status === 429 || status === 401 || status === 403) return "transient";
      if (status >= 400) return "permanent";
      return "transient";
    }
    if (typeof e.code === "string") {
      const code = e.code;
      if (code === "") return "transient";
      if (code.startsWith("PGRST")) return code.startsWith("PGRST1") ? "permanent" : "transient";
      if (code.length === 5) {
        return TRANSIENT_SQLSTATE_CLASSES.has(code.slice(0, 2)) ? "transient" : "permanent";
      }
      return "transient";
    }
    return "transient";
  } catch {
    // Een fout die zich niet laat inspecteren is per definitie onbekend: 500.
    return "transient";
  }
}

/**
 * Uitkomst van de dedupe-lookup. "lookup_failed" is een eigen uitkomst en
 * geen verkapte "not_found": de melding die daaruit volgt komt uit
 * onzekerheid, niet uit een vastgestelde eerste keer, en dat moet achteraf
 * in het event te zien zijn.
 */
export type DedupeOutcome = "found" | "not_found" | "lookup_failed" | "not_applicable";

/**
 * Is er binnen het retry-venster al een webhook.failed voor dit pad en deze
 * payment geschreven? De payload-containment (@>) loopt over
 * events_payload_gin (jsonb_path_ops). Fail-open: bij een leesfout of een
 * throw is de uitkomst "lookup_failed" en meldt de caller wel. Tijdens een
 * databasestoring falen deze lookup en de webhook.failed-insert samen, en
 * zwijgen is dan de slechtste uitkomst. Throwt nooit.
 */
async function lookupRecentFailure(
  path: FailurePath,
  molliePaymentId: string,
): Promise<DedupeOutcome> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - MOLLIE_RETRY_WINDOW_MS).toISOString();
    const { data, error } = await admin
      .from("events")
      .select("id")
      .eq("type", "webhook.failed")
      .contains("payload", { path, mollie_payment_id: molliePaymentId })
      .gte("created_at", since)
      .limit(1);
    if (error) {
      console.error("[activation-failure] webhook.failed lookup failed", { path, molliePaymentId }, error);
      return "lookup_failed";
    }
    return (data?.length ?? 0) > 0 ? "found" : "not_found";
  } catch (err) {
    console.error("[activation-failure] webhook.failed lookup threw", { path, molliePaymentId }, err);
    return "lookup_failed";
  }
}

/**
 * Payload die gegarandeerd te serialiseren is. Extra velden van de caller
 * gaan eerst door JSON; lukt dat niet (BigInt, cyclisch), dan vallen ze weg
 * met een marker, en blijft de kern van het event staan.
 */
function safePayload(
  base: Record<string, unknown>,
  extra: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!extra) return base;
  try {
    return { ...base, ...(JSON.parse(JSON.stringify(extra)) as Record<string, unknown>) };
  } catch {
    return { ...base, extra_dropped: true };
  }
}

export interface RegisterFailureArgs {
  /** Wie registreert; landt als payload.source op het event. */
  source: ActivationSource;
  path: FailurePath;
  molliePaymentId: string | null;
  orderId?: string | null;
  mode: MollieMode | null;
  error: unknown;
  classification?: FailureClass;
  extra?: Record<string, unknown>;
  notify?: { title: string; message: string; tags?: string };
}

/**
 * Registreert een mislukte verwerking. Contract, zelfde als de vijf
 * zijeffecten in de activatieketen: throwt onder geen enkele omstandigheid,
 * ook niet vanuit een buitenste catch. De classificatie wordt vóór al het
 * andere bepaald en altijd teruggegeven; de caller kiest daarop de
 * responscode (webhook) of het vervolg (cron), en dat hangt dus nooit af
 * van het slagen van deze registratie.
 *
 * Volgorde en onafhankelijkheid: eerst de dedupe-lookup (fail-open), dan de
 * ntfy, dan het webhook.failed-event. De ntfy gaat vóór de insert omdat
 * tijdens een databasestoring ntfy het enige kanaal is dat nog werkt; de
 * uitkomst van de een blokkeert de ander niet. Het event draagt de
 * werkelijke uitkomsten: notified is alleen true als ntfy de melding heeft
 * geaccepteerd, dedupe zegt waar het besluit op rustte. Kon het event niet
 * geschreven worden terwijl er wel gemeld is, dan staat dat met payment-id
 * en pad in de console, zodat de melding achteraf te plaatsen is.
 */
export async function registerFailure(args: RegisterFailureArgs): Promise<FailureClass> {
  const classification = args.classification ?? classifyFailure(args.error);
  try {
    const { code, message } = describeError(args.error);

    // 1. Dedupe, fail-open.
    let dedupe: DedupeOutcome = "not_applicable";
    if (args.notify && args.molliePaymentId) {
      dedupe = await lookupRecentFailure(args.path, args.molliePaymentId);
    } else if (args.notify) {
      // Geen payment-id (onparseerbare body): niets om op te dedupliceren.
      dedupe = "not_found";
    }
    const shouldNotify = Boolean(args.notify) && dedupe !== "found";

    // 2. ntfy, onafhankelijk van de insert hieronder. sendNotification
    //    throwt nooit en geeft aan of ntfy de melding heeft geaccepteerd.
    let notified = false;
    if (args.notify && shouldNotify) {
      const suffix =
        dedupe === "lookup_failed"
          ? " (dedupe-lookup mislukt; mogelijk al eerder gemeld)"
          : "";
      notified = await sendNotification(
        args.notify.title,
        `${args.notify.message}${suffix}`,
        args.notify.tags ?? "warning",
      );
      if (!notified) {
        console.error("[activation-failure] ntfy niet geaccepteerd", {
          source: args.source,
          path: args.path,
          molliePaymentId: args.molliePaymentId,
        });
      }
    } else if (args.notify && dedupe === "found") {
      console.warn("[activation-failure] ntfy onderdrukt, al gemeld binnen het retry-venster", {
        source: args.source,
        path: args.path,
        molliePaymentId: args.molliePaymentId,
      });
    }

    // 3. Persistent spoor, onafhankelijk van de ntfy hierboven.
    const written = await emitEvent({
      type: "webhook.failed",
      actorType: "system",
      subjectType: "payment",
      subjectId: null,
      payload: safePayload(
        {
          source: args.source,
          path: args.path,
          mollie_payment_id: args.molliePaymentId,
          order_id: args.orderId ?? null,
          mode: args.mode,
          error_code: code,
          error_message: message,
          classification,
          response_status: classification === "transient" ? 500 : 200,
          notified,
          dedupe,
        },
        args.extra,
      ),
    });
    if (!written) {
      // emitEvent logt de oorzaak zelf; hier de context om de melding (als
      // die er was) achteraf aan een payment en pad te kunnen koppelen.
      console.error("[activation-failure] webhook.failed niet geschreven", {
        source: args.source,
        path: args.path,
        molliePaymentId: args.molliePaymentId,
        orderId: args.orderId ?? null,
        classification,
        notified,
        dedupe,
      });
    }
  } catch (err) {
    // Laatste vangrail; hier hoort nooit iets te komen, maar een fout in
    // de registratie mag nooit een tweede fout in de aanroeper worden.
    try {
      console.error("[activation-failure] registerFailure threw", {
        source: args.source,
        path: args.path,
        molliePaymentId: args.molliePaymentId,
      }, err);
    } catch {
      /* zelfs loggen mag hier niet gooien */
    }
  }
  return classification;
}
