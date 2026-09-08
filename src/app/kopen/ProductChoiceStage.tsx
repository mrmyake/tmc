"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatEuro } from "@/lib/format";
import { trackBeginCheckout } from "@/lib/analytics";
import type { CatalogueRow } from "@/lib/catalogue";
import { PRODUCT_DESCRIPTIONS, PRODUCT_GROUPS } from "@/lib/product-groups";

interface Props {
  products: Record<string, CatalogueRow>;
  initial: CatalogueRow | null;
  onContinue: (product: CatalogueRow) => void;
}

/**
 * Stap 01 van /kopen. Gemodelleerd op KopenPanel (/app/producten): zelfde
 * groepen, zelfde kaarten, zelfde copy per slug; alleen "Koop" is hier
 * "Kies", en het doorgaan zit in een losse knop onderaan. Bewust niet op
 * ConfigureStage gemodelleerd: geen families, geen frequenties, geen
 * toggles, geen breakdown. De prijs op de kaart is letterlijk
 * catalogue.price_cents; er wordt hier niets berekend.
 */
export function ProductChoiceStage({ products, initial, onContinue }: Props) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    initial?.slug ?? null,
  );
  const selected = selectedSlug ? (products[selectedSlug] ?? null) : null;

  const groups = PRODUCT_GROUPS.map((group) => ({
    ...group,
    rows: group.slugs
      .map((slug) => products[slug])
      .filter((row): row is CatalogueRow => Boolean(row)),
  })).filter((group) => group.rows.length > 0);

  if (groups.length === 0) {
    return (
      // COPY: confirm met Marlon
      <p className="text-text-muted">
        Losse producten zijn momenteel niet beschikbaar. Neem contact met ons
        op.
      </p>
    );
  }

  function handleContinue() {
    if (!selected) return;
    // Zelfde event als "Ga verder" op /abonnement: item_id is exact de slug
    // die PayStage aan create_order meegeeft. Geen bedrag (spec-analytics.md).
    trackBeginCheckout({
      itemId: selected.slug,
      itemName: selected.display_name,
      family: selected.family ?? "product",
    });
    onContinue(selected);
  }

  return (
    <div>
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
        {/* COPY: confirm met Marlon */}
        Stap 01 · Kies je product
      </span>
      {/* COPY: confirm met Marlon */}
      <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3">
        Los trainen, zonder abonnement.
      </h1>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted mb-10 max-w-xl">
        Een rittenkaart voor de groepslessen of een pakket personal training.
        Eenmalig betalen, geen automatische incasso.
      </p>

      {groups.map((group) => (
        <div key={group.title} className="mb-10">
          <div className="flex items-baseline gap-3 mb-5">
            <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text">
              {group.title}
            </h2>
            <span className="flex-1 h-px bg-text-muted/15" />
            <span className="text-text-muted text-xs">{group.hint}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {group.rows.map((row) => {
              const isSelected = selectedSlug === row.slug;
              return (
                <article
                  key={row.slug}
                  className={`border p-6 flex flex-col transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
                    isSelected
                      ? "border-accent bg-bg-elevated"
                      : "border-text-muted/20 bg-bg-elevated/40"
                  }`}
                >
                  <span className="font-[family-name:var(--font-playfair)] text-lg text-text leading-snug">
                    {row.display_name}
                  </span>
                  <p className="text-text-muted text-sm mt-1 flex-1">
                    {PRODUCT_DESCRIPTIONS[row.slug] ?? ""}
                  </p>
                  <div className="mt-6">
                    <div className="flex items-baseline gap-1">
                      <span className="font-[family-name:var(--font-playfair)] text-3xl text-text">
                        {formatEuro(Math.round(row.price_cents / 100))}
                      </span>
                      {row.credits !== null && row.credits > 1 && (
                        <span className="text-text-muted text-xs">
                          {/* COPY: confirm met Marlon */}
                          {row.credits} ritten
                        </span>
                      )}
                    </div>
                    {/* COPY: confirm met Marlon */}
                    <span className="text-text-muted text-xs">Eenmalig</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSlug(row.slug)}
                    aria-pressed={isSelected}
                    className={`mt-5 text-xs uppercase tracking-[var(--track-label)] font-medium border cursor-pointer transition-colors duration-300 px-4 py-3 ${
                      isSelected
                        ? "bg-accent text-bg border-accent"
                        : "border-text-muted/30 text-text hover:border-accent hover:text-accent"
                    }`}
                  >
                    {/* COPY: confirm met Marlon */}
                    {isSelected ? "Gekozen" : "Kies dit product"}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <Button
          type="button"
          onClick={handleContinue}
          className={selected ? "" : "opacity-50 pointer-events-none"}
        >
          {/* COPY: confirm met Marlon */}
          Ga verder
        </Button>
        {selected && (
          <span className="text-text-muted text-sm">
            {selected.display_name},{" "}
            {formatEuro(Math.round(selected.price_cents / 100))}
          </span>
        )}
      </div>
    </div>
  );
}
