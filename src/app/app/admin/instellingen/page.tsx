import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsForm } from "./_components/SettingsForm";
import { CheckinPinForm } from "./_components/CheckinPinForm";

export const metadata = {
  title: "Admin · Instellingen | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const admin = createAdminClient();
  const { data: row } = await admin
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
       pt_intake_discount_cents, member_pt_discount_percent,
       admin_checkin_pin_hash`,
    )
    .eq("id", "singleton")
    .maybeSingle();

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
          memberPtDiscountPercent: row.member_pt_discount_percent,
        }}
      />

      <div className="mt-16">
        <CheckinPinForm isSet={Boolean(row.admin_checkin_pin_hash)} />
      </div>
    </div>
  );
}
