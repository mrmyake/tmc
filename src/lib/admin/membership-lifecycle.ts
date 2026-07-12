import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  cancelMollieSubscription,
  createMollieRecurringSubscription,
  getMollieSubscriptionInfo,
  hasValidMollieMandate,
  isMollieConfigured,
  updateMollieSubscriptionAmount,
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

interface CancelParams {
  membershipId: string;
  /** Verplichte reden; gaat het events-log in (audit). */
  reason: string;
  /** Gemarkeerde coulance/geschil-tak: stopt per direct, maakt de betaalde cyclus niet af. */
  hardStop?: boolean;
}

interface CancelRpcResult {
  ok: boolean;
  reason?: string;
  mode?: "immediate" | "scheduled";
  hard_stop?: boolean;
  effective_date?: string;
  cancelled_bookings?: number;
  already_cancelled?: boolean;
  already_scheduled?: boolean;
  end_date?: string;
}

/**
 * Admin-stop. Zelfde volgorde-discipline als pauzeren: Mollie-cancel EERST
 * (idempotent), dan pas de definer-RPC. Default plant de stop op het einde
 * van de betaalde cyclus en rijdt daarna op de bestaande
 * process-cancellations cron; hardStop stopt per direct. Faalt de RPC na
 * een geslaagde Mollie-cancel, dan is de incasso gestopt maar de lokale
 * staat ongewijzigd; opnieuw aanroepen is veilig.
 */
export async function cancelMembershipCore(
  params: CancelParams,
): Promise<LifecycleResult> {
  const admin = createAdminClient();
  const { data: m } = await admin
    .from("memberships")
    .select(
      "id, profile_id, status, start_date, billing_cycle_weeks, mollie_customer_id, mollie_subscription_id, pause_effective_date, cancellation_effective_date",
    )
    .eq("id", params.membershipId)
    .maybeSingle();

  if (!m) return { ok: false, message: "Abonnement niet gevonden." };
  if (m.status === "cancelled") {
    // COPY: confirm met Marlon
    return { ok: true, message: "Dit abonnement is al stopgezet." };
  }
  if (!m.billing_cycle_weeks) {
    return {
      ok: false,
      reason: "not_cancellable_plan",
      // COPY: confirm met Marlon
      message:
        "Dit product heeft geen doorlopende incasso; pas het tegoed aan in plaats van stop te zetten.",
    };
  }
  if (!params.reason?.trim()) {
    // COPY: confirm met Marlon
    return { ok: false, reason: "missing_reason", message: "Geef een reden op." };
  }

  // Einde van de betaalde dekking voor de default-modus. Bron is Mollie's
  // nextPaymentDate; is de subscription al gestopt (bv. door een pauze),
  // dan kent de RPC de dekking via pause_effective_date. Zonder enige
  // subscription valt hij terug op de berekende cyclusgrens.
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
          "Mollie is niet bereikbaar; de stopzetting is niet doorgevoerd. Probeer het opnieuw.",
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
          "De incasso kon bij Mollie niet gestopt worden; de stopzetting is niet doorgevoerd. Probeer het opnieuw.",
      };
    }
  } else if (!m.pause_effective_date && m.status === "active") {
    effectiveDate = nextCycleBoundary(m.start_date, m.billing_cycle_weeks);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_cancel_membership", {
    p_membership_id: params.membershipId,
    p_reason: params.reason.trim(),
    p_hard_stop: params.hardStop ?? false,
    p_effective_date: effectiveDate,
  });

  if (error) {
    console.error("[cancelMembershipCore] rpc failed", error);
    await sendNotification(
      "Stopzetting half doorgevoerd",
      `De Mollie-incasso van membership ${params.membershipId} is gestopt, maar de lokale stopzetting faalde (${error.message}). Opnieuw proberen is veilig en idempotent.`,
      "warning",
    );
    return {
      ok: false,
      reason: "rpc_failed",
      // COPY: confirm met Marlon
      message:
        "De incasso is gestopt, maar de stopzetting faalde. Probeer het direct opnieuw.",
    };
  }

  const result = data as CancelRpcResult | null;
  if (!result?.ok) {
    return {
      ok: false,
      reason: result?.reason,
      // COPY: confirm met Marlon
      message: `De stopzetting is geweigerd (${result?.reason ?? "onbekende reden"}).`,
    };
  }
  if (result.already_cancelled) {
    // COPY: confirm met Marlon
    return { ok: true, message: "Dit abonnement is al stopgezet." };
  }
  if (result.already_scheduled) {
    return {
      ok: true,
      // COPY: confirm met Marlon
      message: `De stopzetting stond al gepland per ${result.effective_date}.`,
      effectiveDate: result.effective_date,
    };
  }

  return {
    ok: true,
    // COPY: confirm met Marlon
    message:
      result.mode === "immediate"
        ? "Abonnement per direct stopgezet; de incasso is gestopt."
        : `Stopzetting gepland per ${result.effective_date} (einde van de betaalde cyclus); de incasso is per direct gestopt.`,
    effectiveDate: result.effective_date,
    cancelledBookings: result.cancelled_bookings,
  };
}

