export interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  /**
   * Visual size preset.
   * `lg` (default): padded, large Playfair number. Used on B1 member
   *   dashboard hero tiles.
   * `md`: compact with subtle border. Used on admin/trainer dashboards
   *   where several tiles sit side-by-side with more density.
   */
  size?: "lg" | "md";
  /** Optional value color tone — useful when a stat tile is itself a
   *  status signal (approved/failed/warning). */
  tone?: "default" | "success" | "warning" | "danger";
}

const TONE_CLASS: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "text-text",
  success: "text-[color:var(--success)]",
  warning: "text-[color:var(--warning)]",
  danger: "text-[color:var(--danger)]",
};

export function StatTile({
  label,
  value,
  hint,
  size = "lg",
  tone = "default",
}: StatTileProps) {
  if (size === "md") {
    return (
      <div className="bg-bg-elevated p-5 border border-[color:var(--ink-500)]">
        <span className="tmc-eyebrow block mb-2">{label}</span>
        <p
          className={`font-[family-name:var(--font-playfair)] text-3xl md:text-4xl leading-none tracking-[-0.02em] mb-1 ${TONE_CLASS[tone]}`}
        >
          {value}
        </p>
        {hint && (
          <p className="text-[11px] text-text-muted uppercase tracking-[0.14em]">
            {hint}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="bg-bg-elevated p-8">
      <span className="tmc-eyebrow block mb-4">{label}</span>
      <p
        className={`font-[family-name:var(--font-playfair)] text-4xl md:text-5xl leading-none tracking-[-0.02em] ${TONE_CLASS[tone]}`}
      >
        {value}
      </p>
      {hint && <p className="mt-3 text-text-muted text-sm">{hint}</p>}
    </div>
  );
}
