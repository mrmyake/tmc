"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCw, UserPlus, Undo2, LogOut, Search } from "lucide-react";
import {
  searchProfiles,
  getTodayCheckIns,
  type AdminProfileRow,
  type TodayCheckInRow,
} from "@/lib/check-in/admin-queries";
import {
  checkInByProfileId,
  undoCheckIn,
  createWalkInProfile,
  type AccessType,
} from "@/lib/check-in/actions";

interface Props {
  onExit: () => void;
}

const PILLAR_LABELS: Record<string, string> = {
  yoga_mobility: "Yoga & Mobility",
  kettlebell: "Kettlebell",
  vrij_trainen: "Vrij trainen",
  kids: "Kids",
  senior: "Senior",
};

const ACCESS_LABELS: Record<AccessType, string> = {
  membership: "Abonnement",
  guest_pass: "Guest pass",
  credit: "Credit",
  drop_in: "Drop-in",
  trial: "Proefles",
  comp: "Gratis",
};

export function AdminPanel({ onExit }: Props) {
  const [checkIns, setCheckIns] = useState<TodayCheckInRow[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminProfileRow[]>([]);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);
  const [showWalkInForm, setShowWalkInForm] = useState(false);

  function refreshCheckIns() {
    startTransition(async () => {
      const rows = await getTodayCheckIns();
      setCheckIns(rows);
    });
  }

  // Initial load + auto-refresh elke 30s
  useEffect(() => {
    refreshCheckIns();
    const id = window.setInterval(refreshCheckIns, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const rows = await searchProfiles(q);
        setResults(rows);
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  function showToast(tone: "success" | "error", text: string) {
    setToast({ tone, text });
    window.setTimeout(() => setToast(null), 2500);
  }

  function doCheckIn(
    profileId: string,
    pillar: string,
    accessType: AccessType,
  ) {
    startTransition(async () => {
      const res = await checkInByProfileId({
        profileId,
        pillar,
        accessType,
        method: "admin_tablet",
      });
      if (res.ok) {
        showToast("success", `Ingecheckt: ${res.profile.firstName}`);
        setQuery("");
        setResults([]);
        refreshCheckIns();
      } else {
        showToast("error", res.message);
      }
    });
  }

  function doUndo(id: string) {
    startTransition(async () => {
      const res = await undoCheckIn(id);
      if (res.ok) {
        refreshCheckIns();
        showToast("success", "Ongedaan gemaakt.");
      } else {
        showToast("error", res.message);
      }
    });
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center justify-between px-6 md:px-10 py-4 border-b border-[color:var(--ink-500)]/60">
        <div>
          <span className="tmc-eyebrow tmc-eyebrow--accent">Admin modus</span>
          <p className="text-text-muted text-xs mt-1">
            Sluit automatisch na 5 minuten inactiviteit.
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer"
        >
          <LogOut size={14} strokeWidth={1.5} />
          Terug naar self-modus
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 p-6 md:p-10">
        {/* Links: vandaag ingecheckt */}
        <section
          aria-labelledby="today-title"
          className="flex flex-col min-h-0"
        >
          <div className="flex items-baseline justify-between mb-5">
            <h2
              id="today-title"
              className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text"
            >
              Vandaag ingecheckt
              <span className="ml-3 text-text-muted text-sm">
                ({checkIns.length})
              </span>
            </h2>
            <button
              type="button"
              onClick={refreshCheckIns}
              disabled={pending}
              aria-label="Ververs"
              className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-accent transition-colors duration-300 cursor-pointer"
            >
              <RefreshCw size={16} strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto border-y border-[color:var(--ink-500)]/60 divide-y divide-[color:var(--ink-500)]/60">
            {checkIns.length === 0 ? (
              <p className="py-8 text-text-muted text-sm">Nog niemand.</p>
            ) : (
              checkIns.map((c) => (
                <div
                  key={c.id}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-text text-sm truncate">
                      {c.profileName}
                    </p>
                    <p className="text-text-muted text-[11px]">
                      {c.timeLabel} · {PILLAR_LABELS[c.pillar] ?? c.pillar} ·{" "}
                      {ACCESS_LABELS[c.accessType] ?? c.accessType}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => doUndo(c.id)}
                    disabled={pending}
                    aria-label={`Undo check-in ${c.profileName}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted hover:text-[color:var(--danger)] transition-colors duration-300 cursor-pointer"
                  >
                    <Undo2 size={12} strokeWidth={1.5} />
                    Undo
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Rechts: zoek + walk-in */}
        <section aria-labelledby="search-title" className="flex flex-col">
          <h2
            id="search-title"
            className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text mb-5"
          >
            Iemand anders inchecken
          </h2>

          <div className="relative mb-6">
            <Search
              size={16}
              strokeWidth={1.5}
              aria-hidden
              className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Naam of email"
              className="w-full pl-12 pr-4 py-4 bg-bg-elevated border border-[color:var(--ink-500)] text-text text-base focus:outline-none focus:border-accent"
            />
          </div>

          {results.length > 0 && (
            <ul className="mb-6 border-y border-[color:var(--ink-500)]/60 divide-y divide-[color:var(--ink-500)]/60 max-h-[40vh] overflow-y-auto">
              {results.map((p) => (
                <li
                  key={p.id}
                  className="py-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-text text-sm">
                      {p.firstName} {p.lastName}
                    </p>
                    <p className="text-text-muted text-[11px]">
                      {p.phone} · {p.memberCode}
                    </p>
                  </div>
                  <PillarActions
                    onPick={(pillar, accessType) =>
                      doCheckIn(p.id, pillar, accessType)
                    }
                    pending={pending}
                    suggestedPillars={p.coveredPillars}
                  />
                </li>
              ))}
            </ul>
          )}

          {!showWalkInForm ? (
            <button
              type="button"
              onClick={() => setShowWalkInForm(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text hover:border-accent hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer"
            >
              <UserPlus size={14} strokeWidth={1.5} />
              Nieuwe walk-in
            </button>
          ) : (
            <WalkInForm
              onCreated={(profileId) => {
                setShowWalkInForm(false);
                // Na aanmaken: automatisch de check-in-prompt voor drop-in
                // op de meest-voor-de-hand-liggende pillar. Admin kiest.
                showToast(
                  "success",
                  "Walk-in aangemaakt. Kies pillar hierboven.",
                );
                setQuery(""); // forceer admin de search te gebruiken
                void profileId; // kan in PR3 gebruikt worden voor auto-prefill
              }}
              onCancel={() => setShowWalkInForm(false)}
            />
          )}
        </section>
      </div>

      {toast && (
        <div
          role={toast.tone === "success" ? "status" : "alert"}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 border text-sm ${
            toast.tone === "success"
              ? "border-[color:var(--success)] text-[color:var(--success)] bg-bg"
              : "border-[color:var(--danger)] text-[color:var(--danger)] bg-bg"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function PillarActions({
  onPick,
  pending,
  suggestedPillars,
}: {
  onPick: (pillar: string, accessType: AccessType) => void;
  pending: boolean;
  suggestedPillars: string[];
}) {
  // Tonen we alleen pillars die de user mag, plus 'vrij_trainen' als
  // fallback. Voor drop-in tappen admin buiten deze suggestions.
  const pillars = suggestedPillars.length > 0
    ? suggestedPillars
    : ["vrij_trainen"];
  return (
    <div className="flex flex-wrap gap-2">
      {pillars.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p, "membership")}
          disabled={pending}
          className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text hover:border-accent hover:text-accent transition-colors duration-300 disabled:opacity-50 cursor-pointer"
        >
          {PILLAR_LABELS[p] ?? p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPick(pillars[0], "drop_in")}
        disabled={pending}
        className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] border border-accent/40 text-accent hover:bg-accent hover:text-bg transition-colors duration-300 disabled:opacity-50 cursor-pointer"
      >
        Drop-in
      </button>
    </div>
  );
}

function WalkInForm({
  onCreated,
  onCancel,
}: {
  onCreated: (profileId: string) => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createWalkInProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneRaw: phone.trim(),
      });
      if (res.ok) onCreated(res.profileId);
      else setError(res.message);
    });
  }

  const inputCls =
    "w-full bg-bg-elevated border border-[color:var(--ink-500)] text-text text-base px-4 py-3 focus:outline-none focus:border-accent";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        type="text"
        required
        placeholder="Voornaam"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        className={inputCls}
      />
      <input
        type="text"
        required
        placeholder="Achternaam"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        className={inputCls}
      />
      <input
        type="tel"
        required
        placeholder="Nummer (06...)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className={inputCls}
      />
      {error && (
        <p role="alert" className="text-sm text-[color:var(--danger)]">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center px-7 py-3 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent hover:bg-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
        >
          {pending ? "Bezig" : "Aanmaken"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors duration-300 px-3 py-2 cursor-pointer"
        >
          Annuleren
        </button>
      </div>
    </form>
  );
}