interface UndoCancellationRpcResult {
  ok: boolean;
  reason?: string;
  restored_status?: string;
  undone_effective_date?: string;
  already_active?: boolean;
  end_date?: string;
  cancellation_source?: string | null;
  cancellation_prior_status?: string | null;
}

/**
 * Undo van een GEPLANDE lid-opzegging (fase 2C). Bewust GEEN Mollie-actie:
 * de RPC staat undo alleen toe op een opzegging met lokale provenance
 * cancellation_source = 'member' en cancellation_prior_status = 'active',
 * en precies in dat geval is de Mollie-subscription gegarandeerd nooit
 * geraakt. Het lid-opzegpad cancelt Mollie niet (dat doet pas de
 * process-cancellations cron op de ingangsdatum, en de RPC weigert due
 * rijen met 'effectuation_due'), en elke route die Mollie WEL cancelt
 * (admin-stop, ook de already_scheduled-tak) markeert de rij als 'admin'
 * waarna de RPC 'not_safely_undoable' teruggeeft. De detectie is dus
 * lokaal en fail-dicht; er valt hier niets bij Mollie te herstellen of te
 * controleren.
 */
export async function undoMembershipCancellation(params: {
  membershipId: string;
}): Promise<LifecycleResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_undo_cancellation", {
    p_membership_id: params.membershipId,
  });

  if (error) {
    console.error("[undoMembershipCancellation] rpc failed", error);
    return {
      ok: false,
      reason: "rpc_failed",
      // COPY: confirm met Marlon
      message: "Het terugdraaien lukte niet. Probeer het opnieuw.",
    };
  }

  const result = data as UndoCancellationRpcResult | null;
  if (!result?.ok) {
    if (result?.reason === "not_safely_undoable") {
      return {
        ok: false,
        reason: result.reason,
        // COPY: confirm met Marlon
        message:
          "Deze opzegging is niet veilig terug te draaien: de incasso is al gestopt of de eerdere staat was niet actief. Gebruik hervatten of een nieuw abonnement.",
      };
    }
    if (result?.reason === "already_cancelled") {
      return {
        ok: false,
        reason: result.reason,
        // COPY: confirm met Marlon
        message:
          "Dit abonnement is al definitief stopgezet en kan niet worden teruggedraaid.",
      };
    }
    if (result?.reason === "effectuation_due") {
      return {
        ok: false,
        reason: result.reason,
        // COPY: confirm met Marlon
        message:
          "De einddatum van deze opzegging is bereikt; de afronding loopt al en kan niet meer worden teruggedraaid.",
      };
    }
    return {
      ok: false,
      reason: result?.reason,
      // COPY: confirm met Marlon
      message: `Het terugdraaien is geweigerd (${result?.reason ?? "onbekende reden"}).`,
    };
  }

  if (result.already_active) {
    // COPY: confirm met Marlon
    return { ok: true, message: "Dit abonnement is al actief." };
  }

  return {
    ok: true,
    // COPY: confirm met Marlon
    message:
      "De opzegging is teruggedraaid; het abonnement loopt gewoon door en de incasso was nooit gestopt.",
    effectiveDate: result.undone_effective_date,
  };
}

