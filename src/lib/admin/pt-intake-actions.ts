"use server";

import { requireTrainerOrAdmin } from "@/lib/admin/require-trainer-or-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { getPtBusy } from "@/lib/admin/pt-busy-actions";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import IntakeConfirmation from "@/emails/intake_confirmation";

/**
 * PT-agenda C2: intake inplannen voor een nieuwe klant zonder account
 * (naam, e-mail, telefoon direct op de sessie). Geen kosten, geen credit,
 * blokkeert de agenda, geen boekbaar slot.
 *
 * Bewuste afwijking van het RPC-patroon: er bestaat geen RPC om een
 * account-loze intake-sessie aan te maken (alle boek-RPC's uit C1 vereisen
 * een bestaand profile_id). Op uitdrukkelijk verzoek (geen nieuwe RPC's of
 * migraties in C2) doet deze action een directe insert via de
 * service-role-client, met de overlap-check in TS tegen de bestaande RPC
 * get_pt_busy (die de omkleedtijd-buffer al meeneemt). Dit mist de
 * DB-advisory-lock die de andere boek-paden wel hebben; voor deze
 * lage-frequentie, door-Marlon-bediende flow is dat kleine race-window
 * acceptabel. Bij een conflict is er GEEN override: zonder lock is een
 * geforceerde dubbele boeking hier risicovoller dan bij de gelockte RPC's.
 */

export interface CreatePtIntakeInput {
  trainerId: string;
  prospectName: string;
  prospectEmail: string;
  prospectPhone?: string;
  /** ISO-timestamp. */
  startAt: string;
  /** Default 90 min. */
  durationMin?: number;
}

export type CreatePtIntakeResult =
  | { ok: true; ptSessionId: string; startAt: string; endAt: string }
  | { ok: false; message: string };

const DEFAULT_INTAKE_DURATION_MIN = 90;

export async function createPtIntake(
  input: CreatePtIntakeInput,
): Promise<CreatePtIntakeResult> {
  // C3: admin of actieve trainer. De service-role-insert hieronder heeft
  // geen DB-gate, dus deze TS-check is hier de enige toegangscontrole.
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };

  const name = input.prospectName.trim();
  const email = input.prospectEmail.trim();
  // COPY: confirm met Marlon
  if (!name) return { ok: false, message: "Naam is verplicht." };
  if (!email) return { ok: false, message: "E-mailadres is verplicht." };

  const durationMin = input.durationMin ?? DEFAULT_INTAKE_DURATION_MIN;
  if (durationMin < 1 || durationMin > 480) {
    return {
      ok: false,
      message: "De duur moet tussen 1 minuut en 8 uur liggen.",
    };
  }
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime()) || startAt.getTime() <= Date.now()) {
    return { ok: false, message: "Dit moment is al voorbij." };
  }
  const endAt = new Date(startAt.getTime() + durationMin * 60_000);

  const admin = createAdminClient();

  const { data: trainer } = await admin
    .from("trainers")
    .select("id, is_active, display_name")
    .eq("id", input.trainerId)
    .maybeSingle();
  if (!trainer?.is_active) {
    return { ok: false, message: "Deze trainer is niet actief." };
  }

  // Zelfde default als tmc.pt_trainer_settings (15 min); die functie zelf
  // is niet direct aanroepbaar (interne helper, geen grant), dus hier
  // rechtstreeks de instellingenrij lezen.
  const { data: settings } = await admin
    .from("pt_settings")
    .select("turnaround_min")
    .eq("trainer_id", input.trainerId)
    .maybeSingle();
  const turnaroundMin = settings?.turnaround_min ?? 15;

  const marginMs = Math.max(turnaroundMin, 60) * 60_000 + 4 * 3_600_000;
  const busy = await getPtBusy(
    input.trainerId,
    new Date(startAt.getTime() - marginMs).toISOString(),
    new Date(endAt.getTime() + marginMs).toISOString(),
  );
  const conflict = busy.find(
    (b) => new Date(b.blockedFrom) < endAt && startAt < new Date(b.blockedUntil),
  );
  if (conflict) {
    return {
      ok: false,
      // COPY: confirm met Marlon
      message: `Dit moment overlapt met een bestaande afspraak (${new Date(
        conflict.startAt,
      ).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}).`,
    };
  }

  const { data: session, error } = await admin
    .from("pt_sessions")
    .insert({
      trainer_id: input.trainerId,
      kind: "intake",
      format: null,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      duration_min: durationMin,
      capacity: 1,
      status: "scheduled",
      prospect_name: name,
      prospect_email: email,
      prospect_phone: input.prospectPhone?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !session) {
    console.error("[createPtIntake] insert failed", error);
    return {
      ok: false,
      message: "Intake inplannen lukte niet. Probeer opnieuw.",
    };
  }

  await emitEvent({
    type: "pt_intake.created",
    actorType: gate.actorType,
    actorId: gate.userId,
    subjectType: "pt_session",
    subjectId: session.id,
    payload: {
      trainer_id: input.trainerId,
      start_at: startAt.toISOString(),
      duration_min: durationMin,
    },
  });

  // PR K: bevestiging naar de prospect (prospect_email), zelfde
  // sendEmail-patroon als sendCustomerConfirmation bij een gewone
  // boeking. Een intake is gratis, dus geen prijs- of credit-taal.
  // Faalt stil: een mail-storing mag de geplande intake niet breken.
  try {
    await sendEmail({
      to: email,
      toName: name,
      // COPY: confirm met Marlon
      subject: "Je intake bij The Movement Club staat gepland",
      react: IntakeConfirmation({
        prospectName: name,
        trainerName: trainer.display_name ?? "je trainer",
        whenLabel: `${formatWeekdayDate(startAt)} · ${formatTimeRange(startAt, endAt)}`,
        // COPY: confirm met Marlon
        durationLabel: `${durationMin} minuten`,
        locationLabel: "Industrieweg 14P, Loosdrecht",
        siteUrl: siteUrl(),
      }),
    });
  } catch (err) {
    console.error("[createPtIntake] bevestiging skipped", err);
  }

  return {
    ok: true,
    ptSessionId: session.id,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}
