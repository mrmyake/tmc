"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { ExerciseRow } from "@/lib/admin/exercises-query";
import { ExerciseForm } from "./ExerciseForm";
import { ExerciseRowView } from "./ExerciseRowView";

interface Props {
  rows: ExerciseRow[];
}

export function ExercisesClient({ rows }: Props) {
  const [editing, setEditing] = useState<ExerciseRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const showForm = creating || editing !== null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <>
      {!showForm && (
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] cursor-pointer"
          >
            <Plus size={14} strokeWidth={1.8} />
            {/* COPY: confirm met Marlon */}
            Nieuwe oefening
          </button>

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search
              size={15}
              strokeWidth={1.8}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              // COPY: confirm met Marlon
              placeholder="Zoek op naam"
              className="w-full bg-bg border border-[color:var(--ink-500)] pl-9 pr-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      )}

      {showForm && (
        <div className="mb-10">
          <ExerciseForm
            existing={editing}
            onDone={() => {
              setEditing(null);
              setCreating(false);
            }}
          />
        </div>
      )}

      {!showForm && (
        <>
          {rows.length === 0 ? (
            <div className="py-16 text-center border-t border-[color:var(--ink-500)]/60">
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                Nog niks
              </span>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-sm max-w-md mx-auto">
                Voeg de eerste oefening toe aan de bibliotheek.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center border-t border-[color:var(--ink-500)]/60">
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-sm">
                Geen oefeningen gevonden voor &quot;{search}&quot;.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
              {filtered.map((r) => (
                <li key={r.id} className={r.isActive ? "" : "opacity-60"}>
                  <ExerciseRowView row={r} onEdit={() => setEditing(r)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
