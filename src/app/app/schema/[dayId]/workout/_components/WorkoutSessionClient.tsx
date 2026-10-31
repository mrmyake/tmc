"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkoutDay, WorkoutExercise, LoggedSet } from "@/lib/member/workout-query";
import {
  completeWorkoutSession,
  deleteSetLog,
  logSet,
  startWorkoutSession,
} from "@/lib/member/workout-actions";
import { formatWeightForInput } from "@/lib/member/workout-input";
import { isStaleDeploymentError } from "@/lib/member/stale-deployment";
import { tempoNotation } from "@/lib/training-tempo";
import { formatWeekdayDate } from "@/lib/format-date";
import { deltaFromPrevious, type GhostSet } from "@/lib/member/workout-ghost";
import {
  canComplete,
  describeRow,
  effectiveValues,
  emptyRow,
  intentOf,
  materialize,
  rowFromStored,
  rowKey,
  splitKey,
  visualOf,
  type RowState,
} from "@/lib/member/workout-rows";
import {
  effectiveWeightStep,
  equipmentLabel,
  formatKg,
  stepReps,
  stepWeight,
} from "@/lib/equipment";
import { SetRow } from "./SetRow";
import { SetEditor } from "./SetEditor";
import { WorkoutProgressBar } from "./WorkoutProgressBar";

/**
 * Workout-logger met ghost values en autosave (spec-trainingsprotocol.md,
 * "Vervolg, autosave" en "Vervolg, vorige waarden").
 *
 * Per set toont de rij de waarden van vorige keer (of het startgewicht van
 * de coach) als ghost value. Het vinkje neemt ze over en zet de set op
 * gedaan (log_set met p_completed true). Tikken op gewicht of reps opent
 * een editor die bij het type materiaal past; elke wijziging gaat met
 * debounce als draft (p_completed false) naar de database, tenzij de set
 * al afgevinkt was. Een rij die nooit is aangeraakt wordt nooit
 * opgeslagen. Alleen afgevinkte sets komen in de historie.
 *
 * De rijlogica (intentOf, describeRow, materialize) staat in
 * src/lib/member/workout-rows.ts; dit bestand doet de orkestratie:
 * debounce, in-flight saves met convergentie (de laatste veldwaarde wint),
 * retry, sessionStorage als vangnet en afronden.
 */

export interface ExerciseGhosts {
  ghosts: Record<number, GhostSet>;
  previous: { startedAt: string; programVersion: number; isArchivedVersion: boolean } | null;
}

export interface PreviousSessionInfo {
  startedAt: string;
  daysAgo: number;
}

interface Props {
  day: WorkoutDay;
  initialSessionId: string | null;
  initialLoggedSets: LoggedSet[];
  /** Per program_exercise_id: ghost per setnummer en de bron-sessie. */
  ghostsByExercise: Record<string, ExerciseGhosts>;
  previousSession: PreviousSessionInfo | null;
}

const DEBOUNCE_MS = 600;
const AUTO_RETRY_MS = 2000;

// COPY: confirm met Marlon
const COPY = {
  eyebrow: "Workout",
  day: (n: number) => `Dag ${n}`,
  previous: (when: string, daysAgo: number) =>
    `Vorige keer: ${when}, ${
      daysAgo === 0 ? "vandaag" : daysAgo === 1 ? "1 dag geleden" : `${daysAgo} dagen geleden`
    }`,
  noPrevious: "Nieuw schema, nog geen eerdere sessie",
  explainer:
    "Grijze waarden zijn van vorige keer. Zelfde gedaan? Vink de set af. Iets anders? Tik op het gewicht of de reps.",
  target: (sets: number, min: number, max: number) =>
    `Doel ${sets} × ${min === max ? min : `${min}-${max}`}`,
  firstTimeWithStart: (kg: number) => `Eerste keer. Startgewicht van je coach: ${formatKg(kg)} kg`,
  firstTimeNoStart: (reps: number) =>
    `Geen startgewicht opgegeven. Kies een gewicht waarmee ${reps} reps net lukt.`,
  firstTimeBodyweight: "Eerste keer.",
  previousVersion: (v: number) => `vorige keer uit versie ${v}`,
  colSet: "Set",
  colPrevious: "Vorige",
  colKg: "Kg",
  colKgPerHand: "Kg/hand",
  colReps: "Reps",
  tempo: (notation: string, rest: number) => `Tempo ${notation} · Rust ${rest}s`,
  staleBanner:
    "De app is bijgewerkt. Herlaad de pagina om verder te gaan, je ingevulde waarden blijven bewaard.",
  reload: "Pagina herladen",
  completeNotAllSaved:
    "Niet alle sets konden worden opgeslagen. Kijk naar de gemarkeerde rijen en probeer het opnieuw.",
  completeFailed: "Afronden lukte niet. Probeer het opnieuw.",
  startFailed: "Workout starten lukte niet. Probeer het opnieuw.",
  saveFailed: "Opslaan mislukt",
  confirmEmpty: "Er zijn nog geen sets afgevinkt. Toch afronden?",
  confirmNormal: "Training afronden?",
  back: "Terug",
  finishAnyway: "Toch afronden",
  finish: "Afronden",
  completeButton: "Training afronden",
  completeBusy: "Bezig met opslaan",
  startButton: "Start workout",
  startBusy: "Bezig",
};

