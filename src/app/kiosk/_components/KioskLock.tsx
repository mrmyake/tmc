"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { unlockKiosk, type KioskStaffOption } from "@/lib/kiosk/actions";
import { KIOSK_PIN_LENGTH } from "@/lib/kiosk/constants";
import styles from "../kiosk.module.css";

/**
 * Slotscherm (mockups/kiosk-prototype.html, scherm Slot), met de afspraak
 * uit PR 2: eerst je naam, dan de pincode. Vier cijfers, auto-verzenden,
 * schudden bij een foute code, keypad uit tijdens een blokkade.
 */
export function KioskLock({
  staff,
  message,
}: {
  staff: KioskStaffOption[];
  /** Reden waarom het scherm nu op slot staat (bijvoorbeeld pincode gewijzigd). */
  message?: string | null;
}) {
  const router = useRouter();
  const [who, setWho] = useState<KioskStaffOption | null>(staff.length === 1 ? staff[0] : null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  /** Seconden blokkade uit de server; null als niet geblokkeerd. */
  const [lockSeconds, setLockSeconds] = useState<number | null>(null);
  const locked = lockSeconds !== null;

  useEffect(() => {
    if (lockSeconds === null) return;
    const t = window.setTimeout(() => {
      setLockSeconds(null);
      setError(null);
    }, lockSeconds * 1000);
    return () => window.clearTimeout(t);
  }, [lockSeconds]);

  async function submit(value: string) {
    if (!who) return;
    setBusy(true);
    const res = await unlockKiosk({ profileId: who.profileId, pin: value });
    setBusy(false);
    setPin("");
    if (res.ok) {
      router.refresh();
      return;
    }
    setError(res.message);
    if (res.reason === "locked") {
      setLockSeconds(res.retryAfterSeconds ?? 900);
    } else if (res.reason === "invalid_pin") {
      setShake(false);
      requestAnimationFrame(() => setShake(true));
    }
  }

  function press(k: string) {
    if (busy || locked || !who) return;
    if (k === "clear") {
      setPin("");
      setError(null);
      return;
    }
    if (k === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= KIOSK_PIN_LENGTH) return;
    const next = pin + k;
    setPin(next);
    setError(null);
    if (next.length === KIOSK_PIN_LENGTH) void submit(next);
  }

  return (
    <section className={styles.lockScreen} aria-labelledby="lock-title">
      <div className={styles.lockInfo}>
        <div className={styles.lockFlag}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          {/* COPY: confirm met Marlon */}
          Vergrendeld
        </div>
        {/* COPY: confirm met Marlon */}
        <h1 id="lock-title" className={styles.lockTitle}>
          Ontgrendel met
          <br />
          je pincode
        </h1>
        {/* COPY: confirm met Marlon */}
        <div className={styles.lockSub}>{message ?? "Alleen voor trainers."}</div>

        <div className={styles.lockList} role="radiogroup" aria-label="Wie ben je?">
          {/* COPY: confirm met Marlon */}
          <div className={styles.sectionLabelKiosk}>Wie ben je?</div>
          {staff.length === 0 && (
            // COPY: confirm met Marlon
            <div className={styles.lockEmpty}>Er is nog geen pincode ingesteld. Vraag de admin.</div>
          )}
          {staff.map((s) => (
            <button
              key={s.profileId}
              type="button"
              role="radio"
              aria-checked={who?.profileId === s.profileId}
              className={who?.profileId === s.profileId ? `${styles.lockRow} ${styles.lockRowOn}` : styles.lockRow}
              onClick={() => {
                setWho(s);
                setPin("");
                setError(null);
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.pin}>
        {/* COPY: confirm met Marlon */}
        <div className={styles.sectionLabelKiosk}>{who ? `Pincode van ${who.name}` : "Kies eerst je naam"}</div>
        <div className={shake ? `${styles.pinDots} ${styles.pinDotsShake}` : styles.pinDots} onAnimationEnd={() => setShake(false)}>
          {Array.from({ length: KIOSK_PIN_LENGTH }).map((_, i) => (
            <span key={i} className={i < pin.length ? styles.pinDotFilled : undefined} />
          ))}
        </div>
        <div className={error ? `${styles.pinMsg} ${styles.pinMsgErr}` : styles.pinMsg} role="status" aria-live="polite">
          {/* COPY: confirm met Marlon */}
          {error ?? (busy ? "Controleren..." : "")}
        </div>
        <div className={locked || !who ? `${styles.keypad} ${styles.keypadOff}` : styles.keypad}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
            <button key={k} type="button" className={styles.key} onClick={() => press(k)} disabled={locked || !who || busy}>
              {k}
            </button>
          ))}
          {/* COPY: confirm met Marlon */}
          <button type="button" className={`${styles.key} ${styles.keyAux}`} onClick={() => press("clear")} disabled={locked || !who || busy}>
            Wis
          </button>
          <button type="button" className={styles.key} onClick={() => press("0")} disabled={locked || !who || busy}>
            0
          </button>
          <button type="button" className={`${styles.key} ${styles.keyAux}`} onClick={() => press("back")} disabled={locked || !who || busy} aria-label="Laatste cijfer wissen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 5h11v14H9l-6-7z" />
              <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
