import { getFreeTrainingAvailability } from "@/lib/scheduling/opening-hours";
import { getTodayCheckIns } from "@/lib/check-in/actions";
import { ACCESS_TYPE_LABELS_NL } from "@/lib/check-in/access-type-labels";
import { Chip } from "@/components/ui/Chip";
import { formatTime } from "@/lib/format-date";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";

export async function FreeTrainingPanel() {
  const now = new Date();
  const [days, checkIns] = await Promise.all([
    getFreeTrainingAvailability({ from: now, to: now }),
    getTodayCheckIns(),
  ]);
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
    </section>
  );
}
