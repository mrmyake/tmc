/**
 * Kern van de webhooktak voor tmc.checkout_intents ("betalen voor account",
 * PR 2). Geen Supabase, Mollie, GoTrue of Next hier: alles komt binnen via
 * `deps`, zodat scripts/checkout/intent-webhook-core.test.mts de paden
 * zonder netwerk kan bewijzen (nieuw account, bestaand account, herkansing
 * na failed, app_metadata-vergelijking bij email_exists, modecheck).
 *
 * Contract met de aanroeper (webhook, uurlijkse reconciliatie, staf-script):
 * - "converted": geld is binnen en de order staat in pending; de aanroeper
 *   draait daarna de bestaande activatieketen (runActivationChain) met
 *   isTest en de welkomstmail als bevestiging.
 * - "failed" en "ignored": vastgelegd, herhalen geeft dezelfde uitkomst, dus
 *   200 aan Mollie. De staf-alert is al verstuurd (alleen intent-id en code).
 * - "retry": transiënte fout (GoTrue of database niet bereikbaar) en er is
 *   nog niets onherroepelijks gebeurd; de webhook geeft 500 zodat Mollie
 *   herhaalt.
 * - "cancelled": betaling canceled, failed of expired; intent op cancelled,
 *   geen account.
 *
 * Dubbel createUser (twee gelijktijdige webhooks, of een time-out waarvan
 * de user wel is aangemaakt): elke aanmaak zet app_metadata.checkout_intent_id
 * (leden kunnen hun eigen app_metadata niet wijzigen, user_metadata wel).
 * Bij email_exists halen we de user op en vergelijken die marker; gelijk
 * betekent "door deze intent gemaakt" en dus p_profile_created true. Zo
 * wordt de verliezer van de race nooit een vals existing_account.
 */

export interface CheckoutIntentRow {
  id: string;
  status: string;
  mode: "live" | "test";
  kind: "subscription" | "product";
  catalogue_slug: string;
  first_charge_cents: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  acquisition_source: string | null;
  acquisition_medium: string | null;
  acquisition_campaign: string | null;
  acquisition_content: string | null;
  signup_path: string | null;
  first_touch_at: string | null;
  mollie_payment_id: string | null;
  paid_at: string | null;
  profile_id: string | null;
  order_id: string | null;
  conversion_error: string | null;
}

export interface IntentPaymentView {
  id: string;
  status: string;
  paidAt: string | null;
  amountCents: number;
}

export interface ConvertResult {
  ok: boolean;
  reason?: string;
  already_converted?: boolean;
  from_failed?: boolean;
  order_id?: string;
  profile_id?: string;
  login_token?: string;
  phone_skipped?: boolean;
  is_test?: boolean;
  intent_id?: string;
}

export type CreateUserResult =
  | { ok: true; userId: string }
  | { ok: false; emailExists: true }
  | { ok: false; emailExists?: false; error: unknown };

