"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pairKioskDevice } from "@/lib/admin/kiosk-admin-actions";
import styles from "../../kiosk.module.css";

export function PairDevice({
  configured,
  currentLabel,
}: {
  configured: boolean;
  currentLabel: string | null;
}) {
  const router = useRouter();
  // COPY: confirm met Marlon
  const [label, setLabel] = useState(currentLabel ?? "Wandtablet");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await pairKioskDevice(label);
      setMessage({ tone: res.ok ? "ok" : "error", text: res.message });
      if (res.ok) router.refresh();
    });
  }

  return (
    <section className={styles.pairScreen}>
      {/* COPY: confirm met Marlon */}
      <h1 className={styles.pairTitle}>Dit apparaat koppelen</h1>
      {currentLabel ? (
        // COPY: confirm met Marlon
        <p className={styles.pairSub}>Dit apparaat is al gekoppeld als &ldquo;{currentLabel}&rdquo;. Opnieuw koppelen maakt een nieuwe koppeling; trek de oude in via de admin-instellingen.</p>
      ) : (
        // COPY: confirm met Marlon
        <p className={styles.pairSub}>Geef de tablet een naam. Daarna kunnen trainers hier ontgrendelen met hun eigen pincode, zonder in te loggen.</p>
      )}
      {!configured && (
        // COPY: confirm met Marlon
        <p className={styles.pairWarn}>KIOSK_SESSION_SECRET ontbreekt op deze omgeving; koppelen kan pas als die staat.</p>
      )}
      <form onSubmit={submit} className={styles.pairForm}>
        <input
          className={styles.pairInput}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          // COPY: confirm met Marlon
          placeholder="Naam van het apparaat"
          disabled={pending || !configured}
        />
        <button type="submit" className={styles.cta} disabled={pending || !configured}>
          {/* COPY: confirm met Marlon */}
          {pending ? "Bezig..." : "Koppelen"}
        </button>
      </form>
      {message && (
        <p className={message.tone === "ok" ? styles.pairOk : styles.pairWarn}>{message.text}</p>
      )}
    </section>
  );
}
