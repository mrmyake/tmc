import { KioskHeader } from "../_components/KioskHeader";
import { parseRoomParam } from "./_lib/controller";
import { RoomControlPanel } from "./_components/RoomControlPanel";
import styles from "../kiosk.module.css";

export const dynamic = "force-dynamic";

/**
 * /kiosk/bediening: licht en Sonos per zaal (spec-kiosk-room-control.md,
 * PR 3). Zelfde gate als /kiosk via src/app/kiosk/layout.tsx (ingelogde
 * trainer of admin); de server action controlRoom() controleert dat
 * nogmaals per verzoek. ?zaal=yoga|kracht kiest de starttab, anders Yoga.
 */
export default async function BedieningPage({
  searchParams,
}: {
  searchParams: Promise<{ zaal?: string | string[] }>;
}) {
  const { zaal } = await searchParams;
  const room = parseRoomParam(zaal);

  return (
    <div className={styles.frame}>
      <KioskHeader current="bediening" />
      <RoomControlPanel initialRoom={room} />
    </div>
  );
}
