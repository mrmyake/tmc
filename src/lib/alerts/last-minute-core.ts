import { formatTime, formatTimeRange, formatWeekdayDate } from "@/lib/format-date";

/**
 * Last-minute trainersmelding (spec-last-minute-alerts.md): pure kern.
 *
 * Een trainer krijgt een mail zodra iemand zich minder dan drie uur voor de
 * start van zijn groepsles definitief inschrijft. Geen Supabase, geen
 * MailerSend en geen React hier; alles komt binnen via `deps`, zodat
 * scripts/last-minute-alerts/core.test.mts de grens, de idempotentie, de
 * fallback en de omleiding buiten productie zonder netwerk kan bewijzen.
 * De dunne wrapper in last-minute-trainer.ts wiret de echte afhankelijkheden.
 *
 * Volgorde: sessie laden, pillar en status, de drie-uursgrens, deelnemer
 * laden (testboekingen in productie overslaan), stempelen (stamp-first, net
 * als reminder_sent_at: nul geraakte rijen betekent al gemeld), tellen,
 * ontvanger bepalen, omleiden buiten productie, versturen, event.
 */

export const LAST_MINUTE_WINDOW_MS = 3 * 60 * 60 * 1000;

export type LastMinuteSource = "member" | "waitlist" | "trial" | "guest";
export type RecipientKind = "trainer" | "fallback" | "redirect";

export interface LastMinuteInput {
  sessionId: string;
  source: LastMinuteSource;
  /** bookings.id (member, waitlist), trial_bookings.id (trial) of guest_bookings.id (guest). */
  participantId: string;
}

export interface SessionRow {
  id: string;
  pillar: string;
  status: string;
  start_at: string;
  end_at: string;
  className: string;
  trainer: { profileId: string; isActive: boolean; displayName: string } | null;
}

export interface ParticipantRow {
  name: string;
  /** trial_bookings.is_test, of profiles.is_test van het lid of de gastheer. */
  isTest: boolean;
  /** Alleen bij source guest: de voornaam van het lid dat uitnodigt. */
  hostFirstName?: string | null;
}

export interface Recipient {
  email: string;
  firstName: string;
}

/** Props van src/emails/last_minute_booking.tsx; hier zonder React. */
export interface LastMinuteMailProps {
  recipientFirstName: string;
  className: string;
  whenLabel: string;
  participantName: string;
  kindLabel: string;
  totalParticipants: number;
  participantsUrl: string;
  /** Alleen buiten productie: wie de mail in productie had gekregen. */
  originalRecipientLabel: string | null;
}

export type StampResult = "stamped" | "already" | "error";

export interface LastMinuteEvent {
  type: "trainer.last_minute_alert_sent";
  actorType: "system";
  actorId: null;
  subjectType: "session";
  subjectId: string;
  payload: Record<string, unknown>;
}

export interface LastMinuteDeps {
  now: () => Date;
  env: {
    vercelEnv: string | undefined;
    redirectEmail: string | undefined;
    siteUrl: string;
  };
  loadSession(sessionId: string): Promise<SessionRow | null>;
  loadParticipant(source: LastMinuteSource, participantId: string): Promise<ParticipantRow | null>;
  stampAlerted(source: LastMinuteSource, participantId: string): Promise<StampResult>;
  /** Definitieve deelnemers: leden booked, proeflessen paid of attended zonder is_test, gasten booked of attended. */
  countParticipants(sessionId: string): Promise<number>;
  loadProfileRecipient(profileId: string): Promise<Recipient | null>;
  loadHeadTrainerRecipient(): Promise<Recipient | null>;
  loadAdminRecipients(): Promise<Recipient[]>;
  send(args: { to: string; toName?: string; subject: string; props: LastMinuteMailProps }): Promise<boolean>;
  emit(event: LastMinuteEvent): Promise<boolean>;
  log: Pick<Console, "info" | "warn" | "error">;
}

export type SkipReason =
  | "session_not_found"
  | "vrij_trainen"
  | "session_not_scheduled"
  | "before_window"
  | "session_started"
  | "participant_not_found"
  | "test_booking"
  | "already_alerted"
  | "stamp_failed";

export type LastMinuteResult =
  | { outcome: "skipped"; reason: SkipReason }
  | {
      outcome: "sent" | "not_delivered";
      recipientKind: RecipientKind;
      recipients: string[];
      delivered: number;
      reason?: "redirect_missing" | "no_recipient" | "send_failed";
    };

