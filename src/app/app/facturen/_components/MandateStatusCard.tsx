import { formatDateLong } from "@/lib/format-date";

interface MandateStatusCardProps {
  active: boolean;
  planName: string | null;
  nextInvoiceDate: string | null;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return formatDateLong(new Date(d));
  } catch {
    return "—";
  }
}

export function MandateStatusCard({
  active,
  planName,
  nextInvoiceDate,
}: MandateStatusCardProps) {
  if (!active) {
    return (
      <section
        aria-labelledby="mandate-status-title"
        className="bg-bg-elevated p-8 md:p-10"
      >
        <span className="tmc-eyebrow block mb-3">Incasso</span>
        <h2
          id="mandate-status-title"
          className="text-xl md:text-2xl font-medium text-text mb-2 tracking-[-0.01em]"
        >
          Geen actieve incasso.
        </h2>
        <p className="text-text-muted text-sm leading-relaxed max-w-md">
          Er loopt geen automatische incasso. Zodra je een abonnement
          activeert, zie je je incasso-status hier terug.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="mandate-status-title"
      className="relative bg-bg-elevated p-8 md:p-10"
    >
      <div
        aria-hidden
        className="absolute top-0 left-10 right-10 h-px bg-accent"
      />
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        Incasso actief
      </span>
      <h2
        id="mandate-status-title"
        className="text-xl md:text-2xl font-medium text-text mb-2 tracking-[-0.01em]"
      >
        Automatische incasso loopt.
      </h2>
      <p className="text-text-muted text-sm leading-relaxed max-w-md">
        {planName ? `Je ${planName}-abonnement` : "Je abonnement"} wordt elke
        cyclus automatisch afgeschreven.
        {nextInvoiceDate && (
          <>
            {" "}Volgende incasso:{" "}
            <span className="text-text">{formatDate(nextInvoiceDate)}</span>.
          </>
        )}
      </p>
    </section>
  );
}
