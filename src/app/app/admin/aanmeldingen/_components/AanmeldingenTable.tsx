import type { EmailSignupRow } from "@/lib/admin/email-signups-query";
import { amsterdamParts } from "@/lib/format-date";
import { SignupStatusChip, SourceChip } from "./status";

/** "06-10-2026" in Europe/Amsterdam. */
function formatDayMonthYear(iso: string): string {
  const p = amsterdamParts(new Date(iso));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(p.day)}-${pad(p.month)}-${p.year}`;
}

function EmptyState() {
  return (
    <div className="py-20 text-center border-t border-[color:var(--ink-500)]/60">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        {/* COPY: confirm met Marlon */}
        Geen aanmeldingen
      </span>
      <p className="text-text-muted text-sm max-w-md mx-auto">
        {/* COPY: confirm met Marlon */}
        Geen e-mailadressen gevonden bij deze filter.
      </p>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-text-muted/70">{children}</span>;
}

function DateCell({ iso }: { iso: string | null }) {
  // COPY: confirm met Marlon
  if (!iso) return <Muted>Onbekend</Muted>;
  return <>{formatDayMonthYear(iso)}</>;
}

/** Desktop-tabel plus mobiele kaarten, zelfde opzet als de andere admin-lijsten. */
export function AanmeldingenTable({ rows }: { rows: EmailSignupRow[] }) {
  if (rows.length === 0) return <EmptyState />;

  const isInactive = (row: EmailSignupRow) => row.status !== "active";

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[color:var(--ink-500)]/60">
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 pl-3 pr-4 text-left">
                <span className="tmc-eyebrow">E-mail</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Naam</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Bronnen</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Aangemeld op</span>
              </th>
              <th scope="col" className="py-3 pl-4 pr-3 text-left">
                <span className="tmc-eyebrow">Status</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.email}
                className={`border-b border-[color:var(--ink-500)]/40 transition-colors duration-300 hover:bg-bg-elevated/60 ${
                  isInactive(row) ? "opacity-70" : ""
                }`}
              >
                <td className="py-4 pl-3 pr-4 align-middle text-sm text-text">
                  <a href={`mailto:${row.email}`} className="hover:text-accent transition-colors break-all">
                    {row.email}
                  </a>
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text">
                  {/* COPY: confirm met Marlon */}
                  {row.name ?? <Muted>Onbekend</Muted>}
                </td>
                <td className="py-4 px-4 align-middle">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {row.sourceLabels.map((label) => (
                      <SourceChip key={label} label={label} />
                    ))}
                  </div>
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted whitespace-nowrap">
                  <DateCell iso={row.signedUpAt} />
                </td>
                <td className="py-4 pl-4 pr-3 align-middle">
                  <SignupStatusChip status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden flex flex-col border-t border-[color:var(--ink-500)]/60">
        {rows.map((row) => (
          <li
            key={row.email}
            className={`flex flex-col gap-3 py-4 border-b border-[color:var(--ink-500)]/40 ${
              isInactive(row) ? "opacity-70" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <a href={`mailto:${row.email}`} className="text-sm text-text hover:text-accent transition-colors break-all">
                {row.email}
              </a>
              <SignupStatusChip status={row.status} />
            </div>
            {row.name && <span className="text-sm text-text-muted">{row.name}</span>}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {row.sourceLabels.map((label) => (
                <SourceChip key={label} label={label} />
              ))}
            </div>
            <span className="text-xs text-text-muted">
              {/* COPY: confirm met Marlon */}
              Aangemeld <DateCell iso={row.signedUpAt} />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
