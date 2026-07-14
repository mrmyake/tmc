"use client";

import { useEffect, useState, useTransition } from "react";
import { getPtBusy, type PtBusyBlock } from "@/lib/admin/pt-busy-actions";
import { formatTimeRange } from "@/lib/format-date";
import { zonedWallClockToUtc } from "@/lib/scheduling/amsterdam-time";

interface BusyDayPanelProps {
  trainerId: string;
  /** yyyy-mm-dd, Amsterdam wall-clock dag om te checken. */
  dateIso: string | null;
}

/**
 * PT-agenda C2: hulp bij het prikken van een vrij moment. Toont de
 * bezette intervallen (incl. omkleedtijd-buffer) van de gekozen trainer
 * op de gekozen dag, via de bestaande admin-only RPC get_pt_busy.
 * Uitsluitend tijden, nooit wie of waarvoor.
 */
export function BusyDayPanel({ trainerId, dateIso }: BusyDayPanelProps) {
  const [blocks, setBlocks] = useState<PtBusyBlock[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dateIso || !trainerId) {
      setBlocks([]);
      return;
    }
    const [year, month, day] = dateIso.split("-").map(Number);
    const dayStart = zonedWallClockToUtc(year, month, day, 0, 0);
    const dayEnd = zonedWallClockToUtc(year, month, day, 23, 59);
    startTransition(async () => {
      const rows = await getPtBusy(
        trainerId,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      );
      setBlocks(rows);
    });
  }, [trainerId, dateIso]);

  if (!dateIso || !trainerId) return null;

  return (
    <div className="mt-2 text-xs">
      {pending ? (
        // COPY: confirm met Marlon
        <p className="text-text-muted">Bezette tijden laden...</p>
      ) : blocks.length === 0 ? (
        // COPY: confirm met Marlon
        <p className="text-text-muted">
          Deze dag is nog helemaal vrij bij deze trainer.
        </p>
      ) : (
        <>
          {/* COPY: confirm met Marlon */}
          <p className="text-text-muted mb-1.5">
            Al bezet deze dag (incl. omkleedtijd):
          </p>
          <ul className="flex flex-wrap gap-2">
            {blocks.map((b) => (
              <li
                key={b.ptSessionId}
                className="px-2 py-1 border border-[color:var(--ink-500)] text-text-muted"
              >
                {formatTimeRange(
                  new Date(b.blockedFrom),
                  new Date(b.blockedUntil),
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
