import { PRESENCE_MARLON } from "@/lib/constants";
import { formatTime } from "@/lib/opening-hours-format";
import { presenceForWeekday, type PresenceWindow } from "@/lib/presence";

/**
 * Aanwezigheid van Marlon. De tijden komen uit tmc.trainer_presence_windows
 * (enige bron), aangeleverd door de server-pagina; hier staat alleen de copy.
 * Zonder vensters (tabel leeg of onbereikbaar) blijft de tijdenregel weg.
 */
export function MarlonPresence({ windows }: { windows: readonly PresenceWindow[] }) {
  // De dagen-copy ("Maandag t/m vrijdag") gaat uit van een vast weekpatroon;
  // de tijden zijn die van de eerste weekdag met vensters.
  const firstDay = [1, 2, 3, 4, 5, 6, 0].find(
    (d) => presenceForWeekday(windows, d).windows.length > 0,
  );
  const times =
    firstDay === undefined
      ? ""
      : presenceForWeekday(windows, firstDay)
          .windows.map((w) => `${formatTime(w.from)} tot ${formatTime(w.to)} uur`)
          .join(" en ");

  return (
    <div>
      {/* COPY: confirm met Marlon */}
      <span className="tmc-eyebrow block mb-3">{PRESENCE_MARLON.label}</span>
      {times && (
        <p className="text-text-muted text-sm">
          {PRESENCE_MARLON.days}: {times}
        </p>
      )}
      {/* COPY: confirm met Marlon */}
      <p className="mt-4 border border-accent/60 bg-bg px-5 py-4 text-text-muted text-sm leading-relaxed">
        {PRESENCE_MARLON.note}
      </p>
    </div>
  );
}
