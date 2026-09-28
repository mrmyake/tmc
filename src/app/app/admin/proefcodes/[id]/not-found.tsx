import Link from "next/link";

export default function TrialCodeNotFound() {
  return (
    <div className="px-6 md:px-10 lg:px-12 py-20 text-center">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
        {/* COPY: confirm met Marlon */}
        Niet gevonden
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em] mb-6">
        {/* COPY: confirm met Marlon */}
        Deze proefcode bestaat niet.
      </h1>
      <Link
        href="/app/admin/proefcodes"
        className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text transition-colors duration-500 hover:border-accent hover:text-accent"
      >
        {/* COPY: confirm met Marlon */}
        Terug naar proefcodes
      </Link>
    </div>
  );
}
