"use client";

import { useState } from "react";
import { AdminPanel } from "./AdminPanel";
import { AdminLockScreen } from "./AdminLockScreen";
import { lockAdminMode } from "@/lib/check-in/admin-lock";

type Mode = "admin_locked" | "admin_unlocked";

interface Props {
  adminUnlocked: boolean;
}

/**
 * Check-in gebeurt uitsluitend door staff (trainer/admin). De route landt
 * altijd op het PIN-lockscherm, tenzij de tmc_admin_unlock cookie nog
 * geldig is. Geen self-check-in pad meer — leden checken zichzelf niet
 * in via de tablet.
 */
export function CheckInTablet({ adminUnlocked }: Props) {
  const [mode, setMode] = useState<Mode>(
    adminUnlocked ? "admin_unlocked" : "admin_locked",
  );

  async function closeAdmin() {
    await lockAdminMode();
    setMode("admin_locked");
  }

  if (mode === "admin_unlocked") {
    return <AdminPanel onExit={closeAdmin} />;
  }

  return (
    <AdminLockScreen
      onUnlocked={() => setMode("admin_unlocked")}
      onCancel={() => setMode("admin_locked")}
    />
  );
}
