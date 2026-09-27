"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { lockKiosk } from "@/lib/kiosk/actions";
import styles from "../kiosk.module.css";

export function LockButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={styles.hbtn}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await lockKiosk();
          router.refresh();
        })
      }
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      {/* COPY: confirm met Marlon */}
      Vergrendel
    </button>
  );
}
