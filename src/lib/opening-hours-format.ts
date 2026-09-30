/** "7:00" of "07:00" wordt "07.00" (Nederlandse puntnotatie). */
export function formatTime(value: string): string {
  const m = /^(\d{1,2})[.:](\d{2})$/.exec(value.trim());
  if (!m) return value;
  return `${m[1].padStart(2, "0")}.${m[2]}`;
}

export interface OpeningDay {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

function dayRangeLabel(days: string[]): string {
  const lower = (d: string) => d.toLowerCase();
  if (days.length === 1) return days[0];
  if (days.length === 2) return `${days[0]} en ${lower(days[1])}`;
  return `${days[0]} t/m ${lower(days[days.length - 1])}`;
}

/**
 * Groepeert opeenvolgende dagen met dezelfde tijden tot één regel:
 * "Maandag t/m vrijdag: 07.00 tot 22.00 uur". Volgorde van de invoer blijft
 * behouden, dus Sanity bepaalt de dagvolgorde.
 */
export function formatOpeningSchedule(
  schedule: ReadonlyArray<OpeningDay>,
): Array<{ key: string; label: string; value: string }> {
  const groups: Array<{ days: string[]; row: OpeningDay }> = [];
  for (const row of schedule) {
    const last = groups[groups.length - 1];
    const same =
      last &&
      last.row.closed === row.closed &&
      (row.closed ||
        (last.row.open === row.open && last.row.close === row.close));
    if (same) last.days.push(row.day);
    else groups.push({ days: [row.day], row });
  }
  return groups.map(({ days, row }) => ({
    key: days.join("-"),
    label: dayRangeLabel(days),
    value: row.closed
      ? "gesloten"
      : `${formatTime(row.open)} tot ${formatTime(row.close)} uur`,
  }));
}
