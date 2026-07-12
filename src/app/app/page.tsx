import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import {
  addDaysIsoAmsterdam,
  formatDaysAgo,
  isoDateAmsterdam,
  todayIsoAmsterdam,
} from "@/lib/format-date";
import {
  loadActiveProgramForMember,
  loadProgramProgressForMember,
} from "@/lib/member/training-program-query";
import { creditType, type CreditMembershipRow } from "./producten/lib";
import { initialsOf, resolveSalutation, resolveStatusLine } from "./_lib/dashboard";
import { DashboardGreeting } from "./_components/DashboardGreeting";
import { DashboardOnboarding } from "./_components/DashboardOnboarding";
import { DashboardNextClass } from "./_components/DashboardNextClass";
import { DashboardCredits } from "./_components/DashboardCredits";
import { DashboardSchema } from "./_components/DashboardSchema";
import {
  DashboardEntitlements,
  type EntitlementRow,
  type EntitlementUpsell,
} from "./_components/DashboardEntitlements";

export const metadata = {
  title: "The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

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
    console.error(`[/app dashboard] ${tag} query failed:`, error.message);
  }
}

export default async function AppDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();

  const [
    profileResult,
    membershipResult,
    creditsResult,
    nextBookingResult,
  ] = await Promise.all([
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
  const credits: CreditMembershipRow[] = (creditsResult.data ?? []).map(
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
  const nextSession = nextBookingRow?.session
    ? {
        startAt: new Date(nextBookingRow.session.start_at),
        endAt: new Date(nextBookingRow.session.end_at),
        className: nextBookingRow.session.class_type?.name ?? "Sessie",
        trainerName: nextBookingRow.session.trainer?.display_name ?? "een coach",
      }
    : null;

  const isOnboarding = !membership && credits.length === 0;

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

  const hasPtCredits = credits.some((r) => creditType(r) === "pt");
  const hasDuoCredits = credits.some((r) => creditType(r) === "duo");

  const planBadge = membership
    ? `${planName}${hasPtCredits ? " + Personal Training" : ""}`
    : null;
  const statusLine = membership ? resolveStatusLine(membership) : null;

  // Schema-teaser: alleen bij een actief protocol (discovery Fase 1, punt 3
  // — geen week-voortgang, training_programs heeft geen start_date/totaal-
  // weken). De "historie read-only, protocol afgerond"-variant uit
  // copy-ledenomgeving-landing.md §5 valt buiten deze build: dat vergt een
  // extra read op niet-actieve programma's, buiten de discovery-scope.
  const program = await loadActiveProgramForMember();
  let schemaTeaser: {
    title: string;
    nextWorkoutLabel: string;
    exerciseCount: number;
    lastLoggedText: string | null;
  } | null = null;
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

  if (isOnboarding) {
    return (
      <Container className="py-16 md:py-20">
        <DashboardOnboarding firstName={firstName} intakeDone={intakeDone} />
      </Container>
    );
  }

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

  return (
    <Container className="py-16 md:py-20">
      <DashboardGreeting
        salutation={resolveSalutation(now)}
        firstName={firstName}
        initials={initialsOf(firstName, lastName)}
        subline={subline}
        planBadge={planBadge}
        statusLine={statusLine}
      />

      <DashboardNextClass session={nextSession} />

      <DashboardCredits credits={credits} />

      {schemaTeaser && (
        <DashboardSchema
          title={schemaTeaser.title}
          nextWorkoutLabel={schemaTeaser.nextWorkoutLabel}
          nextWorkoutExerciseCount={schemaTeaser.exerciseCount}
          lastLoggedText={schemaTeaser.lastLoggedText}
        />
      )}

      <DashboardEntitlements rows={entitlementRows} upsell={upsell} />
    </Container>
  );
}
