import { getFreeTrainingAvailability } from "@/lib/scheduling/opening-hours";
import { getTodayCheckIns } from "@/lib/check-in/actions";
import { ACCESS_TYPE_LABELS_NL } from "@/lib/check-in/access-type-labels";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { formatTime, formatWeekdayDate, isoDateAmsterdam, todayIsoAmsterdam } from "@/lib/format-date";
import { getUpcomingTrialHours } from "@/lib/admin/trial-hours";
import { getUpcomingVrijTrainenBookings } from "@/lib/admin/vrij-trainen-bookings";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";

export async function FreeTrainingPanel() {
  const now = new Date();
  const [days, checkIns, trialHours, memberBookings] = await Promise.all([
    getFreeTrainingAvailability({ from: now, to: now }),
    getTodayCheckIns(),
    getUpcomingTrialHours(now),
    getUpcomingVrijTrainenBookings(now),
  ]);
  const todayIso = todayIsoAmsterdam(now);
  // Leden en proefuren in een lijst, gegroepeerd per Amsterdamse dag (vandaag
  // eerst, dan de komende dagen) en per dag op slotstart gesorteerd.
  const booked = [
    ...memberBookings.map((m) => ({ kind: "member" as const, ...m })),
    ...trialHours.map((t) => ({ kind: "trial" as const, ...t })),
  ].sort((a, b) => a.slotStartAt.localeCompare(b.slotStartAt));
  const bookedByDay = new Map<string, typeof booked>();
  for (const b of booked) {
    const key = isoDateAmsterdam(new Date(b.slotStartAt));
    bookedByDay.set(key, [...(bookedByDay.get(key) ?? []), b]);
  }
  const today = days[0];

  // Combineer vrije en geblokkeerde segmenten chronologisch voor de tijdlijn.
  const timeline = today
    ? [
        ...today.slots.map((s) => ({ ...s, kind: "free" as const, label: null as string | null })),
        ...today.blocked.map((b) => ({
          ...b,
          kind: "blocked" as const,
          label: b.className,
        })),
      ].sort((a, b) => a.start.localeCompare(b.start))
    : [];

  return (
    <section className="mt-16">
      <header className="mb-8">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
          {/* COPY: confirm met Marlon */}
          Vrij trainen vandaag
        </span>
        <p className="text-text-muted text-sm max-w-xl leading-relaxed">
          {/* COPY: confirm met Marlon */}
          Openingstijd minus sessies die de studio blokkeren, wie er
          vandaag heeft ingecheckt en wie de komende twee weken heeft geboekt.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div>
          <span className="tmc-eyebrow block mb-4">
            {/* COPY: confirm met Marlon */}
            Blokken
          </span>
          {!today || today.isClosed ? (
            <p className="text-text-muted text-sm">
              {/* COPY: confirm met Marlon */}
              Gesloten vandaag.
            </p>
          ) : timeline.length === 0 ? (
            <p className="text-text-muted text-sm">
              {/* COPY: confirm met Marlon */}
              Geen openingstijd geconfigureerd.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {timeline.map((seg, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-4 py-2 border-b border-[color:var(--ink-500)]/40"
                >
                  <span className="text-text text-sm tabular-nums">
                    {formatTime(new Date(seg.start))} –{" "}
                    {formatTime(new Date(seg.end))}
                  </span>
                  {seg.kind === "free" ? (
                    <Chip tone="success">
                      {/* COPY: confirm met Marlon */}
                      Vrij
                    </Chip>
                  ) : (
                    <Chip tone="warning">
                      {/* COPY: confirm met Marlon */}
                      Geblokkeerd · {seg.label}
                    </Chip>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <span className="tmc-eyebrow block mb-4">
            {/* COPY: confirm met Marlon */}
            Check-ins vandaag ({checkIns.length})
          </span>
          {checkIns.length === 0 ? (
            <p className="text-text-muted text-sm">
              {/* COPY: confirm met Marlon */}
              Nog niemand ingecheckt vandaag.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {checkIns.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-4 py-2 border-b border-[color:var(--ink-500)]/40"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-text text-sm">
                      {c.firstName} {c.lastInitial}.
                    </span>
                    <span className="text-text-muted text-xs">
                      {formatTime(new Date(c.checkedInAt))} ·{" "}
                      {PILLAR_LABELS[c.pillar as Pillar] ?? c.pillar} ·{" "}
                      {ACCESS_TYPE_LABELS_NL[c.accessType] ?? c.accessType}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-12">
        <span className="tmc-eyebrow block mb-4">
          {/* COPY: confirm met Marlon */}
          Geboekt vrij trainen ({booked.length})
        </span>
        {booked.length === 0 ? (
          <p className="text-text-muted text-sm">
            {/* COPY: confirm met Marlon */}
            Niemand geboekt de komende twee weken.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {[...bookedByDay.entries()].map(([iso, rows]) => (
              <div key={iso}>
                <span className="text-text-muted text-xs uppercase tracking-[0.14em] block mb-2">
                  {/* COPY: confirm met Marlon */}
                  {iso === todayIso ? "Vandaag" : formatWeekdayDate(new Date(rows[0].slotStartAt))}
                </span>
                <ul className="flex flex-col">
                  {rows.map((r) => (
                    <li
                      key={`${r.kind}-${r.id}`}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 border-b border-[color:var(--ink-500)]/40"
                    >
                      <span className="text-text text-sm tabular-nums">
                        {formatTime(new Date(r.slotStartAt))} – {formatTime(new Date(r.slotEndAt))}
                      </span>
                      {r.kind === "member" ? (
                        <Link
                          href={`/app/admin/leden/${r.profileId}`}
                          className="text-text text-sm hover:text-accent transition-colors"
                        >
                          {r.name}
                        </Link>
                      ) : (
                        <>
                          <span className="text-text text-sm">{r.name}</span>
                          <span className="text-text-muted text-xs">{r.phone}</span>
                          <Chip tone="accent">
                            {/* COPY: confirm met Marlon */}
                            Proefuur
                          </Chip>
                        </>
                      )}
                      {r.isTest && (
                        <Chip tone="muted">
                          {/* COPY: confirm met Marlon */}
                          Test
                        </Chip>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