interface ChangeRequestParams {
  membershipId: string;
  targetSlug: string;
  extendedAccess?: boolean;
}

interface ChangeRpcResult {
  ok: boolean;
  reason?: string;
  request_id?: string;
  effective_date?: string;
  current_recurring_cents?: number;
  new_recurring_cents?: number;
  mollie_subscription_id?: string;
  mollie_customer_id?: string;
  already_pending?: boolean;
}

/**
 * Alleen-upgrade wijzigingsverzoek, effectief op de volgende factuurdatum,
 * geen proratie. Volgorde: (1) volgende factuurdatum uit Mollie
 * (nextPaymentDate) met een SEPA-aanloop-guard, (2) de definer-RPC legt het
 * verzoek vast met de catalogus-snapshot, (3) daarna pas het Mollie-bedrag
 * omhoog naar exact dat snapshot-bedrag. Faalt stap 3, dan wordt het
 * verzoek direct geannuleerd zodat bedrag en rechten nooit uiteenlopen.
 * De RPC accepteert eigenaar OF admin; deze core wordt door beide
 * voorkanten gedeeld.
 */
export async function requestMembershipChangeCore(
  params: ChangeRequestParams,
): Promise<LifecycleResult> {
  const admin = createAdminClient();
  const { data: m } = await admin
    .from("memberships")
    .select(
      "id, profile_id, status, billing_cycle_weeks, mollie_customer_id, mollie_subscription_id, pause_effective_date",
    )
    .eq("id", params.membershipId)
    .maybeSingle();

  if (!m) return { ok: false, message: "Abonnement niet gevonden." };
  if (!m.mollie_subscription_id) {
    return {
      ok: false,
      reason: "no_active_subscription",
      // COPY: confirm met Marlon
      message:
        "Er loopt nog geen incasso op dit abonnement; wijzigen kan pas als de eerste cyclus rond is.",
    };
  }

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
        "Mollie is niet bereikbaar; de wijziging is niet doorgevoerd. Probeer het opnieuw.",
    };
  }
  if (info.status !== "active" || !info.nextPaymentDate) {
    return {
      ok: false,
      reason: "no_active_subscription",
      // COPY: confirm met Marlon
      message:
        "De incasso van dit abonnement loopt niet; wijzigen kan alleen op een lopende incasso.",
    };
  }

  // SEPA-aanloop-guard: ligt de volgende incasso te dichtbij, dan kan het
  // bedrag daarvoor al bij de bank klaargezet zijn. Het verzoek schuift dan
  // een hele cyclus op: bedrag EN rechten wisselen samen, een cyclus later.
  const today = isoDate(new Date());
  const sepaLeadGuard = isoDate(new Date(Date.now() + 2 * 86400000));
  let effectiveDate = info.nextPaymentDate;
  if (effectiveDate <= sepaLeadGuard) {
    const cycleMs = (m.billing_cycle_weeks || 4) * 7 * 86400000;
    effectiveDate = isoDate(
      new Date(new Date(`${effectiveDate}T00:00:00Z`).getTime() + cycleMs),
    );
  }
  if (effectiveDate <= today) {
    return { ok: false, reason: "invalid_effective_date", message: "Ongeldige factuurdatum." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_membership_change", {
    p_membership_id: params.membershipId,
    p_target_slug: params.targetSlug,
    p_extended_access: params.extendedAccess ?? false,
    p_effective_date: effectiveDate,
  });

  if (error) {
    console.error("[requestMembershipChangeCore] rpc failed", error);
    return {
      ok: false,
      reason: "rpc_failed",
      // COPY: confirm met Marlon
      message: "De wijziging kon niet worden vastgelegd. Probeer het opnieuw.",
    };
  }
  const result = data as ChangeRpcResult | null;
  if (!result?.ok) {
    return {
      ok: false,
      reason: result?.reason,
      // COPY: confirm met Marlon
      message: `De wijziging is geweigerd (${result?.reason ?? "onbekende reden"}).`,
    };
  }
  if (result.already_pending) {
    return {
      ok: true,
      // COPY: confirm met Marlon
      message: `Deze wijziging stond al gepland per ${result.effective_date}.`,
      effectiveDate: result.effective_date,
    };
  }

  // Mollie-bedrag omhoog naar exact het snapshot-bedrag. Faalt dit, dan
  // wordt het verzoek teruggedraaid: nooit een pending wijziging waarvan
  // de eerstvolgende incasso het oude bedrag zou zijn.
  const raised = await updateMollieSubscriptionAmount(
    result.mollie_customer_id ?? m.mollie_customer_id,
    result.mollie_subscription_id ?? m.mollie_subscription_id,
    result.new_recurring_cents ?? 0,
  );
  if (!raised) {
    const { error: cancelErr } = await supabase.rpc(
      "cancel_membership_change_request",
      { p_request_id: result.request_id },
    );
    if (cancelErr) {
      console.error("[requestMembershipChangeCore] rollback failed", cancelErr);
      await sendNotification(
        "Wijzigingsverzoek inconsistent",
        `Membership ${params.membershipId}: het Mollie-bedrag kon niet verhoogd worden EN het terugdraaien van verzoek ${result.request_id} faalde ook. Handmatig controleren.`,
        "warning",
      );
    }
    return {
      ok: false,
      reason: "mollie_update_failed",
      // COPY: confirm met Marlon
      message:
        "Het incassobedrag kon bij Mollie niet aangepast worden; de wijziging is teruggedraaid. Probeer het opnieuw.",
    };
  }

  return {
    ok: true,
    // COPY: confirm met Marlon
    message: `Wijziging gepland per ${result.effective_date} (volgende factuurdatum). Vanaf dan geldt het nieuwe tarief van ${((result.new_recurring_cents ?? 0) / 100).toFixed(2).replace(".", ",")} euro per 4 weken.`,
    effectiveDate: result.effective_date,
  };
}

