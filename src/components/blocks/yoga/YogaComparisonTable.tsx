import Link from "next/link";
import { YOGA_INTENSITY_MAX } from "@/lib/yoga";
import type { SanityYogaStyle } from "../../../../sanity/lib/fetch";

interface Props {
  styles: SanityYogaStyle[];
}

/**
 * Vergelijkingstabel van de yoga-vormen op de as rust → actief. De vormen
 * worden al op `intensity` gesorteerd door de GROQ-query, dus we renderen
 * ze in volgorde met een intensiteitsmeter per rij.
 */
export function YogaComparisonTable({ styles }: Props) {
  if (!styles.length) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <span className="tmc-eyebrow text-text-muted">Rust</span>
        <span
          aria-hidden
          className="mx-4 h-px flex-1 bg-gradient-to-r from-bg-elevated via-accent/40 to-bg-elevated"
        />
        <span className="tmc-eyebrow text-text-muted">Actief</span>
      </div>

      <div className="border-t border-bg-elevated">
        {styles.map((style) => (
          <Link
            key={style._id}
            href={`/yoga/${style.slug}`}
            className="group block border-b border-bg-elevated py-6 transition-colors hover:bg-bg-elevated/40"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 md:items-center">
              <div className="md:col-span-3">
                <h3 className="font-[family-name:var(--font-playfair)] text-2xl text-text group-hover:text-accent transition-colors tracking-[-0.01em]">
                  {style.title}
                </h3>
              </div>

              <div className="md:col-span-3">
                <div
                  className="flex gap-1.5"
                  role="img"
                  aria-label={`Intensiteit ${style.intensity} van ${YOGA_INTENSITY_MAX}`}
                >
                  {Array.from({ length: YOGA_INTENSITY_MAX }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${
                        i < style.intensity ? "bg-accent" : "bg-bg-elevated"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="md:col-span-5">
                <p className="text-text-muted text-sm leading-relaxed">
                  {style.shortDescription ?? style.definition}
                </p>
              </div>

              <div className="hidden md:block md:col-span-1 text-right">
                <span
                  aria-hidden
                  className="tmc-eyebrow text-text-muted group-hover:text-accent transition-colors"
                >
                  →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
