import Link from "next/link";
import type { ReactNode } from "react";
import { LockButton } from "./LockButton";
import styles from "../kiosk.module.css";

/**
 * Kop van de kiosk (wordmark links, acties rechts), gedeeld door alle
 * /kiosk-schermen. "Licht en geluid" alleen bij een staff-login: de
 * zaalbediening (controlRoom) zit nog op de login-gate en gaat in een
 * latere PR over naar de kiosk-gate. "Vergrendel" alleen onder een
 * kiosk-sessie (check-in PR 2).
 */
export function KioskHeader({
  current,
  controlHref = "/kiosk/bediening",
  showControl = true,
  lockable = false,
  children,
}: {
  current: "vandaag" | "bediening" | "paneel" | "koppelen";
  controlHref?: string;
  showControl?: boolean;
  lockable?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <Link href="/kiosk" className={styles.wordmark}>
        The Movement <span className={styles.wordmarkAccent}>Club</span>
      </Link>
      <div className={styles.headerRight}>
        {children}
        {showControl && (
          // COPY: confirm met Marlon
          <Link
            href={controlHref}
            className={styles.hbtn}
            aria-current={current === "bediening" ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 9v6h4l5 4V5L8 9H4z" />
              <path d="M17 9a4 4 0 0 1 0 6" />
            </svg>
            Licht en geluid
          </Link>
        )}
        {lockable && <LockButton />}
      </div>
    </header>
  );
}
