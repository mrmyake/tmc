/**
 * Pure logica van de roosterpreview op de actiepagina
 * (spec-proefles-funnel.md). Zonder server- of browsercode, zodat node:test
 * hem direct laadt (scripts/actie/core.test.mts).
 *
 * De preview is alleen weergave: informatieve rijen, geen knoppen. Wat
 * boekbaar is beslist de boekingsstap en uiteindelijk tmc.redeem_trial_code.
 */

import {
  FEW_SPOTS_THRESHOLD,
  QUARTER_MS,
  quarterCells,
  type QuarterAvailability,
} from "@/lib/member/vrij-trainen-slots";

export type PreviewStatus = "free" | "few";

export interface PreviewItem {
  key: string;
  kind: "class" | "vrij";
  /** ISO-tijdstippen. */
  startAt: string;
  endAt: string;
  /** Lesnaam; bij vrij trainen leeg (de pagina zet er de vaste tekst voor in). */
  title: string;
  status: PreviewStatus;
}

/** Een proefuur vrij trainen is altijd 60 minuten (afgedwongen in SQL). */
export const TRIAL_SLOT_MINUTES = 60;

/**
 * "Bijna vol" bij FEW_SPOTS_THRESHOLD of minder vrije plekken (B4), dezelfde
 * drempel als de slotkiezer van vrij trainen. null = onbeperkte capaciteit.
 */
export function previewStatus(spotsAvailable: number | null): PreviewStatus {
  return spotsAvailable !== null && spotsAvailable <= FEW_SPOTS_THRESHOLD ? "few" : "free";
}

/**
 * Eén rij per aaneengesloten blok van Marlons aanwezigheid op een
 * vrij-trainen-dag: de eerste starttijd waar een heel proefuur past. De
 * kwartieren komen uit tmc.vrij_trainen_visitor_availability, die alleen
 * kwartieren binnen de aanwezigheid teruggeeft; een gat tussen twee
 * kwartieren (ochtend en avond) begint dus een nieuw blok. De status volgt
 * het krapste kwartier van het uur.
 */
export function vrijTrainenPreviewItems(
  sessionId: string,
  quarters: readonly QuarterAvailability[],
  nowMs: number,
): PreviewItem[] {
  const cells = quarterCells(quarters, TRIAL_SLOT_MINUTES, nowMs);
  const byStart = new Map(cells.map((c) => [c.startMs, c]));
  const items: PreviewItem[] = [];
  let previousMs: number | null = null;
  let blockHasItem = false;
  for (const cell of cells) {
    if (previousMs === null || cell.startMs - previousMs > QUARTER_MS) blockHasItem = false;
    previousMs = cell.startMs;
    if (blockHasItem || !cell.bookable) continue;
    let minAvailable = cell.available;
    for (let i = 1; i < TRIAL_SLOT_MINUTES / 15; i++) {
      const next = byStart.get(cell.startMs + i * QUARTER_MS);
      if (next) minAvailable = Math.min(minAvailable, next.available);
    }
    items.push({
      key: `vrij:${sessionId}:${cell.startMs}`,
      kind: "vrij",
      startAt: new Date(cell.startMs).toISOString(),
      endAt: new Date(cell.startMs + TRIAL_SLOT_MINUTES * 60_000).toISOString(),
      title: "",
      status: previewStatus(minAvailable),
    });
    blockHasItem = true;
  }
  return items;
}

/**
 * Voegt lessen en vrij-trainen-rijen samen op starttijd en neemt de eerste
 * `limit`. maxVrij begrenst het aantal vrij-trainen-rijen (bij "alles" één,
 * zodat twee blokken per dag de lessen niet verdringen); null = geen grens.
 */
export function mergePreviewItems(
  classes: readonly PreviewItem[],
  vrij: readonly PreviewItem[],
  limit: number,
  maxVrij: number | null,
): PreviewItem[] {
  const sortedVrij = [...vrij].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const keptVrij = maxVrij === null ? sortedVrij : sortedVrij.slice(0, maxVrij);
  return [...classes, ...keptVrij]
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
    .slice(0, limit);
}
