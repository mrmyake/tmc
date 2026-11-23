import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Kern van de Akiles-webhook voor pincodegebruik (spec-akiles-access.md),
 * zonder server-only imports en zonder directe DB- of netwerkcalls: alles
 * loopt via PinWebhookDeps, zodat scripts/access/pin-webhook-core.test.mts
 * de echte logica met fakes draait. De wiring staat in
 * src/app/api/webhooks/akiles/route.ts.
 *
 * Doel: een push naar het afgeschermde deur-topic zodra iemand een pincode
 * gebruikt op de PinPad. Telefoon, NFC, bluetooth en wallet geven niets.
 *
 * Invarianten:
 *  - Zonder webhook-secret, deur-topic of ntfy-token doet de route niets en
 *    antwoordt hij 200 (isXConfigured-patroon).
 *  - Een ongeldige signatuur geeft 401 en er wordt niets van de payload
 *    gelogd of opgeslagen.
 *  - Alleen verb "use" op object.type "gadget_action" met access_method
 *    "pin" krijgt een rij in tmc.akiles_webhook_events; al het andere laat
 *    geen spoor na.
 *  - Eerst claimen, dan pushen: een event geeft nooit twee pushes, ook niet
 *    bij de herhalingen van Akiles (tot een uur, met backoff). Keerzijde,
 *    bewust: faalt ntfy na de claim, dan komt er geen tweede poging
 *    (at-most-once); notified blijft dan false als spoor.
 *  - Geen e-mail, telefoonnummer of pincode in de melding, het event of de
 *    logs. De naam staat alleen in de push, nooit in tmc.events.
 */

/** Het deel van een Akiles-event dat deze route leest. Alles is optioneel: de payload komt van buiten. */
export interface AkilesWebhookEvent {
  id?: unknown;
  verb?: unknown;
  created_at?: unknown;
  occurred_at?: unknown;
  subject?: {
    member_id?: unknown;
    member_pin_id?: unknown;
    access_method?: unknown;
    /** Mogelijke vorm van de expand subject_member. */
    member?: { name?: unknown } | null;
  } | null;
  object?: {
    type?: unknown;
    gadget_id?: unknown;
    /** Mogelijke vorm van de expand object_gadget. */
    gadget?: { name?: unknown } | null;
  } | null;
  /** Expands zoals de webhook ze heet (subject_member, object_gadget). */
  subject_member?: { name?: unknown } | null;
  object_gadget?: { name?: unknown } | null;
}

export interface PinProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  is_test: boolean;
}

/**
 * Waar de naam in de melding vandaan komt:
 *  - profile_pin: de PIN die het platform voor dit profiel heeft aangemaakt;
 *  - profile_member: een bekend lid, maar met een PIN die het platform niet
 *    kent (in het Akiles-paneel aangemaakt);
 *  - akiles_member: een Akiles-member zonder profiel (buiten het platform);
 *  - unknown: geen naam te vinden.
 */
export type PinNameSource = "profile_pin" | "profile_member" | "akiles_member" | "unknown";

export interface PinUsedEvent {
  profileId: string | null;
  payload: {
    akiles_event_id: string;
    gadget_id: string | null;
    occurred_at: string | null;
    delayed: boolean;
    name_source: PinNameSource;
    notified: boolean;
  };
}

