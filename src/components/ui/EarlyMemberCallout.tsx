interface EarlyMemberCalloutProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  /**
   * True voor plekken waar de box tussen doorlopende tekst staat en zich
   * naar zijn eigen inhoud moet voegen (zoals de content-breedte badge
   * ernaast), i.p.v. de volledige breedte van zijn flex-container in te
   * nemen. Zie ConfigureStage.tsx's renderFeaturedCard(): die box stond
   * vóór migratie op inline-block, niet op block.
   */
  inline?: boolean;
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
  inline = false,
}: EarlyMemberCalloutProps) {
  return (
    <div
      className={`${inline ? "inline-flex" : "flex"} flex-col gap-1.5 border border-accent/45 bg-accent/[0.07] px-4 py-3.5 ${className}`}
    >
      <span className="text-accent text-[11px] font-semibold uppercase tracking-[0.16em]">
        {label}
      </span>
      {children}
    </div>
  );
}
