import { Button } from "@/components/ui/Button";
import { formatDateLong } from "@/lib/format-date";
import {
  CREDIT_TYPE_LABELS,
  creditType,
  type CreditMembershipRow,
} from "../producten/lib";

function nudgeText(remaining: number): string | null {
  if (remaining >= 3) return null;
  // COPY: akkoord Marlon 2026-07-12
  if (remaining === 2) {
    return "Nog 2 sessies over. Koop bij zodat je zonder onderbreking doortraint.";
  }
  // COPY: akkoord Marlon 2026-07-12
  if (remaining === 1) {
    return "Dit is je laatste sessie. Koop bij om door te gaan.";
  }
  // COPY: akkoord Marlon 2026-07-12
  return "Je tegoed is op. Koop een nieuwe kaart om weer te boeken.";
}

function CreditCard({ row }: { row: CreditMembershipRow }) {
  const type = creditType(row);
  const label = CREDIT_TYPE_LABELS[type];
  const remaining = row.credits_remaining;
  const nudge = nudgeText(remaining);

  return (
    <div className="bg-bg-elevated p-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-1">
            {label.sub}
          </span>
          <p className="text-text text-sm">{label.name}</p>
        </div>
        <p className="font-[family-name:var(--font-playfair)] text-3xl text-text leading-none whitespace-nowrap">
          {remaining}
          <span className="text-text-muted text-lg"> / {row.credits_total}</span>
        </p>
      </div>

      {nudge && (
        <p className="text-text-muted text-sm leading-relaxed mb-6">
          {nudge}
        </p>
      )}

      <Button href="/app/producten" variant="secondary" className="w-full justify-center">
        {/* COPY: akkoord Marlon 2026-07-12 */}
        {remaining > 0 ? "Extra sessies kopen" : "Nieuwe kaart kopen"}
      </Button>

      <p className="mt-5 text-text-muted/70 text-xs text-center">
        {/* COPY: akkoord Marlon 2026-07-12 */}
        {row.credits_expires_at
          ? `Geldig tot ${formatDateLong(new Date(`${row.credits_expires_at}T00:00:00`))}`
          : "Geen vervaldatum"}
      </p>
    </div>
  );
}

export function DashboardCredits({
  credits,
}: {
  credits: CreditMembershipRow[];
}) {
  if (credits.length === 0) return null;

  return (
    <section className="mb-14">
      {/* COPY: akkoord Marlon 2026-07-12 */}
      <h2 className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
        Jouw tegoed
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {credits.map((row) => (
          <CreditCard key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}
