import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { Button } from "@/components/ui/Button";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatWeekdayDate, formatTimeRange } from "@/lib/format-date";

export const metadata: Metadata = {
  title: "Bedankt voor je boeking | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TrialBookingThanksPage(props: {
  searchParams: Promise<{ trial?: string }>;
}) {
  const searchParams = await props.searchParams;
  const trialId = searchParams.trial;

  const admin = createAdminClient();
  const { data: trial } = trialId
    ? await admin
        .from("trial_bookings")
        .select(
          `
            status, cancel_token,
            session:class_sessions(start_at, end_at, class_type:class_types(name))
          `,
        )
        .eq("id", trialId)
        .maybeSingle()
    : { data: null };

  type SessionRel = {
    start_at: string;
    end_at: string;
    class_type: { name: string } | { name: string }[] | null;
  } | null;
  const session = trial?.session as unknown as SessionRel;
  const classTypeRaw = session?.class_type;
  const className = Array.isArray(classTypeRaw)
    ? (classTypeRaw[0]?.name ?? "Proefles")
    : (classTypeRaw?.name ?? "Proefles");

  return (
    <Section className="pt-32 md:pt-40 min-h-[80vh] flex items-center">
      <Container className="max-w-2xl text-center">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-6">
          {trial?.status === "paid" ? "Bevestigd" : "Verwerkt"}
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
          {/* COPY: confirm with Marlon */}
          {trial?.status === "paid"
            ? "Je proefles staat vast."
            : "We verwerken je betaling."}
        </h1>

        {trial?.status === "paid" && session && (
          <p className="text-text-muted text-lg mb-3">
            {/* COPY: confirm with Marlon */}
            {className} op {formatWeekdayDate(new Date(session.start_at))}{" "}
            &middot;{" "}
            {formatTimeRange(
              new Date(session.start_at),
              new Date(session.end_at),
            )}
          </p>
        )}

        <p className="text-text-muted mb-3">
          {/* COPY: confirm with Marlon */}
          Je ontvangt een bevestiging per mail. Tot in de studio.
        </p>

        {trial?.cancel_token && (
          <p className="text-text-muted text-sm mb-10">
            {/* COPY: confirm with Marlon */}
            Kan je toch niet? Annuleer via{" "}
            <Link
              href={`/proefles/annuleren/${trial.cancel_token}`}
              className="text-accent hover:underline"
            >
              deze link
            </Link>
            . Bewaar &apos;m, hij staat niet nogmaals in een mail.
          </p>
        )}

        {/* Upsell-seam: na een geslaagde proefles is dit het natuurlijke
            moment om door te verwijzen naar een echt abonnement. Geen
            conversiemechaniek gebouwd hier, alleen de link. */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button href="/app/abonnement">Bekijk lidmaatschappen</Button>
          <Button href="/" variant="secondary">
            Terug naar home
          </Button>
        </div>
      </Container>
    </Section>
  );
}
