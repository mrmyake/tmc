import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/ntfy";
import { emitEvent } from "@/lib/events/emit";
import {
  handlePinWebhook,
  type PinProfile,
  type PinWebhookDeps,
} from "@/lib/access/pin-webhook-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Akiles-webhook: push naar het afgeschermde deur-topic zodra iemand een
 * pincode gebruikt op de PinPad (spec-akiles-access.md, sectie "Melding bij
 * pincodegebruik"). De logica staat in src/lib/access/pin-webhook-core.ts;
 * dit bestand is de wiring op env, service-role-client, ntfy en events.
 *
 * De webhook zelf wordt eenmalig aangemaakt via /api/akiles/webhook
 * (admin-only, productie). Akiles tekent elke levering met HMAC-SHA256 over
 * de ruwe body; daarom wordt de body hier als tekst gelezen en nooit eerst
 * geparset.
 *
 * Zonder AKILES_WEBHOOK_SECRET, NTFY_DOOR_TOPIC of NTFY_ACCESS_TOKEN doet de
 * route niets en antwoordt hij 200. Op een preview staan die variabelen
 * niet, dus daar is dit een no-op.
 */

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

type ProfileJoin = PinProfile | PinProfile[] | null;

function firstProfile(value: ProfileJoin): PinProfile | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function buildDeps(): PinWebhookDeps {
  const findProfile = async (
    column: "akiles_pin_id" | "akiles_member_id",
    value: string,
  ): Promise<PinProfile | null> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("access_credentials")
      .select("profiles(id, first_name, last_name, is_test)")
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return firstProfile((data as { profiles: ProfileJoin } | null)?.profiles ?? null);
  };

  return {
    env: {
      webhookSecret: env("AKILES_WEBHOOK_SECRET"),
      doorTopic: env("NTFY_DOOR_TOPIC"),
      hasNtfyToken: env("NTFY_ACCESS_TOKEN") !== null,
    },
    db: {
      async claimEvent(eventId, occurredAt) {
        const admin = createAdminClient();
        const { data, error } = await admin
          .from("akiles_webhook_events")
          .upsert(
            { event_id: eventId, occurred_at: occurredAt },
            { onConflict: "event_id", ignoreDuplicates: true },
          )
          .select("event_id");
        if (error) throw new Error(error.message);
        return (data ?? []).length === 1;
      },
      async markNotified(eventId) {
        const admin = createAdminClient();
        const { error } = await admin
          .from("akiles_webhook_events")
          .update({ notified: true })
          .eq("event_id", eventId);
        if (error) throw new Error(error.message);
      },
      findProfileByPinId: (pinId) => findProfile("akiles_pin_id", pinId),
      findProfileByMemberId: (memberId) => findProfile("akiles_member_id", memberId),
    },
    // Tags "key": het sleutel-icoon in ntfy. Priority high staat in de opdracht.
    notify: (title, message, opts) =>
      sendNotification(title, message, "key", {
        topic: opts.topic,
        test: opts.test,
        priority: "high",
      }),
    emit: async (event) => {
      await emitEvent({
        type: "access.pin_used",
        actorType: event.profileId ? "member" : "system",
        actorId: event.profileId,
        subjectType: event.profileId ? "profile" : null,
        subjectId: event.profileId,
        payload: event.payload,
      });
    },
    log: {
      info: (message, meta) => console.info(message, meta ?? ""),
      error: (message, meta) => console.error(message, meta ?? ""),
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  try {
    const result = await handlePinWebhook(
      buildDeps(),
      rawBody,
      request.headers.get("x-akiles-sig-sha256"),
    );
    return new Response(result.status === 200 ? "ok" : result.outcome, { status: result.status });
  } catch (err) {
    // Alleen de foutmelding, nooit de payload.
    console.error("[akiles-webhook] onverwachte fout", err instanceof Error ? err.message : String(err));
    return new Response("error", { status: 500 });
  }
}
