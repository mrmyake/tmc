import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  cancelMollieSubscription,
  createMollieRecurringSubscription,
  getMollieSubscriptionInfo,
  hasValidMollieMandate,
  isMollieConfigured,
} from "@/lib/mollie";
import { mollieWebhookUrl } from "@/lib/site-url";
import { sendNotification } from "@/lib/ntfy";

/**
 * Gedeelde lifecycle-servicelaag (klantbeheer-workstream, fase 1: pauze en
 * hervatten). Dit is de ENIGE plek die Mollie-orkestratie combineert met de
 * SECURITY DEFINER RPC's; admin-actions en (later) de lid-voorkant zijn
 * dunne aanroepers.
 *
 * Volgorde-invariant (zelfde stance als de process-cancellations cron):
 * - Pauzeren: Mollie-cancel EERST, dan pas de lokale RPC. Faalt de RPC na
 *   een geslaagde cancel, dan is de incasso gestopt maar de lokale staat
 *   ongewijzigd; opnieuw aanroepen is veilig (de cancel is idempotent).
 *   We markeren nooit lokaal een pauze terwijl de incasso nog loopt.
 * - Hervatten: mandaat-check EERST (nooit stil een nieuw mandaat), dan de
 *   nieuwe subscription (deterministische idempotencyKey), dan de lokale
 *   RPC. Faalt die, dan wordt de zojuist gemaakte subscription compenserend
 *   geannuleerd zodat er nooit incasso loopt op een lid dat lokaal nog
 *   gepauzeerd staat.
 *
 * De RPC's zijn tmc.is_admin()-gated en lezen auth.uid(); ze worden daarom
 * via de cookie-client van de ingelogde admin aangeroepen, niet via de
 * service-role-client.
 */

export type LifecycleResult =
  | {
      ok: true;
      message: string;
      effectiveDate?: string;
      cancelledBookings?: number;
      shiftDays?: number;
    }
  | { ok: false; message: string; reason?: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Volgende cyclusgrens vanaf start_date. Fallback voor het uitzonderlijke
 * geval dat er geen actieve Mollie-subscription is om nextPaymentDate uit te
 * lezen (bv. subscription-creatie faalde eerder, of een retry nadat de
 * cancel al gelukt was).
 */
function nextCycleBoundary(startDate: string, cycleWeeks: number): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const cycleMs = cycleWeeks * 7 * 86400000;
  const elapsed = Math.max(0, Date.now() - start.getTime());
  const k = Math.floor(elapsed / cycleMs) + 1;
  return isoDate(new Date(start.getTime() + k * cycleMs));
}

interface PauseParams {
  membershipId: string;
  /** Alleen gebruikt zonder pauseRequestId; met request-id telt de reden van de aanvraag. */
  reason?: string;
  /** Optionele pending rij uit membership_pauses (lid-aanvraag) die deze pauze effectueert. */
  pauseRequestId?: string;
}

interface PauseRpcResult {
  ok: boolean;
  reason?: string;
  pause_id?: string;
  pause_effective_date?: string;
  immediate?: boolean;
  cancelled_bookings?: number;
  already_planned?: boolean;
  already_paused?: boolean;
}

