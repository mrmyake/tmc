/**
 * Tijden van een boeking zoals het lid ze beleeft. Vrij trainen boekt een
 * eigen slot binnen een dagsessie van 07:00 tot 21:00; dan zijn
 * slot_start_at/slot_end_at leidend voor weergave, herinnering, annuleer-
 * termijn en e-mail. Voor alle andere pillars zijn ze null en gelden de
 * sessietijden (spec-vrij-trainen-slots.md).
 */
export interface BookingSlotFields {
  slot_start_at?: string | null;
  slot_end_at?: string | null;
}

export interface SessionTimeFields {
  start_at: string;
  end_at: string;
}

export function bookingTimes(
  booking: BookingSlotFields,
  session: SessionTimeFields,
): { startAt: string; endAt: string } {
  return {
    startAt: booking.slot_start_at ?? session.start_at,
    endAt: booking.slot_end_at ?? session.end_at,
  };
}

/**
 * Annuleertermijn in minuten voor een boeking: vrij trainen heeft een eigen,
 * veel kortere termijn (booking_settings.vrij_trainen_cancel_window_minutes),
 * alle andere pillars cancellation_window_hours. Zelfde keuze als de RPC
 * cancel_class_booking.
 */
export function cancelWindowMinutes(
  pillar: string | null | undefined,
  settings: { cancellationWindowHours: number; vrijTrainenCancelWindowMinutes: number },
): number {
  return pillar === "vrij_trainen"
    ? settings.vrijTrainenCancelWindowMinutes
    : settings.cancellationWindowHours * 60;
}
