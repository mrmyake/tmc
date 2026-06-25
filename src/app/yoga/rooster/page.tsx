import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { amsterdamParts, DAY_SHORT_NL, MONTH_SHORT_NL } from "@/lib/format-date";
import { YogaWaitlistCta } from "@/components/blocks/yoga/YogaWaitlistCta";
import { JsonLd } from "@/components/seo/JsonLd";
import { getBreadcrumbSchema } from "@/lib/structuredData";
import { SITE } from "@/lib/constants";
import {
  PublicWeekGrid,
  type PublicDay,
} from "../../rooster/_components/PublicWeekGrid";
import type { PublicSessionCardData } from "../../rooster/_components/PublicSessionCard";

export const metadata: Metadata = {
  title: "Yoga rooster | The Movement Club Loosdrecht",
  description:
    "Het wekelijkse yogarooster van The Movement Club in Loosdrecht. Yin, Restorative, Yoga Nidra, iRest en Flow, in kleine groepen.",
  alternates: { canonical: "/yoga/rooster" },
};

// Bezetting mag niet langer dan een minuut gecached zijn (spec A1).
export const revalidate = 60;

const HORIZON_DAYS = 14;
const YOGA_PILLAR = "yoga_mobility";

type SessionRow = {
  id: string;
  start_at: string;
  end_at: string;
  pillar: string;
  capacity: number;
  class_type: { name: string } | null;
  trainer: { display_name: string } | null;
};

function isoDate(d: Date): string {
  const p = amsterdamParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export default async function YogaRoosterPage() {
  // Admin client leest alleen sessie-metadata + aggregate bezetting; geen
  // member-PII in de resultaatvorm. Zelfde patroon als de publieke /rooster.
  // Zonder Supabase-env (preview-branch zonder env) degraderen we naar de lege
  // "binnenkort"-staat in plaats van de build te laten falen.
  const admin = isAdminConfigured() ? createAdminClient() : null;

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86400000);

  let sessions: SessionRow[] | null = [];
  const bookedBySession = new Map<string, number>();

  if (admin) {
    const sessionsRes = await admin
      .from("class_sessions")
      .select(
        `
          id,
          start_at,
          end_at,
          pillar,
          capacity,
          class_type:class_types(name),
          trainer:trainers(display_name)
        `,
      )
      .eq("status", "scheduled")
      .eq("pillar", YOGA_PILLAR)
      .gte("start_at", now.toISOString())
      .lt("start_at", horizonEnd.toISOString())
      .order("start_at", { ascending: true })
      .returns<SessionRow[]>();

    if (sessionsRes.error) {
      console.error("[/yoga/rooster] sessions query:", sessionsRes.error);
    }
    sessions = sessionsRes.data;

    const sessionIds = (sessions ?? []).map((s) => s.id);
    if (sessionIds.length > 0) {
      const availabilityRes = await admin
        .from("v_session_availability")
        .select("id, booked_count")
        .in("id", sessionIds);
      for (const row of availabilityRes.data ?? []) {
        if (row.id) bookedBySession.set(row.id, row.booked_count ?? 0);
      }
    }
  }

  const cards: PublicSessionCardData[] = (sessions ?? []).map((s) => ({
    id: s.id,
    startAt: s.start_at,
    endAt: s.end_at,
    className: s.class_type?.name ?? "Yogales",
    trainerName: s.trainer?.display_name ?? "docent",
    pillar: s.pillar,
    capacity: s.capacity,
    bookedCount: bookedBySession.get(s.id) ?? 0,
    userHasBooked: false,
  }));

  const days: PublicDay[] = Array.from({ length: HORIZON_DAYS }, (_, i) => {
    const date = new Date(now.getTime() + i * 86400000);
    const parts = amsterdamParts(date);
    return {
      isoDate: isoDate(date),
      weekdayShort: DAY_SHORT_NL[parts.weekday],
      dayNumber: parts.day,
      monthShort: MONTH_SHORT_NL[parts.month - 1],
      sessions: [] as PublicSessionCardData[],
    };
  });
  const dayByIso = new Map(days.map((d) => [d.isoDate, d]));
  for (const card of cards) {
    dayByIso.get(isoDate(new Date(card.startAt)))?.sessions.push(card);
  }

  const week1 = days.slice(0, 7);
  const week2 = days.slice(7, 14);
  const totalSessions = cards.length;

  const breadcrumb = getBreadcrumbSchema([
    { name: "Home", url: SITE.url },
    { name: "Yoga", url: `${SITE.url}/yoga` },
    { name: "Rooster", url: `${SITE.url}/yoga/rooster` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Section className="pt-32 md:pt-40">
        <Container>
          <header className="mb-14 max-w-3xl">
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
              Yoga rooster
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl lg:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
              Twee weken vooruit.
            </h1>
            <p className="mt-6 text-text-muted text-lg max-w-xl">
              Yin, Restorative, Yoga Nidra, iRest en Flow. Kleine groepen,
              persoonlijke begeleiding.
            </p>
          </header>

          {totalSessions === 0 ? (
            <section className="py-20 text-center">
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                Binnenkort
              </span>
              <p className="text-text-muted text-base max-w-md mx-auto">
                Het yogarooster wordt op dit moment ingepland. Schrijf je in
                voor de wachtlijst, dan laten we het als eerste weten zodra de
                lessen starten.
              </p>
            </section>
          ) : (
            <>
              <PublicWeekGrid days={week1} />
              {week2.length > 0 && (
                <div className="mt-12">
                  <PublicWeekGrid days={week2} />
                </div>
              )}
            </>
          )}
        </Container>
      </Section>

      <YogaWaitlistCta bg="elevated" />
    </>
  );
}