export async function pauseMembershipCore(
  params: PauseParams,
): Promise<LifecycleResult> {
  const admin = createAdminClient();
  const { data: m } = await admin
    .from("memberships")
    .select(
      "id, profile_id, status, start_date, billing_cycle_weeks, mollie_customer_id, mollie_subscription_id, pause_effective_date",
    )
    .eq("id", params.membershipId)
    .maybeSingle();

  if (!m) return { ok: false, message: "Abonnement niet gevonden." };
  if (m.status === "paused" || m.pause_effective_date) {
    return {
      ok: true,
      // COPY: confirm met Marlon
      message: "Dit abonnement is al gepauzeerd of de pauze staat al gepland.",
      effectiveDate: m.pause_effective_date ?? undefined,
    };
  }
  if (m.status !== "active") {
    return {
      ok: false,
      reason: "not_pausable",
      // COPY: confirm met Marlon
      message: "Alleen een actief abonnement kan gepauzeerd worden.",
    };
  }
  if (!m.billing_cycle_weeks) {
    return {
      ok: false,
      reason: "not_pausable_plan",
      // COPY: confirm met Marlon
      message:
        "Dit product heeft geen doorlopende incasso en kan niet gepauzeerd worden.",
    };
  }

  // Ingangsdatum: het einde van de lopende betaalde cyclus. Bron is Mollie's
  // nextPaymentDate; zonder actieve subscription de berekende cyclusgrens.
  let effectiveDate: string | null = null;
  if (m.mollie_subscription_id) {
    const info = await getMollieSubscriptionInfo(
      m.mollie_customer_id,
      m.mollie_subscription_id,
    );
    if (!info) {
      return {
        ok: false,
        reason: "mollie_unreachable",
        // COPY: confirm met Marlon
        message:
          "Mollie is niet bereikbaar; de pauze is niet doorgevoerd. Probeer het opnieuw.",
      };
    }
    if (info.status === "active" && info.nextPaymentDate) {
      effectiveDate = info.nextPaymentDate;
    }

    // Mollie-eerst: stop de incasso. Idempotent; bij falen geen lokale
    // wijziging, de volgende poging herprobeert.
    const stopped = await cancelMollieSubscription(
      m.mollie_customer_id,
      m.mollie_subscription_id,
    );
    if (!stopped) {
      return {
        ok: false,
        reason: "mollie_cancel_failed",
        // COPY: confirm met Marlon
        message:
          "De incasso kon bij Mollie niet gestopt worden; de pauze is niet doorgevoerd. Probeer het opnieuw.",
      };
    }
  }
  if (!effectiveDate) {
    effectiveDate = nextCycleBoundary(m.start_date, m.billing_cycle_weeks);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_pause_membership", {
    p_membership_id: params.membershipId,
    p_pause_effective_date: effectiveDate,
    p_reason: params.reason ?? "other_approved",
    p_pause_request_id: params.pauseRequestId ?? null,
  });

  if (error) {
    console.error("[pauseMembershipCore] rpc failed", error);
    await sendNotification(
      "Pauze half doorgevoerd",
      `De Mollie-incasso van membership ${params.membershipId} is gestopt, maar de lokale pauze-registratie faalde (${error.message}). Opnieuw proberen is veilig en idempotent.`,
      "warning",
    );
    return {
      ok: false,
      reason: "rpc_failed",
      // COPY: confirm met Marlon
      message:
        "De incasso is gestopt, maar de pauze-registratie faalde. Probeer het direct opnieuw.",
    };
  }

  const result = data as PauseRpcResult | null;
  if (!result?.ok) {
    return {
      ok: false,
      reason: result?.reason,
      // COPY: confirm met Marlon
      message: `De pauze is geweigerd (${result?.reason ?? "onbekende reden"}).`,
    };
  }

  return {
    ok: true,
    // COPY: confirm met Marlon
    message: result.immediate
      ? "Abonnement per direct gepauzeerd."
      : `Pauze gepland per ${result.pause_effective_date} (einde van de lopende, al betaalde cyclus).`,
    effectiveDate: result.pause_effective_date,
    cancelledBookings: result.cancelled_bookings,
  };
}

interface ResumeRpcResult {
  ok: boolean;
  reason?: string;
  pause_id?: string;
  shift_days?: number;
  commit_end_date?: string;
  already_active?: boolean;
  same_subscription?: boolean;
  mollie_subscription_id?: string;
}

