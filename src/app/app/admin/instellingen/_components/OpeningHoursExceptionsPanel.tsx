"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { AdminField, AdminInput } from "@/components/ui/AdminField";
import {
  addOpeningHoursException,
  deleteOpeningHoursException,
  type OpeningHoursActionResult,
} from "@/lib/admin/opening-hours-actions";

export interface OpeningHoursExceptionRow {
  id: string;
  date: string; // ISO date
  isClosed: boolean;
  opensAt: string | null; // "HH:mm"
  closesAt: string | null;
  note: string | null;
}

interface OpeningHoursExceptionsPanelProps {
  exceptions: OpeningHoursExceptionRow[];
}

export function OpeningHoursExceptionsPanel({
  exceptions,
}: OpeningHoursExceptionsPanelProps) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="self-start inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
        >
          <Plus size={14} strokeWidth={1.8} />
          {/* COPY: confirm met Marlon */}
          Uitzondering toevoegen
        </button>
      )}

      {adding && <NewExceptionForm onDone={() => setAdding(false)} />}

      {exceptions.length === 0 ? (
        <p className="text-text-muted text-sm">
          {/* COPY: confirm met Marlon */}
          Geen uitzonderingen ingepland.
        </p>
      ) : (
        <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
          {exceptions.map((ex) => (
            <li key={ex.id}>
              <ExceptionRowView exception={ex} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExceptionRowView({
  exception: ex,
}: {
  exception: OpeningHoursExceptionRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OpeningHoursActionResult | null>(null);

  function onDelete() {
    startTransition(async () => {
      const res = await deleteOpeningHoursException(ex.id);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-[color:var(--ink-500)]/40">
      <div className="flex flex-col gap-1">
        <span className="text-text text-sm font-medium">{ex.date}</span>
        <span className="text-text-muted text-sm">
          {ex.isClosed
            ? // COPY: confirm met Marlon
              "Gesloten"
            : `${ex.opensAt?.slice(0, 5)} - ${ex.closesAt?.slice(0, 5)}`}
          {ex.note ? ` · ${ex.note}` : ""}
        </span>
        {result && !result.ok && (
          <span className="text-[color:var(--danger)] text-xs">
            {result.message}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        aria-label={`Verwijder uitzondering ${ex.date}`}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 disabled:opacity-50 transition-colors cursor-pointer"
      >
        <Trash2 size={12} strokeWidth={1.8} />
        {/* COPY: confirm met Marlon */}
        Verwijder
      </button>
    </div>
  );
}

function NewExceptionForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OpeningHoursActionResult | null>(null);
  const [date, setDate] = useState("");
  const [isClosed, setIsClosed] = useState(true);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await addOpeningHoursException({
        date,
        isClosed,
        opensAt: isClosed ? null : opensAt,
        closesAt: isClosed ? null : closesAt,
        note,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(onDone, 500);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5 bg-bg-elevated p-6 border border-[color:var(--ink-500)]">
      <AdminField label="Datum">
        <AdminInput
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </AdminField>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={isClosed}
            onChange={() => setIsClosed(true)}
            className="cursor-pointer"
          />
          {/* COPY: confirm met Marlon */}
          Gesloten
        </label>
        <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={!isClosed}
            onChange={() => setIsClosed(false)}
            className="cursor-pointer"
          />
          {/* COPY: confirm met Marlon */}
          Afwijkende tijden
        </label>
      </div>

      {!isClosed && (
        <div className="grid grid-cols-2 gap-4">
          <AdminField label="Open">
            <AdminInput
              type="time"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
            />
          </AdminField>
          <AdminField label="Dicht">
            <AdminInput
              type="time"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </AdminField>
        </div>
      )}

      <AdminField
        label="Notitie"
        // COPY: confirm met Marlon
        hint="Optioneel, bv. 'Tweede Kerstdag'."
      >
        <AdminInput
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
        />
      </AdminField>

      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={`text-sm p-3 border ${
            result.ok
              ? "border-[color:var(--success)]/40 text-[color:var(--success)]"
              : "border-[color:var(--danger)]/40 text-[color:var(--danger)]"
          }`}
        >
          {result.message}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !date}
          className="inline-flex items-center justify-center px-6 py-3 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          {pending ? "Bezig" : "Toevoegen"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-4 py-3 cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          Annuleren
        </button>
      </div>
    </div>
  );
}
