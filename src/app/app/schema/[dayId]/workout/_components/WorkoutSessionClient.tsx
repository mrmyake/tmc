"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkoutDay, LoggedSet } from "@/lib/member/workout-query";
import {
  completeWorkoutSession,
  deleteSetLog,
  logSet,
  startWorkoutSession,
} from "@/lib/member/workout-actions";
import {
  formatWeightForInput,
  parseRepsInput,
  parseWeightInput,
  WEIGHT_INVALID_COPY,
} from "@/lib/member/workout-input";
import { isStaleDeploymentError } from "@/lib/member/stale-deployment";
import { tempoNotation, tempoPlainLanguage } from "@/lib/training-tempo";
import { formatShortDate } from "@/lib/format-date";
import type { PreviousExerciseLog } from "@/lib/training-history/types";
import { formatSet } from "@/components/training-history/formatSet";

/**
 * Workout-logger met autosave (spec-trainingsprotocol.md PR 4 vervolg,
 * fix/workout-logging). Geen "Log set"-knop meer: een set wordt
 * opgeslagen zodra gewicht en reps allebei geldig zijn (600ms na de
 * laatste toets, of direct bij het verlaten van een veld). Beide velden
 * leegmaken van een opgeslagen set verwijdert hem (delete_set_log).
 *
 * Per rij: ruwe invoer (tekstvelden, komma en punt allebei goed), wat de
 * database volgens de client bevat (`stored`), en een fase (idle, saving,
 * error). De zichtbare status wordt daar bij het renderen uit afgeleid,
 * zie describeRow. Na elke voltooide save vergelijkt runSave de verstuurde
 * waarde met wat er nu in de velden staat en stuurt zo nodig opnieuw; zo
 * wint altijd de laatste veldwaarde, ongeacht de volgorde waarin
 * verzoeken de database bereiken.
 *
 * Afronden bevriest de invoer, vuurt alle openstaande debounces af, wacht
 * alle saves af en weigert zolang een geldige rij niet is opgeslagen.
 *
 * Veiligheidsnet: elke aanroep zit in try/catch, ingevulde waarden blijven
 * in de UI staan en gaan naar sessionStorage per sessie (database leidend
 * bij herladen). Herkent de fout een verouderde deployment, dan verschijnt
 * een banner met een herlaadknop.
 */

interface Props {
  day: WorkoutDay;
  initialSessionId: string | null;
  initialLoggedSets: LoggedSet[];
  /** Vorige-keer-referentie per program_exercise_id, uit training-history/aggregate.ts (gematcht op exercise_id). */
  previousLogs: Record<string, PreviousExerciseLog>;
}

interface StoredSet {
  weightKg: number;
  reps: number;
}

type RowPhase = "idle" | "saving" | "error";

interface RowState {
  weightRaw: string;
  repsRaw: string;
  /** Wat tmc.set_logs volgens de client bevat; null = geen rij. */
  stored: StoredSet | null;
  phase: RowPhase;
  /** Alleen bij phase "saving": opslaan of verwijderen. */
  savingKind: "save" | "delete" | null;
  errorMessage: string | null;
  /** De ene automatische retry is gebruikt; daarna alleen handmatig. */
  autoRetried: boolean;
  /** Na blur: een tussenstand ("82,") wel als melding tonen. */
  showIncomplete: boolean;
}

type Intent =
  | { kind: "none" }
  | { kind: "save"; weightKg: number; reps: number }
  | { kind: "delete" };

type DisplayStatus = "empty" | "incomplete" | "invalid" | "dirty" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 600;
const AUTO_RETRY_MS = 2000;

// COPY: confirm met Marlon
const COPY = {
  bodyweightHint: "Gewicht 0 betekent lichaamsgewicht.",
  savedRowPartial: "Vul beide velden in, of maak de rij leeg om de set te verwijderen.",
  saving: "Bezig met opslaan",
  deleting: "Bezig met verwijderen",
  saved: "Opgeslagen",
  saveFailed: "Opslaan mislukt",
  retry: "Opnieuw proberen",
  staleBanner:
    "De app is bijgewerkt. Herlaad de pagina om verder te gaan, je ingevulde waarden blijven bewaard.",
  reload: "Pagina herladen",
  completeNotAllSaved:
    "Niet alle sets konden worden opgeslagen. Kijk naar de gemarkeerde rijen en probeer het opnieuw.",
  completeFailed: "Afronden lukte niet. Probeer het opnieuw.",
  startFailed: "Workout starten lukte niet. Probeer het opnieuw.",
  confirmEmpty: "Er zijn nog geen sets opgeslagen. Toch afronden?",
  confirmNormal: "Workout afronden?",
  back: "Terug",
  finishAnyway: "Toch afronden",
  finish: "Afronden",
  completeButton: "Workout afronden",
  completeBusy: "Bezig met opslaan",
  startButton: "Start workout",
  startBusy: "Bezig",
  previous: "Vorige keer",
  neverLogged: "Nog niet eerder gelogd",
  sets: "sets",
  kgPlaceholder: "kg",
  repsPlaceholder: "reps",
};