interface CancelChangeRpcResult {
  ok: boolean;
  reason?: string;
  membership_id?: string;
  mollie_customer_id?: string;
  mollie_subscription_id?: string;
  restore_recurring_cents?: number;
  already_cancelled?: boolean;
}

/**
 * Annuleer een pending wijzigingsverzoek en zet het Mollie-bedrag terug
 * naar de huidige recurring. Lokaal eerst (daarna kan de verwerking het
 * verzoek nooit meer toepassen), dan het Mollie-bedrag terug; faalt dat,
 * dan luid alarm zodat admin het bij Mollie herstelt.
 */
export async function cancelMembershipChangeCore(params: {
  requestId: string;
}): Promise<LifecycleResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "cancel_membership_change_request",
    { p_request_id: params.requestId },
  );
  if (error) {
    console.error("[cancelMembershipChangeCore] rpc failed", error);
    return {
      ok: false,
      reason: "rpc_failed",
      // COPY: confirm met Marlon
      message: "Annuleren lukte niet. Probeer het opnieuw.",
    };
  }
  const result = data as CancelChangeRpcResult | null;
  if (!result?.ok) {
    return {
      ok: false,
      reason: result?.reason,
      // COPY: confirm met Marlon
      message: `Annuleren is geweigerd (${result?.reason ?? "onbekende reden"}).`,
    };
  }
  if (result.already_cancelled) {
    // COPY: confirm met Marlon
    return { ok: true, message: "Dit verzoek was al geannuleerd." };
  }

  const restored = await updateMollieSubscriptionAmount(
    result.mollie_customer_id ?? null,
    result.mollie_subscription_id ?? null,
    result.restore_recurring_cents ?? 0,
  );
  if (!restored) {
    await sendNotification(
      "Mollie-bedrag niet teruggezet",
      `Wijzigingsverzoek ${params.requestId} is geannuleerd, maar het Mollie-bedrag van subscription ${result.mollie_subscription_id ?? "?"} kon niet teruggezet worden naar ${result.restore_recurring_cents ?? "?"} cent. Handmatig herstellen bij Mollie.`,
      "warning",
    );
    return {
      ok: true,
      // COPY: confirm met Marlon
      message:
        "Het verzoek is geannuleerd, maar het incassobedrag kon bij Mollie nog niet teruggezet worden; dit is gemeld.",
    };
  }

  // COPY: confirm met Marlon
  return { ok: true, message: "De geplande wijziging is geannuleerd." };
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
