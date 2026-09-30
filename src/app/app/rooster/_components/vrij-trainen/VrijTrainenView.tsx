import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getTrainerPresenceWindows } from "@/lib/trainer-presence";
import { loadVrijTrainenPicker } from "@/lib/member/vrij-trainen-query";
import { RoosterHeader } from "../RoosterHeader";
import { SlotPicker } from "./SlotPicker";
import { CheckInHistory } from "./CheckInHistory";

const VRIJ_TRAINEN = "vrij_trainen";

/** Monday 00:00 UTC van de ISO-week waarin `ref` valt. */
function weekStartUtc(ref: Date): Date {
  const d = new Date(ref);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

type CheckInRow = {
  id: string;
  checked_in_at: string;
};

/**
 * Vrij-trainen-weergave van /app/rooster (spec-rooster-vrij-trainen.md). Alleen
 * booking_settings.vrij_trainen_booking_enabled beslist: aan is de slotkiezer,
 * uit de check-in-weergave. check_in_pillars speelt hier geen rol
 * (spec-vrij-trainen-slots.md).
 */
export async function VrijTrainenView({
  userId,
  requestedDate,
  cap,
  isPaused,
  switcher,
}: {
  userId: string;
  requestedDate: string | undefined;
  cap: number | null;
  isPaused: boolean;
  switcher: ReactNode;
}) {
  const supabase = await createClient();
  const { data: modeSettings } = await supabase
    .from("booking_settings")
    .select("vrij_trainen_booking_enabled")
    .eq("id", "singleton")
    .maybeSingle();
  const bookingMode = modeSettings?.vrij_trainen_booking_enabled ?? false;

  if (!bookingMode) {
    return <CheckInView userId={userId} cap={cap} isPaused={isPaused} switcher={switcher} />;
  }
  return (
    <SlotBookingView
      userId={userId}
      isPaused={isPaused}
      requestedDate={requestedDate}
      switcher={switcher}
    />
  );
}

// ---------------------------------------------------------------------------
// Check-in modus: pure aanwezigheids-flow, geen boeken vooraf
// ---------------------------------------------------------------------------

async function CheckInView({
  userId,
  cap,
  isPaused,
  switcher,
}: {
  userId: string;
  cap: number | null;
  isPaused: boolean;
  switcher: ReactNode;
}) {
  const supabase = await createClient();
  const now = new Date();
  const weekStart = weekStartUtc(now);

  const [weekCountResult, recentResult] = await Promise.all([
    supabase
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId)
      .eq("pillar", VRIJ_TRAINEN)
      .gte("checked_in_at", weekStart.toISOString()),
    supabase
      .from("check_ins")
      .select("id, checked_in_at")
      .eq("profile_id", userId)
      .eq("pillar", VRIJ_TRAINEN)
      .order("checked_in_at", { ascending: false })
      .limit(5)
      .returns<CheckInRow[]>(),
  ]);

  const weekUsed = weekCountResult.count ?? 0;
  const capReached = cap !== null && weekUsed >= cap;
  const recent = recentResult.data ?? [];

  return (
    <>
      <RoosterHeader
        eyebrow="Open studio"
        title="Vrij trainen."
        subtitle={
          <>
            {/* COPY: confirm met Marlon */}
            Kom wanneer je wil tussen 06:00 en 23:00. Tik bij binnenkomst je
            nummer op de tablet, dan staat de check-in direct geregistreerd.
          </>
        }
        switcher={switcher}
      />

      {cap !== null && !isPaused && (
        <div className="mb-10 pb-6 border-b border-[color:var(--ink-500)]/60">
          <span className="tmc-eyebrow block mb-2">Deze week</span>
          <p className="font-[family-name:var(--font-playfair)] text-3xl text-text leading-none tracking-[-0.02em]">
            {weekUsed}{" "}
            <span className="text-text-muted">
              van {cap} ingecheckt
            </span>
          </p>
          {capReached && (
            <p className="mt-3 text-[color:var(--warning)] text-sm">
              Je weekcap is bereikt. Volgende week weer.
            </p>
          )}
        </div>
      )}

      {isPaused && (
        <div
          role="status"
          className="mb-10 p-5 border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/5"
        >
          <span className="tmc-eyebrow block mb-2">Abonnement gepauzeerd</span>
          <p className="text-text-muted text-sm leading-relaxed">
            Zolang je pauze loopt tellen check-ins niet mee. Als je het abbo
            hervat staat je plek weer open.
          </p>
        </div>
      )}

      <CheckInHistory items={recent} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Boekmodus: slotkiezer (spec-vrij-trainen-slots.md)
// ---------------------------------------------------------------------------

async function SlotBookingView({
  userId,
  isPaused,
  requestedDate,
  switcher,
}: {
  userId: string;
  isPaused: boolean;
  requestedDate: string | undefined;
  switcher: ReactNode;
}) {
  const supabase = await createClient();
  const [data, presenceRows] = await Promise.all([
    loadVrijTrainenPicker(supabase, userId, requestedDate),
    getTrainerPresenceWindows(),
  ]);

  return (
    <>
      <RoosterHeader
        title="Vrij trainen"
        subtitle={
          <>
            {/* COPY: confirm met Marlon */}
            Boek je tijd. Maximaal {data.maxConcurrent} mensen tegelijk.
          </>
        }
        switcher={switcher}
      />

      {isPaused ? (
        <div
          role="status"
          className="p-5 rounded-lg border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/5"
        >
          <span className="tmc-eyebrow block mb-2">Abonnement gepauzeerd</span>
          <p className="text-text-muted text-sm leading-relaxed">
            Zolang je pauze loopt kun je niet vrij trainen. Als je het abbo
            hervat staat je plek weer open.
          </p>
        </div>
      ) : (
        <SlotPicker
          data={data}
          presence={{
            // COPY: confirm met Marlon
            name: "Marlon",
            rows: presenceRows,
          }}
        />
      )}
    </>
  );
}
