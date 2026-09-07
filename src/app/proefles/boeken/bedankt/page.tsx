import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { Button } from "@/components/ui/Button";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { formatWeekdayDate, formatTimeRange } from "@/lib/format-date";

export const metadata: Metadata = {
  title: "Bedankt voor je boeking | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Houdt een niet-UUID uit de query weg bij Postgres. Zonder deze check
 * levert `.eq("id", "onzin")` een genegeerde databasefout op en zou de
 * pagina alsnog de "we verwerken je betaling"-tekst tonen aan iemand die
 * hier via een kapotte link belandt.
 */
function isLikelyUuid(value: string | undefined): value is string {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export default async function TrialBookingThanksPage(props: {
  searchParams: Promise<{ trial?: string }>;
}) {
  const searchParams = await props.searchParams;
  const trialId = searchParams.trial;

  // De trial-param ontbreekt zodra iemand deze pagina buiten de redirect om
  // raakt: verversen, terugknop, bookmark of een gedeelde link. Een
  // ongeldige of onbekende id levert net zo goed niets op. In alle drie de
  // gevallen blijft `trial` null en tonen we de neutrale variant hieronder,
  // nooit een foutmelding.
  //
  // isAdminConfigured is dezelfde guard als op /rooster, /yoga/rooster,
  // /proefles/code, /proefles/boeken en /betaal/[token]. Zonder die guard
  // gooit createAdminClient op elke omgeving zonder service-role-env (lokale
  // dev, een preview-branch) en wordt deze publieke pagina een harde 500.
  const admin = isAdminConfigured() ? createAdminClient() : null;
  const { data: trial } =
    admin && isLikelyUuid(trialId)
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
          {/* COPY: confirm met Marlon */}
          {!trial ? "Proefles" : trial.status === "paid" ? "Bevestigd" : "Verwerkt"}
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
          {/* COPY: confirm met Marlon */}
          {!trial
            ? "Deze pagina hoort bij een boeking."
            : trial.status === "paid"
              ? "Je proefles staat vast."
              : "We verwerken je betaling."}
        </h1>

        {trial?.status === "paid" && session && (
          <p className="text-text-muted text-lg mb-3">
            {/* COPY: confirm met Marlon */}
            {className} op {formatWeekdayDate(new Date(session.start_at))}{" "}
            &middot;{" "}
            {formatTimeRange(
              new Date(session.start_at),
              new Date(session.end_at),
            )}
          </p>
        )}

        <p className="text-text-muted mb-3">
          {/* COPY: confirm met Marlon */}
          {trial
            ? "Je ontvangt een bevestiging per mail. Tot in de studio."
            : "We kunnen er geen boeking bij vinden. Heb je net geboekt, kijk dan in je mail: daar staat je bevestiging. Wil je een proefles plannen, dan kan dat hieronder."}
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
            conversiemechaniek gebouwd hier, alleen de link. Zonder boeking
            is die upsell niet aan de orde en wijzen we naar de proefles
            zelf, zodat er altijd een duidelijke vervolgstap staat. */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {/* COPY: confirm met Marlon */}
          {trial ? (
            <Button href="/app/abonnement">Bekijk lidmaatschappen</Button>
          ) : (
            <Button href="/proefles">Plan je proefles</Button>
          )}
          <Button href="/" variant="secondary">
            Terug naar home
          </Button>
        </div>
      </Container>
    </Section>
  );
}
