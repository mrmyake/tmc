import Link from "next/link";

export type Weergave = "lessen" | "vrij";

/**
 * Segmented control "Lessen | Vrij trainen". De keuze staat in de URL
 * (?weergave=vrij, afwezig is lessen) en de gekozen dag blijft behouden.
 */
export function WeergaveSwitch({
  active,
  dag,
}: {
  active: Weergave;
  dag: string | undefined;
}) {
  const dagQs = dag ? `dag=${encodeURIComponent(dag)}` : "";
  const hrefLessen = dagQs ? `/app/rooster?${dagQs}` : "/app/rooster";
  const hrefVrij = `/app/rooster?weergave=vrij${dagQs ? `&${dagQs}` : ""}`;

  const base =
    "flex min-h-11 items-center justify-center rounded px-3 text-sm transition-colors duration-300";
  const on = "bg-bg-subtle text-text shadow-[inset_0_0_0_1px_var(--color-accent)]";
  const off = "text-text/55 hover:text-text";

  return (
    <nav
      // COPY: confirm met Marlon
      aria-label="Weergave"
      className="grid grid-cols-2 gap-1 rounded-lg bg-bg-elevated p-1"
    >
      <Link
        href={hrefLessen}
        scroll={false}
        aria-current={active === "lessen" ? "page" : undefined}
        className={`${base} ${active === "lessen" ? on : off}`}
      >
        {/* COPY: confirm met Marlon */}
        Lessen
      </Link>
      <Link
        href={hrefVrij}
        scroll={false}
        aria-current={active === "vrij" ? "page" : undefined}
        className={`${base} ${active === "vrij" ? on : off}`}
      >
        {/* COPY: confirm met Marlon */}
        Vrij trainen
      </Link>
    </nav>
  );
}
