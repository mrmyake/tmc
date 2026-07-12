import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addDaysIsoAmsterdam,
  formatDateLong,
  formatDaysAgo,
  isoDateAmsterdam,
  todayIsoAmsterdam,
} from "@/lib/format-date";
import {
  loadActiveProgramForMember,
  loadProgramProgressForMember,
} from "@/lib/member/training-program-query";
import {
  CREDIT_TYPE_LABELS,
  creditType,
  type CreditMembershipRow,
} from "../producten/lib";
import {
  creditDots,
  initialsOf,
  resolveSalutation,
  resolveStatusLine,
  resolveStatusLineDisplay,
  type ResolvedStatusLine,
} from "./dashboard";
import type { EntitlementRow, EntitlementUpsell } from "../_components/DashboardEntitlements";

// Zelfde vijf statussen als /app/abonnement's currentResult (ACTIVE_STATUSES).
const ACTIVE_STATUSES = [
  "pending",
  "active",
  "paused",
  "cancellation_requested",
  "payment_failed",
];

function logIfError(tag: string, error: { message: string } | null) {
  if (error) {
    console.error(`[dashboard-data] ${tag} query failed:`, error.message);
  }
}

export interface DashboardCreditCard {
  id: string;
  typeName: string;
  typeSub: string;
  remaining: number;
  total: number;
  dots: boolean[];
  nudgeText: string | null;
  buttonLabel: string;
  validityText: string;
}

export interface DashboardNextSession {
  startAt: Date;
  endAt: Date;
  className: string;
  trainerName: string;
}

export interface DashboardSchemaTeaser {
  title: string;
  nextWorkoutLabel: string;
  exerciseCount: number;
  lastLoggedText: string | null;
}

export type DashboardData =
  | {
      kind: "onboarding";
      firstName: string;
      intakeDone: boolean;
    }
  | {
      kind: "dashboard";
      greeting: {
        salutation: string;
        firstName: string;
        initials: string;
        subline: string;
      };
      planBadge: string | null;
      statusLine: ResolvedStatusLine | null;
      nextSession: DashboardNextSession | null;
      credits: DashboardCreditCard[];
      schemaTeaser: DashboardSchemaTeaser | null;
      entitlements: {
        rows: EntitlementRow[];
        upsell: EntitlementUpsell | null;
      };
    };

// COPY: akkoord Marlon 2026-07-12 (nudge-teksten, drempels 2/1/0)
function nudgeText(remaining: number): string | null {
  if (remaining >= 3) return null;
  if (remaining === 2) {
    return "Nog 2 sessies over. Koop bij zodat je zonder onderbreking doortraint.";
  }
  if (remaining === 1) {
    return "Dit is je laatste sessie. Koop bij om door te gaan.";
  }
  return "Je tegoed is op. Koop een nieuwe kaart om weer te boeken.";
}

/**
 * Eén read + derive-laag voor de leden-landing, gedeeld door beide
 * design-varianten (/app en /app/preview-licht). Geen enkele component mag
 * zelf data ophalen of copy resolven — dat garandeert dat de twee skins
 * functioneel en tekstueel identiek zijn, alleen de presentatie verschilt.
 */
