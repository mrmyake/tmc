"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { AdminField, AdminSelect } from "@/components/ui/AdminField";
import { WeekGrid } from "./WeekGrid";
import { MonthGrid } from "./MonthGrid";
import { SessionDetailPanel } from "./SessionDetailPanel";
import { BlockCreatePanel } from "./BlockCreatePanel";
import type {
  AgendaDay,
  AgendaSessionBlockData,
  AgendaViewMode,
  TrainerOption,
} from "./types";

interface AgendaScreenProps {
  view: AgendaViewMode;
  anchorIso: string;
  days: AgendaDay[];
  isAdmin: boolean;
  trainerOptions: TrainerOption[];
  selectedTrainerId: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  isCurrentRangeToday: boolean;
}

// COPY: confirm met Marlon
const VIEW_TABS: Array<{ id: AgendaViewMode; label: string }> = [
  { id: "day", label: "Dag" },
  { id: "week", label: "Week" },
  { id: "month", label: "Maand" },
];

function rangeLabel(view: AgendaViewMode, days: AgendaDay[]): string {
  if (days.length === 0) return "";
  const first = days[0];
  const last = days[days.length - 1];
  if (view === "day") {
    return `${first.weekdayShort} ${first.dayNumber} ${first.monthShort}`;
  }
  if (view === "month") {
    // De maandtitel volgt de dag halverwege de grid (voorkomt dat een
    // rand-week uit de vorige/volgende maand de titel bepaalt).
    const mid = days[Math.floor(days.length / 2)];
    return `${mid.monthShort}`;
  }
  return first.monthShort === last.monthShort
    ? `${first.dayNumber} – ${last.dayNumber} ${first.monthShort}`
    : `${first.dayNumber} ${first.monthShort} – ${last.dayNumber} ${last.monthShort}`;
}

/**
 * PT-agenda PR D: orchestrator voor de trainer-agenda. Puur
 * query-param-gedreven (geen losse client-state voor view/datum/trainer)
 * zodat prev/today/next-navigatie en delen van een link werken zoals bij
 * het bestaande rooster-scherm. Alleen de sessie-detailpaneel-selectie is
 * lokale state.
 */
export function AgendaScreen({
  view,
  anchorIso,
  days,
  isAdmin,
  trainerOptions,
  selectedTrainerId,
  prevHref,
  nextHref,
  todayHref,
  isCurrentRangeToday,
}: AgendaScreenProps) {
  const router = useRouter();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [blockPanelOpen, setBlockPanelOpen] = useState(false);

  const sessionById = useMemo(() => {
    const map = new Map<string, AgendaSessionBlockData>();
    for (const day of days) {
      for (const s of day.sessions) map.set(s.id, s);
    }
    return map;
  }, [days]);

  const selectedSession = selectedSessionId
    ? (sessionById.get(selectedSessionId) ?? null)
    : null;

  function viewHref(nextView: AgendaViewMode): string {
    const params = new URLSearchParams({ view: nextView, date: anchorIso });
    if (isAdmin) params.set("trainerId", selectedTrainerId);
    return `/app/trainer/agenda?${params.toString()}`;
  }

  function handleTrainerChange(trainerId: string) {
    const params = new URLSearchParams({
      view,
      date: anchorIso,
      trainerId,
    });
    router.push(`/app/trainer/agenda?${params.toString()}`);
  }

  return (
    <Container className="py-10 md:py-14 max-w-6xl">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
        <div>
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
            PT-agenda
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text leading-[1.02] tracking-[-0.02em]">
            {isCurrentRangeToday
              ? // COPY: confirm met Marlon
                view === "day"
                ? "Vandaag."
                : view === "week"
                  ? "Deze week."
                  : "Deze maand."
              : `${rangeLabel(view, days)}.`}
          </h1>
          <p className="tmc-eyebrow mt-3">{rangeLabel(view, days)}</p>
        </div>

        <nav
          aria-label="Datumnavigatie"
          className="flex flex-wrap items-center gap-2"
        >
          <Link
            href={prevHref}
            className="inline-flex items-center gap-2 px-4 py-3 border border-text-muted/30 text-text-muted text-xs uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
          >
            {/* COPY: confirm met Marlon */}
            Vorige
          </Link>
          {!isCurrentRangeToday && (
            <Link
              href={todayHref}
              className="inline-flex items-center gap-2 px-4 py-3 border border-text-muted/30 text-text-muted text-xs uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
            >
              {/* COPY: confirm met Marlon */}
              Vandaag
            </Link>
          )}
          <Link
            href={nextHref}
            className="inline-flex items-center gap-2 px-4 py-3 border border-text-muted/30 text-text-muted text-xs uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
          >
            {/* COPY: confirm met Marlon */}
            Volgende
          </Link>
        </nav>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
        <div
          role="tablist"
          aria-label="Weergave"
          className="flex flex-wrap gap-2"
        >
          {VIEW_TABS.map((tab) => (
            <Link
              key={tab.id}
              href={viewHref(tab.id)}
              role="tab"
              aria-selected={view === tab.id}
              className={`px-4 py-2.5 text-xs font-medium uppercase tracking-[0.14em] border transition-colors ${
                view === tab.id
                  ? "bg-accent text-bg border-accent"
                  : "border-[color:var(--ink-500)] text-text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setBlockPanelOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium uppercase tracking-[0.14em] border border-[color:var(--ink-500)] text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}+ Blok toevoegen
        </button>

        {isAdmin && trainerOptions.length > 0 && (
          <div className="max-w-xs w-full sm:w-56">
            <AdminField label="Trainer">
              <AdminSelect
                value={selectedTrainerId}
                onChange={(e) => handleTrainerChange(e.target.value)}
              >
                {trainerOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          </div>
        )}
      </div>

      {trainerOptions.length === 0 ? (
        <section className="bg-bg-elevated p-10 text-center">
          {/* COPY: confirm met Marlon */}
          <p className="text-text-muted text-base max-w-md mx-auto">
            Er zijn nog geen actieve trainers om een agenda voor te tonen.
          </p>
        </section>
      ) : view === "month" ? (
        <MonthGrid
          days={days}
          dayHref={(isoDate) => {
            const params = new URLSearchParams({ view: "day", date: isoDate });
            if (isAdmin) params.set("trainerId", selectedTrainerId);
            return `/app/trainer/agenda?${params.toString()}`;
          }}
        />
      ) : (
        <WeekGrid days={days} onSelect={setSelectedSessionId} />
      )}

      {selectedSession && (
        <SessionDetailPanel
          session={selectedSession}
          isAdmin={isAdmin}
          onClose={() => setSelectedSessionId(null)}
        />
      )}

      {blockPanelOpen && (
        <BlockCreatePanel
          trainerId={selectedTrainerId}
          defaultDateIso={anchorIso}
          onClose={() => setBlockPanelOpen(false)}
        />
      )}
    </Container>
  );
}
