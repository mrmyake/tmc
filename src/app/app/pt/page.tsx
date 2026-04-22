import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import type { PtTier } from "@/lib/member/pt-pricing";
import { PtBookingFlow } from "./PtBookingFlow";
import type { TrainerOption } from "./_components/TrainerStep";
import type { SlotOption } from "./_components/SlotStep";

export const metadata = {
  title: "PT boeken | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SLOT_HORIZON_DAYS = 14;

type TrainerRow = {
  id: string;
  slug: string;
  display_name: string;
  bio: string | null;
  pt_tier: string;
  is_pt_available: boolean;
  is_active: boolean;
};

type PtSessionRow = {
  id: string;
  trainer_id: string;
  start_at: string;
  end_at: string;
  format: string;
  status: string;
};

export default async function PtPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const horizon = new Date(now.getTime() + SLOT_HORIZON_DAYS * 86400000);

  const [
    trainersRes,
    sessionsRes,
    profileRes,
    ptMembershipRes,
    nonPtMembershipRes,
    existingBookingsRes,
  ] = await Promise.all([
    supabase
      .from("trainers")
      .select("id, slug, display_name, bio, pt_tier, is_pt_available, is_active")
      .eq("is_active", true)
      .eq("is_pt_available", true)
      .order("pt_tier", { ascending: true })
      .returns<TrainerRow[]>(),
    supabase
      .from("pt_sessions")
      .select("id, trainer_id, start_at, end_at, format, status")
      .eq("status", "scheduled")
      .eq("format", "one_on_one")
      .gte("start_at", now.toISOString())
      .lt("start_at", horizon.toISOString())
      .order("start_at", { ascending: true })
      .returns<PtSessionRow[]>(),
    supabase
      .from("profiles")
      .select("has_used_pt_intake_discount")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id, credits_remaining")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .eq("plan_type", "pt_package")
      .gt("credits_remaining", 0)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .neq("plan_type", "pt_package")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pt_bookings")
      .select("pt_session_id")
      .eq("profile_id", user.id)
      .in("status", ["booked"]),
  ]);

  const trainers: TrainerOption[] = (trainersRes.data ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    displayName: t.display_name,
    bio: t.bio,
    tier: (t.pt_tier === "premium" ? "premium" : "standard") as PtTier,
    avatarUrl: null,
  }));

  const bookedSessionIds = new Set(
    (existingBookingsRes.data ?? []).map((b) => b.pt_session_id),
  );
  const slots: Array<SlotOption & { trainerId: string }> = (
    sessionsRes.data ?? []
  )
    .filter((s) => !bookedSessionIds.has(s.id))
    .map((s) => ({
      id: s.id,
      startAt: s.start_at,
      endAt: s.end_at,
      trainerId: s.trainer_id,
    }));

  const hasIntakeDiscountAvailable =
    !profileRes.data?.has_used_pt_intake_discount;
  const creditsRemaining = ptMembershipRes.data?.credits_remaining ?? null;
  const hasActiveNonPtMembership = Boolean(nonPtMembershipRes.data);

  return (
    <Container className="py-16 md:py-20 max-w-4xl">
      <header className="mb-14">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Personal training
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
          Boek een sessie.
        </h1>
        <p className="mt-6 text-text-muted text-lg max-w-xl">
          Kies een trainer en een moment. Jouw sessie staat binnen vier
          stappen.
        </p>
      </header>

      {trainers.length === 0 ? (
        <section className="bg-bg-elevated p-10 text-center">
          <span className="tmc-eyebrow block mb-4">Geen trainers</span>
          <p className="text-text-muted text-base max-w-md mx-auto">
            Er staan op dit moment geen PT-trainers beschikbaar. Neem contact
            op met Marlon voor een afspraak.
          </p>
        </section>
      ) : (
        <PtBookingFlow
          trainers={trainers}
          slots={slots}
          hasIntakeDiscountAvailable={hasIntakeDiscountAvailable}
          creditsRemaining={creditsRemaining}
          hasActiveNonPtMembership={hasActiveNonPtMembership}
        />
      )}
    </Container>
  );
}