export async function loadDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();

  const [profileResult, membershipResult, creditsResult, nextBookingResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("first_name, last_name, health_intake_completed_at")
        .eq("id", user.id)
        .maybeSingle(),
      // Exacte kolommenset van /app/abonnement's currentResult-query (discovery
      // Fase 1, punt 2) — de "lidmaatschap"-rij voor plan-badge, statusregel
      // en entitlements. Alleen echte abonnementen (subscription-shaped);
      // rittenkaart/PT/Duo-tegoed leeft in de aparte credits-read hieronder.
      // Tweede bewuste afwijking t.o.v. de letterlijke abonnement-read: die
      // heeft geen plan_type-filter en pakt dus "de meest recent aangemaakte
      // rij", wat tijdens preview een pt_package-credit-rij als "lidmaatschap"
      // opleverde (billing_cycle_weeks=0 → "per 0 weken opzegbaar"). Hier
      // expliciet uitgesloten zodat deze query alleen subscription-rijen kan
      // teruggeven. Zie het Fase 2-rapport.
      supabase
        .from("memberships")
        .select(
          `
            id, plan_type, plan_variant, status, billing_cycle_weeks,
            commit_end_date, pause_effective_date, cancellation_effective_date,
            covered_pillars, frequency_cap, extended_access
          `,
        )
        .eq("profile_id", user.id)
        .in("status", ACTIVE_STATUSES)
        .not("plan_type", "in", "(ten_ride_card,pt_package)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Zelfde tabel/kolommen als /app/producten's tegoed-tab-read, met één
      // bewuste afwijking: de .gt(credits_remaining, 0)-filter is weggelaten
      // zodat een uitgeput saldo (0) zichtbaar blijft i.p.v. onzichtbaar te
      // worden — nodig voor de "saldo 0"-ledenstaat uit BESLOTEN item 9.
      // Zie het Fase 2-rapport voor de volledige toelichting.
      supabase
        .from("memberships")
        .select(
          "id, plan_type, plan_variant, credits_remaining, credits_total, credits_expires_at, start_date",
        )
        .eq("profile_id", user.id)
        .eq("status", "active")
        .in("plan_type", ["ten_ride_card", "pt_package"])
        .order("start_date", { ascending: false }),
      // Exacte query van /app/rooster's nextBookingResult (discovery punt 2).
      supabase
        .from("bookings")
        .select(
          `
            id,
            session:class_sessions!inner(
              id, start_at, end_at,
              class_type:class_types(name),
              trainer:trainers(display_name)
            )
          `,
        )
        .eq("profile_id", user.id)
        .eq("status", "booked")
        .gte("session.start_at", now.toISOString())
        .order("session(start_at)", { ascending: true })
        .limit(1)
        .returns<
          Array<{
            id: string;
            session: {
              id: string;
              start_at: string;
              end_at: string;
              class_type: { name: string } | null;
              trainer: { display_name: string } | null;
            } | null;
          }>
        >(),
    ]);

  logIfError("profile", profileResult.error);
  logIfError("membership", membershipResult.error);
  logIfError("credits", creditsResult.error);
  logIfError("next booking", nextBookingResult.error);

  const profile = profileResult.data;
  const firstName = profile?.first_name?.trim() || "daar";
  const lastName = profile?.last_name ?? null;
  const intakeDone = Boolean(profile?.health_intake_completed_at);

  const membership = membershipResult.data;
  const creditRows: CreditMembershipRow[] = (creditsResult.data ?? []).map(
    (row) => ({
      id: row.id,
      plan_type: row.plan_type,
      plan_variant: row.plan_variant,
      credits_remaining: row.credits_remaining ?? 0,
      credits_total: row.credits_total ?? 0,
      credits_expires_at: row.credits_expires_at,
      start_date: row.start_date,
    }),
  );

  const nextBookingRow = nextBookingResult.data?.[0];
  const nextSession: DashboardNextSession | null = nextBookingRow?.session
    ? {
        startAt: new Date(nextBookingRow.session.start_at),
        endAt: new Date(nextBookingRow.session.end_at),
        className: nextBookingRow.session.class_type?.name ?? "Sessie",
        trainerName: nextBookingRow.session.trainer?.display_name ?? "een coach",
      }
    : null;

  const isOnboarding = !membership && creditRows.length === 0;
  if (isOnboarding) {
    return { kind: "onboarding", firstName, intakeDone };
  }

  // Plan-badge naam uit tmc.catalogue, zelfde patroon als /app/abonnement.
  let planName: string | null = null;
  if (membership) {
    const catalogueResult = await supabase
      .from("catalogue")
      .select("display_name")
      .eq("slug", membership.plan_variant)
      .maybeSingle();
    logIfError("catalogue", catalogueResult.error);
    planName = catalogueResult.data?.display_name ?? membership.plan_variant;
  }

  const hasPtCredits = creditRows.some((r) => creditType(r) === "pt");
  const hasDuoCredits = creditRows.some((r) => creditType(r) === "duo");

  const planBadge = membership
    ? `${planName}${hasPtCredits ? " + Personal Training" : ""}`
    : null;
  const statusLine = membership
    ? resolveStatusLineDisplay(resolveStatusLine(membership))
    : null;

  const credits: DashboardCreditCard[] = creditRows.map((row) => {
    const type = creditType(row);
    const label = CREDIT_TYPE_LABELS[type];
    return {
      id: row.id,
      typeName: label.name,
      typeSub: label.sub,
      remaining: row.credits_remaining,
      total: row.credits_total,
      dots: creditDots(row.credits_remaining, row.credits_total),
      nudgeText: nudgeText(row.credits_remaining),
      // COPY: akkoord Marlon 2026-07-12
      buttonLabel:
        row.credits_remaining > 0 ? "Extra sessies kopen" : "Nieuwe kaart kopen",
      // COPY: akkoord Marlon 2026-07-12
      validityText: row.credits_expires_at
        ? `Geldig tot ${formatDateLong(new Date(`${row.credits_expires_at}T00:00:00`))}`
        : "Geen vervaldatum",
    };
  });

  // Schema-teaser: alleen bij een actief protocol (discovery Fase 1, punt 3
  // — geen week-voortgang, training_programs heeft geen start_date/totaal-
  // weken). De "historie read-only, protocol afgerond"-variant uit
  // copy-ledenomgeving-landing.md §5 valt buiten deze build: dat vergt een
  // extra read op niet-actieve programma's, buiten de discovery-scope.
  const program = await loadActiveProgramForMember();
  let schemaTeaser: DashboardSchemaTeaser | null = null;
  if (program && program.days.length > 0) {
    const progress = await loadProgramProgressForMember(program.id);
    let nextDay = program.days[0];
    if (progress.lastLoggedDayId) {
      const idx = program.days.findIndex(
        (d) => d.id === progress.lastLoggedDayId,
      );
      if (idx !== -1) {
        nextDay = program.days[(idx + 1) % program.days.length];
      }
    }
    schemaTeaser = {
      title: program.title || "Jouw schema.", // zelfde fallback als /app/schema
      nextWorkoutLabel: nextDay.label || `Dag ${nextDay.dayNumber}`,
      exerciseCount: nextDay.exercises.length,
      lastLoggedText: progress.lastLoggedAt
        ? formatDaysAgo(new Date(progress.lastLoggedAt), now)
        : null,
    };
  }

  // Entitlements: uitsluitend uit de subscription-membership-rij (geen
  // rittenkaart/PT/Duo — die staan al in het tegoed-blok). Zie het
  // Fase 2-rapport voor de afweging bij een lid zonder subscription.
  const entitlementRows: EntitlementRow[] = [];
  if (membership) {
    const coveredPillars = membership.covered_pillars ?? [];
    const hasGroepslessen =
      coveredPillars.includes("yoga_mobility") ||
      coveredPillars.includes("kettlebell");
    const hasVrijTrainen = coveredPillars.includes("vrij_trainen");
    const freqValue =
      membership.frequency_cap === null
        ? "Onbeperkt"
        : `${membership.frequency_cap}x per week`;

    if (hasGroepslessen) {
      entitlementRows.push({
        // COPY: akkoord Marlon 2026-07-12
        title: "Groepslessen",
        description: "Yoga, mobility en kettlebell",
        value: freqValue,
      });
    }
    if (hasVrijTrainen) {
      entitlementRows.push({
        // COPY: akkoord Marlon 2026-07-12
        title: "Vrij Trainen",
        description:
          membership.plan_type === "all_inclusive"
            ? "Altijd inbegrepen"
            : "Los toegevoegd aan je lidmaatschap",
        value: freqValue,
      });
    }
    if (membership.extended_access) {
      entitlementRows.push({
        // COPY: akkoord Marlon 2026-07-12
        title: "Verlengde toegang",
        description: "Ook buiten openingstijden naar binnen",
        value: "06:00 tot 23:00",
      });
    }
    if (hasPtCredits) {
      entitlementRows.push({
        // COPY: akkoord Marlon 2026-07-12
        title: "Personal Training",
        description: "1-op-1 met Marlon",
        value: "Actief",
      });
    }
    if (schemaTeaser) {
      entitlementRows.push({
        // COPY: akkoord Marlon 2026-07-12
        title: "Trainingsschema",
        description: "Jouw persoonlijke protocol",
        value: "Actief",
      });
    }
  }

  const upsell: EntitlementUpsell | null =
    membership && entitlementRows.length > 0 && !hasDuoCredits
      ? {
          // COPY: akkoord Marlon 2026-07-12
          title: "Duo Training",
          description: "Samen trainen. Jij neemt iemand mee.",
          cta: "Bekijk",
          href: "/app/producten",
        }
      : null;

  const todayIso = todayIsoAmsterdam(now);
  const tomorrowIso = addDaysIsoAmsterdam(todayIso, 1);
  const nextSessionIsSoon =
    nextSession &&
    [todayIso, tomorrowIso].includes(isoDateAmsterdam(nextSession.startAt));

  const subline = nextSessionIsSoon
    ? // COPY: akkoord Marlon 2026-07-12
      "Klaar voor je volgende sessie."
    : // COPY: akkoord Marlon 2026-07-12
      "Fijn dat je er weer bent.";

  return {
    kind: "dashboard",
    greeting: {
      salutation: resolveSalutation(now),
      firstName,
      initials: initialsOf(firstName, lastName),
      subline,
    },
    planBadge,
    statusLine,
    nextSession,
    credits,
    schemaTeaser,
    entitlements: { rows: entitlementRows, upsell },
  };
}