export interface IntentWebhookDeps {
  db: {
    getIntent(intentId: string): Promise<CheckoutIntentRow | null>;
    convert(args: {
      intentId: string;
      profileId: string;
      paymentId: string;
      paidAt: string;
      profileCreated: boolean;
    }): Promise<ConvertResult>;
    fail(args: { intentId: string; code: string; paidAt: string | null }): Promise<void>;
    cancel(args: { intentId: string; paymentId: string }): Promise<void>;
  };
  auth: {
    createUser(args: {
      email: string;
      intentId: string;
      firstName: string;
      lastName: string;
      acquisition: Record<string, string | null>;
    }): Promise<CreateUserResult>;
    userIdForEmail(email: string): Promise<string | null>;
    /** app_metadata.checkout_intent_id van de user, of null. */
    intentMarkerForUser(userId: string): Promise<string | null>;
  };
  /** Is deze fout transiënt (herhalen kan een andere uitkomst geven)? */
  isTransient(error: unknown): boolean;
  notify(title: string, message: string, tags?: string): Promise<unknown>;
  emit(event: {
    type: "checkout_intent.converted" | "member.created" | "order.created";
    subjectType: "checkout_intent" | "profile" | "order";
    subjectId: string;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
  now(): Date;
}

export type IntentWebhookOutcome =
  | { kind: "ignored"; reason: "intent_not_found" | "mode_mismatch" | "payment_mismatch" | "not_terminal" }
  | { kind: "cancelled"; intentId: string }
  | {
      kind: "converted";
      intentId: string;
      orderId: string;
      profileId: string;
      loginToken: string | null;
      isTest: boolean;
      alreadyConverted: boolean;
      fromFailed: boolean;
      phoneSkipped: boolean;
    }
  | { kind: "failed"; intentId: string; reason: string }
  | { kind: "retry"; intentId: string; reason: string; error: unknown };

type MarkerCheck = { ok: true; owns: boolean } | { ok: false; error: unknown };

const TERMINAL_FAILED = new Set(["failed", "expired", "canceled"]);

function acquisitionOf(intent: CheckoutIntentRow): Record<string, string | null> {
  return {
    acquisition_source: intent.acquisition_source,
    acquisition_medium: intent.acquisition_medium,
    acquisition_campaign: intent.acquisition_campaign,
    acquisition_content: intent.acquisition_content,
    signup_path: intent.signup_path,
    first_touch_at: intent.first_touch_at,
  };
}

export async function handleCheckoutIntentPayment(
  deps: IntentWebhookDeps,
  args: { intentId: string; payment: IntentPaymentView; mode: "live" | "test" },
): Promise<IntentWebhookOutcome> {
  const { intentId, payment, mode } = args;

  const intent = await deps.db.getIntent(intentId);
  if (!intent) {
    await deps.notify(
      "Gastcheckout: betaling zonder intent",
      `Betaling ${payment.id} verwijst naar intent ${intentId}, maar die bestaat niet. Handmatig naklopen.`,
      "warning",
    );
    return { kind: "ignored", reason: "intent_not_found" };
  }

  // Modecheck: convert_checkout_intent vergelijkt de modus niet zelf. Een
  // testbetaling op een live-intent (of andersom) is een configuratiefout,
  // nooit iets om stil te converteren.
  if (intent.mode !== mode) {
    await deps.notify(
      "Gastcheckout: modus klopt niet",
      `Intent ${intent.id} is ${intent.mode}, de webhook kwam binnen als ${mode}. Niet verwerkt.`,
      "warning",
    );
    return { kind: "ignored", reason: "mode_mismatch" };
  }

  if (intent.mollie_payment_id !== payment.id) {
    // Een vervangen betaling (Opnieuw proberen) meldt zich later nog met
    // canceled, expired of failed: stil negeren. Alleen een betaalde
    // verweesde betaling is geld zonder koppeling en vraagt om een mens.
    if (payment.status === "paid") {
      await deps.notify(
        "Gastcheckout: betaalde verweesde betaling",
        `paid_orphan_payment: intent ${intent.id}, betaling ${payment.id}. Hoort niet (meer) bij de intent; refund of handmatig koppelen.`,
        "warning",
      );
    }
    return { kind: "ignored", reason: "payment_mismatch" };
  }

  if (payment.status !== "paid") {
    if (TERMINAL_FAILED.has(payment.status)) {
      // Geen account, geen order: de intent gaat naar cancelled (idempotent
      // in de RPC), de bezoeker kan via "Opnieuw proberen" een nieuwe
      // betaling starten op dezelfde intent.
      await deps.db.cancel({ intentId: intent.id, paymentId: payment.id });
      return { kind: "cancelled", intentId: intent.id };
    }
    return { kind: "ignored", reason: "not_terminal" };
  }

  const paidAt = payment.paidAt ?? deps.now().toISOString();

  // Al geconverteerd: convert geeft het bestaande resultaat terug zonder
  // nieuw inlogtoken; de aanroeper draait de keten opnieuw (idempotent).
  if (intent.status === "converted" && intent.profile_id && intent.order_id) {
    return {
      kind: "converted",
      intentId: intent.id,
      orderId: intent.order_id,
      profileId: intent.profile_id,
      loginToken: null,
      isTest: intent.mode === "test",
      alreadyConverted: true,
      fromFailed: false,
      phoneSkipped: false,
    };
  }

  // Profiel bepalen. Volgorde: eerder vastgelegd profiel (herkansing na
  // failed), dan precheck op het adres, dan createUser, dan bij
  // email_exists de marker vergelijken (race of time-out).
  let profileId: string | null = null;
  let profileCreated = false;

  if (intent.profile_id) {
    profileId = intent.profile_id;
    profileCreated = false; // convert herkent het eigen vastgelegde profiel
  } else if (!intent.email || !intent.first_name || !intent.last_name) {
    // PII al weg (kan alleen na de 30-dagen-wis): niets om een account van
    // te maken; geld is binnen, dus staf.
    await deps.db.fail({ intentId: intent.id, code: "intent_pii_missing", paidAt });
    await deps.notify(
      "Gastcheckout: betaling op intent zonder gegevens",
      `Intent ${intent.id} is betaald maar de gegevens zijn al gewist. Handmatig afronden.`,
      "warning",
    );
    return { kind: "failed", intentId: intent.id, reason: "intent_pii_missing" };
  } else {
    const resolved = await resolveProfile(deps, intent, paidAt);
    if (resolved.kind !== "resolved") return resolved.outcome;
    profileId = resolved.profileId;
    profileCreated = resolved.profileCreated;
  }

  let result: ConvertResult;
  try {
    result = await deps.db.convert({
      intentId: intent.id,
      profileId,
      paymentId: payment.id,
      paidAt,
      profileCreated,
    });
  } catch (error) {
    if (deps.isTransient(error)) {
      return { kind: "retry", intentId: intent.id, reason: "convert_transient", error };
    }
    await deps.db.fail({ intentId: intent.id, code: "convert_rpc_error", paidAt });
    await deps.notify(
      "Gastcheckout: conversie gaf een fout",
      `Intent ${intent.id}: convert_checkout_intent faalde blijvend (convert_rpc_error). Betaling is binnen; handmatig afronden of het script retry-intent draaien.`,
      "warning",
    );
    return { kind: "failed", intentId: intent.id, reason: "convert_rpc_error" };
  }

  if (!result.ok) {
    const reason = result.reason ?? "unknown";
    // existing_account, order_conflict en profile_not_found zijn door de RPC
    // al als failed-na-paid vastgelegd; de overige twee zijn onverwacht en
    // krijgen hier hun code.
    if (reason !== "existing_account" && reason !== "order_conflict" && reason !== "profile_not_found") {
      await deps.db.fail({ intentId: intent.id, code: `convert_${reason}`, paidAt });
    }
    await deps.notify(
      "Gastcheckout: betaald maar niet afgerond",
      `Intent ${intent.id}: ${reason}. Betaling is binnen, geen account of order aangemaakt. Neem binnen een werkdag contact op met de klant (scherm 7) of draai retry-intent na herstel.`,
      "warning",
    );
    return { kind: "failed", intentId: intent.id, reason };
  }

  const orderId = result.order_id as string;
  const isTest = Boolean(result.is_test ?? intent.mode === "test");
  if (!result.already_converted) {
    await deps.emit({
      type: "checkout_intent.converted",
      subjectType: "checkout_intent",
      subjectId: intent.id,
      payload: {
        intent_id: intent.id,
        profile_id: profileId,
        order_id: orderId,
        slug: intent.catalogue_slug,
        kind: intent.kind,
        mode: intent.mode,
        from_failed: Boolean(result.from_failed),
        phone_skipped: Boolean(result.phone_skipped),
        profile_created: profileCreated,
      },
    });
    if (profileCreated) {
      await deps.emit({
        type: "member.created",
        subjectType: "profile",
        subjectId: profileId,
        payload: { profile_id: profileId, source: "guest_checkout" },
      });
    }
    await deps.emit({
      type: "order.created",
      subjectType: "order",
      subjectId: orderId,
      payload: {
        profile_id: profileId,
        order_id: orderId,
        slug: intent.catalogue_slug,
        first_charge_cents: intent.first_charge_cents,
        intent_id: intent.id,
        via: "checkout_intent",
      },
    });
    if (result.phone_skipped) {
      await deps.notify(
        "Gastcheckout: telefoonnummer overgeslagen",
        `Intent ${intent.id}: het nummer hoorde al bij een ander profiel en is niet overgenomen. Lid kan het zelf aanpassen.`,
        "warning",
      );
    }
  }

  return {
    kind: "converted",
    intentId: intent.id,
    orderId,
    profileId,
    loginToken: result.login_token ?? null,
    isTest,
    alreadyConverted: Boolean(result.already_converted),
    fromFailed: Boolean(result.from_failed),
    phoneSkipped: Boolean(result.phone_skipped),
  };
}

type ResolveOutcome =
  | { kind: "resolved"; profileId: string; profileCreated: boolean }
  | { kind: "stop"; outcome: IntentWebhookOutcome };

async function resolveProfile(
  deps: IntentWebhookDeps,
  intent: CheckoutIntentRow,
  paidAt: string,
): Promise<ResolveOutcome> {
  const email = intent.email as string;

  // Precheck: bestaat het adres al? Dan geen createUser-poging.
  let existingId: string | null;
  try {
    existingId = await deps.auth.userIdForEmail(email);
  } catch (error) {
    if (deps.isTransient(error)) {
      return { kind: "stop", outcome: { kind: "retry", intentId: intent.id, reason: "auth_lookup_transient", error } };
    }
    existingId = null;
  }
  if (existingId) {
    return resolveByMarker(deps, intent, paidAt, existingId);
  }

  const created = await deps.auth.createUser({
    email,
    intentId: intent.id,
    firstName: intent.first_name as string,
    lastName: intent.last_name as string,
    acquisition: acquisitionOf(intent),
  });
  if (created.ok) {
    return { kind: "resolved", profileId: created.userId, profileCreated: true };
  }
  if (created.emailExists) {
    // Race met een gelijktijdige webhook of een time-out van onze eigen
    // createUser: de user bestaat nu wel. Marker beslist wie hem maakte.
    const raced = await deps.auth.userIdForEmail(email);
    if (!raced) {
      return { kind: "stop", outcome: { kind: "retry", intentId: intent.id, reason: "auth_race_unresolved", error: null } };
    }
    return resolveByMarker(deps, intent, paidAt, raced);
  }
  if (deps.isTransient(created.error)) {
    return { kind: "stop", outcome: { kind: "retry", intentId: intent.id, reason: "auth_create_user_transient", error: created.error } };
  }
  await deps.db.fail({ intentId: intent.id, code: "createuser_failed", paidAt });
  await deps.notify(
    "Gastcheckout: account aanmaken mislukt",
    `Intent ${intent.id}: createUser faalde blijvend (createuser_failed). Betaling is binnen; handmatig afronden of retry-intent draaien.`,
    "warning",
  );
  return { kind: "stop", outcome: { kind: "failed", intentId: intent.id, reason: "createuser_failed" } };
}

/**
 * Beslist op app_metadata.checkout_intent_id of een bestaande user door deze
 * intent is gemaakt. Een fout bij het lezen van de marker mag nooit stil
 * "bestaand account" worden: transiënt wordt een retry (Mollie herhaalt),
 * blijvend wordt failed met code auth_marker_error plus staf-alert.
 */
async function resolveByMarker(
  deps: IntentWebhookDeps,
  intent: CheckoutIntentRow,
  paidAt: string,
  userId: string,
): Promise<ResolveOutcome> {
  const marker = await ownsIntent(deps, userId, intent.id);
  if (marker.ok) return { kind: "resolved", profileId: userId, profileCreated: marker.owns };
  if (deps.isTransient(marker.error)) {
    return { kind: "stop", outcome: { kind: "retry", intentId: intent.id, reason: "auth_marker_transient", error: marker.error } };
  }
  await deps.db.fail({ intentId: intent.id, code: "auth_marker_error", paidAt });
  await deps.notify(
    "Gastcheckout: accountcontrole mislukt",
    `Intent ${intent.id}: de marker van de bestaande user kon niet gelezen worden (auth_marker_error). Betaling is binnen; handmatig afronden of retry-intent draaien.`,
    "warning",
  );
  return { kind: "stop", outcome: { kind: "failed", intentId: intent.id, reason: "auth_marker_error" } };
}

async function ownsIntent(deps: IntentWebhookDeps, userId: string, intentId: string): Promise<MarkerCheck> {
  try {
    return { ok: true, owns: (await deps.auth.intentMarkerForUser(userId)) === intentId };
  } catch (error) {
    return { ok: false, error };
  }
}
