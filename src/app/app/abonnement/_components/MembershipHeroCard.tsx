import { formatEuro } from "@/lib/crowdfunding-helpers";
import { formatDateLong } from "@/lib/format-date";

const STATUS_LABEL: Record<string, string> = {
  pending: "Betaling in behandeling",
  active: "Actief",
  paused: "Gepauzeerd",
  cancellation_requested: "Loopt tot einddatum",
  cancelled: "Beëindigd",
  expired: "Verlopen",
  payment_failed: "Betaling mislukt",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return formatDateLong(new Date(d));
  } catch {
    return "—";
  }
}

function computeNextInvoice(
  startDate: string,
  billingCycleWeeks: number,
  status: string,
  cancellationEffectiveDate: string | null,
): string | null {
  if (status !== "active" && status !== "cancellation_requested") return null;
  const start = new Date(startDate);
  const cycleMs = billingCycleWeeks * 7 * 86400000;
  const now = Date.now();
  if (now < start.getTime()) return start.toISOString().slice(0, 10);
  const elapsed = now - start.getTime();
  const cyclesElapsed = Math.floor(elapsed / cycleMs);
  const next = new Date(start.getTime() + (cyclesElapsed + 1) * cycleMs);
  if (
    cancellationEffectiveDate &&
    next > new Date(cancellationEffectiveDate)
  ) {
    return null;
  }
  return next.toISOString().slice(0, 10);
}

interface MembershipHeroCardProps {
  planName: string;
  planVariant: string;
  status: string;
  pricePerCycleCents: number;
  billingCycleWeeks: number;
  startDate: string;
  commitEndDate: string;
  cancellationEffectiveDate: string | null;
}

export function MembershipHeroCard({
  planName,
  planVariant,
  status,
  pricePerCycleCents,
  billingCycleWeeks,
  startDate,
  commitEndDate,
  cancellationEffectiveDate,
}: MembershipHeroCardProps) {
  const nextInvoice = computeNextInvoice(
    startDate,
    billingCycleWeeks,
    status,
    cancellationEffectiveDate,
  );
  const isActive = status === "active";
  const priceEuro = formatEuro(Math.round(pricePerCycleCents / 100));

  return (
    <section
      aria-labelledby="membership-hero-title"
      className="relative bg-bg-elevated p-10 md:p-12"
    >
      {isActive && (
        <div
          aria-hidden
          className="absolute top-0 left-10 right-10 h-px bg-accent"
        />
      )}
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
        {STATUS_LABEL[status] ?? status}
      </span>
      <h2
        id="membership-hero-title"
        className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.05] tracking-[-0.02em] mb-6"
      >
        {planName || planVariant}
      </h2>

      <div className="flex items-baseline gap-3 mb-10">
        <span className="font-[family-name:var(--font-playfair)] text-5xl text-accent leading-none tracking-[-0.02em]">
          {priceEuro}
        </span>
        <span className="text-text-muted text-sm">
          per {billingCycleWeeks} weken
        </span>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Row label="Gestart" value={formatDate(startDate)} />
        <Row label="Commitment tot" value={formatDate(commitEndDate)} />
        {nextInvoice && (
          <Row label="Volgende incasso" value={formatDate(nextInvoice)} />
        )}
        {cancellationEffectiveDate && (
          <Row
            label="Opzegging effectief"
            value={formatDate(cancellationEffectiveDate)}
          />
        )}
      </dl>

      {status === "pending" && (
        <p className="mt-8 pt-6 border-t border-[color:var(--ink-500)]/60 text-sm text-text-muted">
          Je betaling is nog niet bevestigd. Zodra die binnen is, wordt je
          abonnement automatisch actief.
        </p>
      )}
      {status === "payment_failed" && (
        <p className="mt-8 pt-6 border-t border-[color:var(--ink-500)]/60 text-sm text-[color:var(--danger)]">
          Je laatste incasso is niet gelukt. Neem contact op of probeer
          opnieuw.
        </p>
      )}
      {status === "cancellation_requested" && (
        <p className="mt-8 pt-6 border-t border-[color:var(--ink-500)]/60 text-sm text-text-muted">
          Je opzegverzoek staat. Je abbo loopt door tot de einddatum, daarna
          stopt de incasso.
        </p>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="tmc-eyebrow mb-2">{label}</dt>
      <dd className="text-text text-base">{value}</dd>
    </div>
  );
}
