import { Chip } from "@/components/ui/Chip";
import type {
  TrialBookingGroup,
  TrialBookingPeriod,
  TrialBookingRow,
} from "@/lib/admin/trial-bookings-query";
import { formatShortDateWithYear, formatTime } from "@/lib/format-date";
import { BookingKindChip, BookingStatusChip } from "./booking-status";
import { WhatsAppButton } from "./WhatsAppButton";

// COPY: confirm met Marlon
const EMPTY_TEXT: Record<TrialBookingPeriod, { title: string; body: string }> = {
  upcoming: {
    title: "Geen komende proeflessen",
    body: "Er staan geen proeflessen gepland bij deze filter.",
  },
  past: {
    title: "Geen afgelopen proeflessen",
    body: "Er zijn nog geen proeflessen geweest bij deze filter.",
  },
  all: {
    title: "Geen proeflessen",
    body: "Geen proefboekingen gevonden bij deze filter.",
  },
};

function EmptyState({ period }: { period: TrialBookingPeriod }) {
  const text = EMPTY_TEXT[period];
  return (
    <div className="py-20 text-center border-t border-[color:var(--ink-500)]/60">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">{text.title}</span>
      <p className="text-text-muted text-sm max-w-md mx-auto">{text.body}</p>
    </div>
  );
}

function EmailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className="hover:text-accent transition-colors break-all">
      {email}
    </a>
  );
}

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a href={`tel:${phone}`} className="hover:text-accent transition-colors">
      {phone}
    </a>
  );
}

// COPY: confirm met Marlon
function participantsLabel(n: number): string {
  return n === 1 ? "1 deelnemer" : `${n} deelnemers`;
}

/** Datum en tijd in Europe/Amsterdam, plus lestype en teller. */
function GroupHeading({ group }: { group: TrialBookingGroup }) {
  const start = new Date(group.startAt);
  const end = new Date(group.endAt);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="text-sm text-text">
        {formatShortDateWithYear(start)} · {formatTime(start)} tot {formatTime(end)}
      </span>
      <span className="text-sm text-text-muted">
        {/* COPY: confirm met Marlon */}
        {group.isSlot ? "Proefuur vrij trainen" : group.className}
      </span>
      <span className="text-xs text-text-muted">{participantsLabel(group.bookings.length)}</span>
      {group.sessionCancelled && (
        <Chip tone="danger">
          {/* COPY: confirm met Marlon */}
          Les geannuleerd
        </Chip>
      )}
    </div>
  );
}

const isClosed = (row: TrialBookingRow) => row.status === "cancelled";

/**
 * Per les een kopregel, daaronder de deelnemers. Desktop als tabel met
 * groepsrijen, mobiel als kaart per les; zelfde stijl als ProeflessenTable.
 */
export function BoekingenTable({
  groups,
  period,
}: {
  groups: TrialBookingGroup[];
  period: TrialBookingPeriod;
}) {
  if (groups.length === 0) return <EmptyState period={period} />;

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[color:var(--ink-500)]/60">
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 pl-3 pr-4 text-left">
                <span className="tmc-eyebrow">Naam</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">E-mail</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Telefoon</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Soort</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Status</span>
              </th>
              <th scope="col" className="py-3 pl-4 pr-3 text-right">
                <span className="tmc-eyebrow">Actie</span>
              </th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.key}>
              <tr className="bg-bg-elevated/60">
                <th
                  scope="rowgroup"
                  colSpan={6}
                  className="py-3 pl-3 pr-4 text-left font-normal border-b border-[color:var(--ink-500)]/40"
                >
                  <GroupHeading group={group} />
                </th>
              </tr>
              {group.bookings.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-[color:var(--ink-500)]/40 transition-colors duration-300 hover:bg-bg-elevated/60 ${
                    isClosed(row) ? "opacity-70" : ""
                  }`}
                >
                  <td className="py-4 pl-3 pr-4 align-middle text-sm text-text">{row.name}</td>
                  <td className="py-4 px-4 align-middle text-sm text-text">
                    <EmailLink email={row.email} />
                  </td>
                  <td className="py-4 px-4 align-middle text-sm text-text whitespace-nowrap">
                    <PhoneLink phone={row.phone} />
                  </td>
                  <td className="py-4 px-4 align-middle">
                    <BookingKindChip viaCode={row.viaCode} />
                  </td>
                  <td className="py-4 px-4 align-middle">
                    <BookingStatusChip status={row.status} />
                  </td>
                  <td className="py-4 pl-4 pr-3 align-middle text-right">
                    <WhatsAppButton href={row.whatsappHref} name={row.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <ul className="md:hidden flex flex-col gap-6 border-t border-[color:var(--ink-500)]/60 pt-6">
        {groups.map((group) => (
          <li key={group.key} className="flex flex-col gap-3">
            <GroupHeading group={group} />
            <ul className="flex flex-col">
              {group.bookings.map((row) => (
                <li
                  key={row.id}
                  className={`flex flex-col gap-3 py-4 border-b border-[color:var(--ink-500)]/40 ${
                    isClosed(row) ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm text-text">{row.name}</span>
                    <BookingStatusChip status={row.status} />
                  </div>
                  <div className="flex flex-col gap-1 text-sm text-text">
                    <EmailLink email={row.email} />
                    <PhoneLink phone={row.phone} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <BookingKindChip viaCode={row.viaCode} />
                    <WhatsAppButton href={row.whatsappHref} name={row.name} />
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
