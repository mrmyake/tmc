import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { requireKioskActor } from "@/lib/kiosk/gate";
import { KIOSK_FAIL_COPY } from "@/lib/kiosk/gate-core";
import { listKioskStaff } from "@/lib/kiosk/actions";
import { KioskLock } from "./_components/KioskLock";
import { KioskSessionGuard } from "./_components/KioskSessionGuard";
import styles from "./kiosk.module.css";

export const metadata: Metadata = {
  title: "Kiosk · The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Fraunces-gewicht 300 (clock, now-time in de mockup) zit niet in de
// site-brede Fraunces-load (src/app/layout.tsx laadt bewust alleen
// 400/500). Een eigen, aan /kiosk gebonden font-load houdt de rest van de
// site op dat budget.
const kioskSerif = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-kiosk-serif",
  display: "swap",
});

/**
 * Eén gate voor alle /kiosk-schermen (check-in PR 2, requireKioskActor):
 *  - staff-login (telefoon van de trainer): gewoon door, geen PIN;
 *  - gekoppeld apparaat met geldige kiosk-sessie: door, plus de
 *    sessiebewaker (60-secondencontrole zonder verlenging, 10 minuten
 *    inactief is vergrendelen);
 *  - gekoppeld apparaat zonder sessie: het slotscherm (naam, dan PIN);
 *  - geen apparaat en geen login: alleen de melding dat het apparaat niet
 *    gekoppeld is, met de koppelroute voor een ingelogde admin.
 * Renderen verlengt nooit (extend: false); alleen acties doen dat.
 */
export default async function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireKioskActor({ extend: false });

  let body: React.ReactNode;
  if (actor.ok) {
    body = (
      <>
        {children}
        {actor.via === "kiosk" && <KioskSessionGuard />}
      </>
    );
  } else if (
    actor.reason === "device_not_paired" ||
    actor.reason === "device_revoked" ||
    actor.reason === "not_configured"
  ) {
    body = (
      <section className={styles.notPaired}>
        {/* COPY: confirm met Marlon */}
        <h1 className={styles.lockTitle}>Apparaat niet gekoppeld</h1>
        <p className={styles.lockSub}>{KIOSK_FAIL_COPY[actor.reason]}</p>
        {/* COPY: confirm met Marlon */}
        <p className={styles.lockSub}>
          Een admin koppelt de tablet via <Link href="/login?next=/kiosk/koppelen" className={styles.inlineLink}>inloggen</Link>, daarna
          werkt ontgrendelen met een pincode.
        </p>
      </section>
    );
  } else {
    const staff = await listKioskStaff();
    body = (
      <KioskLock
        staff={staff}
        message={actor.reason === "pin_changed" ? KIOSK_FAIL_COPY.pin_changed : null}
      />
    );
  }

  return <div className={`${styles.kiosk} ${kioskSerif.variable}`}>{body}</div>;
}
