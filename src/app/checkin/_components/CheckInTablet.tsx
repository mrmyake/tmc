"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Lock } from "lucide-react";
import {
  lookupByIdentifier,
  checkInByIdentifier,
  type LookupResult,
  type CheckInResult,
} from "@/lib/check-in/actions";
import { Keypad } from "./Keypad";
import { AdminPanel } from "./AdminPanel";
import { AdminLockScreen } from "./AdminLockScreen";
import { lockAdminMode } from "@/lib/check-in/admin-lock";

type Mode = "self" | "admin_locked" | "admin_unlocked";

type SelfState =
  | { kind: "idle" }
  | { kind: "looking_up" }
  | { kind: "preview"; lookup: Extract<LookupResult, { ok: true }> }
  | { kind: "committing" }
  | { kind: "success"; name: string }
  | { kind: "error"; message: string };

interface Props {
  adminUnlocked: boolean;
}

export function CheckInTablet({ adminUnlocked }: Props) {
  const [mode, setMode] = useState<Mode>(
    adminUnlocked ? "admin_unlocked" : "self",
  );
  const [input, setInput] = useState("");
  const [selfState, setSelfState] = useState<SelfState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const resetTimer = useRef<number | null>(null);

  // Reset-timer na succes of error
  useEffect(() => {
    if (selfState.kind === "success" || selfState.kind === "error") {
      resetTimer.current = window.setTimeout(() => {
        resetSelf();
      }, selfState.kind === "success" ? 2000 : 3000);
    }
    return () => {
      if (resetTimer.current) {
        window.clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }
    };
  }, [selfState]);

  function resetSelf() {
    setInput("");
    setSelfState({ kind: "idle" });
  }

  // Auto-lookup bij 6 of 10 cijfers of bij +31XXXXXXXXX
  useEffect(() => {
    const digits = input.replace(/[^0-9+]/g, "");
    if (selfState.kind !== "idle") return;
    // Disambiguate op eerste teken:
    //   begint met 0 → phone (wacht op 10 cijfers)
    //   anders       → member_code (6 cijfers)
    // Keypad zelf limiteert op 10 cijfers, geen +-prefix mogelijk.
    const isPhoneInput = digits.startsWith("0");
    const shouldLookup = isPhoneInput
      ? digits.length === 10
      : digits.length === 6;
    if (!shouldLookup) return;
    setSelfState({ kind: "looking_up" });
    startTransition(async () => {
      const res = await lookupByIdentifier(input);
      if (!res.ok) {
        setSelfState({
          kind: "error",
          message:
            res.reason === "identifier_not_found"
              ? "Nummer niet gevonden. Spreek Marlon even aan."
              : "Ongeldig nummer. Probeer opnieuw.",
        });
        return;
      }
      setSelfState({ kind: "preview", lookup: res });
    });
  }, [input, selfState.kind]);

  function commitSelf(lookup: Extract<LookupResult, { ok: true }>) {
    const suggestion = lookup.suggestion;
    // Geen commit voor states zonder check-in knop
    if (
      suggestion.kind === "none" ||
      suggestion.kind === "already_checked_in"
    ) {
      return;
    }
    setSelfState({ kind: "committing" });
    startTransition(async () => {
      const res: CheckInResult = await checkInByIdentifier({
        identifier: input,
        pillar: suggestion.pillar,
        sessionId:
          suggestion.kind === "session_today"
            ? suggestion.sessionId
            : undefined,
        method: "self_tablet",
      });
      if (!res.ok) {
        setSelfState({ kind: "error", message: res.message });
        return;
      }
      setSelfState({
        kind: "success",
        name: `${res.profile.firstName} ${res.profile.lastInitial}.`.trim(),
      });
    });
  }

  async function openAdminLock() {
    setMode("admin_locked");
  }

  async function closeAdmin() {
    await lockAdminMode();
    setMode("self");
    resetSelf();
  }

  if (mode === "admin_locked") {
    return (
      <AdminLockScreen
        onUnlocked={() => setMode("admin_unlocked")}
        onCancel={() => setMode("self")}
      />
    );
  }

  if (mode === "admin_unlocked") {
    return <AdminPanel onExit={closeAdmin} />;
  }

  return (
    <div className="relative flex-1 flex items-center justify-center p-8 md:p-12">
      <button
        type="button"
        onClick={openAdminLock}
        aria-label="Admin-modus"
        className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center text-text-muted hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
      >
        <Lock size={18} strokeWidth={1.5} />
      </button>

      <div className="w-full max-w-2xl flex flex-col items-center">
        {selfState.kind === "success" ? (
          <SuccessView name={selfState.name} />
        ) : selfState.kind === "error" ? (
          <ErrorView message={selfState.message} />
        ) : selfState.kind === "preview" ? (
          <PreviewView
            lookup={selfState.lookup}
            onCheckIn={() => commitSelf(selfState.lookup)}
            onCancel={resetSelf}
            pending={pending}
          />
        ) : (
          <IdleView
            input={input}
            onChange={setInput}
            looking={selfState.kind === "looking_up" || pending}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Display-formatting voor invoer. Telefoon (begint met 0) toont als
 * "06 12 34 56 78" zodat de user 'm makkelijker kan controleren.
 * Member-code (6 cijfers) blijft 1 blok. State zelf is altijd de
 * ongeformatteerde digit-string.
 */
function formatDisplay(raw: string): string {
  if (!raw) return "";
  if (raw.startsWith("0")) {
    // 2-2-2-2-2 groups: "06", "12", "34", "56", "78"
    const groups: string[] = [raw.slice(0, 2)];
    for (let i = 2; i < raw.length; i += 2) {
      groups.push(raw.slice(i, i + 2));
    }
    return groups.join(" ");
  }
  return raw;
}

function IdleView({
  input,
  onChange,
  looking,
}: {
  input: string;
  onChange: (v: string) => void;
  looking: boolean;
}) {
  return (
    <>
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
        Check in
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em] mb-10 text-center">
        Welkom terug.
      </h1>
      <p className="text-text-muted text-sm md:text-base mb-6 text-center">
        Tik je telefoonnummer of je 6-cijferige member-code.
      </p>
      <div
        role="status"
        aria-live="polite"
        aria-label={input ? `Ingevoerd: ${input}` : "Nog geen invoer"}
        className="h-20 md:h-24 flex items-center justify-center mb-8 font-[family-name:var(--font-playfair)] text-4xl md:text-6xl tabular-nums tracking-[0.04em] text-text min-w-[12ch]"
      >
        {input ? formatDisplay(input) : <span className="text-text-muted/30">—</span>}
      </div>
      <Keypad value={input} onChange={onChange} disabled={looking} maxLength={10} />
    </>
  );
}

function PreviewView({
  lookup,
  onCheckIn,
  onCancel,
  pending,
}: {
  lookup: Extract<LookupResult, { ok: true }>;
  onCheckIn: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const { profile, suggestion } = lookup;
  const name = `${profile.firstName} ${profile.lastInitial}.`;
  const isAlreadyCheckedIn = suggestion.kind === "already_checked_in";
  const canCheckIn =
    suggestion.kind === "session_today" || suggestion.kind === "vrij_trainen";

  return (
    <div className="w-full text-center">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
        {isAlreadyCheckedIn ? "Al ingecheckt" : "Gevonden"}
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em] mb-8">
        Hoi, {name}
      </h1>
      {suggestion.kind === "already_checked_in" && (
        <p className="text-text-muted text-lg md:text-xl mb-10">
          Je bent vandaag al ingecheckt om{" "}
          <span className="text-text">{suggestion.timeLabel}</span>.
        </p>
      )}
      {suggestion.kind === "session_today" && (
        <p className="text-text-muted text-lg md:text-xl mb-10">
          Check je in voor{" "}
          <span className="text-text">{suggestion.className}</span> om{" "}
          {suggestion.startLabel}?
        </p>
      )}
      {suggestion.kind === "vrij_trainen" && (
        <p className="text-text-muted text-lg md:text-xl mb-10">
          Check je in voor vrij trainen?
        </p>
      )}
      {suggestion.kind === "none" && (
        <p className="text-text-muted text-lg md:text-xl mb-10 max-w-lg mx-auto">
          Je hebt vandaag niks geboekt en geen vrij-trainen toegang. Spreek
          Marlon even aan.
        </p>
      )}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        {canCheckIn && (
          <button
            type="button"
            onClick={onCheckIn}
            disabled={pending}
            className="inline-flex items-center justify-center px-10 py-5 text-sm font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {pending ? "Bezig" : "Check in"}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors duration-300 px-4 py-3 cursor-pointer"
        >
          {isAlreadyCheckedIn ? "Klaar" : "Annuleren"}
        </button>
      </div>
    </div>
  );
}

function SuccessView({ name }: { name: string }) {
  return (
    <div className="text-center animate-tab-in">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
        Ingecheckt
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-6xl md:text-8xl text-text leading-[1.02] tracking-[-0.02em] mb-6">
        Tot zo.
      </h1>
      <p className="text-text-muted text-xl">Veel plezier, {name}</p>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="text-center max-w-lg animate-tab-in">
      <span className="tmc-eyebrow block mb-4 text-[color:var(--danger)]">
        Even kijken
      </span>
      <p className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em]">
        {message}
      </p>
    </div>
  );
}