export async function resumeMembershipCore(params: {
  membershipId: string;
}): Promise<LifecycleResult> {
  const admin = createAdminClient();
  const { data: m } = await admin
    .from("memberships")
    .select(
      "id, profile_id, status, price_per_cycle_cents, extended_access_price_cents, billing_cycle_weeks, mollie_customer_id, mollie_subscription_id, pause_effective_date, resume_blocked_reason",
    )
    .eq("id", params.membershipId)
    .maybeSingle();

  if (!m) return { ok: false, message: "Abonnement niet gevonden." };
  if (m.status === "active" && !m.pause_effective_date) {
    // COPY: confirm met Marlon
    return { ok: true, message: "Dit abonnement is al actief." };
  }
  if (!m.pause_effective_date || !["active", "paused"].includes(m.status)) {
    return {
      ok: false,
      reason: "not_paused",
      // COPY: confirm met Marlon
      message: "Dit abonnement is niet gepauzeerd.",
    };
  }
  if (!isMollieConfigured()) {
    return {
      ok: false,
      reason: "mollie_not_configured",
      message: "Mollie is niet geconfigureerd; hervatten kan nu niet.",
    };
  }

  // Een Mollie-customer per profiel: de membership-kopie, met het profiel
  // als canonieke bron. Er wordt hier nooit een customer aangemaakt.
  let customerId: string | null = m.mollie_customer_id;
  if (!customerId) {
    const { data: p } = await admin
      .from("profiles")
      .select("mollie_customer_id")
      .eq("id", m.profile_id)
      .maybeSingle();
    customerId = p?.mollie_customer_id ?? null;
  }

  const supabase = await createClient();

  if (!customerId) {
    await supabase.rpc("admin_flag_resume_blocked", {
      p_membership_id: params.membershipId,
      p_reason: "no_mollie_customer",
    });
    return {
      ok: false,
      reason: "no_mollie_customer",
      // COPY: confirm met Marlon
      message:
        "Er is geen Mollie-klant voor dit lid; hervatten kan alleen via een nieuwe eerste betaling.",
    };
  }

  // Mandaat-check EERST: is het mandaat ingetrokken of verlopen, dan geen
  // stille nieuwe subscription maar de expliciete herautorisatie-staat.
  const mandateValid = await hasValidMollieMandate(customerId);
  if (mandateValid === null) {
    return {
      ok: false,
      reason: "mollie_unreachable",
      // COPY: confirm met Marlon
      message:
        "Mollie is niet bereikbaar; hervatten is niet doorgevoerd. Probeer het opnieuw.",
    };
  }
  if (!mandateValid) {
    const { error: flagError } = await supabase.rpc(
      "admin_flag_resume_blocked",
      {
        p_membership_id: params.membershipId,
        p_reason: "mandate_invalid",
      },
    );
    if (flagError) {
      console.error("[resumeMembershipCore] flag rpc failed", flagError);
    }
    return {
      ok: false,
      reason: "mandate_invalid",
      // COPY: confirm met Marlon
      message:
        "Het SEPA-mandaat is ingetrokken of verlopen. Er is geen incasso gestart; het lid moet opnieuw autoriseren via een nieuwe eerste betaling.",
    };
  }

  // Nieuwe subscription op het bestaande mandaat. startDate is de eerste
  // onbetaalde dag: bij hervatten VOOR de ingangsdatum (pauze terugdraaien)
  // de al betaalde cyclusgrens zelf, anders vandaag. De deterministische
  // idempotencyKey maakt een dubbelklik onschadelijk: Mollie geeft dan
  // dezelfde subscription terug.
  const today = isoDate(new Date());
  const startDate =
    m.pause_effective_date > today ? m.pause_effective_date : today;
  const amountCents =
    (m.price_per_cycle_cents ?? 0) + (m.extended_access_price_cents ?? 0);

  const sub = await createMollieRecurringSubscription({
    customerId,
    amountCents,
    intervalDays: (m.billing_cycle_weeks || 4) * 7,
    startDate,
    description: `TMC hervatting membership ${m.id}`,
    membershipId: m.id,
    idempotencyKey: `resume-${m.id}-${m.pause_effective_date}`,
    webhookUrl: mollieWebhookUrl(),
  });
  if (!sub) {
    return {
      ok: false,
      reason: "mollie_subscription_failed",
      // COPY: confirm met Marlon
      message:
        "De nieuwe incasso kon bij Mollie niet aangemaakt worden; hervatten is niet doorgevoerd. Probeer het opnieuw.",
    };
  }

  const { data, error } = await supabase.rpc("admin_resume_membership", {
    p_membership_id: params.membershipId,
    p_new_subscription_id: sub.id,
    p_resume_date: today,
  });

  const result = (data as ResumeRpcResult | null) ?? null;
  if (error || !result?.ok) {
    // Compenserend: nooit een lopende incasso op een lid dat lokaal nog
    // gepauzeerd staat. De cancel is idempotent; falen wordt luid gemeld.
    const rolledBack = await cancelMollieSubscription(customerId, sub.id);
    console.error("[resumeMembershipCore] rpc failed", error, result);
    if (!rolledBack) {
      await sendNotification(
        "Hervatten inconsistent",
        `Membership ${params.membershipId}: de lokale hervat-registratie faalde EN de compenserende Mollie-cancel van ${sub.id} faalde ook. Handmatig controleren bij Mollie.`,
        "warning",
      );
    }
    return {
      ok: false,
      reason: result?.reason ?? "rpc_failed",
      // COPY: confirm met Marlon
      message:
        "Hervatten is niet doorgevoerd; de aangemaakte incasso is teruggedraaid. Probeer het opnieuw.",
    };
  }

  if (result.already_active) {
    return {
      ok: true,
      // COPY: confirm met Marlon
      message: "Dit abonnement is al hervat.",
    };
  }

  return {
    ok: true,
    // COPY: confirm met Marlon
    message: `Abonnement hervat; de incasso loopt weer vanaf ${startDate}. De einddatum van de verplichting schuift ${result.shift_days ?? 0} dagen op.`,
    effectiveDate: startDate,
    shiftDays: result.shift_days,
  };
}
