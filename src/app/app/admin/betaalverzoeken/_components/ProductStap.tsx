"use client";

import { formatEuro } from "@/lib/crowdfunding-helpers";
import type { CatalogueRow } from "@/lib/catalogue";
import {
  DEFAULT_SUBSCRIPTION_TOGGLE,
  EM_ACTIVE,
  FREQUENCY_LABELS,
  PRODUCT_LABELS,
  PRODUCT_SLUGS,
  SUBSCRIPTION_ROWS,
  SUBSCRIPTION_ROW_LABELS,
  SUBSCRIPTION_ROW_META,
  computeBreakdown,
  resolveSubscriptionPlan,
  type ProductSlug,
  type SubscriptionRowId,
  type SubscriptionRowToggle,
} from "../lib";
import type { ProductSelection, Track } from "./BetaalverzoekWizard";

interface ProductStapProps {
  plans: Record<string, CatalogueRow>;
  products: Record<string, CatalogueRow>;
  extendedAccessAddon: CatalogueRow | null;
  signupFee: CatalogueRow | null;
  track: Track | null;
  onTrackChange: (track: Track) => void;
  selection: ProductSelection | null;
  onSelectionChange: (selection: ProductSelection) => void;
}

/**
 * WS-5 PR C, stap 2. Bewust GEEN eigen prijslogica: elk bedrag komt uit
 * computeBreakdown (src/app/abonnement/lib.ts, ongewijzigd), dezelfde
 * functie die de publieke /abonnement-configurator gebruikt en die
 * tmc._compute_order_price spiegelt. Dit bestand bepaalt alleen welke van
 * de 7 abonnement-rijen en 5 producten getoond worden, in admin-stijl
 * i.p.v. de publieke full-bleed kaarten-UI (die past niet naast de vaste
 * admin-sidebar).
 */
