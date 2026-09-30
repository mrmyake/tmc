import type { ReactNode } from "react";

/**
 * Kop van het rooster met weergaveschakelaar: op mobiel en tablet staat de
 * schakelaar over volle breedte onder de titel, op desktop rechts op dezelfde
 * regel (spec-rooster-vrij-trainen.md).
 */
export function RoosterHeader({
  eyebrow,
  title,
  subtitle,
  switcher,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  switcher?: ReactNode;
}) {
  return (
    <header className="mb-10 lg:flex lg:items-end lg:justify-between lg:gap-10">
      <div>
        {eyebrow && <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">{eyebrow}</span>}
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 text-text-muted text-lg leading-relaxed max-w-xl">{subtitle}</p>
        )}
      </div>
      {switcher && <div className="mt-6 lg:mt-0 lg:w-[340px] lg:shrink-0">{switcher}</div>}
    </header>
  );
}