function rowKey(programExerciseId: string, setNumber: number): string {
  return `${programExerciseId}:${setNumber}`;
}

function splitKey(key: string): { programExerciseId: string; setNumber: number } {
  const i = key.lastIndexOf(":");
  return { programExerciseId: key.slice(0, i), setNumber: Number(key.slice(i + 1)) };
}

function emptyRow(): RowState {
  return {
    weightRaw: "",
    repsRaw: "",
    stored: null,
    phase: "idle",
    savingKind: null,
    errorMessage: null,
    autoRetried: false,
    showIncomplete: false,
  };
}

function initialRows(day: WorkoutDay, logged: LoggedSet[]): Record<string, RowState> {
  const rows: Record<string, RowState> = {};
  for (const ex of day.exercises) {
    for (let n = 1; n <= ex.sets; n++) rows[rowKey(ex.id, n)] = emptyRow();
  }
  for (const s of logged) {
    rows[rowKey(s.programExerciseId, s.setNumber)] = {
      ...emptyRow(),
      weightRaw: formatWeightForInput(s.weightKg),
      repsRaw: String(s.reps),
      stored: { weightKg: s.weightKg, reps: s.reps },
    };
  }
  return rows;
}

/** Wat er met deze rij moet gebeuren, puur uit invoer en stored. */
function intentOf(row: RowState): Intent {
  const w = parseWeightInput(row.weightRaw);
  const r = parseRepsInput(row.repsRaw);
  if (w.kind === "empty" && r.kind === "empty") {
    return row.stored ? { kind: "delete" } : { kind: "none" };
  }
  if (w.kind !== "valid" || r.kind !== "valid") return { kind: "none" };
  if (row.stored && row.stored.weightKg === w.value && row.stored.reps === r.value) {
    return { kind: "none" };
  }
  return { kind: "save", weightKg: w.value, reps: r.value };
}

/** Zichtbare status en melding, puur uit de rij. */
function describeRow(row: RowState): { status: DisplayStatus; message: string | null } {
  if (row.phase === "saving") return { status: "saving", message: null };
  if (row.phase === "error") return { status: "error", message: row.errorMessage };

  const w = parseWeightInput(row.weightRaw);
  const r = parseRepsInput(row.repsRaw);

  if (w.kind === "empty" && r.kind === "empty") {
    // Beide leeg op een opgeslagen rij: de delete staat klaar (dirty).
    return { status: row.stored ? "dirty" : "empty", message: null };
  }
  if (w.kind === "invalid") return { status: "invalid", message: w.message };
  if (r.kind === "invalid") return { status: "invalid", message: r.message };
  if (w.kind === "incomplete") {
    return { status: "incomplete", message: row.showIncomplete ? WEIGHT_INVALID_COPY : null };
  }
  if (w.kind === "empty" || r.kind === "empty") {
    // Eén veld leeg, het andere gevuld.
    return row.stored
      ? { status: "invalid", message: COPY.savedRowPartial }
      : { status: "incomplete", message: null };
  }
  if (w.kind !== "valid" || r.kind !== "valid") {
    return { status: "incomplete", message: null };
  }
  if (row.stored && row.stored.weightKg === w.value && row.stored.reps === r.value) {
    return { status: "saved", message: null };
  }
  return { status: "dirty", message: null };
}

function draftKey(sessionId: string): string {
  return `tmc-workout-draft:${sessionId}`;
}

type Draft = Record<string, { weightRaw: string; repsRaw: string }>;

