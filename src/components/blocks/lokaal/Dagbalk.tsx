import { PRESENCE_MARLON } from "@/lib/constants";
import type { Dagbalk as DagbalkData } from "@/lib/lokaal/dagbalk";

/**
 * Balk met per rij de openingstijden van de studio en de tijden van Marlon.
 * De data komt uit getOpeningHours() en tmc.trainer_presence_windows (via
 * bouwDagbalk); er staan nergens tijden in de content.
 */
export function Dagbalk({ data }: { data: DagbalkData }) {
  if (data.rijen.length === 0) return null;
  return (
    <div>
      <div className="grid gap-3">
        {data.rijen.map((rij) => (
          <div key={rij.label} className="grid grid-cols-[74px_1fr] items-center gap-3">
            <span className="text-[12.5px] text-text-muted">{rij.label}</span>
            <div className="relative h-[34px] overflow-hidden rounded bg-bg-elevated">
              {rij.open && (
                <i
                  className="absolute inset-y-0 bg-text/10"
                  style={{ left: `${rij.open.left}%`, width: `${rij.open.width}%` }}
                />
              )}
              {rij.marlon.map((m) => (
                <i
                  key={m.left}
                  className="absolute inset-y-[9px] rounded-[2px] bg-accent"
                  style={{ left: `${m.left}%`, width: `${m.width}%` }}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[74px_1fr] gap-3" aria-hidden>
          <span />
          <div className="relative h-4 text-[11px] text-text-muted">
            {data.ticks.map((t) => (
              <em
                key={t.uur}
                className="absolute -translate-x-1/2 not-italic"
                style={{ left: `${t.left}%` }}
              >
                {String(t.uur).padStart(2, "0")}
              </em>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-text-muted">
        <span className="inline-flex items-center gap-2">
          <i className="h-2 w-3 rounded-[2px] bg-text/20" />
          {/* COPY: confirm met Marlon */}
          Studio open voor vrij trainen
        </span>
        <span className="inline-flex items-center gap-2">
          <i className="h-2 w-3 rounded-[2px] bg-accent" />
          {/* COPY: confirm met Marlon */}
          Marlon in de studio
        </span>
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-text-muted">{PRESENCE_MARLON.note}</p>
    </div>
  );
}
