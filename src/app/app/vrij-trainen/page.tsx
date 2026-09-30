import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { PRESENCE_MARLON } from "@/lib/constants";
import { loadVrijTrainenPicker } from "@/lib/member/vrij-trainen-query";
import { SlotPicker } from "./_components/SlotPicker";
import { CheckInHistory } from "./_components/CheckInHistory";

export const metadata = {
  title: "Vrij trainen | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const VRIJ_TRAINEN = "vrij_trainen";

/** Monday 00:00 UTC van de ISO-week waarin `ref` valt. */
function weekStartUtc(ref: Date): Date {
  const d = new Date(ref);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

type MembershipRow = {
  plan_variant: string;
  status: string;
  frequency_cap: number | null;
  covered_pillars: string[];
};

type CheckInRow = {
  id: string;
  checked_in_at: string;
};

export default async function VrijTrainenPage({
  searchParams,
}: {
  searchParams: Promise<{ dag?: string }>;
}) {
  const { dag } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Alleen booking_settings.vrij_trainen_booking_enabled beslist: aan is de
  // slotkiezer, uit de check-in-weergave. check_in_pillars speelt hier geen
  // rol (spec-vrij-trainen-slots.md).
  const { data: modeSettings } = await supabase
    .from("booking_settings")
    .select("vrij_trainen_booking_enabled")
    .eq("id", "singleton")
    .maybeSingle();
  const bookingMode = modeSettings?.vrij_trainen_booking_enabled ?? false;

  // Membership bepaalt eligibility in beide modi.
  const { data: membership } = await supabase
    .from("memberships")
    .select("plan_variant, status, frequency_cap, covered_pillars")
    .eq("profile_id", user.id)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<MembershipRow>();

  const covers = membership?.covered_pillars?.includes(VRIJ_TRAINEN) ?? false;
  if (!covers) {
    return <NotEligibleView hasMembership={Boolean(membership)} />;
  }

  const isPaused = membership?.status === "paused";
  const cap = membership?.frequency_cap ?? null;

  if (!bookingMode) {
    return (
      <CheckInView
        userId={user.id}
        cap={cap}
        isPaused={isPaused}
      />
    );
  }

  return (
    <SlotBookingView userId={user.id} isPaused={isPaused} requestedDate={dag} />
  );
}

// ---------------------------------------------------------------------------
// Check-in modus: pure aanwezigheids-flow, geen boeken vooraf
// ---------------------------------------------------------------------------

async function CheckInView({
  userId,
  cap,
  isPaused,
}: {
  userId: string;
  cap: number | null;
  isPaused: boolean;
}) {
  const supabase = await createClient();
  const now = new Date();
  const weekStart = weekStartUtc(now);

  const [weekCountResult, recentResult] = await Promise.all([
    supabase
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId)
      .eq("pillar", VRIJ_TRAINEN)
      .gte("checked_in_at", weekStart.toISOString()),
    supabase
      .from("check_ins")
      .select("id, checked_in_at")
      .eq("profile_id", userId)
      .eq("pillar", VRIJ_TRAINEN)
      .order("checked_in_at", { ascending: false })
      .limit(5)
      .returns<CheckInRow[]>(),
  ]);

  const weekUsed = weekCountResult.count ?? 0;
  const capReached = cap !== null && weekUsed >= cap;
  const recent = recentResult.data ?? [];

  return (
    <Container className="py-16 md:py-20 max-w-3xl">
      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Open studio
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em] mb-6">
          Vrij trainen.
        </h1>
        <p className="text-text-muted text-lg leading-relaxed max-w-xl">
          {/* COPY: confirm met Marlon */}
          Kom wanneer je wil tussen 06:00 en 23:00. Tik bij binnenkomst je
          nummer op de tablet, dan staat de check-in direct geregistreerd.
        </p>
      </header>

      {cap !== null && !isPaused && (
        <div className="mb-10 pb-6 border-b border-[color:var(--ink-500)]/60">
          <span className="tmc-eyebrow block mb-2">Deze week</span>
          <p className="font-[family-name:var(--font-playfair)] text-3xl text-text leading-none tracking-[-0.02em]">
            {weekUsed}{" "}
            <span className="text-text-muted">
              van {cap} ingecheckt
            </span>
          </p>
          {capReached && (
            <p className="mt-3 text-[color:var(--warning)] text-sm">
              Je weekcap is bereikt. Volgende week weer.
            </p>
          )}
        </div>
      )}

      {isPaused && (
        <div
          role="status"
          className="mb-10 p-5 border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/5"
        >
          <span className="tmc-eyebrow block mb-2">Abonnement gepauzeerd</span>
          <p className="text-text-muted text-sm leading-relaxed">
            Zolang je pauze loopt tellen check-ins niet mee. Als je het abbo
            hervat staat je plek weer open.
          </p>
        </div>
      )}

      <CheckInHistory items={recent} />
    </Container>
  );
}

// ---------------------------------------------------------------------------
// Boekmodus: slotkiezer (spec-vrij-trainen-slots.md)
// ---------------------------------------------------------------------------

async function SlotBookingView({
  userId,
  isPaused,
  requestedDate,
}: {
  userId: string;
  isPaused: boolean;
  requestedDate: string | undefined;
}) {
  const supabase = await createClient();
  const data = await loadVrijTrainenPicker(supabase, userId, requestedDate);

  return (
    <Container className="py-12 md:py-20 max-w-3xl">
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em] mb-4">
          {/* COPY: confirm met Marlon */}
          Vrij trainen
        </h1>
        <p className="text-text-muted text-lg leading-relaxed max-w-xl">
          {/* COPY: confirm met Marlon */}
          Boek je eigen tijd. Maximaal {data.maxConcurrent} mensen tegelijk.
        </p>
      </header>

      {isPaused ? (
        <div
          role="status"
          className="p-5 rounded-lg border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/5"
        >
          <span className="tmc-eyebrow block mb-2">Abonnement gepauzeerd</span>
          <p className="text-text-muted text-sm leading-relaxed">
            Zolang je pauze loopt kun je niet vrij trainen. Als je het abbo
            hervat staat je plek weer open.
          </p>
        </div>
      ) : (
        <SlotPicker
          data={data}
          presence={{
            // COPY: confirm met Marlon
            name: "Marlon",
            weekdays: PRESENCE_MARLON.weekdays,
            windows: PRESENCE_MARLON.windows,
          }}
        />
      )}
    </Container>
  );
}

function NotEligibleView({ hasMembership }: { hasMembership: boolean }) {
  return (
    <Container className="py-16 md:py-20 max-w-2xl">
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Open studio
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Vrij trainen.
        </h1>
      </header>
      <section className="bg-bg-elevated p-10 md:p-12">
        <span className="tmc-eyebrow block mb-4">Nog geen toegang</span>
        <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4">
          {hasMembership
            ? "Jouw abbo dekt vrij trainen nog niet."
            : "Kies een abonnement met vrij trainen."}
        </h2>
        {/* COPY: confirm met Marlon */}
        <p className="text-text-muted text-base leading-relaxed mb-8 max-w-md">
          De open studio is inbegrepen bij Vrij Trainen- en All Access-
          plannen. Upgrade of kies een plan en je kunt direct binnenlopen.
        </p>
        <Button href="/app/abonnement">Bekijk abonnementen</Button>
      </section>
    </Container>
  );
}
