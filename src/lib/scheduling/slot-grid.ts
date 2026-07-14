/**
 * Gedeeld tussen de PT-agenda (WeekGrid, kalender-klik-om-te-boeken, PR F)
 * en het boek-scherm (MomentPicker, PR H): de klik-op-een-pixel naar
 * gesnapt-tijdstip-conversie. Beide gebruiken dezelfde 15-minuten-snap
 * zodat een geklikt moment nooit tussen twee onlogische tijden in valt.
 */
export const SLOT_SNAP_MIN = 15;

/**
 * Rekent een verticale pixel-offset binnen een dagkolom (1 minuut = 1
 * pixel, de bestaande grid-conventie) om naar een gesnapt uur/minuut
 * tussen `startHour` en `endHour`. Identiek aan de berekening die
 * WeekGrid al deed vóór de extractie; alleen verplaatst zodat
 * MomentPicker 'm kan hergebruiken zonder duplicatie.
 */
export function snapOffsetMinutesToTime(
  offsetMin: number,
  startHour: number,
  endHour: number,
  snapMin: number = SLOT_SNAP_MIN,
): { hour: number; minute: number } {
  const snapped = Math.round(offsetMin / snapMin) * snapMin;
  const maxMin = (endHour - startHour) * 60 - snapMin;
  const clamped = Math.min(Math.max(snapped, 0), maxMin);
  const hour = startHour + Math.floor(clamped / 60);
  const minute = clamped % 60;
  return { hour, minute };
}
