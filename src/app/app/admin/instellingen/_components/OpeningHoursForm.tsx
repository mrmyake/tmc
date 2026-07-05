"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminInput } from "@/components/ui/AdminField";
import {
  saveOpeningHours,
  type OpeningHoursActionResult,
  type OpeningHoursRowInput,
} from "@/lib/admin/opening-hours-actions";

// Zelfde conventie als schedule_templates.day_of_week / opening_hours.weekday:
// 0-6, 0 = zondag (JS getDay). Zie migratie-comments op beide kolommen.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABEL: Record<number, string> = {
  0: "Zondag",
  1: "Maandag",
  2: "Dinsdag",
  3: "Woensdag",
  4: "Donderdag",
  5: "Vrijdag",
  6: "Zaterdag",
};

interface OpeningHoursFormProps {
  initial: OpeningHoursRowInput[];
}

export function OpeningHoursForm({ initial }: OpeningHoursFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<OpeningHoursRowInput[]>(initial);
  const [message, setMessage] = useState<OpeningHoursActionResult | null>(null);

  function updateRow(weekday: number, patch: Partial<OpeningHoursRowInput>) {
    setRows((prev) =>
      prev.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await saveOpeningHours(rows);
      setMessage(res);
      if (res.ok) router.refresh();
    });
  }

  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-4">
        {DAY_ORDER.map((weekday) => {
          const row = rows.find((r) => r.weekday === weekday);
          if (!row) return null;
          return (
            <div
              key={weekday}
              className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 sm:gap-6 pb-4 border-b border-[color:var(--ink-500)]/60 last:border-b-0 last:pb-0"
            >
              <span className="tmc-eyebrow pt-3">{DAY_LABEL[weekday]}</span>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={row.isClosed}
                    onChange={(e) =>
                      updateRow(weekday, { isClosed: e.target.checked })
                    }
                    className="cursor-pointer"
                  />
                  {/* COPY: confirm met Marlon */}
                  Gesloten
                </label>
                {!row.isClosed && (
                  <>
                    <AdminInput
                      type="time"
                      value={row.opensAt ?? ""}
                      onChange={(e) =>
                        updateRow(weekday, { opensAt: e.target.value })
                      }
                      className="w-32"
                    />
                    <span className="text-text-muted text-sm">
                      {/* COPY: confirm met Marlon */}
                      tot
                    </span>
                    <AdminInput
                      type="time"
                      value={row.closesAt ?? ""}
                      onChange={(e) =>
                        updateRow(weekday, { closesAt: e.target.value })
                      }
                      className="w-32"
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

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

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          {pending ? "Opslaan…" : dirty ? "Opslaan" : "Niks gewijzigd"}
        </button>
      </div>
    </form>
  );
}
