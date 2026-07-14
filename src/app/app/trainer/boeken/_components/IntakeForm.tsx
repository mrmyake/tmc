"use client";

import { useState, useTransition } from "react";
import { AdminField, AdminInput } from "@/components/ui/AdminField";
import { createPtIntake } from "@/lib/admin/pt-intake-actions";
import { zonedWallClockToUtc } from "@/lib/scheduling/amsterdam-time";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import { BusyDayPanel } from "./BusyDayPanel";
import { SuccessBanner } from "./SuccessBanner";

interface IntakeFormProps {
  trainerId: string;
}

type DurationChoice = "60" | "90" | "120" | "custom";

const DURATION_CHOICES: DurationChoice[] = ["60", "90", "120", "custom"];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * PT-agenda C2, keuze 3: intake voor een nieuwe klant zonder account.
 * Geen kosten, geen credit; blokkeert de agenda maar is geen boekbaar
 * slot. Bewuste afwijking (zie createPtIntake): geen override bij een
 * conflict, alleen een hard-blokkerende melding, want dit pad heeft geen
 * DB-advisory-lock.
 */
export function IntakeForm({ trainerId }: IntakeFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [durationChoice, setDurationChoice] = useState<DurationChoice>("90");
  const [customDuration, setCustomDuration] = useState("90");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("09:00");

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ startAt: string; endAt: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const durationMin =
    durationChoice === "custom" ? Number(customDuration) : Number(durationChoice);
  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    (durationChoice !== "custom" || Boolean(customDuration));

  function handleSubmit() {
    setError(null);
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const startAt = zonedWallClockToUtc(year, month, day, hour, minute);

    startTransition(async () => {
      const res = await createPtIntake({
        trainerId,
        prospectName: name.trim(),
        prospectEmail: email.trim(),
        prospectPhone: phone.trim() || undefined,
        startAt: startAt.toISOString(),
        durationMin,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setResult({ startAt: res.startAt, endAt: res.endAt });
    });
  }

  if (result) {
    const start = new Date(result.startAt);
    const end = new Date(result.endAt);
    return (
      <SuccessBanner
        // COPY: confirm met Marlon
        title="Intake ingepland."
        detail={`${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}`}
        payUrl={null}
        warning={null}
        onReset={() => setResult(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-sm">
        Voor een nieuwe klant zonder account. Geen kosten, geen credit; dit
        blokkeert alleen de agenda.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <AdminField label="Naam">
          <AdminInput
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </AdminField>
        <AdminField label="Telefoon" hint="Optioneel.">
          <AdminInput
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </AdminField>
      </div>

      <AdminField label="E-mail">
        <AdminInput
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </AdminField>

      <AdminField label="Duur (min)">
        <div className="flex gap-1.5 flex-wrap">
          {DURATION_CHOICES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDurationChoice(d)}
              aria-pressed={durationChoice === d}
              className={`px-3 py-3 text-xs font-medium uppercase tracking-[0.1em] border transition-colors cursor-pointer ${
                durationChoice === d
                  ? "bg-accent text-bg border-accent"
                  : "border-[color:var(--ink-500)] text-text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {/* COPY: confirm met Marlon */}
              {d === "custom" ? "Vrij" : d}
            </button>
          ))}
        </div>
      </AdminField>

      {durationChoice === "custom" && (
        <AdminField label="Duur (minuten)" hint="Tussen 1 en 480 minuten.">
          <AdminInput
            type="number"
            min={1}
            max={480}
            value={customDuration}
            onChange={(e) => setCustomDuration(e.target.value)}
          />
        </AdminField>
      )}

      <div className="grid grid-cols-2 gap-4">
        <AdminField label="Datum">
          <AdminInput
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </AdminField>
        <AdminField label="Tijd">
          <AdminInput
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </AdminField>
      </div>

      <BusyDayPanel trainerId={trainerId} dateIso={date} />

      {error && (
        <div
          role="alert"
          className="p-4 border border-[color:var(--danger)]/40 text-sm text-[color:var(--danger)]"
        >
          {error}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || !canSubmit}
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          {pending ? "Bezig..." : "Intake inplannen"}
        </button>
      </div>
    </div>
  );
}
