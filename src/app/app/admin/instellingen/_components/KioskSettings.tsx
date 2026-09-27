"use client";

import { useState, useTransition } from "react";
import {
  clearStaffPin,
  revokeKioskDevice,
  setStaffPin,
  type KioskDeviceRow,
  type StaffPinRow,
} from "@/lib/admin/kiosk-admin-actions";
import { KIOSK_PIN_LENGTH } from "@/lib/kiosk/constants";

const PIN_PATTERN = new RegExp(`^[0-9]{${KIOSK_PIN_LENGTH}}$`);

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Kiosk-beheer op /app/admin/instellingen (check-in PR 2): per staflid de
 * persoonlijke pincode instellen, resetten of verwijderen, en de gekoppelde
 * apparaten bekijken en intrekken. Vervangt de verborgen team-PIN-sectie.
 */
export function KioskSettings({
  staff,
  devices,
}: {
  staff: StaffPinRow[];
  devices: KioskDeviceRow[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const primaryButton =
    "inline-flex items-center justify-center px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] active:scale-[0.99] disabled:opacity-50 cursor-pointer";
  const ghostButton = `${primaryButton} border-text-muted/30 text-text-muted hover:border-accent hover:text-accent`;
  const accentButton = `${primaryButton} border-accent text-accent hover:bg-accent hover:text-bg`;
  const input =
    "w-32 bg-bg-elevated border border-[color:var(--ink-500)] px-3 py-2 text-sm tracking-[0.3em] text-center focus:outline-none focus:border-accent";

  function savePin(profileId: string) {
    setMessage(null);
    if (pin !== confirm) {
      // COPY: confirm met Marlon
      setMessage({ tone: "error", text: "De pincodes komen niet overeen." });
      return;
    }
    if (!PIN_PATTERN.test(pin)) {
      // COPY: confirm met Marlon
      setMessage({ tone: "error", text: `Een pincode is ${KIOSK_PIN_LENGTH} cijfers.` });
      return;
    }
    startTransition(async () => {
      const res = await setStaffPin({ profileId, pin });
      setMessage({ tone: res.ok ? "success" : "error", text: res.message });
      if (res.ok) {
        setEditing(null);
        setPin("");
        setConfirm("");
      }
    });
  }

  function clear(profileId: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await clearStaffPin(profileId);
      setMessage({ tone: res.ok ? "success" : "error", text: res.message });
    });
  }

  function revoke(deviceId: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await revokeKioskDevice(deviceId);
      setMessage({ tone: res.ok ? "success" : "error", text: res.message });
    });
  }

  return (
    <section className="max-w-2xl">
      {/* COPY: confirm met Marlon */}
      <h2 className="font-display text-2xl mb-2">Kiosk</h2>
      {/* COPY: confirm met Marlon */}
      <p className="text-sm text-text-muted mb-6">
        Elk staflid ontgrendelt de tablet met een eigen pincode van {KIOSK_PIN_LENGTH} cijfers. Een nieuwe of
        verwijderde pincode maakt lopende kiosk-sessies van dat staflid direct ongeldig. Een tablet koppel
        je door als admin op de tablet in te loggen en naar /kiosk/koppelen te gaan.
      </p>

      {/* COPY: confirm met Marlon */}
      <h3 className="text-xs uppercase tracking-[0.18em] text-text-muted mb-3">Pincodes</h3>
      <ul className="divide-y divide-[color:var(--ink-500)]/60 border border-[color:var(--ink-500)]/60">
        {staff.map((s) => (
          <li key={s.profileId} className="px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[10rem]">
              <div className="text-sm">{s.name}</div>
              <div className="text-xs text-text-muted">
                {s.role === "admin" ? "Admin" : "Trainer"}
                {/* COPY: confirm met Marlon */}
                {s.hasPin && s.setAt ? ` · pincode gezet ${dateFmt.format(new Date(s.setAt))}` : " · geen pincode"}
              </div>
            </div>
            {editing === s.profileId ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={input}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={KIOSK_PIN_LENGTH}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  // COPY: confirm met Marlon
                  placeholder="Pincode"
                  disabled={pending}
                />
                <input
                  className={input}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={KIOSK_PIN_LENGTH}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
                  // COPY: confirm met Marlon
                  placeholder="Nogmaals"
                  disabled={pending}
                />
                <button type="button" className={accentButton} disabled={pending} onClick={() => savePin(s.profileId)}>
                  {/* COPY: confirm met Marlon */}
                  Opslaan
                </button>
                <button
                  type="button"
                  className={ghostButton}
                  disabled={pending}
                  onClick={() => {
                    setEditing(null);
                    setPin("");
                    setConfirm("");
                  }}
                >
                  {/* COPY: confirm met Marlon */}
                  Annuleren
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button type="button" className={ghostButton} disabled={pending} onClick={() => setEditing(s.profileId)}>
                  {/* COPY: confirm met Marlon */}
                  {s.hasPin ? "Resetten" : "Instellen"}
                </button>
                {s.hasPin && (
                  <button type="button" className={ghostButton} disabled={pending} onClick={() => clear(s.profileId)}>
                    {/* COPY: confirm met Marlon */}
                    Verwijderen
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
        {staff.length === 0 && (
          // COPY: confirm met Marlon
          <li className="px-4 py-3 text-sm text-text-muted">Geen staf gevonden.</li>
        )}
      </ul>

      {/* COPY: confirm met Marlon */}
      <h3 className="text-xs uppercase tracking-[0.18em] text-text-muted mt-8 mb-3">Gekoppelde apparaten</h3>
      <ul className="divide-y divide-[color:var(--ink-500)]/60 border border-[color:var(--ink-500)]/60">
        {devices.map((d) => (
          <li key={d.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[10rem]">
              <div className="text-sm">
                {d.label}
                {/* COPY: confirm met Marlon */}
                {d.isThisDevice && <span className="ml-2 text-xs text-accent">dit apparaat</span>}
              </div>
              <div className="text-xs text-text-muted">
                {/* COPY: confirm met Marlon */}
                {d.revokedAt
                  ? `Ingetrokken ${dateFmt.format(new Date(d.revokedAt))}`
                  : d.lastSeenAt
                    ? `Laatst gezien ${dateFmt.format(new Date(d.lastSeenAt))}`
                    : `Gekoppeld ${dateFmt.format(new Date(d.createdAt))}, nog niet gezien`}
              </div>
            </div>
            {!d.revokedAt && (
              <button type="button" className={ghostButton} disabled={pending} onClick={() => revoke(d.id)}>
                {/* COPY: confirm met Marlon */}
                Intrekken
              </button>
            )}
          </li>
        ))}
        {devices.length === 0 && (
          // COPY: confirm met Marlon
          <li className="px-4 py-3 text-sm text-text-muted">Nog geen apparaat gekoppeld.</li>
        )}
      </ul>

      {message && (
        <p className={`mt-4 text-sm ${message.tone === "error" ? "text-red-400" : "text-accent"}`}>{message.text}</p>
      )}
    </section>
  );
}
