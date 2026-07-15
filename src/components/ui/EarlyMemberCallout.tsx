interface EarlyMemberCalloutProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Gedeelde Early Member-highlight-box. Treatment overgenomen van de
 * EarlyMemberContent.tsx-versie (translucent accent-wash): die werkt zowel
 * op lichte als donkere kaartachtergronden, in tegenstelling tot de
 * ConfigureStage-versie die met een ondoorzichtige bg-bg-vulling op een
 * lichte kaart een dicht blok zou vormen.
 */
export function EarlyMemberCallout({
  label,
  children,
  className = "",
}: EarlyMemberCalloutProps) {
  return (
    <div
      className={`border border-accent/45 bg-accent/[0.07] px-4 py-3.5 flex flex-col gap-1.5 ${className}`}
    >
      <span className="text-accent text-[11px] font-semibold uppercase tracking-[0.16em]">
        {label}
      </span>
      {children}
    </div>
  );
}
