import { PRESENCE_MARLON } from "@/lib/constants";
import { formatTime } from "@/lib/opening-hours-format";

export function MarlonPresence() {
  const times = PRESENCE_MARLON.windows
    .map((w) => `${formatTime(w.from)} tot ${formatTime(w.to)} uur`)
    .join(" en ");

  return (
    <div>
      {/* COPY: confirm met Marlon */}
      <span className="tmc-eyebrow block mb-3">{PRESENCE_MARLON.label}</span>
      <p className="text-text-muted text-sm">
        {PRESENCE_MARLON.days}: {times}
      </p>
      {/* COPY: confirm met Marlon */}
      <p className="mt-4 border border-accent/60 bg-bg px-5 py-4 text-text-muted text-sm leading-relaxed">
        {PRESENCE_MARLON.note}
      </p>
    </div>
  );
}
