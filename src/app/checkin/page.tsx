import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /checkin bestaat alleen nog als bladwijzer op de tablet: de kiosk op
 * /kiosk heeft het slotscherm en (tot PR 5) het paneel op /kiosk/paneel.
 * Check-in-spoor PR 2.
 */
export default function CheckinPage() {
  redirect("/kiosk");
}