export function ProductStap({
  plans,
  products,
  extendedAccessAddon,
  signupFee,
  track,
  onTrackChange,
  selection,
  onSelectionChange,
}: ProductStapProps) {
  const subSelection =
    selection?.kind === "subscription" ? selection : null;
  const prodSelection = selection?.kind === "product" ? selection : null;

  function selectSubscriptionRow(rowId: SubscriptionRowId) {
    const toggle = subSelection?.toggle ?? DEFAULT_SUBSCRIPTION_TOGGLE;
    onSelectionChange({ kind: "subscription", rowId, toggle });
  }

  function toggleVt(rowId: Exclude<SubscriptionRowId, "all-access">) {
    if (subSelection?.rowId !== rowId) return;
    const current = subSelection.toggle;
    const nextVt = !current.vt;
    onSelectionChange({
      kind: "subscription",
      rowId,
      // Uitzetten van plus-30 reset ook plus-10: zonder vt-toggle heeft de
      // rij geen addon-modus meer (zelfde regel als ConfigureStage).
      toggle: { vt: nextVt, ext: nextVt ? current.ext : false },
    });
  }

  function toggleExt(rowId: SubscriptionRowId) {
    if (subSelection?.rowId !== rowId) return;
    onSelectionChange({
      kind: "subscription",
      rowId,
      toggle: { ...subSelection.toggle, ext: !subSelection.toggle.ext },
    });
  }

  function planForRow(
    rowId: SubscriptionRowId,
    toggle: SubscriptionRowToggle,
  ): CatalogueRow | undefined {
    return resolveSubscriptionPlan(rowId, toggle, plans);
  }

  function breakdownForRow(rowId: SubscriptionRowId) {
    const toggle =
      subSelection?.rowId === rowId ? subSelection.toggle : DEFAULT_SUBSCRIPTION_TOGGLE;
    const plan = planForRow(rowId, toggle);
    if (!plan) return null;
    const extendedAccess =
      plan.extended_access_mode === "addon" ? toggle.ext : false;
    return computeBreakdown({
      plan,
      extendedAccessAddon: extendedAccessAddon ?? undefined,
      signupFee: signupFee ?? undefined,
      extendedAccess,
      // 24m/waiver horen bij stap 3 (Voorwaarden), niet bij de productkeuze
      // hier; de preview per rij toont het standaard 12-maanden-bedrag.
      commit24m: false,
      emActive: EM_ACTIVE,
    });
  }

  return (
    <div className="bg-bg-elevated border border-[color:var(--ink-500)] p-6">
      <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-1">
        Kies wat de klant afneemt
      </h2>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-sm mb-5">
        Alle bedragen komen uit de catalogus.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <button
          type="button"
          onClick={() => onTrackChange("subscription")}
          aria-pressed={track === "subscription"}
          className={`text-left border p-4 transition-colors cursor-pointer ${
            track === "subscription"
              ? "border-accent bg-bg"
              : "border-[color:var(--ink-500)] hover:border-accent"
          }`}
        >
          {/* COPY: confirm met Marlon */}
          <div className="font-[family-name:var(--font-playfair)] text-base text-text mb-1">
            Abonnement
          </div>
          <div className="text-text-muted text-xs">
            De zeven abonnementen, met dezelfde keuzes als de klant zelf
            ziet.
          </div>
        </button>
        <button
          type="button"
          onClick={() => onTrackChange("product")}
          aria-pressed={track === "product"}
          className={`text-left border p-4 transition-colors cursor-pointer ${
            track === "product"
              ? "border-accent bg-bg"
              : "border-[color:var(--ink-500)] hover:border-accent"
          }`}
        >
          {/* COPY: confirm met Marlon */}
          <div className="font-[family-name:var(--font-playfair)] text-base text-text mb-1">
            Los product
          </div>
          <div className="text-text-muted text-xs">
            Rittenkaart, PT of Duo. Eenmalige betaling.
          </div>
        </button>
      </div>

      {/* Custom bedrag: bewust geparkeerd, zichtbaar zodat de volledige
          flow duidelijk is, nooit klikbaar. */}
      <div
        aria-disabled
        className="border border-dashed border-[color:var(--ink-500)] p-4 mb-6 opacity-60 cursor-not-allowed"
      >
        {/* COPY: confirm met Marlon */}
        <div className="font-[family-name:var(--font-playfair)] text-base text-text mb-1">
          Custom bedrag / factuur
        </div>
        <div className="text-text-muted text-xs mb-2">
          Coaching, ruimteverhuur, achteraf betalen. Levert een echte
          factuur op.
        </div>
        <span className="inline-block text-[10px] uppercase tracking-[0.14em] text-accent border border-accent/40 px-2 py-0.5">
          Binnenkort · via boekhouding
        </span>
      </div>

      {track === "subscription" && (
        <div className="flex flex-col gap-2">
          {SUBSCRIPTION_ROWS.map((rowId) => {
            const toggle =
              subSelection?.rowId === rowId
                ? subSelection.toggle
                : DEFAULT_SUBSCRIPTION_TOGGLE;
            const plan = planForRow(rowId, toggle);
            if (!plan) return null;
            const breakdown = breakdownForRow(rowId);
            const meta =
              rowId === "all-access" ? null : SUBSCRIPTION_ROW_META[rowId];
            const isSelected = subSelection?.rowId === rowId;
            const showVtToggle =
              rowId !== "all-access" && meta?.hasVtToggle;
            const showExtToggle = plan.extended_access_mode === "addon";

            return (
              <div
                key={rowId}
                className={`border p-4 transition-colors ${
                  isSelected
                    ? "border-accent bg-bg"
                    : "border-[color:var(--ink-500)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectSubscriptionRow(rowId)}
                  className="w-full flex items-center justify-between gap-4 text-left cursor-pointer"
                >
                  <span>
                    <span className="block text-sm font-medium text-text">
                      {SUBSCRIPTION_ROW_LABELS[rowId]}
                    </span>
                    {meta && (
                      <span className="block text-xs text-text-muted">
                        {FREQUENCY_LABELS[meta.frequency]}
                      </span>
                    )}
                  </span>
                  {breakdown && (
                    <span className="font-[family-name:var(--font-playfair)] text-base text-text whitespace-nowrap">
                      {formatEuro(
                        Math.round(breakdown.recurringTotalCents / 100),
                      )}
                      {/* COPY: confirm met Marlon */}
                      <span className="text-text-muted text-xs"> /4wk</span>
                    </span>
                  )}
                </button>

                {isSelected && (showVtToggle || showExtToggle) && (
                  <div className="mt-3 pt-3 border-t border-[color:var(--ink-500)]/60 flex flex-col gap-2">
                    {showVtToggle && (
                      <label className="flex items-center justify-between gap-3 text-xs text-text cursor-pointer select-none">
                        {/* COPY: confirm met Marlon */}
                        <span>Onbeperkt vrij trainen erbij</span>
                        <input
                          type="checkbox"
                          checked={toggle.vt}
                          onChange={() =>
                            toggleVt(rowId as Exclude<SubscriptionRowId, "all-access">)
                          }
                          className="accent-[color:var(--color-accent)]"
                          aria-label="Onbeperkt vrij trainen toevoegen"
                        />
                      </label>
                    )}
                    {showExtToggle && extendedAccessAddon && (
                      <label className="flex items-center justify-between gap-3 text-xs text-text cursor-pointer select-none">
                        {/* COPY: confirm met Marlon */}
                        <span>
                          Verlengde toegang +
                          {formatEuro(
                            Math.round(extendedAccessAddon.price_cents / 100),
                          )}
                        </span>
                        <input
                          type="checkbox"
                          checked={toggle.ext}
                          onChange={() => toggleExt(rowId)}
                          className="accent-[color:var(--color-accent)]"
                          aria-label="Verlengde toegang toevoegen"
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {track === "product" && (
        <div className="flex flex-col gap-2">
          {PRODUCT_SLUGS.map((slug) => {
            const row = products[slug];
            if (!row) return null;
            const isSelected = prodSelection?.slug === slug;
            return (
              <button
                key={slug}
                type="button"
                onClick={() =>
                  onSelectionChange({ kind: "product", slug: slug as ProductSlug })
                }
                className={`w-full flex items-center justify-between gap-4 text-left border p-4 transition-colors cursor-pointer ${
                  isSelected
                    ? "border-accent bg-bg"
                    : "border-[color:var(--ink-500)] hover:border-accent"
                }`}
              >
                <span className="text-sm font-medium text-text">
                  {PRODUCT_LABELS[slug]}
                </span>
                <span className="font-[family-name:var(--font-playfair)] text-base text-text whitespace-nowrap">
                  {formatEuro(Math.round(row.price_cents / 100))}
                  {row.credits && row.credits > 1 && (
                    // COPY: confirm met Marlon
                    <span className="text-text-muted text-xs">
                      {" "}
                      {row.credits} ritten
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
