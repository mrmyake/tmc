/**
 * Herkenning van de twee database-weigeringen rond vrij-trainen-sessies
 * (spec-vrij-trainen-slots.md, migratie 20260930090000):
 *
 * - class_sessions_vrij_trainen_one_per_day: partiele unique index, maximaal
 *   een geplande vrij-trainen-sessie per Amsterdamse kalenderdag.
 * - vrij_trainen_pillar_change_not_empty: guard die de pillar niet van of
 *   naar vrij trainen laat wijzigen zolang de sessie deelnemers heeft.
 */

interface DbError {
  code?: string | null;
  message?: string | null;
}

export const VRIJ_TRAINEN_ONE_PER_DAY_INDEX = "class_sessions_vrij_trainen_one_per_day";

export function isVrijTrainenDayConflict(err: DbError | null | undefined): boolean {
  return (
    err?.code === "23505" &&
    (err.message ?? "").includes(VRIJ_TRAINEN_ONE_PER_DAY_INDEX)
  );
}

export function isVrijTrainenPillarChangeRefused(err: DbError | null | undefined): boolean {
  return (err?.message ?? "").includes("vrij_trainen_pillar_change_not_empty");
}

// COPY: confirm met Marlon
export const VRIJ_TRAINEN_DAY_CONFLICT_MESSAGE =
  "Op deze dag staat al een vrij-trainen-sessie gepland. Per dag kan er maar een zijn.";

// COPY: confirm met Marlon
export const VRIJ_TRAINEN_PILLAR_CHANGE_MESSAGE =
  "Deze sessie heeft deelnemers. Het lestype kan dan niet van of naar vrij trainen wijzigen.";
