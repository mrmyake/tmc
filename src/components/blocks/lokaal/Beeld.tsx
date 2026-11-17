import Image from "next/image";
import type { BeeldConcept } from "@/content/lokaal";

interface BeeldProps {
  beeld: BeeldConcept | undefined;
  /** Tailwind-klassen voor positie (relative of absolute), afmeting en vorm. */
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Toon het label van een placeholder. */
  toonLabel?: boolean;
}

/**
 * Statische foto uit public/images/lokaal/ via next/image, of een warme
 * placeholder zolang er geen echte foto is. Een placeholder bestaat alleen bij
 * status 'concept' (zie de types); bij 'live' is het altijd een Foto met alt.
 */
export function Beeld({
  beeld,
  className = "",
  sizes = "100vw",
  priority = false,
  toonLabel = true,
}: BeeldProps) {
  if (beeld && "src" in beeld) {
    return (
      <div className={`overflow-hidden ${className}`}>
        <Image
          src={beeld.src}
          alt={beeld.alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{
        background:
          "radial-gradient(120% 80% at 70% 30%, rgba(185,152,106,0.35), transparent 60%), radial-gradient(90% 70% at 30% 90%, rgba(244,239,230,0.10), transparent 60%), linear-gradient(160deg, #3a2f26 0%, #1c1714 55%, #110e0c 100%)",
      }}
      role="img"
      aria-label={beeld ? beeld.label : "Foto volgt"}
    >
      {toonLabel && (
        <span className="absolute top-3 left-3 rounded-[3px] bg-bg/60 px-2 py-1 text-[10.5px] uppercase tracking-[0.06em] text-text/75">
          {beeld ? beeld.label : "Foto volgt"}
        </span>
      )}
    </div>
  );
}
