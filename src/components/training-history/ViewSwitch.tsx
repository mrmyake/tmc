import Link from "next/link";

export type HistoryView = "oefening" | "workout";

interface ViewSwitchProps {
  active: HistoryView;
  hrefFor: (view: HistoryView) => string;
}

/**
 * Schakelaar "Per oefening | Per workout", queryparam-gestuurd (geen
 * client state): werkt zo als server component op /app/schema/geschiedenis,
 * de admin-tab Historie en de trainer-klantpagina, met elk hun eigen
 * hrefFor-basis.
 */
export function ViewSwitch({ active, hrefFor }: ViewSwitchProps) {
  const options: Array<{ key: HistoryView; label: string }> = [
    // COPY: confirm met Marlon
    { key: "oefening", label: "Per oefening" },
    // COPY: confirm met Marlon
    { key: "workout", label: "Per workout" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Weergave"
      className="grid grid-cols-2 gap-1 p-1 mb-6 bg-bg border border-[color:var(--ink-500)]"
    >
      {options.map((o) => {
        const isActive = active === o.key;
        return (
          <Link
            key={o.key}
            href={hrefFor(o.key)}
            role="tab"
            aria-selected={isActive}
            className={`text-center py-2.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-bg-elevated text-text shadow-[inset_0_0_0_1px_var(--accent)]"
                : "text-text-muted hover:text-text"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
