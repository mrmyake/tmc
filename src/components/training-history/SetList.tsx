import { topSetValue } from "@/lib/training-history/aggregate";
import type { HistorySet } from "@/lib/training-history/types";
import { formatSet } from "./formatSet";

interface SetListProps {
  sets: HistorySet[];
  isBodyweight: boolean;
}

/**
 * Compacte set-notatie voor de historie ("82,5 kg x 8 · 82,5 kg x 7 ..."),
 * gedeeld tussen de per-oefening tabel (ExerciseHistory) en de
 * per-workout lijst (WorkoutHistory). De zwaarste set (of bij bodyweight
 * de set met de meeste reps) staat vetgedrukt.
 */
export function SetList({ sets, isBodyweight }: SetListProps) {
  if (sets.length === 0) {
    // COPY: confirm met Marlon
    return <span className="text-text-muted">Geen sets gelogd</span>;
  }

  const top = topSetValue(sets, isBodyweight);
  let boldIndex = sets.findIndex((s) => (isBodyweight ? s.reps : s.weightKg) === top);
  if (boldIndex === -1) boldIndex = 0;

  return (
    <>
      {sets.map((s, i) => (
        <span key={s.setNumber}>
          {i > 0 && " · "}
          {i === boldIndex ? (
            <b className="text-text font-medium">{formatSet(s)}</b>
          ) : (
            formatSet(s)
          )}
        </span>
      ))}
    </>
  );
}
