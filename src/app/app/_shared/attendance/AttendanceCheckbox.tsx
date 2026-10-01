"use client";

/**
 * Vinkje in de desktop-deelnemerslijst (AttendanceList en de proeflesrijen
 * in TrialBookingsBlock). Eigen bestand zodat beide componenten hetzelfde
 * vinkje gebruiken zonder elkaar te importeren.
 */
export function AttendanceCheckbox({
  id,
  label,
  checked,
  onChange,
  disabled,
  tone,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  const checkedColor =
    tone === "danger"
      ? "border-[color:var(--danger)] bg-[color:var(--danger)]/10 text-[color:var(--danger)]"
      : "border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]";
  return (
    <label
      htmlFor={id}
      className={`inline-flex items-center gap-2 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border transition-colors duration-300 cursor-pointer ${
        checked
          ? checkedColor
          : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      <span
        aria-hidden
        className={`w-3 h-3 border ${
          checked
            ? tone === "danger"
              ? "border-[color:var(--danger)] bg-[color:var(--danger)]"
              : "border-[color:var(--success)] bg-[color:var(--success)]"
            : "border-text-muted/60"
        }`}
      />
      {label}
    </label>
  );
}
