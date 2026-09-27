import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/require-admin";
import { listKioskDevices } from "@/lib/admin/kiosk-admin-actions";
import { kioskSecret } from "@/lib/kiosk/gate";
import { KioskHeader } from "../_components/KioskHeader";
import { PairDevice } from "./_components/PairDevice";
import styles from "../kiosk.module.css";

export const dynamic = "force-dynamic";

/**
 * Apparaat koppelen: alleen voor een ingelogde admin, op de tablet zelf.
 * Zet na "Koppelen" het langlevende apparaat-cookie in deze browser.
 */
export default async function KoppelenPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/login?next=/kiosk/koppelen");
  const devices = await listKioskDevices();
  const thisDevice = devices.find((d) => d.isThisDevice && !d.revokedAt) ?? null;
  return (
    <div className={styles.frame}>
      <KioskHeader current="koppelen" showControl={false} />
      <PairDevice configured={kioskSecret() !== null} currentLabel={thisDevice?.label ?? null} />
    </div>
  );
}