function initialRows(day: WorkoutDay, logged: LoggedSet[]): Record<string, RowState> {
  const rows: Record<string, RowState> = {};
  for (const ex of day.exercises) {
    for (let n = 1; n <= ex.sets; n++) rows[rowKey(ex.id, n)] = emptyRow();
  }
  for (const s of logged) {
    rows[rowKey(s.programExerciseId, s.setNumber)] = rowFromStored({
      weightKg: s.weightKg,
      reps: s.reps,
      completed: s.completedAt !== null,
      source: s.source,
    });
  }
  return rows;
}

function draftKey(sessionId: string): string {
  return `tmc-workout-draft:${sessionId}`;
}

type Draft = Record<string, { weightRaw: string; repsRaw: string; completed: boolean }>;

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
      const storedC = row.stored ? row.stored.completed : false;
      if (
        row.weightRaw.trim() !== storedW ||
        row.repsRaw.trim() !== storedR ||
        row.completed !== storedC
      ) {
        draft[key] = { weightRaw: row.weightRaw, repsRaw: row.repsRaw, completed: row.completed };
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
  ghostsByExercise,
  previousSession,
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

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [staleDeployment, setStaleDeployment] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"empty" | "normal" | null>(null);
  const [completeMessage, setCompleteMessage] = useState<string | null>(null);

  const ghostFor = useCallback(
    (key: string): GhostSet | undefined => {
      const { programExerciseId, setNumber } = splitKey(key);
      return ghostsByExercise[programExerciseId]?.ghosts[setNumber];
    },
    [ghostsByExercise],
  );

  const patchRow = useCallback((key: string, patch: Partial<RowState>) => {
    const current = rowsRef.current[key] ?? emptyRow();
    const next = { ...rowsRef.current, [key]: { ...current, ...patch } };
    rowsRef.current = next;
    setRowsState(next);
  }, []);

  // Concept in sessionStorage bijhouden (try/catch binnenin). De database
  // blijft leidend: bij herladen worden alleen rijen zonder opgeslagen
  // waarde uit het concept hersteld.
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
      const intent = intentOf(row, ghostFor(key));
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
            completed: intent.completed,
            source: intent.source,
          });
          if (!res.ok) {
            handleFailure(key, res.message, COPY.saveFailed);
            return;
          }
          patchRow(key, {
            stored: {
              weightKg: intent.weightKg,
              reps: intent.reps,
              completed: intent.completed,
              source: intent.source,
            },
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
    [patchRow, handleFailure, ghostFor],
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
        if (after && after.phase !== "error" && intentOf(after, ghostFor(key)).kind !== "none") {
          await runSaveRef.current(key);
        }
      })();
      inFlightRef.current.set(key, p);
      return p;
    },
    [doSave, ghostFor],
  );
  useEffect(() => {
    runSaveRef.current = runSave;
  }, [runSave]);

  const schedule = useCallback(
    (key: string) => {
      clearTimer(timersRef.current, key);
      const row = rowsRef.current[key];
      if (!row || intentOf(row, ghostFor(key)).kind === "none") return;
      timersRef.current.set(
        key,
        setTimeout(() => {
          timersRef.current.delete(key);
          void runSave(key);
        }, DEBOUNCE_MS),
      );
    },
    [runSave, ghostFor],
  );

  const flush = useCallback(
    (key: string) => {
      clearTimer(timersRef.current, key);
      const row = rowsRef.current[key];
      if (row && intentOf(row, ghostFor(key)).kind !== "none") void runSave(key);
    },
    [runSave, ghostFor],
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
      patchRow(key, {
        weightRaw: d.weightRaw ?? "",
        repsRaw: d.repsRaw ?? "",
        completed: d.completed === true,
      });
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

  /** Eerste aanraking van een rij: lege velden krijgen de ghost als tekst. */
  function touch(key: string): RowState {
    const row = rowsRef.current[key] ?? emptyRow();
    const wasError = row.phase === "error";
    clearTimer(retryTimersRef.current, key);
    const next: RowState = {
      ...row,
      ...materialize(row, ghostFor(key)),
      showIncomplete: false,
      phase: wasError ? "idle" : row.phase,
      errorMessage: wasError ? null : row.errorMessage,
    };
    return next;
  }

  function onChange(key: string, field: "weightRaw" | "repsRaw", value: string) {
    if (completing) return;
    const touched = touch(key);
    patchRow(key, { ...touched, [field]: value });
    schedule(key);
  }

  function onStepWeight(key: string, direction: 1 | -1) {
    if (completing) return;
    const touched = touch(key);
    const { programExerciseId } = splitKey(key);
    const ex = day.exercises.find((e) => e.id === programExerciseId);
    const step = effectiveWeightStep(ex?.equipment ?? null, ex?.weightStepKg);
    const current = effectiveValues(touched, ghostFor(key)).weightKg;
    patchRow(key, {
      ...touched,
      weightRaw: formatWeightForInput(stepWeight(current, step, direction)),
    });
    schedule(key);
  }

  function onPickWeight(key: string, kg: number) {
    if (completing) return;
    const touched = touch(key);
    patchRow(key, { ...touched, weightRaw: formatWeightForInput(kg) });
    schedule(key);
  }

  function onStepReps(key: string, direction: 1 | -1) {
    if (completing) return;
    const touched = touch(key);
    const current = effectiveValues(touched, ghostFor(key)).reps;
    patchRow(key, { ...touched, repsRaw: String(stepReps(current, direction)) });
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

  /** Vinkje: getoonde waarden overnemen en afvinken; nog eens tikken zet terug. */
  function onToggle(key: string) {
    if (completing) return;
    const row = rowsRef.current[key] ?? emptyRow();
    const ghost = ghostFor(key);
    if (row.completed) {
      patchRow(key, { ...touch(key), completed: false });
    } else {
      if (!canComplete(row, ghost)) return;
      patchRow(key, { ...touch(key), completed: true });
      if (openKey === key) setOpenKey(null);
    }
    flush(key);
  }

  function onOpen(key: string) {
    if (completing) return;
    setOpenKey((k) => (k === key ? null : key));
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
    setOpenKey(null);

    // 1. Alle openstaande debounces en retries direct afvuren (drafts mee).
    for (const key of Object.keys(rowsRef.current)) {
      clearTimer(timersRef.current, key);
      clearTimer(retryTimersRef.current, key);
      const row = rowsRef.current[key];
      if (row && intentOf(row, ghostFor(key)).kind !== "none") void runSave(key);
    }

    // 2. Alles afwachten, ook saves die door convergentie zijn bijgekomen.
    while (inFlightRef.current.size > 0) {
      await Promise.all(Array.from(inFlightRef.current.values()));
    }

    // 3. Staat er nog een geldige, niet opgeslagen rij of een fout?
    const unsaved = Object.entries(rowsRef.current).filter(
      ([key, row]) => row.phase === "error" || intentOf(row, ghostFor(key)).kind !== "none",
    );
    if (unsaved.length > 0) {
      setCompleteMessage(COPY.completeNotAllSaved);
      setCompleting(false);
      return;
    }

    // 4. Bevestigen; invoer blijft bevroren tot Terug of Afronden.
    const doneCount = Object.values(rowsRef.current).filter((row) => row.completed).length;
    setConfirmMode(doneCount === 0 ? "empty" : "normal");
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

  // Voortgang: afgevinkte sets, en hoeveel daarvan afwijken van vorige keer.
  const allKeys = Object.keys(rows);
  const doneCount = allKeys.filter((k) => rows[k].completed).length;
  const editedCount = allKeys.filter((k) => {
    const row = rows[k];
    if (!row.completed) return false;
    const v = effectiveValues(row, ghostFor(k));
    if (v.weightKg === null || v.reps === null) return false;
    return deltaFromPrevious(ghostFor(k), v.weightKg, v.reps) !== null;
  }).length;

  return (
    <div>
      {staleDeployment && (
        <div
          role="alert"
          className="mb-8 px-5 py-4 rounded-[8px] border border-[color:var(--warning)]/60 bg-bg-elevated text-sm text-text flex flex-wrap items-center justify-between gap-3"
        >
          <span>{COPY.staleBanner}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 px-4 rounded-[4px] text-[11px] font-medium uppercase tracking-[0.16em] border border-accent text-accent hover:bg-accent hover:text-bg transition-colors cursor-pointer"
          >
            {COPY.reload}
          </button>
        </div>
      )}

      <header className="mb-8">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">{COPY.eyebrow}</span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em] mb-3">
          {COPY.day(day.dayNumber)}
          {day.label ? `: ${day.label}` : ""}
        </h1>
        <p className="text-text-muted text-sm">
          {previousSession
            ? COPY.previous(
                formatWeekdayDate(new Date(previousSession.startedAt)),
                previousSession.daysAgo,
              )
            : COPY.noPrevious}
        </p>

        {!sessionId && (
          <div className="mt-6">
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              className="inline-flex items-center justify-center min-h-11 px-7 rounded-[4px] text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {starting ? COPY.startBusy : COPY.startButton}
            </button>
            {startError && (
              <p className="text-[color:var(--danger)] text-sm mt-3">{startError}</p>
            )}
          </div>
        )}
      </header>

      {sessionId && (
        <p className="mb-6 text-sm text-text-muted leading-relaxed">{COPY.explainer}</p>
      )}

      <div className="flex flex-col gap-6">
        {day.exercises.map((ex) => (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            sessionActive={sessionId !== null}
            ghosts={ghostsByExercise[ex.id]}
            rows={rows}
            openKey={openKey}
            disabled={completing}
            onOpen={onOpen}
            onToggle={onToggle}
            onRetry={onRetry}
            onChange={onChange}
            onBlur={onBlur}
            onStepWeight={onStepWeight}
            onStepReps={onStepReps}
            onPickWeight={onPickWeight}
          />
        ))}
      </div>

      {sessionId && (
        <div className="mt-10 flex flex-col gap-6">
          <WorkoutProgressBar done={doneCount} total={allKeys.length} edited={editedCount} />

          {confirmMode ? (
            <div className="rounded-[8px] border border-[color:var(--ink-500)] bg-bg-elevated px-5 py-5">
              <p className="text-text text-sm mb-4">
                {confirmMode === "empty" ? COPY.confirmEmpty : COPY.confirmNormal}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={cancelConfirm}
                  className="min-h-11 px-5 rounded-[4px] text-[11px] font-medium uppercase tracking-[0.16em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
                >
                  {COPY.back}
                </button>
                <button
                  type="button"
                  onClick={finishSession}
                  className="min-h-11 px-5 rounded-[4px] text-[11px] font-medium uppercase tracking-[0.16em] bg-accent text-bg border border-accent hover:bg-accent-hover hover:border-accent-hover transition-colors cursor-pointer"
                >
                  {confirmMode === "empty" ? COPY.finishAnyway : COPY.finish}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              disabled={completing}
              className="inline-flex items-center justify-center min-h-11 px-7 rounded-[4px] text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {completing ? COPY.completeBusy : COPY.completeButton}
            </button>
          )}
          {completeMessage && (
            <p className="text-[color:var(--danger)] text-sm">{completeMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface ExerciseCardProps {
  exercise: WorkoutExercise;
  sessionActive: boolean;
  ghosts: ExerciseGhosts | undefined;
  rows: Record<string, RowState>;
  openKey: string | null;
  disabled: boolean;
  onOpen: (key: string) => void;
  onToggle: (key: string) => void;
  onRetry: (key: string) => void;
  onChange: (key: string, field: "weightRaw" | "repsRaw", value: string) => void;
  onBlur: (key: string) => void;
  onStepWeight: (key: string, direction: 1 | -1) => void;
  onStepReps: (key: string, direction: 1 | -1) => void;
  onPickWeight: (key: string, kg: number) => void;
}

function ExerciseCard({
  exercise: ex,
  sessionActive,
  ghosts,
  rows,
  openKey,
  disabled,
  onOpen,
  onToggle,
  onRetry,
  onChange,
  onBlur,
  onStepWeight,
  onStepReps,
  onPickWeight,
}: ExerciseCardProps) {
  const isBodyweight = ex.equipment === "bodyweight";
  const stepKg = effectiveWeightStep(ex.equipment, ex.weightStepKg);
  const setNumbers = Array.from({ length: ex.sets }, (_, i) => i + 1);

  // Bodyweight: de kg-kolom alleen als er ergens extra gewicht in het spel is.
  const showWeightColumn =
    !isBodyweight ||
    setNumbers.some((n) => {
      const key = rowKey(ex.id, n);
      const v = effectiveValues(rows[key] ?? emptyRow(), ghosts?.ghosts[n]);
      return v.weightKg !== null && v.weightKg > 0;
    });

  const previous = ghosts?.previous ?? null;
  const firstGhost = ghosts?.ghosts[1];
  const firstTimeLine = previous
    ? previous.isArchivedVersion
      ? COPY.previousVersion(previous.programVersion)
      : null
    : isBodyweight
      ? COPY.firstTimeBodyweight
      : firstGhost && firstGhost.weightKg !== null
        ? COPY.firstTimeWithStart(firstGhost.weightKg)
        : COPY.firstTimeNoStart(ex.repsMin);

  const gridCols = showWeightColumn
    ? "grid-cols-[2rem_minmax(0,1fr)_4rem_3.5rem_2.75rem]"
    : "grid-cols-[2rem_minmax(0,1fr)_3.5rem_2.75rem]";

  return (
    <section className="rounded-[8px] border border-[color:var(--ink-500)] bg-bg-elevated">
      <header className="px-4 md:px-6 py-4 border-b border-[color:var(--ink-500)]/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5">
              <span className="text-accent font-medium tabular-nums text-xs">{ex.slot}</span>
              <span className="text-text font-medium leading-snug">{ex.exerciseName}</span>
            </div>
            <p className="text-text-muted text-xs mt-1 tabular-nums">
              {COPY.target(ex.sets, ex.repsMin, ex.repsMax)}
              {" · "}
              {COPY.tempo(
                tempoNotation(
                  ex.tempoEccentric,
                  ex.tempoPauseBottom,
                  ex.tempoConcentric,
                  ex.tempoPauseTop,
                ),
                ex.restSeconds,
              )}
            </p>
          </div>
          <span className="shrink-0 rounded-[4px] border border-[color:var(--ink-500)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-text-muted">
            {equipmentLabel(ex.equipment)}
          </span>
        </div>
        {sessionActive && firstTimeLine && (
          <p className="text-text-muted text-xs mt-2">{firstTimeLine}</p>
        )}
      </header>

      {sessionActive && (
        <div className="px-4 md:px-6 py-4 flex flex-col gap-2">
          <div
            className={`grid ${gridCols} gap-2 px-2 -mx-2 text-[10px] uppercase tracking-[0.14em] text-text-muted`}
          >
            <span>{COPY.colSet}</span>
            <span>{COPY.colPrevious}</span>
            {showWeightColumn && (
              <span className="text-center">
                {ex.equipment === "dumbbell" ? COPY.colKgPerHand : COPY.colKg}
              </span>
            )}
            <span className="text-center">{COPY.colReps}</span>
            <span />
          </div>

          {setNumbers.map((setNumber) => {
            const key = rowKey(ex.id, setNumber);
            const row = rows[key] ?? emptyRow();
            const ghost = ghosts?.ghosts[setNumber];
            const effective = effectiveValues(row, ghost);
            const { status, message } = describeRow(row);
            const delta =
              row.completed && effective.weightKg !== null && effective.reps !== null
                ? deltaFromPrevious(ghost, effective.weightKg, effective.reps)
                : null;
            const open = openKey === key;
            return (
              <SetRow
                key={key}
                setNumber={setNumber}
                equipment={ex.equipment}
                ghost={ghost}
                effective={effective}
                visual={visualOf(row)}
                status={status}
                savingKind={row.savingKind}
                message={message}
                completed={row.completed}
                canTick={canComplete(row, ghost)}
                showWeightColumn={showWeightColumn}
                open={open}
                disabled={disabled}
                delta={delta}
                onOpen={() => onOpen(key)}
                onToggle={() => onToggle(key)}
                onRetry={() => onRetry(key)}
              >
                <SetEditor
                  setNumber={setNumber}
                  equipment={ex.equipment}
                  stepKg={stepKg}
                  weightRaw={row.weightRaw}
                  repsRaw={row.repsRaw}
                  effective={effective}
                  completed={row.completed}
                  canTick={canComplete(row, ghost)}
                  disabled={disabled}
                  onWeightChange={(raw) => onChange(key, "weightRaw", raw)}
                  onRepsChange={(raw) => onChange(key, "repsRaw", raw)}
                  onStepWeight={(dir) => onStepWeight(key, dir)}
                  onStepReps={(dir) => onStepReps(key, dir)}
                  onPickWeight={(kg) => onPickWeight(key, kg)}
                  onBlur={() => onBlur(key)}
                  onTick={() => onToggle(key)}
                  onClose={() => onOpen(key)}
                />
              </SetRow>
            );
          })}
        </div>
      )}
    </section>
  );
}