export interface PinWebhookDeps {
  env: {
    /** AKILES_WEBHOOK_SECRET */
    webhookSecret: string | null;
    /** NTFY_DOOR_TOPIC */
    doorTopic: string | null;
    /** Of NTFY_ACCESS_TOKEN gezet is; de waarde zelf komt hier niet. */
    hasNtfyToken: boolean;
  };
  db: {
    /**
     * Insert op event-id met "on conflict do nothing". True = deze aanroep
     * heeft de rij aangemaakt en mag pushen; false = het event was er al.
     * Gooit bij een databasefout.
     */
    claimEvent(eventId: string, occurredAt: string | null): Promise<boolean>;
    markNotified(eventId: string): Promise<void>;
    findProfileByPinId(pinId: string): Promise<PinProfile | null>;
    findProfileByMemberId(memberId: string): Promise<PinProfile | null>;
  };
  notify(
    title: string,
    message: string,
    opts: { topic: string; test: boolean },
  ): Promise<boolean>;
  emit(event: PinUsedEvent): Promise<void>;
  log: {
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
}

export type PinWebhookOutcome =
  | "not_configured"
  | "bad_signature"
  | "ignored"
  | "duplicate"
  | "claim_failed"
  | "notified"
  | "notify_failed";

export interface PinWebhookResult {
  status: 200 | 401 | 500;
  outcome: PinWebhookOutcome;
}

/** Vanaf dit verschil tussen occurred_at en created_at heet een event vertraagd. */
export const DELAYED_THRESHOLD_MS = 5 * 60_000;

// COPY: confirm met Marlon
export const PIN_PUSH_COPY = {
  titlePrefix: "Code gebruikt: ",
  unknownName: "Onbekende code",
  fallbackDoor: "Deur",
  unknownTime: "tijd onbekend",
  delayed: "Vertraagd gemeld: het apparaat was offline.",
  foreignPin: "Deze code is buiten het platform aangemaakt.",
  noProfile: "Niet gekoppeld aan een profiel in het platform.",
} as const;

export function isPinWebhookConfigured(env: PinWebhookDeps["env"]): boolean {
  return Boolean(env.webhookSecret && env.doorTopic && env.hasNtfyToken);
}

/**
 * HMAC-SHA256 over de ruwe body met het webhook-secret, hex in de header
 * X-Akiles-Sig-SHA256. timingSafeEqual gooit bij ongelijke lengte, vandaar
 * de lengtecontrole vooraf (de lengte van een SHA-256 is geen geheim).
 */
export function verifyAkilesSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const hex = signatureHeader.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;
  const got = Buffer.from(hex, "hex");
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function parseTime(value: unknown): Date | null {
  const s = str(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Alleen een pincode op een gadget-actie; al het andere wordt genegeerd. */
export function isPinUse(event: AkilesWebhookEvent): boolean {
  return (
    event.verb === "use" &&
    event.object?.type === "gadget_action" &&
    event.subject?.access_method === "pin"
  );
}

const AMSTERDAM_FORMAT = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "ma 23 nov 14:05" in Europe/Amsterdam. */
export function formatAmsterdam(date: Date): string {
  const parts = Object.fromEntries(
    AMSTERDAM_FORMAT.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const clean = (v: string | undefined) => (v ?? "").replace(/\.$/, "");
  return `${clean(parts.weekday)} ${parts.day} ${clean(parts.month)} ${parts.hour}:${parts.minute}`;
}

function profileName(profile: PinProfile): string | null {
  const name = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return name || null;
}

interface ResolvedName {
  name: string;
  source: PinNameSource;
  profile: PinProfile | null;
}

/**
 * Naam voor de melding. Volgorde: de PIN van het platform, dan het lid
 * waar de PIN bij hoort, dan de membernaam die Akiles meestuurt, dan
 * "Onbekende code". Een code die buiten het platform om is aangemaakt
 * geeft dus juist wel een melding. Een mislukte lookup valt door naar de
 * volgende stap: de push gaat voor de precieze naam.
 */
async function resolveName(deps: PinWebhookDeps, event: AkilesWebhookEvent): Promise<ResolvedName> {
  const pinId = str(event.subject?.member_pin_id);
  const memberId = str(event.subject?.member_id);
  const akilesName = str(event.subject_member?.name) ?? str(event.subject?.member?.name);

  const lookup = async (
    label: string,
    fn: () => Promise<PinProfile | null>,
  ): Promise<PinProfile | null> => {
    try {
      return await fn();
    } catch (err) {
      deps.log.error(`[akiles-webhook] profiel opzoeken mislukt (${label})`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };

  if (pinId) {
    const profile = await lookup("pin", () => deps.db.findProfileByPinId(pinId));
    if (profile) {
      return {
        name: profileName(profile) ?? akilesName ?? PIN_PUSH_COPY.unknownName,
        source: "profile_pin",
        profile,
      };
    }
  }
  if (memberId) {
    const profile = await lookup("member", () => deps.db.findProfileByMemberId(memberId));
    if (profile) {
      return {
        name: profileName(profile) ?? akilesName ?? PIN_PUSH_COPY.unknownName,
        source: "profile_member",
        profile,
      };
    }
  }
  if (akilesName) return { name: akilesName, source: "akiles_member", profile: null };
  return { name: PIN_PUSH_COPY.unknownName, source: "unknown", profile: null };
}

export interface PinPush {
  title: string;
  message: string;
  delayed: boolean;
}

/** Titel en bericht van de push. Bevat naam, deur en tijd; geen e-mail, telefoon of pincode. */
export function buildPinPush(event: AkilesWebhookEvent, resolved: { name: string; source: PinNameSource }): PinPush {
  const occurred = parseTime(event.occurred_at);
  const created = parseTime(event.created_at);
  // occurred_at is het moment aan de deur; created_at is pas het moment
  // waarop een offline apparaat het event alsnog meldde.
  const when = occurred ?? created;
  const delayed =
    occurred !== null &&
    created !== null &&
    created.getTime() - occurred.getTime() > DELAYED_THRESHOLD_MS;
  const door =
    str(event.object_gadget?.name) ?? str(event.object?.gadget?.name) ?? PIN_PUSH_COPY.fallbackDoor;

  const lines = [`${door}, ${when ? formatAmsterdam(when) : PIN_PUSH_COPY.unknownTime}`];
  if (delayed) lines.push(PIN_PUSH_COPY.delayed);
  if (resolved.source === "profile_member") lines.push(PIN_PUSH_COPY.foreignPin);
  if (resolved.source === "akiles_member" || resolved.source === "unknown") {
    lines.push(PIN_PUSH_COPY.noProfile);
  }
  return {
    title: `${PIN_PUSH_COPY.titlePrefix}${resolved.name}`,
    message: lines.join("\n"),
    delayed,
  };
}

export async function handlePinWebhook(
  deps: PinWebhookDeps,
  rawBody: string,
  signatureHeader: string | null,
): Promise<PinWebhookResult> {
  if (!isPinWebhookConfigured(deps.env) || !deps.env.webhookSecret || !deps.env.doorTopic) {
    return { status: 200, outcome: "not_configured" };
  }
  if (!verifyAkilesSignature(rawBody, signatureHeader, deps.env.webhookSecret)) {
    // Niets van de payload of de header loggen: die komt van een onbekende afzender.
    deps.log.error("[akiles-webhook] ongeldige signatuur, verzoek geweigerd");
    return { status: 401, outcome: "bad_signature" };
  }

  let event: AkilesWebhookEvent;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object") return { status: 200, outcome: "ignored" };
    event = parsed as AkilesWebhookEvent;
  } catch {
    return { status: 200, outcome: "ignored" };
  }

  if (!isPinUse(event)) return { status: 200, outcome: "ignored" };

  const eventId = str(event.id);
  if (!eventId) {
    // Zonder id is dedupe onmogelijk; liever geen push dan een dubbele.
    deps.log.error("[akiles-webhook] pin-event zonder id genegeerd");
    return { status: 200, outcome: "ignored" };
  }

  const occurredIso = parseTime(event.occurred_at)?.toISOString() ?? null;
  let claimed: boolean;
  try {
    claimed = await deps.db.claimEvent(eventId, occurredIso);
  } catch (err) {
    // Geen 2xx: Akiles herhaalt de levering, en zonder claim is er ook nog
    // niets verstuurd.
    deps.log.error("[akiles-webhook] claim mislukt", {
      event_id: eventId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: 500, outcome: "claim_failed" };
  }
  if (!claimed) return { status: 200, outcome: "duplicate" };

  const resolved = await resolveName(deps, event);
  const push = buildPinPush(event, resolved);

  let notified = false;
  try {
    notified = await deps.notify(push.title, push.message, {
      topic: deps.env.doorTopic,
      test: resolved.profile?.is_test === true,
    });
  } catch {
    notified = false;
  }
  if (notified) {
    try {
      await deps.db.markNotified(eventId);
    } catch (err) {
      deps.log.error("[akiles-webhook] notified wegschrijven mislukt", {
        event_id: eventId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    deps.log.error("[akiles-webhook] push niet geaccepteerd door ntfy", { event_id: eventId });
  }

  try {
    await deps.emit({
      profileId: resolved.profile?.id ?? null,
      payload: {
        akiles_event_id: eventId,
        gadget_id: str(event.object?.gadget_id),
        occurred_at: occurredIso,
        delayed: push.delayed,
        name_source: resolved.source,
        notified,
      },
    });
  } catch {
    // emitEvent throwt zelf nooit; dit vangt alleen een afwijkende wiring.
  }

  return { status: 200, outcome: notified ? "notified" : "notify_failed" };
}
