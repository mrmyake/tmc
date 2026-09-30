"use client";

import { useEffect, useMemo, useState } from "react";
import {
  groupByHour,
  isStartBookable,
  quarterCells,
  slotQuarterStarts,
  type HourRow,
  type QuarterAvailability,
} from "@/lib/member/vrij-trainen-slots";

/**
 * Gedeelde rekenlaag van de slotkiezer, voor leden (SlotPicker) en voor
 * proefbezoekers met een code (VisitorSlotPicker): de klok voor "voorbij", de
 * kwartiercellen voor de gekozen duur, de uurrijen en of de gekozen start nog
 * boekbaar is. Geen tweede implementatie van het raster. De database blijft de
 * controle; dit bepaalt alleen wat de knoppen tonen.
 */
export function useSlotSelection({
  quarters,
  duration,
  selectedDate,
  selection,
}: {
  quarters: readonly QuarterAvailability[];
  duration: number;
  /** De dag waarvoor `quarters` gelden. */
  selectedDate: string;
  /** De keuze van de bezoeker; telt alleen op dezelfde dag en zolang hij past. */
  selection: { date: string; start: string } | null;
}): {
  nowMs: number;
  rows: HourRow[];
  selected: string | null;
  selectedStartMs: number | null;
  slotQuarterMs: ReadonlySet<number>;
} {
  const [nowMs, setNowMs] = useState(() => Date.now());

  // "Voorbij" loopt mee met de klok.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const cells = useMemo(
    () => quarterCells(quarters, duration, nowMs),
    [quarters, duration, nowMs],
  );
  const rows = useMemo(() => groupByHour(cells), [cells]);

  const selected =
    selection &&
    selection.date === selectedDate &&
    isStartBookable(quarters, selection.start, duration, nowMs)
      ? selection.start
      : null;

  const selectedStartMs = selected ? Date.parse(selected) : null;
  const slotQuarterMs = useMemo(
    () => new Set(selected ? slotQuarterStarts(selected, duration) : []),
    [selected, duration],
  );

  return { nowMs, rows, selected, selectedStartMs, slotQuarterMs };
}
