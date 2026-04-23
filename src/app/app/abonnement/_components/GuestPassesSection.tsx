import type { GuestPassStatus } from "@/lib/member/guest-pass-actions";
import { formatDateLong, formatShortDate } from "@/lib/format-date";

export function GuestPassesSection({ status }: { status: GuestPassStatus }) {
  if (!status.eligible) return null;

  const periodEndLabel = status.periodEnd
    ? formatDateLong(new Date(`${status.periodEnd}T00:00:00`))
    : null;

  const invited = status.invitedThisPeriod.filter(
    (v) => v.status === "booked" || v.status === "attended",
  );

  return (
    <section aria-labelledby="guest-passes-title" className="mb-14">
      <div className="flex items-baseline justify-between mb-5 gap-4">
        <h3 id="guest-passes-title" className="tmc-eyebrow">
          Guest passes
        </h3>
        {periodEndLabel && (
          <span className="text-text-muted text-xs">
            Vernieuwt {periodEndLabel}
          </span>
        )}
      </div>

      <div className="border-y border-[color:var(--ink-500)]/60">
        <div className="py-6 flex items-baseline gap-6">
          <span className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl text-text leading-none tracking-[-0.02em] tabular-nums">
            {status.remaining}
          </span>
          <div className="flex-1">
            <p className="text-text text-sm leading-relaxed">
              {status.remaining === 0
                ? "Geen passes meer deze periode."
                : status.remaining === 1
                  ? "Eén vrije plek om iemand mee te nemen."
                  : `${status.remaining} vrije plekken om iemand mee te nemen.`}
            </p>
            <p className="text-text-muted text-xs mt-1">
              {status.used} van {status.allocated} gebruikt. Uitnodigen gaat
              vanuit een sessie in je rooster.
            </p>
          </div>
        </div>

        {invited.length > 0 && (
          <ul className="border-t border-[color:var(--ink-500)]/60">
            {invited.map((visit) => (
              <li
                key={visit.id}
                className="grid grid-cols-[1fr_auto_auto] gap-6 py-4 border-b border-[color:var(--ink-500)]/60 items-baseline last:border-b-0"
              >
                <span className="text-text text-sm">{visit.guestName}</span>
                <span className="text-text-muted text-xs">
                  {visit.className}
                </span>
                <span className="text-text-muted text-xs">
                  {visit.sessionStart
                    ? formatShortDate(new Date(visit.sessionStart))
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
