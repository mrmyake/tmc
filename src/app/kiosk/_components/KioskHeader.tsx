import Link from "next/link";
import type { ReactNode } from "react";
import styles from "../kiosk.module.css";

/**
 * Kop van de kiosk (wordmark links, acties rechts), gedeeld door /kiosk en
 * /kiosk/bediening. De knop "Licht en geluid" staat altijd rechts; op het
 * bedieningsscherm zelf is hij de huidige pagina (aria-current). Extra
 * elementen (datum, klok op /kiosk) komen via children.
 */
export function KioskHeader({
  current,
  controlHref = "/kiosk/bediening",
  children,
}: {
  current: "vandaag" | "bediening";
  controlHref?: string;
  children?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.wordmark}>
        The Movement <span className={styles.wordmarkAccent}>Club</span>
      </div>
      <div className={styles.headerRight}>
        {children}
        {/* COPY: confirm met Marlon */}
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
      </div>
    </header>
  );
}
