"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AdminField,
  AdminInput,
} from "@/components/ui/AdminField";
import {
  saveBookingSettings,
  type BookingSettingsInput,
  type SettingsActionResult,
} from "@/lib/admin/settings-actions";
import {
  CHECK_IN_PILLAR_OPTIONS,
  type CheckInPillar,
} from "@/lib/admin/settings-constants";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";

interface SettingsFormProps {
  initial: BookingSettingsInput;
}

export function SettingsForm({ initial }: SettingsFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<BookingSettingsInput>(initial);
  const [message, setMessage] = useState<SettingsActionResult | null>(null);

  function setField<K extends keyof BookingSettingsInput>(
    key: K,
    v: BookingSettingsInput[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await saveBookingSettings(values);
      setMessage(res);
      if (res.ok) router.refresh();
    });
  }

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-12 max-w-2xl">
      <Section title="Boeking-regels">
        <IntField
          label="Cancel-venster groepsles (uur)"
          hint="Na dit venster telt annuleren als sessie gebruikt."
          value={values.cancellationWindowHours}
          onChange={(v) => setField("cancellationWindowHours", v)}
          min={0}
          max={48}
        />
        <IntField
          label="Cancel-venster vrij trainen (min)"
          hint="Veel soepeler dan groepslessen."
          value={values.vrijTrainenCancelWindowMinutes}
          onChange={(v) => setField("vrijTrainenCancelWindowMinutes", v)}
          min={0}
          max={600}
        />
        <IntField
          label="Boekings-horizon (dagen)"
          hint="Hoe ver vooruit leden mogen boeken."
          value={values.bookingWindowDays}
          onChange={(v) => setField("bookingWindowDays", v)}
          min={1}
          max={90}
        />
        <IntField
          label="Wachtlijst bevestiging (min)"
          hint="Tijd om te bevestigen na promote."
          value={values.waitlistConfirmationMinutes}
          onChange={(v) => setField("waitlistConfirmationMinutes", v)}
          min={5}
          max={240}
        />
        <IntField
          label="Fair-use max sessies per dag"
          hint="Per lid, per dag."
          value={values.fairUseDailyMax}
          onChange={(v) => setField("fairUseDailyMax", v)}
          min={1}
          max={10}
        />
      </Section>

      <Section title="No-show beleid">
        <IntField
          label="Strike-venster (dagen)"
          hint="Hoe lang een strike meetelt."
          value={values.noShowStrikeWindowDays}
          onChange={(v) => setField("noShowStrikeWindowDays", v)}
          min={1}
          max={365}
        />
        <IntField
          label="Strike-drempel"
          hint="Aantal strikes voor block."
          value={values.noShowStrikeThreshold}
          onChange={(v) => setField("noShowStrikeThreshold", v)}
          min={1}
          max={10}
        />
        <IntField
          label="Block-duur (dagen)"
          hint="Hoe lang het lid niet kan boeken na drempel."
          value={values.noShowBlockDays}
          onChange={(v) => setField("noShowBlockDays", v)}
          min={0}
          max={90}
        />
        <IntField
          label="Release-venster (min voor start)"
          hint="Zonder check-in wordt de plek dan vrijgegeven voor wachtlijst."
          value={values.noShowReleaseMinutes}
          onChange={(v) => setField("noShowReleaseMinutes", v)}
          min={0}
          max={120}
        />
      </Section>

      {/* Geen prijs-secties meer: prijzen leven uitsluitend in tmc.catalogue
          en wijzigen per migratie (Migratie B). */}
      <section>
        <header className="mb-5">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
            Check-in
          </span>
          <p className="text-text-muted text-sm max-w-xl leading-relaxed">
            Studio-tablet op `/checkin`. Leden checken zelf in met telefoon of
            member-code. Uit = tablet weigert alle check-ins, counters vallen
            terug op boeking-status.
          </p>
        </header>
        <div className="flex flex-col gap-5">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={values.checkInEnabled}
              onChange={(e) =>
                setField("checkInEnabled", e.target.checked)
              }
              className="mt-1 w-4 h-4 accent-accent cursor-pointer"
            />
            <span className="flex flex-col">
              <span className="text-text text-sm font-medium">
                Tablet actief
              </span>
              <span className="text-text-muted text-xs mt-0.5">
                Wanneer uit: /checkin toont geen zelf-modus, alleen admin-login
                met PIN.
              </span>
            </span>
          </label>

          <div
            className={
              values.checkInEnabled ? "" : "opacity-40 pointer-events-none"
            }
          >
            <span className="tmc-eyebrow block mb-3">
              Pillars met check-in
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CHECK_IN_PILLAR_OPTIONS.map((pillar) => {
                const checked = values.checkInPillars.includes(pillar);
                const label =
                  PILLAR_LABELS[pillar as Pillar] ?? pillar;
                return (
                  <label
                    key={pillar}
                    className="flex items-center gap-3 cursor-pointer py-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? Array.from(
                              new Set<CheckInPillar>([
                                ...values.checkInPillars,
                                pillar,
                              ]),
                            )
                          : values.checkInPillars.filter(
                              (p) => p !== pillar,
                            );
                        setField("checkInPillars", next);
                      }}
                      className="w-4 h-4 accent-accent cursor-pointer"
                    />
                    <span className="text-text text-sm">{label}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-text-muted text-xs mt-3 max-w-lg leading-relaxed">
              Aangevinkte pillars laten leden via de tablet inchecken. Niet-
              aangevinkte pillars blijven puur booking-based.
            </p>
          </div>
        </div>
      </section>

      {message && (
        <div
          role={message.ok ? "status" : "alert"}
          className={`text-sm p-4 border ${
            message.ok
              ? "border-[color:var(--success)]/40 text-[color:var(--success)]"
              : "border-[color:var(--danger)]/40 text-[color:var(--danger)]"
          }`}
        >
          {message.message}
        </div>
      )}

      <div className="sticky bottom-4 flex justify-end">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {pending ? "Opslaan…" : dirty ? "Opslaan" : "Niks gewijzigd"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-5">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
          {title}
        </span>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {children}
      </div>
    </section>
  );
}

function IntField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <AdminField label={label} hint={hint}>
      <AdminInput
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="tabular-nums"
      />
    </AdminField>
  );
}

