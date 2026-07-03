import Link from "next/link";
import { listOpenDropoffFlags } from "@/lib/admin/dropoff-query";
import { amsterdamParts, DAY_SHORT_NL, MONTH_SHORT_NL } from "@/lib/format-date";

export const metadata = {
  title: "Admin · Dropoff-signaal | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "Nooit";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  const p = amsterdamParts(d);
  return `${DAY_SHORT_NL[p.weekday]} ${p.day} ${MONTH_SHORT_NL[p.month - 1]}`;
}

/**
 * Admin-facing dropoff-signaal (spec-community-growth.md §2). Toont
 * actieve leden die de flag-dropoff-cron heeft gemarkeerd (14+ dagen
 * geen bezoek) en die nog niet zijn teruggekomen. Bewust geen actie-
 * knoppen hier: het punt is dat Marlon zelf persoonlijk contact
 * opneemt, niet een geautomatiseerde vervolgstap.
 */
export default async function AdminDropoffPage() {
  const rows = await listOpenDropoffFlags();

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Dropoff-signaal.
        </h1>
        <p className="tmc-eyebrow mt-4">
          {rows.length} {rows.length === 1 ? "lid" : "leden"} zonder bezoek
          sinds 14+ dagen
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="py-20 text-center border-t border-[color:var(--ink-500)]/60">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
            Niets gevlagd
          </span>
          <p className="text-text-muted text-sm max-w-md mx-auto">
            Alle actieve leden zijn recent nog geweest, of hebben nog geen
            14 dagen inactiviteit bereikt.
          </p>
        </div>
      ) : (
        <div className="border-t border-[color:var(--ink-500)]/60">
          {rows.map((r) => (
            <Link
              key={r.profileId}
              href={`/app/admin/leden/${r.profileId}`}
              className="flex items-center justify-between gap-4 py-4 border-b border-[color:var(--ink-500)]/40 hover:bg-bg-elevated/60 transition-colors duration-300"
            >
              <div className="min-w-0">
                <p className="text-text text-sm font-medium truncate">
                  {r.firstName} {r.lastName}
                </p>
                <p className="text-text-muted text-xs truncate">{r.email}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-text-muted text-xs">
                  Laatste bezoek: {formatDate(r.lastAttendedAt)}
                </p>
                <p className="text-text-muted text-xs">
                  Gevlagd: {formatDate(r.flaggedAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
