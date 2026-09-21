import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCancellationNoticeDays } from "@/lib/cancellation-notice";
import { getDeletionConfig } from "@/lib/account-deletion/config";
import { computePurgeAfter } from "@/lib/account-deletion/core";
import { addDaysIsoAmsterdam, todayIsoAmsterdam } from "@/lib/format-date";

/**
 * Leesdeel van de ledenkant van de accountverwijdering (PR 3). Alleen
 * queries op de cookie-client van het lid (RLS self-read), geen mutaties;
 * de kern (src/lib/account-deletion/core.ts) blijft onaangeraakt.
 *
 * De voorwaarde hier spiegelt die van de kern: elke membership in een
 * niet-terminale status behalve cancellation_requested telt als lopend.
 * Dat geldt ook voor credit-rijen (rittenkaart, PT-pakket,
 * billing_cycle_weeks = 0) met status active: de kern maakt daar vandaag
 * geen onderscheid in, dus de UI ook niet, met eigen copy. Zie de PR-body
 * voor dit bekende gat.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

const LIVE_STATUSES = ["pending", "active", "paused", "cancellation_requested", "payment_failed"];

export interface PreflightMembership {
  id: string;
  planVariant: string | null;
  status: string;
  /** true: abonnement met incasso; false: rittenkaart of PT-pakket (credits). */
  isSubscription: boolean;
  commitEndDate: string | null;
  cancellationEffectiveDate: string | null;
  creditsRemaining: number;
  creditsExpiresAt: string | null;
  /** Vroegste opzegdatum als het abonnement nog loopt: max(commit_end_date, vandaag + opzegtermijn). */
  earliestCancellationDate: string | null;
}

export interface OpenDeletionRequest {
  id: string;
  status: string;
  requestedAt: string;
  purgeAfter: string;
}

export interface DeletionPreflight {
  /** Lopende memberships die het verzoek tegenhouden (zelfde regel als de kern). */
  running: PreflightMembership[];
  /** Al opgezegde abonnementen (cancellation_requested) met hun ingangsdatum. */
  cancelled: PreflightMembership[];
  /** Credit-rijen met resterend tegoed; vervallen bij verwijdering. */
  credits: PreflightMembership[];
  bookings: number;
  waitlist: number;
  ptSessions: number;
  guestBookings: number;
  invoices: number;
  /** Open verwijderverzoek, als dat er is. */
  open: OpenDeletionRequest | null;
  /**
   * Verwachte purge-datum (ISO) als het verzoek nu ingediend zou worden,
   * of, bij een lopend abonnement, als het lid vandaag opzegt.
   */
  expectedPurgeAfter: string;
  /** Bedenktijd in dagen, voor de copy. */
  coolingOffDays: number;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getDeletionPreflight(
  supabase: AnyClient,
  userId: string,
  now: Date = new Date(),
): Promise<DeletionPreflight> {
  const today = todayIsoAmsterdam(now);
  const nowIso = now.toISOString();
  const [memberships, bookings, waitlist, ptBookings, guestBookings, invoices, open, noticeDays] =
    await Promise.all([
      supabase
        .from("memberships")
        .select(
          "id, plan_variant, status, billing_cycle_weeks, commit_end_date, cancellation_effective_date, credits_remaining, credits_expires_at",
        )
        .eq("profile_id", userId)
        .in("status", LIVE_STATUSES),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", userId)
        .in("status", ["booked", "waitlisted"])
        .gte("session_date", today),
      supabase
        .from("waitlist_entries")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", userId),
      supabase
        .from("pt_bookings")
        .select("id, pt_session:pt_sessions!pt_session_id(start_at)")
        .eq("profile_id", userId)
        .in("status", ["pending", "booked"]),
      supabase
        .from("guest_bookings")
        .select("id, session:class_sessions!session_id(start_at)")
        .eq("booked_by", userId)
        .eq("status", "booked"),
      supabase
        .from("invoices")
        .select("issued_at", { count: "exact" })
        .eq("profile_id", userId)
        .order("issued_at", { ascending: false })
        .limit(1),
      supabase
        .from("account_deletions")
        .select("id, status, requested_at, purge_after")
        .eq("profile_id", userId)
        .in("status", ["requested", "in_progress", "blocked"])
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getCancellationNoticeDays(),
    ]);

  const rows = (memberships.data ?? []) as Array<{
    id: string;
    plan_variant: string | null;
    status: string;
    billing_cycle_weeks: number;
    commit_end_date: string;
    cancellation_effective_date: string | null;
    credits_remaining: number | null;
    credits_expires_at: string | null;
  }>;

  const earliestCancellation = addDaysIsoAmsterdam(today, noticeDays);
  const all: PreflightMembership[] = rows.map((m) => {
    const isSubscription = (m.billing_cycle_weeks ?? 0) > 0;
    const runningSubscription = isSubscription && m.status !== "cancellation_requested";
    return {
      id: m.id,
      planVariant: m.plan_variant,
      status: m.status,
      isSubscription,
      commitEndDate: m.commit_end_date ?? null,
      cancellationEffectiveDate: m.cancellation_effective_date,
      creditsRemaining: m.credits_remaining ?? 0,
      creditsExpiresAt: m.credits_expires_at,
      earliestCancellationDate: runningSubscription
        ? m.commit_end_date > earliestCancellation
          ? m.commit_end_date
          : earliestCancellation
        : null,
    };
  });

  const running = all.filter((m) => m.status !== "cancellation_requested");
  const cancelled = all.filter((m) => m.status === "cancellation_requested");
  const credits = all.filter((m) => !m.isSubscription && m.creditsRemaining > 0);

  const futurePt = ((ptBookings.data ?? []) as Array<{ pt_session: unknown }>).filter((b) => {
    const s = one(b.pt_session as { start_at: string } | { start_at: string }[] | null);
    return Boolean(s?.start_at && s.start_at >= nowIso);
  }).length;
  const futureGuests = ((guestBookings.data ?? []) as Array<{ session: unknown }>).filter((b) => {
    const s = one(b.session as { start_at: string } | { start_at: string }[] | null);
    return Boolean(s?.start_at && s.start_at >= nowIso);
  }).length;

  const latestInvoice =
    ((invoices.data ?? []) as Array<{ issued_at: string | null }>)[0]?.issued_at ?? null;

  // Zelfde formule als de kern bij een verzoek: bedenktijd, ingangsdatum
  // van elke opzegging, laatste factuur. Voor een lopend abonnement rekenen
  // we met de vroegste opzegdatum, alsof het lid vandaag opzegt.
  const config = getDeletionConfig();
  const dates: Array<string | null> = [
    ...cancelled.map((m) => m.cancellationEffectiveDate),
    ...running.map((m) => m.earliestCancellationDate),
    latestInvoice,
  ];
  const expectedPurgeAfter = computePurgeAfter(now, config, dates, false).toISOString();

  const openRow = open.data as {
    id: string;
    status: string;
    requested_at: string;
    purge_after: string;
  } | null;

  return {
    running,
    cancelled,
    credits,
    bookings: bookings.count ?? 0,
    waitlist: waitlist.count ?? 0,
    ptSessions: futurePt,
    guestBookings: futureGuests,
    invoices: invoices.count ?? 0,
    open: openRow
      ? {
          id: openRow.id,
          status: openRow.status,
          requestedAt: openRow.requested_at,
          purgeAfter: openRow.purge_after,
        }
      : null,
    expectedPurgeAfter,
    coolingOffDays: config.coolingOffDays,
  };
}
