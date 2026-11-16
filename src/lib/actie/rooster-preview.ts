import "server-only";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { getTrialSessionOptions } from "@/lib/trial-sessions";
import { addDaysIsoAmsterdam, todayIsoAmsterdam } from "@/lib/format-date";
import type { QuarterAvailability } from "@/lib/member/vrij-trainen-slots";
import type { ActiePillarFilter } from "./core";
import {
  mergePreviewItems,
  previewStatus,
  vrijTrainenPreviewItems,
  type PreviewItem,
} from "./rooster-core";

/** Zelfde horizon als de sessielijst en de slotkiezer van de boekingsstap. */
const HORIZON_DAYS = 14;

/** Groepslessen die de actiepagina's aanbieden (kids en senior horen er niet bij). */
const PREVIEW_CLASS_PILLARS = ["yoga_mobility", "kettlebell"];

async function classItems(pillar: "yoga_mobility" | "kettlebell" | null): Promise<PreviewItem[]> {
  // Dezelfde lijst als de boekingsstap: geplande lessen van de komende twee
  // weken, volle lessen eruit. Zo toont de preview niets wat de bezoeker in
  // de volgende stap niet kan kiezen.
  const options = await getTrialSessionOptions({ withPrices: false, scope: pillar ?? "group" });
  return options
    .filter((o) => PREVIEW_CLASS_PILLARS.includes(o.pillar))
    .map((o) => ({
      key: `class:${o.id}`,
      kind: "class" as const,
      startAt: o.startAt,
      endAt: o.endAt,
      title: o.className,
      status: previewStatus(o.spotsAvailable),
    }));
}

async function vrijItems(now: Date): Promise<PreviewItem[]> {
  if (!isAdminConfigured()) return [];
  const admin = createAdminClient();
  const from = todayIsoAmsterdam(now);
  const to = addDaysIsoAmsterdam(from, HORIZON_DAYS - 1);
  // Alleen kwartieren binnen de aanwezigheid van Marlon
  // (tmc.trainer_presence_windows), met het maximum tegelijk al verrekend.
  const { data, error } = await admin.rpc("vrij_trainen_visitor_availability", {
    p_from: from,
    p_to: to,
  });
  if (error) {
    console.error("[actie/rooster-preview] availability", error.code, error.message);
    return [];
  }
  type Row = {
    session_id: string;
    quarter_start: string;
    booked: number;
    available: number;
    blocked: boolean;
  };
  const bySession = new Map<string, QuarterAvailability[]>();
  for (const r of (data ?? []) as Row[]) {
    const list = bySession.get(r.session_id) ?? [];
    list.push({
      quarterStart: r.quarter_start,
      booked: r.booked,
      available: r.available,
      blocked: r.blocked,
    });
    bySession.set(r.session_id, list);
  }
  const nowMs = now.getTime();
  return [...bySession.entries()].flatMap(([sessionId, quarters]) =>
    vrijTrainenPreviewItems(sessionId, quarters, nowMs),
  );
}

/**
 * De eerstvolgende sessies voor de roosterpreview van een actiepagina
 * (spec-proefles-funnel.md), binnen het pijlerfilter van de slug: een
 * groepspijler, vrij trainen, of alles (null). Bij alles hoogstens één rij
 * vrij trainen. Informatief; throwt nooit en geeft bij een fout een lege
 * lijst, zodat de pagina dan de preview weglaat.
 */
export async function getRoosterPreview(
  pillarFilter: ActiePillarFilter | null,
  limit = 4,
  now: Date = new Date(),
): Promise<PreviewItem[]> {
  try {
    if (pillarFilter === "vrij_trainen") {
      return mergePreviewItems([], await vrijItems(now), limit, null);
    }
    if (pillarFilter) {
      return mergePreviewItems(await classItems(pillarFilter), [], limit, null);
    }
    const [classes, vrij] = await Promise.all([classItems(null), vrijItems(now)]);
    return mergePreviewItems(classes, vrij, limit, 1);
  } catch (e) {
    console.error("[actie/rooster-preview] failed", e);
    return [];
  }
}
