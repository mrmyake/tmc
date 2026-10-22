"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import {
  addWalkIn,
  searchWalkInMembers,
  type AddWalkInActionResult,
  type ParticipantRow,
} from "@/lib/admin/attendance-actions";
import {
  WALK_IN_SEARCH_MIN_CHARS,
  type WalkInCandidate,
} from "@/lib/attendance/walk-in-core";
import { AvatarBubble } from "./AvatarBubble";

/**
 * Walk-in-venster van de deelnemerslijst (mockups/kiosk-prototype.html):
 * bovenaan het scherm zodat het Android- en iOS-toetsenbord eronder past,
 * zoekveld met autofocus, per lid een statusregel en een knop. De RPC is
 * leidend: een weigering komt als melding bovenin, de sheet blijft open.
 */

interface WalkInSheetProps {
  sessionId: string;
  capacity: number | null;
  takenCount: number;
  onAdded: (participant: ParticipantRow, alreadyBooked: boolean, takenCount: number) => void;
  onClose: () => void;
}

export function WalkInSheet({ sessionId, capacity, takenCount, onAdded, onClose }: WalkInSheetProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WalkInCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const latestQuery = useRef("");

  const full = capacity !== null && takenCount >= capacity;

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, []);

  const debounce = useRef<number | null>(null);
  useEffect(() => () => {
    if (debounce.current !== null) window.clearTimeout(debounce.current);
  }, []);

  // Zoeken vanuit de invoer zelf (geen effect): 250 ms debounce, en een oud
  // antwoord mag een nieuwere zoekopdracht niet overschrijven.
  function onQueryChange(value: string) {
    setQuery(value);
    const q = value.trim();
    latestQuery.current = q;
    if (debounce.current !== null) window.clearTimeout(debounce.current);
    if (q.length < WALK_IN_SEARCH_MIN_CHARS) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = window.setTimeout(() => {
      void (async () => {
        const res = await searchWalkInMembers(sessionId, q);
        if (latestQuery.current !== q) return;
        setSearching(false);
        if (!res.ok) {
          setMessage(res.message);
          setResults([]);
          return;
        }
        setResults(res.candidates);
      })();
    }, 250);
  }

  function add(c: WalkInCandidate) {
    if (addingId) return;
    setAddingId(c.profileId);
    setMessage(null);
    void (async () => {
      const res: AddWalkInActionResult = await addWalkIn(sessionId, c.profileId);
      setAddingId(null);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      onAdded(res.participant, res.alreadyBooked, res.takenCount);
    })();
  }

  const trimmed = query.trim();

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Sluiten"
        onClick={onClose}
        className="absolute inset-0 bg-bg/60 backdrop-blur-sm cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkin-sheet-title"
        className="absolute top-0 left-0 right-0 max-h-[85vh] flex flex-col bg-bg border-b border-[color:var(--ink-500)] rounded-b-[8px] text-text shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h2
            id="walkin-sheet-title"
            className="font-[family-name:var(--font-playfair)] text-2xl leading-none tracking-[-0.02em]"
          >
            {/* COPY: confirm met Marlon */}
            Walk-in toevoegen
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-[4px] text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <X size={20} strokeWidth={1.8} aria-hidden />
          </button>
        </div>

        {full && (
          <p className="mx-4 mb-3 px-3 py-2 rounded-[4px] bg-[color:var(--warning)]/10 border border-[color:var(--warning)]/40 text-[12px] text-[color:var(--warning)] leading-snug">
            {/* COPY: confirm met Marlon */}
            Deze les is vol ({takenCount} van {capacity} plekken). Een walk-in komt er als extra plek bij.
          </p>
        )}

        {message && (
          <p
            role="alert"
            className="mx-4 mb-3 px-3 py-2 rounded-[4px] bg-[color:var(--danger)]/10 border border-[color:var(--danger)]/40 text-[12px] text-[color:var(--danger)] leading-snug"
          >
            {message}
          </p>
        )}

        <label className="mx-4 mb-3 flex items-center gap-2 h-12 px-3 rounded-[4px] bg-bg-elevated border border-[color:var(--ink-500)] focus-within:border-accent transition-colors">
          <Search size={18} strokeWidth={1.8} aria-hidden className="text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            // COPY: confirm met Marlon
            placeholder="Zoek een lid op naam"
            aria-label="Zoek een lid op naam"
            className="flex-1 min-w-0 bg-transparent text-base text-text placeholder:text-text-muted outline-none"
          />
        </label>

        <div className="px-4 pb-4 overflow-y-auto">
          {trimmed.length < WALK_IN_SEARCH_MIN_CHARS ? (
            <p className="py-6 text-center text-sm text-text-muted">
              {/* COPY: confirm met Marlon */}
              Typ minstens twee letters van de naam.
            </p>
          ) : searching && results.length === 0 ? (
            <p role="status" className="py-6 text-center text-sm text-text-muted">
              Zoeken
            </p>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">
              {/* COPY: confirm met Marlon */}
              Geen lid gevonden.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((c) => {
                const disabled = c.state !== "eligible" || addingId !== null;
                const busy = addingId === c.profileId;
                // COPY: confirm met Marlon ("Toevoegen", "Toegevoegd", "Niet mogelijk")
                const label =
                  c.state === "on_list" ? "Toegevoegd" : c.state === "no_coverage" ? "Niet mogelijk" : busy ? "Bezig" : "Toevoegen";
                return (
                  <li
                    key={c.profileId}
                    className="flex items-center gap-3 p-3 rounded-[8px] bg-bg-elevated border border-[color:var(--ink-500)]"
                  >
                    <AvatarBubble
                      firstName={c.firstName}
                      lastName={c.lastName}
                      avatarUrl={c.avatarUrl}
                      size={40}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-text text-base font-medium truncate">
                        {c.firstName} {c.lastName}
                      </p>
                      <p
                        className={`text-[12px] leading-snug ${
                          c.state === "no_coverage" ? "text-[color:var(--danger)]" : "text-text-muted"
                        }`}
                      >
                        {c.statusLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => add(c)}
                      className={`min-h-11 px-4 rounded-[4px] text-xs font-medium uppercase tracking-[0.16em] transition-colors cursor-pointer disabled:cursor-default ${
                        c.state === "eligible"
                          ? "bg-accent text-bg hover:bg-accent/90 disabled:opacity-60"
                          : "border border-text-muted/30 text-text-muted disabled:opacity-60"
                      }`}
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