/**
 * De grens: definitief geworden op `now`, minder dan drie uur voor `startAt`
 * en de les is nog niet begonnen. Vergelijking op tijdstippen, dus de
 * tijdzone speelt hier geen rol; Europe/Amsterdam is alleen weergave.
 */
export function lastMinuteDecision(
  startAt: Date,
  now: Date,
): "before_window" | "last_minute" | "session_started" {
  const diff = startAt.getTime() - now.getTime();
  if (diff <= 0) return "session_started";
  if (diff < LAST_MINUTE_WINDOW_MS) return "last_minute";
  return "before_window";
}

export function isProduction(vercelEnv: string | undefined): boolean {
  return vercelEnv === "production";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Bruikbaar adres: een echt e-mailadres, geen placeholder zoals de
 * walk-in-adressen op *.internal (src/lib/check-in/core.ts).
 */
export function isUsableEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  const trimmed = email.trim();
  if (!EMAIL_RE.test(trimmed)) return false;
  return !/\.internal$/i.test(trimmed);
}

/** Soort inschrijving zoals die in de mail staat. */
export function kindLabel(source: LastMinuteSource, hostFirstName?: string | null): string {
  switch (source) {
    case "member":
      // COPY: confirm met Marlon
      return "lid";
    case "waitlist":
      // COPY: confirm met Marlon
      return "van de wachtlijst";
    case "trial":
      // COPY: confirm met Marlon
      return "proefles";
    case "guest": {
      const host = (hostFirstName ?? "").trim();
      // COPY: confirm met Marlon
      return host ? `gast van ${host}` : "gast van een lid";
    }
  }
}

export function buildSubject(className: string, startAt: Date, redirect: boolean): string {
  // COPY: confirm met Marlon
  const base = `Last minute inschrijving: ${className} om ${formatTime(startAt)}`;
  return redirect ? `[TEST] ${base}` : base;
}

export function whenLabel(startAt: Date, endAt: Date): string {
  return `${formatWeekdayDate(startAt)} · ${formatTimeRange(startAt, endAt)}`;
}

export function participantsUrl(siteUrl: string, sessionId: string): string {
  return `${siteUrl}/app/trainer/sessies/${sessionId}`;
}

/**
 * Ontvanger in productie: de trainer van de sessie als zijn rij actief is en
 * zijn adres bruikbaar; anders de actieve head trainer; anders alle admins
 * met een bruikbaar adres (besluit Ilja, spec-last-minute-alerts.md).
 */
export async function resolvePrimaryRecipients(
  session: SessionRow,
  deps: Pick<LastMinuteDeps, "loadProfileRecipient" | "loadHeadTrainerRecipient" | "loadAdminRecipients">,
): Promise<{ kind: "trainer" | "fallback"; recipients: Recipient[] }> {
  if (session.trainer?.isActive) {
    const trainer = await deps.loadProfileRecipient(session.trainer.profileId);
    if (trainer && isUsableEmail(trainer.email)) {
      return { kind: "trainer", recipients: [trainer] };
    }
  }
  const head = await deps.loadHeadTrainerRecipient();
  if (head && isUsableEmail(head.email)) {
    return { kind: "fallback", recipients: [head] };
  }
  const admins = (await deps.loadAdminRecipients()).filter((a) => isUsableEmail(a.email));
  return { kind: "fallback", recipients: admins };
}

