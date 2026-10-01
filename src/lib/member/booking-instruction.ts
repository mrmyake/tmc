/**
 * Instructietekst in de bevestigingsmail van een geboekte sessie, per
 * sessietype (class_sessions.pillar). Alleen weergave: de echte
 * annuleertermijn komt uit booking_settings en de RPC cancel_class_booking.
 */
export function bookingInstructionText(
  pillar: string | null | undefined,
): string {
  return pillar === "vrij_trainen"
    ? "Annuleren kan tot twee uur van tevoren via de app."
    : "Kom tien minuten voor de start binnen, kleed je om en ontspan. Annuleren kan tot zes uur van tevoren via de app.";
}
