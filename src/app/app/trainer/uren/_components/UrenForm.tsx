"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitOwnHours } from "@/lib/member/trainer-hours-actions";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface UrenFormProps {
  defaultDate?: string;
}

export function UrenForm({ defaultDate }: UrenFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [workDate, setWorkDate] = useState(defaultDate ?? todayIso());
  const [hours, setHours] = useState("1");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(hours);
    if (!(n > 0 && n <= 24)) {
      setMessage({
        tone: "error",
        text: "Uren moeten tussen 0 en 24 liggen.",
      });
      return;
    }
    startTransition(async () => {
      const res = await submitOwnHours({
        workDate,
        hours: n,
        notes,
      });
      setMessage({ tone: res.ok ? "success" : "error", text: res.message });
      if (res.ok) {
        setHours("1");
        setNotes("");
        router.refresh();
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="bg-bg-elevated p-6 border border-[color:var(--ink-500)] flex flex-col gap-5"
    >
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-2">
          <span className="tmc-eyebrow">Datum</span>
          <input
            type="date"
            value={workDate}
            max={todayIso()}
            onChange={(e) => setWorkDate(e.target.value)}
            required
            className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="tmc-eyebrow">Uren</span>
          <input
            type="number"
            step="0.25"
            min="0.25"
            max="24"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            required
            className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text tabular-nums focus:outline-none focus:border-accent"
          />
        </label>
      </div>

      <label className="flex flex-col gap-2">
        <span className="tmc-eyebrow">Notitie (optioneel)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Bv. PT-blok 10-12, extra schoonmaak, admin-werk."
          className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent resize-none"
        />
      </label>

      {message && (
        <p
          role={message.tone === "success" ? "status" : "alert"}
          className={`text-sm ${
            message.tone === "success"
              ? "text-[color:var(--success)]"
              : "text-[color:var(--danger)]"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
      >
        {pending ? "Bezig" : "Dien uren in"}
      </button>
    </form>
  );
}