function readDraft(sessionId: string): Draft {
  try {
    const raw = window.sessionStorage.getItem(draftKey(sessionId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Draft) : {};
  } catch {
    return {};
  }
}

function writeDraft(sessionId: string, rows: Record<string, RowState>): void {
  try {
    const draft: Draft = {};
    for (const [key, row] of Object.entries(rows)) {
      const storedW = row.stored ? formatWeightForInput(row.stored.weightKg) : "";
      const storedR = row.stored ? String(row.stored.reps) : "";
      if (row.weightRaw.trim() !== storedW || row.repsRaw.trim() !== storedR) {
        draft[key] = { weightRaw: row.weightRaw, repsRaw: row.repsRaw };
      }
    }
    if (Object.keys(draft).length === 0) {
      window.sessionStorage.removeItem(draftKey(sessionId));
    } else {
      window.sessionStorage.setItem(draftKey(sessionId), JSON.stringify(draft));
    }
  } catch {
    // sessionStorage kan ontbreken of vol zijn; de UI houdt de waarden zelf.
  }
}

function clearDraft(sessionId: string): void {
  try {
    window.sessionStorage.removeItem(draftKey(sessionId));
  } catch {
    // zie writeDraft
  }
}

function clearTimer(map: Map<string, ReturnType<typeof setTimeout>>, key: string) {
  const t = map.get(key);
  if (t) {
    clearTimeout(t);
    map.delete(key);
  }
}

export function WorkoutSessionClient({
  day,
  initialSessionId,
  initialLoggedSets,
  previousLogs,
}: Props) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [rows, setRowsState] = useState<Record<string, RowState>>(() =>
    initialRows(day, initialLoggedSets),
  );
  // Spiegel van rows die synchroon bijblijft, voor de async save-logica.
  const rowsRef = useRef(rows);
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const retryTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlightRef = useRef(new Map<string, Promise<void>>());
  const restoredForRef = useRef<string | null>(null);
  // runSave verwijst naar zichzelf (convergentie) en naar handleFailure
  // (retry); via een ref, zodat de useCallbacks geen cirkel vormen.
  const runSaveRef = useRef<(key: string) => Promise<void>>(async () => {});

  const [staleDeployment, setStaleDeployment] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"empty" | "normal" | null>(null);
  const [completeMessage, setCompleteMessage] = useState<string | null>(null);

  const patchRow = useCallback((key: string, patch: Partial<RowState>) => {
    const current = rowsRef.current[key] ?? emptyRow();
    const next = { ...rowsRef.current, [key]: { ...current, ...patch } };
    rowsRef.current = next;
    setRowsState(next);
  }, []);

  // Concept in sessionStorage bijhouden (try/catch binnenin).
  useEffect(() => {
    if (sessionId) writeDraft(sessionId, rows);
  }, [rows, sessionId]);

  const handleFailure = useCallback(
    (key: string, err: unknown, fallbackMessage: string) => {
      const row = rowsRef.current[key];
      const stale = isStaleDeploymentError(err);
      if (stale) setStaleDeployment(true);
      const message = typeof err === "string" ? err : fallbackMessage;
      patchRow(key, {
        phase: "error",
        savingKind: null,
        errorMessage: message,
        autoRetried: stale ? true : (row?.autoRetried ?? false),
      });
      // Eén automatische herhaling na een korte vertraging; daarna handmatig.
      // Bij een verouderde deployment heeft herhalen geen zin.
      if (!stale && row && !row.autoRetried) {
        clearTimer(retryTimersRef.current, key);
        retryTimersRef.current.set(
          key,
          setTimeout(() => {
            retryTimersRef.current.delete(key);
            void runSaveRef.current(key);
          }, AUTO_RETRY_MS),
        );
      }
    },
    [patchRow],
  );

  const doSave = useCallback(
    async (key: string): Promise<void> => {
      const currentSessionId = sessionIdRef.current;
      const row = rowsRef.current[key];
      if (!currentSessionId || !row) return;
      const intent = intentOf(row);
      if (intent.kind === "none") return;

      const { programExerciseId, setNumber } = splitKey(key);
      patchRow(key, { phase: "saving", savingKind: intent.kind, errorMessage: null });

      try {
        if (intent.kind === "save") {
          const res = await logSet({
            sessionId: currentSessionId,
            programExerciseId,
            setNumber,
            weightKg: intent.weightKg,
            reps: intent.reps,
          });
          if (!res.ok) {
            handleFailure(key, res.message, COPY.saveFailed);
            return;
          }
          patchRow(key, {
            stored: { weightKg: intent.weightKg, reps: intent.reps },
            phase: "idle",
            savingKind: null,
            errorMessage: null,
            autoRetried: false,
          });
        } else {
          const res = await deleteSetLog({
            sessionId: currentSessionId,
            programExerciseId,
            setNumber,
          });
          if (!res.ok) {
            handleFailure(key, res.message, COPY.saveFailed);
            return;
          }
          patchRow(key, {
            stored: null,
            phase: "idle",
            savingKind: null,
            errorMessage: null,
            autoRetried: false,
          });
        }
      } catch (err) {
        console.error("[WorkoutSessionClient] save failed", err);
        handleFailure(key, err, COPY.saveFailed);
      }
    },
    [patchRow, handleFailure],
  );

  const runSave = useCallback(
    (key: string): Promise<void> => {
      const existing = inFlightRef.current.get(key);
      if (existing) return existing;
      const p = (async () => {
        try {
          await doSave(key);
        } finally {
          inFlightRef.current.delete(key);
        }
        // Convergentie: is er tijdens het opslaan een nieuwere waarde getypt?
        const after = rowsRef.current[key];
        if (after && after.phase !== "error" && intentOf(after).kind !== "none") {
          await runSaveRef.current(key);
        }
      })();
      inFlightRef.current.set(key, p);
      return p;
    },
    [doSave],
  );
  // Vóór de effects hieronder (declaratievolgorde), zodat retry en
  // convergentie altijd de actuele runSave zien.
  useEffect(() => {
    runSaveRef.current = runSave;
  }, [runSave]);

  const schedule = useCallback(
    (key: string) => {
      clearTimer(timersRef.current, key);
      const row = rowsRef.current[key];
      if (!row || intentOf(row).kind === "none") return;
      timersRef.current.set(
        key,
        setTimeout(() => {
          timersRef.current.delete(key);
          void runSave(key);
        }, DEBOUNCE_MS),
      );
    },
    [runSave],
  );

  const flush = useCallback(
    (key: string) => {
      clearTimer(timersRef.current, key);
      const row = rowsRef.current[key];
      if (row && intentOf(row).kind !== "none") void runSave(key);
    },
    [runSave],
  );

  // Concept terugzetten na herladen: alleen rijen die de server niet als
  // opgeslagen teruggeeft (database leidend), daarna autosave.
  useEffect(() => {
    if (!sessionId || restoredForRef.current === sessionId) return;
    restoredForRef.current = sessionId;
    const draft = readDraft(sessionId);
    const keys: string[] = [];
    for (const [key, d] of Object.entries(draft)) {
      const row = rowsRef.current[key];
      if (!row || row.stored) continue;
      if (row.weightRaw !== "" || row.repsRaw !== "") continue;
      patchRow(key, { weightRaw: d.weightRaw ?? "", repsRaw: d.repsRaw ?? "" });
      keys.push(key);
    }
    for (const key of keys) schedule(key);
  }, [sessionId, patchRow, schedule]);

  useEffect(() => {
    const timers = timersRef.current;
    const retries = retryTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      for (const t of retries.values()) clearTimeout(t);
    };
  }, []);

  function onChange(key: string, field: "weightRaw" | "repsRaw", value: string) {
    if (completing) return;
    clearTimer(retryTimersRef.current, key);
    const row = rowsRef.current[key] ?? emptyRow();
    const wasError = row.phase === "error";
    patchRow(key, {
      [field]: value,
      showIncomplete: false,
      // Een nieuwe toets na een fout: weer een gewone rij.
      phase: wasError ? "idle" : row.phase,
      errorMessage: wasError ? null : row.errorMessage,
    });
    schedule(key);
  }

  function onBlur(key: string) {
    patchRow(key, { showIncomplete: true });
    flush(key);
  }

  function onRetry(key: string) {
    clearTimer(retryTimersRef.current, key);
    patchRow(key, { phase: "idle", errorMessage: null });
    flush(key);
  }

  async function handleStart() {
    if (starting) return;
    setStartError(null);
    setStarting(true);
    try {
      const res = await startWorkoutSession(day.id);
      if (res.ok) {
        setSessionId(res.sessionId);
      } else {
        setStartError(res.message);
      }
    } catch (err) {
      console.error("[WorkoutSessionClient] start failed", err);
      if (isStaleDeploymentError(err)) setStaleDeployment(true);
      setStartError(COPY.startFailed);
    } finally {
      setStarting(false);
    }
  }

  async function handleComplete() {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId || completing) return;
    setCompleting(true);
    setCompleteMessage(null);

    // 1. Alle openstaande debounces en retries direct afvuren.
    for (const key of Object.keys(rowsRef.current)) {
      clearTimer(timersRef.current, key);
      clearTimer(retryTimersRef.current, key);
      const row = rowsRef.current[key];
      if (row && intentOf(row).kind !== "none") void runSave(key);
    }

    // 2. Alles afwachten, ook saves die door convergentie zijn bijgekomen.
    while (inFlightRef.current.size > 0) {
      await Promise.all(Array.from(inFlightRef.current.values()));
    }

    // 3. Staat er nog een geldige, niet opgeslagen rij of een fout?
    const unsaved = Object.values(rowsRef.current).filter(
      (row) => row.phase === "error" || intentOf(row).kind !== "none",
    );
    if (unsaved.length > 0) {
      setCompleteMessage(COPY.completeNotAllSaved);
      setCompleting(false);
      return;
    }

    // 4. Bevestigen; invoer blijft bevroren tot Terug of Afronden.
    const savedCount = Object.values(rowsRef.current).filter((row) => row.stored).length;
    setConfirmMode(savedCount === 0 ? "empty" : "normal");
  }

  function cancelConfirm() {
    setConfirmMode(null);
    setCompleting(false);
  }

  async function finishSession() {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return;
    setConfirmMode(null);
    try {
      const res = await completeWorkoutSession(currentSessionId);
      if (!res.ok) {
        setCompleteMessage(res.message);
        setCompleting(false);
        return;
      }
      clearDraft(currentSessionId);
      router.push("/app/schema");
    } catch (err) {
      console.error("[WorkoutSessionClient] complete failed", err);
      if (isStaleDeploymentError(err)) setStaleDeployment(true);
      setCompleteMessage(COPY.completeFailed);
      setCompleting(false);
    }
  }

  const inputClass =
    "w-20 bg-bg border border-[color:var(--ink-500)] px-2 py-1.5 text-sm text-text disabled:opacity-60";

  return (
    <div>
      {staleDeployment && (
        <div
          role="alert"
          className="mb-8 px-5 py-4 border border-[color:var(--warning)]/60 bg-bg-elevated text-sm text-text flex flex-wrap items-center justify-between gap-3"
        >
          {/* COPY: confirm met Marlon */}
          <span>{COPY.staleBanner}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] border border-accent text-accent hover:bg-accent hover:text-bg transition-colors cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            {COPY.reload}
          </button>
        </div>
      )}

      <header className="mb-10">
        {/* COPY: confirm met Marlon */}
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Workout
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em] mb-6">
          {/* COPY: confirm met Marlon */}
          Dag {day.dayNumber}
          {day.label ? `: ${day.label}` : ""}
        </h1>

        {!sessionId && (
          <div>
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              {starting ? COPY.startBusy : COPY.startButton}
            </button>
            {startError && (
              <p className="text-[color:var(--danger)] text-sm mt-3">{startError}</p>
            )}
          </div>
        )}
      </header>

      <div className="flex flex-col gap-10">
        {day.exercises.map((ex) => (
          <section
            key={ex.id}
            className="border border-[color:var(--ink-500)] bg-bg-elevated"
          >
            <header className="px-6 py-4 border-b border-[color:var(--ink-500)]/60">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-accent font-medium tabular-nums text-sm">
                  {ex.slot}
                </span>
                <span className="text-text font-medium">{ex.exerciseName}</span>
              </div>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-xs">
                {ex.repsMin === ex.repsMax ? ex.repsMin : `${ex.repsMin}-${ex.repsMax}`}{" "}
                reps · Tempo{" "}
                {tempoNotation(
                  ex.tempoEccentric,
                  ex.tempoPauseBottom,
                  ex.tempoConcentric,
                  ex.tempoPauseTop,
                )}{" "}
                · Rust {ex.restSeconds}s
              </p>
              <p className="text-text-muted text-xs mt-1">
                {tempoPlainLanguage(
                  ex.tempoEccentric,
                  ex.tempoPauseBottom,
                  ex.tempoConcentric,
                  ex.tempoPauseTop,
                )}
              </p>
            </header>

            {sessionId && (
              <div className="px-6 py-5 flex flex-col gap-3">
                {(() => {
                  const prevLog = previousLogs[ex.id];
                  return (
                    <div className="flex items-baseline justify-between gap-3 text-xs text-text-muted -mt-1 mb-1">
                      {/* COPY: confirm met Marlon */}
                      <span>
                        {prevLog ? (
                          <>
                            {COPY.previous}: {formatShortDate(new Date(prevLog.startedAt))}
                            {prevLog.isArchivedVersion ? `, versie ${prevLog.programVersion}` : ""}
                          </>
                        ) : (
                          COPY.neverLogged
                        )}
                      </span>
                      {prevLog && (
                        <span>
                          {prevLog.sets.length} {COPY.sets}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {Array.from({ length: ex.sets }, (_, i) => i + 1).map((setNumber) => {
                  const key = rowKey(ex.id, setNumber);
                  const row = rows[key] ?? emptyRow();
                  const { status, message } = describeRow(row);
                  const prev = previousLogs[ex.id]?.sets.find((s) => s.setNumber === setNumber);
                  return (
                    <div key={key} className="flex flex-wrap items-center gap-3">
                      {/* COPY: confirm met Marlon */}
                      <span className="text-text-muted text-xs w-14 shrink-0">
                        Set {setNumber}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        // COPY: confirm met Marlon
                        placeholder={COPY.kgPlaceholder}
                        aria-label={`Set ${setNumber} gewicht in kg`}
                        value={row.weightRaw}
                        disabled={completing}
                        onChange={(e) => onChange(key, "weightRaw", e.target.value)}
                        onBlur={() => onBlur(key)}
                        className={inputClass}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        // COPY: confirm met Marlon
                        placeholder={COPY.repsPlaceholder}
                        aria-label={`Set ${setNumber} reps`}
                        value={row.repsRaw}
                        disabled={completing}
                        onChange={(e) => onChange(key, "repsRaw", e.target.value)}
                        onBlur={() => onBlur(key)}
                        className={inputClass}
                      />
                      <RowStatus
                        status={status}
                        savingKind={row.savingKind}
                        disabled={completing}
                        onRetry={() => onRetry(key)}
                      />
                      {prev && (
                        // COPY: confirm met Marlon
                        <span className="text-text-muted text-xs">
                          {COPY.previous}: {formatSet(prev)}
                        </span>
                      )}
                      {message && (
                        <span className="text-[color:var(--danger)] text-xs w-full">
                          {message}
                        </span>
                      )}
                    </div>
                  );
                })}
                {/* COPY: confirm met Marlon */}
                <p className="text-text-muted/80 text-[11px] mt-1">{COPY.bodyweightHint}</p>
              </div>
            )}
          </section>
        ))}
      </div>

      {sessionId && (
        <div className="mt-10">
          {confirmMode ? (
            <div className="border border-[color:var(--ink-500)] bg-bg-elevated px-6 py-5">
              {/* COPY: confirm met Marlon */}
              <p className="text-text text-sm mb-4">
                {confirmMode === "empty" ? COPY.confirmEmpty : COPY.confirmNormal}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={cancelConfirm}
                  className="px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
                >
                  {/* COPY: confirm met Marlon */}
                  {COPY.back}
                </button>
                <button
                  type="button"
                  onClick={finishSession}
                  className="px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] bg-accent text-bg border border-accent hover:bg-accent-hover hover:border-accent-hover transition-colors cursor-pointer"
                >
                  {/* COPY: confirm met Marlon */}
                  {confirmMode === "empty" ? COPY.finishAnyway : COPY.finish}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              disabled={completing}
              className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              {completing ? COPY.completeBusy : COPY.completeButton}
            </button>
          )}
          {completeMessage && (
            <p className="text-[color:var(--danger)] text-sm mt-3">{completeMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}

function RowStatus({
  status,
  savingKind,
  disabled,
  onRetry,
}: {
  status: DisplayStatus;
  savingKind: "save" | "delete" | null;
  disabled: boolean;
  onRetry: () => void;
}) {
  const base = "text-[11px] font-medium uppercase tracking-[0.16em]";
  if (status === "saving") {
    // COPY: confirm met Marlon
    return (
      <span aria-live="polite" className={`${base} text-text-muted`}>
        {savingKind === "delete" ? COPY.deleting : COPY.saving}
      </span>
    );
  }
  if (status === "saved") {
    // COPY: confirm met Marlon
    return (
      <span aria-live="polite" className={`${base} text-accent`}>
        {COPY.saved}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        aria-live="polite"
        className={`${base} text-[color:var(--danger)] flex items-center gap-2`}
      >
        {/* COPY: confirm met Marlon */}
        {COPY.saveFailed}
        <button
          type="button"
          onClick={onRetry}
          disabled={disabled}
          className="underline underline-offset-2 normal-case tracking-normal text-text-muted hover:text-accent disabled:opacity-50 cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          {COPY.retry}
        </button>
      </span>
    );
  }
  return null;
}
