import { getFreeTrainingAvailability } from "@/lib/scheduling/opening-hours";
import { getTodayCheckIns } from "@/lib/check-in/actions";
import { ACCESS_TYPE_LABELS_NL } from "@/lib/check-in/access-type-labels";
import { Chip } from "@/components/ui/Chip";
import { formatTime, formatWeekdayDateHeading, isoDateAmsterdam, todayIsoAmsterdam } from "@/lib/format-date";
import { getUpcomingTrialHours } from "@/lib/admin/trial-hours";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";

export async function FreeTrainingPanel() {
  const now = new Date();
  const [days, checkIns, trialHours] = await Promise.all([
    getFreeTrainingAvailability({ from: now, to: now }),
    getTodayCheckIns(),
    getUpcomingTrialHours(now),
  ]);
  const todayIso = todayIsoAmsterdam(now);
  // Gegroepeerd per Amsterdamse dag; vandaag eerst, dan de komende dagen.
  const trialByDay = new Map<string, typeof trialHours>();
  for (const t of trialHours) {
    const key = isoDateAmsterdam(new Date(t.slotStartAt));
    trialByDay.set(key, [...(trialByDay.get(key) ?? []), t]);
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
          Openingstijd minus sessies die de studio blokkeren, plus wie er
          vandaag heeft ingecheckt.
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
          Proefuren vrij trainen ({trialHours.length})
        </span>
        {trialHours.length === 0 ? (
          <p className="text-text-muted text-sm">
            {/* COPY: confirm met Marlon */}
            Geen proefuren geboekt de komende twee weken.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {[...trialByDay.entries()].map(([iso, rows]) => (
              <div key={iso}>
                <span className="text-text-muted text-xs uppercase tracking-[0.14em] block mb-2">
                  {/* COPY: confirm met Marlon */}
                  {iso === todayIso ? "Vandaag" : formatWeekdayDateHeading(new Date(rows[0].slotStartAt))}
                </span>
                <ul className="flex flex-col">
                  {rows.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 border-b border-[color:var(--ink-500)]/40"
                    >
                      <span className="text-text text-sm tabular-nums">
                        {formatTime(new Date(t.slotStartAt))} – {formatTime(new Date(t.slotEndAt))}
                      </span>
                      <span className="text-text text-sm">{t.name}</span>
                      <span className="text-text-muted text-xs">{t.phone}</span>
                      {t.isTest && (
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
