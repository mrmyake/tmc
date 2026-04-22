import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import { formatPriceEuro } from "@/lib/member/pt-pricing";

export const metadata = {
  title: "PT-sessie geboekt | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface BookingJoinRow {
  id: string;
  status: string;
  price_paid_cents: number;
  is_intake_discount: boolean;
  credits_used_from: string | null;
  session:
    | {
        start_at: string;
        end_at: string;
        trainer: { display_name: string } | null;
      }
    | null;
}

export default async function PtBedanktPage(props: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const { booking: bookingId } = await props.searchParams;
  if (!bookingId) redirect("/app/pt");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: bookingRaw } = await supabase
    .from("pt_bookings")
    .select(
      `
        id,
        status,
        price_paid_cents,
        is_intake_discount,
        credits_used_from,
        session:pt_sessions(
          start_at, end_at,
          trainer:trainers(display_name)
        )
      `,
    )
    .eq("id", bookingId)
    .eq("profile_id", user.id)
    .maybeSingle();

  const booking = bookingRaw as BookingJoinRow | null;
  const sessionRow = booking?.session
    ? Array.isArray(booking.session)
      ? booking.session[0]
      : booking.session
    : null;
  const trainerRow = sessionRow?.trainer
    ? Array.isArray(sessionRow.trainer)
      ? sessionRow.trainer[0]
      : sessionRow.trainer
    : null;

  if (!booking || !sessionRow) {
    return (
      <Container className="py-24 max-w-xl">
        <header className="mb-10">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
            PT-boeking
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text leading-[1.05] tracking-[-0.02em]">
            We vinden deze boeking niet.
          </h1>
        </header>
        <p className="text-text-muted text-base leading-relaxed mb-10">
          Mogelijk is de betaling nog niet verwerkt. Probeer het over een
          paar seconden opnieuw, of check je boekingen.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button href="/app/boekingen">Mijn boekingen</Button>
          <Button href="/app/pt" variant="secondary">
            Terug naar PT
          </Button>
        </div>
      </Container>
    );
  }

  const isCredits = Boolean(booking.credits_used_from);
  const start = new Date(sessionRow.start_at);
  const end = new Date(sessionRow.end_at);

  const isPaid = booking.status === "booked";
  const isPending = booking.status !== "booked" && booking.status !== "cancelled";
  const isFailed = booking.status === "cancelled";

  return (
    <Container className="py-16 md:py-24 max-w-2xl">
      <header className="mb-12 text-center">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          {isCredits
            ? "Geboekt uit credits"
            : isPaid
              ? "Betaling ontvangen"
              : isFailed
                ? "Betaling mislukt"
                : "Betaling loopt"}
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          {isFailed
            ? "Er ging iets mis."
            : isPending
              ? "Bijna klaar."
              : "Je sessie staat."}
        </h1>
        {!isFailed && !isPending && (
          <p className="mt-6 text-text-muted text-lg max-w-lg mx-auto">
            {isCredits
              ? "Boeking bevestigd. We zien je in de studio."
              : "Bedankt. Je ontvangt ook een bevestigingsmail."}
          </p>
        )}
        {isPending && (
          <p className="mt-6 text-text-muted text-base max-w-lg mx-auto">
            Mollie bevestigt je betaling meestal binnen een paar seconden.
            Ververs deze pagina over een moment.
          </p>
        )}
        {isFailed && (
          <p className="mt-6 text-text-muted text-base max-w-lg mx-auto">
            De betaling is niet doorgegaan. Het slot is vrijgegeven. Probeer
            opnieuw of kies een ander moment.
          </p>
        )}
      </header>

      <section
        aria-label="Boekingsdetails"
        className="relative bg-bg-elevated p-8 md:p-10 mb-12"
      >
        {isPaid && (
          <div
            aria-hidden
            className="absolute top-0 left-10 right-10 h-px bg-accent"
          />
        )}
        <dl className="flex flex-col gap-6">
          <Row
            label="Trainer"
            value={trainerRow?.display_name ?? "coach"}
          />
          <Row label="Format" value="1-op-1" />
          <Row
            label="Wanneer"
            value={`${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}`}
          />
          {isCredits ? (
            <Row label="Betaling" value="Uit je PT-pakket" />
          ) : (
            <Row
              label="Totaal"
              value={
                booking.is_intake_discount
                  ? `${formatPriceEuro(booking.price_paid_cents)} · Intake-korting`
                  : formatPriceEuro(booking.price_paid_cents)
              }
            />
          )}
        </dl>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {isFailed ? (
          <>
            <Button href="/app/pt">Probeer opnieuw</Button>
            <Button href="/app/boekingen" variant="secondary">
              Mijn boekingen
            </Button>
          </>
        ) : (
          <>
            <Button href="/app/boekingen">Mijn boekingen</Button>
            <Button href="/app/pt" variant="secondary">
              Nog een sessie boeken
            </Button>
          </>
        )}
      </div>
    </Container>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 sm:gap-6 pb-5 border-b border-[color:var(--ink-500)]/60 last:border-b-0 last:pb-0">
      <dt className="tmc-eyebrow">{label}</dt>
      <dd className="text-text text-base">{value}</dd>
    </div>
  );
}
