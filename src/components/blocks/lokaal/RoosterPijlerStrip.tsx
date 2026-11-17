import { QuietLink } from "@/components/ui/QuietLink";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { amsterdamParts, formatShortDate, formatTime } from "@/lib/format-date";
import type { Pillar } from "@/lib/member/plan-coverage";

interface StripSessie {
  id: string;
  startAt: string;
  className: string;
  duurMin: number;
  spotsAvailable: number | null;
}

interface SessieRij {
  id: string;
  start_at: string;
  end_at: string;
  class_type: { name: string } | null;
}

const AANTAL = 3;

/**
 * Leesquery op bestaande tabellen (class_sessions, v_session_availability):
 * de eerstvolgende drie lessen van een pijler. Geen schemawijziging. Zonder
 * Supabase-env of bij een fout een lege lijst, zodat de build en de pagina
 * nooit falen op het rooster.
 */
async function haalSessies(pijler: Pillar): Promise<StripSessie[]> {
  if (!isAdminConfigured()) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("class_sessions")
    .select("id, start_at, end_at, class_type:class_types(name)")
    .eq("status", "scheduled")
    .eq("pillar", pijler)
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(AANTAL)
    .returns<SessieRij[]>();
  if (error) {
    console.error("[RoosterPijlerStrip] sessions query:", error);
    return [];
  }
  const sessies = data ?? [];
  if (sessies.length === 0) return [];

  const { data: beschikbaar } = await admin
    .from("v_session_availability")
    .select("id, spots_available")
    .in("id", sessies.map((s) => s.id));
  const plekken = new Map<string, number | null>();
  for (const r of beschikbaar ?? []) {
    if (r.id) plekken.set(r.id, r.spots_available);
  }

  return sessies.map((s) => ({
    id: s.id,
    startAt: s.start_at,
    className: s.class_type?.name ?? "Les",
    duurMin: Math.round(
      (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 60_000,
    ),
    spotsAvailable: plekken.get(s.id) ?? null,
  }));
}

function plekTekst(vrij: number | null): string {
  // null betekent onbeperkt of geen view-rij: nooit vol.
  if (vrij === null) return "Plek vrij";
  const n = Math.max(0, vrij);
  if (n === 0) return "Vol";
  if (n <= 2) return n === 1 ? "1 plek vrij" : `${n} plekken vrij`;
  return "Plek vrij";
}

function dagLabel(iso: string): string {
  const nu = amsterdamParts(new Date());
  const p = amsterdamParts(new Date(iso));
  if (nu.year === p.year && nu.month === p.month && nu.day === p.day) return "Vandaag";
  return formatShortDate(new Date(iso));
}

interface Props {
  pijler: Pillar;
  /** Kop boven de lijst, bv. "Kettlebell deze week". */
  titel: string;
  roosterHref: string;
}

/**
 * Kleine variant op ScheduleTeaser met een pijler-prop: de eerstvolgende 3
 * lessen van die pijler, live uit het rooster.
 */
export async function RoosterPijlerStrip({ pijler, titel, roosterHref }: Props) {
  const sessies = await haalSessies(pijler);
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        {/* COPY: confirm met Marlon */}
        <h3 className="font-[family-name:var(--font-playfair)] text-[22px] text-text">{titel}</h3>
        <span className="text-xs text-text-muted">live uit het rooster</span>
      </div>
      {sessies.length === 0 ? (
        // COPY: confirm met Marlon
        <p className="rounded-lg bg-bg-elevated px-4 py-5 text-sm text-text-muted">
          Er staan nu geen lessen gepland. Bekijk het volledige rooster voor de komende weken.
        </p>
      ) : (
        <ul aria-label="Eerstvolgende lessen" className="grid gap-2">
          {sessies.map((s) => (
            <li
              key={s.id}
              className="grid grid-cols-[64px_1fr_auto] items-center gap-3 rounded-lg bg-bg-elevated px-4 py-3"
            >
              <div className="text-xs leading-tight text-text-muted">
                {dagLabel(s.startAt)}
                <b className="block font-[family-name:var(--font-playfair)] text-lg font-normal text-text tabular-nums">
                  {formatTime(new Date(s.startAt))}
                </b>
              </div>
              <div className="min-w-0 text-[14.5px] font-medium text-text">
                <span className="block truncate">{s.className}</span>
                <small className="mt-0.5 block text-[12.5px] font-normal text-text-muted">
                  {s.duurMin} min
                </small>
              </div>
              <span className="whitespace-nowrap text-xs text-accent">
                {plekTekst(s.spotsAvailable)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        {/* COPY: confirm met Marlon */}
        <QuietLink href={roosterHref}>Bekijk het volledige rooster</QuietLink>
      </div>
    </div>
  );
}
