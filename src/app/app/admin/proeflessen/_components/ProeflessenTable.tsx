import type { TrialRequestRow } from "@/lib/admin/trial-requests-query";
import { experienceLabel } from "@/lib/trial-requests/status";
import { formatShortDateWithYear } from "@/lib/format-date";
import { StatusChip } from "./status";
import { TrialRequestDialog } from "./TrialRequestDialog";
import { WhatsAppButton } from "./WhatsAppButton";

function EmptyState() {
  return (
    <div className="py-20 text-center border-t border-[color:var(--ink-500)]/60">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        {/* COPY: confirm met Marlon */}
        Geen aanvragen
      </span>
      <p className="text-text-muted text-sm max-w-md mx-auto">
        {/* COPY: confirm met Marlon */}
        Geen proefles-aanvragen gevonden bij deze filter.
      </p>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-text-muted/70">{children}</span>;
}

function EmailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className="hover:text-accent transition-colors break-all">
      {email}
    </a>
  );
}

function PhoneLink({ phone }: { phone: string | null }) {
  // COPY: confirm met Marlon
  if (!phone) return <Muted>Geen telefoon</Muted>;
  return (
    <a href={`tel:${phone}`} className="hover:text-accent transition-colors">
      {phone}
    </a>
  );
}

/** Desktop-tabel plus mobiele kaarten, zelfde opzet als ProefcodesTable. */
export function ProeflessenTable({ rows }: { rows: TrialRequestRow[] }) {
  if (rows.length === 0) return <EmptyState />;

  const isClosed = (row: TrialRequestRow) => row.status === "booked" || row.status === "lost";

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[color:var(--ink-500)]/60">
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 pl-3 pr-4 text-left">
                <span className="tmc-eyebrow">Datum</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Naam</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">E-mail</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Telefoon</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Voorkeur</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Ervaring</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Status</span>
              </th>
              <th scope="col" className="py-3 pl-4 pr-3 text-right">
                <span className="tmc-eyebrow">Actie</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-[color:var(--ink-500)]/40 transition-colors duration-300 hover:bg-bg-elevated/60 ${
                  isClosed(row) ? "opacity-70" : ""
                }`}
              >
                <td className="py-4 pl-3 pr-4 align-middle text-sm text-text-muted whitespace-nowrap">
                  {formatShortDateWithYear(new Date(row.createdAt))}
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text">
                  {row.name}
                  {row.message && (
                    <span className="block mt-0.5 text-xs text-text-muted">
                      {/* COPY: confirm met Marlon */}
                      Met bericht
                    </span>
                  )}
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text">
                  <EmailLink email={row.email} />
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text whitespace-nowrap">
                  <PhoneLink phone={row.phone} />
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted max-w-[16rem]">
                  {/* COPY: confirm met Marlon */}
                  {row.preference ?? <Muted>Geen voorkeur</Muted>}
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">
                  {experienceLabel(row.experience) ?? <Muted>Onbekend</Muted>}
                </td>
                <td className="py-4 px-4 align-middle">
                  <StatusChip status={row.status} />
                </td>
                <td className="py-4 pl-4 pr-3 align-middle text-right">
                  <div className="inline-flex items-center gap-3">
                    <WhatsAppButton href={row.whatsappHref} name={row.name} />
                    <TrialRequestDialog row={row} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden flex flex-col border-t border-[color:var(--ink-500)]/60">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`flex flex-col gap-3 py-4 border-b border-[color:var(--ink-500)]/40 ${
              isClosed(row) ? "opacity-70" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm text-text">{row.name}</span>
              <StatusChip status={row.status} />
            </div>
            <div className="flex flex-col gap-1 text-sm text-text">
              <EmailLink email={row.email} />
              <PhoneLink phone={row.phone} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              <span>{formatShortDateWithYear(new Date(row.createdAt))}</span>
              {experienceLabel(row.experience) && (
                <>
                  <span>·</span>
                  <span>{experienceLabel(row.experience)}</span>
                </>
              )}
              {row.preference && (
                <>
                  <span>·</span>
                  <span>{row.preference}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <WhatsAppButton href={row.whatsappHref} name={row.name} />
              <TrialRequestDialog row={row} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
