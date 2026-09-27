import { redirect } from "next/navigation";
import { requireKioskActor } from "@/lib/kiosk/gate";
import { KioskHeader } from "../_components/KioskHeader";
import { AdminPanel } from "./_components/AdminPanel";
import styles from "../kiosk.module.css";

export const dynamic = "force-dynamic";

/**
 * Het oude /checkin-paneel (zoeken, vrij-trainen-check-in, walk-in, undo),
 * verhuisd achter de kiosk-gate tot het Deelnemers-scherm van PR 5 het
 * vervangt. De layout heeft de gate al gedaan; dit is de defensieve
 * herhaling zonder verlenging.
 */
export default async function KioskPaneelPage() {
  const actor = await requireKioskActor({ extend: false });
  if (!actor.ok) redirect("/kiosk");
  return (
    <div className={styles.frame}>
      <KioskHeader current="paneel" showControl={actor.via === "login"} lockable={actor.via === "kiosk"} />
      <div className={styles.panelBody}>
        <AdminPanel />
      </div>
    </div>
  );
}
