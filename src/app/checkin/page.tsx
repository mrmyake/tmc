import { CheckInTablet } from "./_components/CheckInTablet";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Publieke tablet-route. Geen auth — de tablet staat fysiek in de
 * studio; fraud-threat is laag. Admin-modus ontgrendelt via PIN,
 * sessie via httpOnly cookie tmc_admin_unlock (5 min TTL).
 */
export default async function CheckinPage() {
  const cookieStore = await cookies();
  const adminUnlocked =
    cookieStore.get("tmc_admin_unlock")?.value === "1";

  return <CheckInTablet adminUnlocked={adminUnlocked} />;
}
