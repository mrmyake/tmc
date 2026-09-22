import { listAccountDeletions } from "@/lib/admin/account-deletion-query";
import { AccountDeletionRow } from "./_components/AccountDeletionRow";

export const metadata = {
  title: "Admin · Verwijderverzoeken | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Lijst van accountverwijderingen (spec-ios-app.md D.2, PR 4). Leest
 * tmc.account_deletions via src/lib/admin/account-deletion-query.ts (puur
 * lezen, service-role-client); de acties (intrekken, nu sluiten) lopen via
 * src/lib/admin/account-deletion-actions.ts op de bestaande functies uit
 * de wiring-laag. De kern (core.ts) en de RPC uit #206 zijn onaangeraakt.
 */
export default async function AdminVerwijderverzoekenPage() {
  const { open, history } = await listAccountDeletions();

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          {/* COPY: confirm met Marlon */}
          Verwijderverzoeken.
        </h1>
        <p className="tmc-eyebrow mt-4">
          {open.length} open &middot; {history.length} recent afgehandeld
        </p>
      </header>

      <section className="mb-14">
        <header className="mb-6">
          <span className="tmc-eyebrow block mb-2">Openstaand</span>
          <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
            {open.length === 0 ? "Niks te doen" : `${open.length} lopend`}
          </h2>
        </header>
        {open.length === 0 ? (
          <div className="py-12 text-center border-t border-[color:var(--ink-500)]/60">
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
              Up to date
            </span>
            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted text-sm max-w-md mx-auto">
              Geen openstaande verwijderverzoeken.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
            {open.map((row) => (
              <AccountDeletionRow key={row.id} row={row} actionable />
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <header className="mb-6">
            <span className="tmc-eyebrow block mb-2">Historie</span>
            <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
              Recent afgehandeld
            </h2>
          </header>
          <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
            {history.map((row) => (
              <AccountDeletionRow key={row.id} row={row} actionable={false} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