export async function runLastMinuteAlert(
  input: LastMinuteInput,
  deps: LastMinuteDeps,
): Promise<LastMinuteResult> {
  const session = await deps.loadSession(input.sessionId);
  if (!session) return { outcome: "skipped", reason: "session_not_found" };
  if (session.pillar === "vrij_trainen") return { outcome: "skipped", reason: "vrij_trainen" };
  if (session.status !== "scheduled") return { outcome: "skipped", reason: "session_not_scheduled" };

  const startAt = new Date(session.start_at);
  const endAt = new Date(session.end_at);
  const decision = lastMinuteDecision(startAt, deps.now());
  if (decision !== "last_minute") return { outcome: "skipped", reason: decision };

  const participant = await deps.loadParticipant(input.source, input.participantId);
  if (!participant) return { outcome: "skipped", reason: "participant_not_found" };

  const production = isProduction(deps.env.vercelEnv);
  // Testboekingen (preview-proeflessen, testprofielen) mailen in productie
  // nooit een echte trainer. Buiten productie geldt de omleiding hieronder.
  if (production && participant.isTest) return { outcome: "skipped", reason: "test_booking" };

  const stamp = await deps.stampAlerted(input.source, input.participantId);
  if (stamp === "already") return { outcome: "skipped", reason: "already_alerted" };
  if (stamp === "error") return { outcome: "skipped", reason: "stamp_failed" };

  const total = await deps.countParticipants(session.id);
  const primary = await resolvePrimaryRecipients(session, deps);

  const baseProps: Omit<LastMinuteMailProps, "recipientFirstName" | "originalRecipientLabel"> = {
    className: session.className,
    whenLabel: whenLabel(startAt, endAt),
    participantName: participant.name,
    kindLabel: kindLabel(input.source, participant.hostFirstName),
    totalParticipants: total,
    participantsUrl: participantsUrl(deps.env.siteUrl, session.id),
  };

  const eventBase = {
    type: "trainer.last_minute_alert_sent" as const,
    actorType: "system" as const,
    actorId: null,
    subjectType: "session" as const,
    subjectId: session.id,
  };
  const payloadBase = {
    session_id: session.id,
    source: input.source,
    participant_id: input.participantId,
    trainer_profile_id: session.trainer?.profileId ?? null,
    total_participants: total,
  };

  let kind: RecipientKind = primary.kind;
  let targets: Recipient[] = primary.recipients;
  let originalRecipientLabel: string | null = null;

  if (!production) {
    // Preview en productie delen een database: een testboeking op een
    // preview mag nooit een echte trainer mailen. Alles gaat naar het
    // omleidingsadres, met de oorspronkelijke ontvanger in de body.
    kind = "redirect";
    originalRecipientLabel =
      primary.recipients.length > 0
        ? `${primary.kind === "trainer" ? "trainer" : "fallback"}: ${primary.recipients.map((r) => r.email).join(", ")}`
        : // COPY: confirm met Marlon
          "geen bruikbare ontvanger gevonden";
    if (!isUsableEmail(deps.env.redirectEmail)) {
      deps.log.warn(
        "[last-minute-alert] LAST_MINUTE_ALERT_REDIRECT_EMAIL ontbreekt buiten productie; mail overgeslagen",
        { sessionId: session.id, source: input.source, vercelEnv: deps.env.vercelEnv ?? "(leeg)" },
      );
      await deps.emit({
        ...eventBase,
        payload: { ...payloadBase, recipient_kind: kind, delivered: 0, recipients: 0, reason: "redirect_missing" },
      });
      return { outcome: "not_delivered", recipientKind: kind, recipients: [], delivered: 0, reason: "redirect_missing" };
    }
    targets = [{ email: deps.env.redirectEmail.trim(), firstName: "" }];
  }

  if (targets.length === 0) {
    deps.log.error("[last-minute-alert] geen bruikbare ontvanger (trainer, head trainer of admin)", {
      sessionId: session.id,
      trainerProfileId: session.trainer?.profileId ?? null,
    });
    await deps.emit({
      ...eventBase,
      payload: { ...payloadBase, recipient_kind: kind, delivered: 0, recipients: 0, reason: "no_recipient" },
    });
    return { outcome: "not_delivered", recipientKind: kind, recipients: [], delivered: 0, reason: "no_recipient" };
  }

  const subject = buildSubject(session.className, startAt, kind === "redirect");
  let delivered = 0;
  for (const target of targets) {
    const ok = await deps.send({
      to: target.email,
      toName: target.firstName || undefined,
      subject,
      props: {
        ...baseProps,
        recipientFirstName: target.firstName,
        originalRecipientLabel,
      },
    });
    if (ok) delivered += 1;
  }

  await deps.emit({
    ...eventBase,
    payload: { ...payloadBase, recipient_kind: kind, delivered, recipients: targets.length },
  });

  if (delivered < targets.length) {
    deps.log.error("[last-minute-alert] niet bij alle ontvangers afgeleverd", {
      sessionId: session.id,
      source: input.source,
      delivered,
      expected: targets.length,
    });
  }

  return {
    outcome: delivered > 0 ? "sent" : "not_delivered",
    recipientKind: kind,
    recipients: targets.map((t) => t.email),
    delivered,
    ...(delivered === 0 ? { reason: "send_failed" as const } : {}),
  };
}
