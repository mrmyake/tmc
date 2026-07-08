import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsForm } from "./_components/SettingsForm";
import { CheckinPinForm } from "./_components/CheckinPinForm";
import { OpeningHoursForm } from "./_components/OpeningHoursForm";
import {
  OpeningHoursExceptionsPanel,
  type OpeningHoursExceptionRow,
} from "./_components/OpeningHoursExceptionsPanel";
import { CHECK_IN_PILLAR_OPTIONS } from "@/lib/admin/settings-constants";
import type { OpeningHoursRowInput } from "@/lib/admin/opening-hours-actions";
import { toIsoDate } from "@/lib/scheduling/amsterdam-time";

export const metadata = {
  title: "Admin · Instellingen | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const admin = createAdminClient();
  const [{ data: row }, { data: hoursData }, { data: exceptionsData }] =
    await Promise.all([
      admin
        .from("booking_settings")
        .select(
          `cancellation_window_hours, vrij_trainen_cancel_window_minutes,
           booking_window_days, waitlist_confirmation_minutes,
           fair_use_daily_max, no_show_strike_window_days,
           no_show_strike_threshold, no_show_block_days,
           registration_fee_cents,
           drop_in_yoga_cents, drop_in_kettlebell_cents,
           drop_in_kids_cents, drop_in_senior_cents,
           ten_ride_card_cents, kids_ten_ride_card_cents,
           senior_ten_ride_card_cents, ten_ride_card_validity_months,
           pt_intake_discount_cents,
           admin_checkin_pin_hash,
           check_in_enabled, check_in_pillars, no_show_release_minutes`,
        )
        .eq("id", "singleton")
        .maybeSingle(),
      admin
        .from("opening_hours")
        .select("weekday, is_closed, opens_at, closes_at")
        .order("weekday", { ascending: true }),
      admin
        .from("opening_hours_exceptions")
        .select("id, date, is_closed, opens_at, closes_at, note")
        .gte("date", toIsoDate(new Date()))
        .order("date", { ascending: true }),
    ]);

  const openingHoursRows: OpeningHoursRowInput[] = (hoursData ?? []).map(
    (r) => ({
      weekday: r.weekday,
      isClosed: r.is_closed,
      opensAt: r.opens_at?.slice(0, 5) ?? null,
      closesAt: r.closes_at?.slice(0, 5) ?? null,
    }),
  );

  const exceptionRows: OpeningHoursExceptionRow[] = (exceptionsData ?? []).map(
    (r) => ({
      id: r.id,
      date: r.date,
      isClosed: r.is_closed,
      opensAt: r.opens_at,
      closesAt: r.closes_at,
      note: r.note,
    }),
  );

  if (!row) {
    return (
      <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
        <p className="text-text-muted text-sm">
          Geen booking-settings rij gevonden. Check de migratie.
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-10 max-w-2xl">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Instellingen.
        </h1>
        <p className="text-text-muted mt-4 leading-relaxed">
          Configuratie voor het boekingssysteem. Wijzigingen gelden direct
          voor alle nieuwe boekingen. Bestaande boekingen behouden de regel
          die gold op het moment dat ze gemaakt werden.
        </p>
      </header>

      <SettingsForm
        initial={{
          cancellationWindowHours: row.cancellation_window_hours,
          vrijTrainenCancelWindowMinutes:
            row.vrij_trainen_cancel_window_minutes ?? 5,
          bookingWindowDays: row.booking_window_days,
          waitlistConfirmationMinutes: row.waitlist_confirmation_minutes,
          fairUseDailyMax: row.fair_use_daily_max,
          noShowStrikeWindowDays: row.no_show_strike_window_days,
          noShowStrikeThreshold: row.no_show_strike_threshold,
          noShowBlockDays: row.no_show_block_days,
          registrationFeeCents: row.registration_fee_cents,
          dropInYogaCents: row.drop_in_yoga_cents,
          dropInKettlebellCents: row.drop_in_kettlebell_cents,
          dropInKidsCents: row.drop_in_kids_cents,
          dropInSeniorCents: row.drop_in_senior_cents,
          tenRideCardCents: row.ten_ride_card_cents,
          kidsTenRideCardCents: row.kids_ten_ride_card_cents,
          seniorTenRideCardCents: row.senior_ten_ride_card_cents,
          tenRideCardValidityMonths: row.ten_ride_card_validity_months,
          ptIntakeDiscountCents: row.pt_intake_discount_cents,
          checkInEnabled: row.check_in_enabled ?? true,
          checkInPillars: (Array.isArray(row.check_in_pillars)
            ? row.check_in_pillars
            : []
          ).filter(
            (p: string): p is (typeof CHECK_IN_PILLAR_OPTIONS)[number] =>
              (CHECK_IN_PILLAR_OPTIONS as readonly string[]).includes(p),
          ),
          noShowReleaseMinutes: row.no_show_release_minutes ?? 10,
        }}
      />

      <div className="mt-16">
        <CheckinPinForm isSet={Boolean(row.admin_checkin_pin_hash)} />
      </div>

      <div className="mt-16 max-w-2xl">
        <header className="mb-8">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
            {/* COPY: confirm met Marlon */}
            Openingstijden
          </span>
          <p className="text-text-muted text-sm leading-relaxed">
            {/* COPY: confirm met Marlon */}
            Bepaalt wanneer de studio open is voor vrij trainen. Sessies die
            de studio blokkeren tellen hier los van mee.
          </p>
        </header>
        <OpeningHoursForm initial={openingHoursRows} />
      </div>

      <div className="mt-16 max-w-2xl">
        <header className="mb-8">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
            {/* COPY: confirm met Marlon */}
            Uitzonderingen
          </span>
          <p className="text-text-muted text-sm leading-relaxed">
            {/* COPY: confirm met Marlon */}
            Feestdagen en vakantieweken. Overschrijft de reguliere
            openingstijden voor die specifieke datum.
          </p>
        </header>
        <OpeningHoursExceptionsPanel exceptions={exceptionRows} />
      </div>
    </div>
  );
}
