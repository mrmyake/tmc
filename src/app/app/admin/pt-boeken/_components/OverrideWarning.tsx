"use client";

interface OverrideWarningProps {
  /** danger = terracotta (overlap), warning = amber (omkleedtijd). */
  tone: "danger" | "warning";
  title: string;
  detail: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  checkboxLabel: string;
}

const TONE_CLASS: Record<"danger" | "warning", string> = {
  danger: "border-[color:var(--danger)]/40 text-[color:var(--danger)]",
  warning: "border-[color:var(--warning)]/40 text-[color:var(--warning)]",
};

/**
 * PT-agenda C2: de twee losse override-meldingen (pt_overlap in
 * terracotta, pt_no_turnaround in amber). Beide vlaggen zijn per
 * handeling, admin-only (deze component wordt alleen gerenderd binnen
 * het al admin-gate'de scherm), en worden pas als true meegestuurd
 * zodra de bijbehorende checkbox is aangevinkt.
 */
export function OverrideWarning({
  tone,
  title,
  detail,
  checked,
  onCheckedChange,
  checkboxLabel,
}: OverrideWarningProps) {
  return (
    <div role="alert" className={`p-4 border text-sm ${TONE_CLASS[tone]}`}>
      <p className="font-medium mb-1">{title}</p>
      <p className="text-text-muted mb-3">{detail}</p>
      <label className="flex items-start gap-2 text-text cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="mt-0.5 cursor-pointer"
        />
        <span>{checkboxLabel}</span>
      </label>
    </div>
  );
}
