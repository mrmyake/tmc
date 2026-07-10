"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import { trackCTA } from "@/lib/analytics";
import type { CatalogueRow } from "@/lib/catalogue";
import {
  FAMILIES,
  FAMILY_LABELS,
  FREQUENCIES,
  FREQUENCY_LABELS,
  planSlug,
  computeBreakdown,
  type FamilyKey,
  type FrequencyKey,
  type Selection,
} from "./lib";

interface Props {
  plans: Record<string, CatalogueRow>;
  extendedAccessAddon: CatalogueRow | null;
  signupFee: CatalogueRow | null;
  emActive: boolean;
  initial: Selection;
  onContinue: (selection: Selection) => void;
}

export function ConfigureStage({
  plans,
  extendedAccessAddon,
  signupFee,
  emActive,
  initial,
  onContinue,
}: Props) {
  const [family, setFamily] = useState<FamilyKey>(initial.family);
  const [frequency, setFrequency] = useState<FrequencyKey>(initial.frequency);
  const [extendedAccess, setExtendedAccess] = useState(initial.extendedAccess);
  const [commit24m, setCommit24m] = useState(initial.commit24m);

  const availableFamilies = FAMILIES.filter((f) =>
    FREQUENCIES.some((freq) => plans[planSlug(f, freq)]),
  );
  const availableFrequencies = FREQUENCIES.filter(
    (freq) => plans[planSlug(family, freq)],
  );

  const plan = plans[planSlug(family, frequency)];

  const breakdown = plan
    ? computeBreakdown({
        plan,
        extendedAccessAddon: extendedAccessAddon ?? undefined,
        signupFee: signupFee ?? undefined,
        extendedAccess,
        commit24m,
        emActive,
      })
    : null;

  // Groepslessen → wijs op All Access bij dezelfde frequentie i.p.v. een
  // toggle die het product onder de koper laat wisselen (besluit WS-4 §1).
  const upsellPlan =
    family === "groepslessen" ? plans[planSlug("all_inclusive", frequency)] : null;
  const upsellDeltaCents =
    upsellPlan && plan ? upsellPlan.price_cents - plan.price_cents : null;

  function handleFamilyChange(next: FamilyKey) {
    setFamily(next);
    const nextPlan = plans[planSlug(next, frequency)];
    if (!nextPlan || nextPlan.extended_access_mode !== "addon") {
      setExtendedAccess(false);
    }
    if (!nextPlan || nextPlan.price_cents_24m_computed === null) {
      setCommit24m(false);
    }
  }

  function handleContinue() {
    if (!plan) return;
    trackCTA("Ga verder", "/abonnement");
    onContinue({ family, frequency, extendedAccess, commit24m });
  }

  if (!plan || !breakdown) {
    return (
      // COPY: confirm met Marlon
      <p className="text-text-muted">
        Dit abonnement is momenteel niet beschikbaar. Neem contact met ons op.
      </p>
    );
  }

  return (
    <div>
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
        Stap 01 · Kies je abonnement
      </span>
      {/* COPY: confirm met Marlon */}
      <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3">
        Stel je abonnement samen.
      </h1>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted mb-10 max-w-xl">
        Alle prijzen zijn per 4 weken. Eenmalige inschrijfkosten worden bij de
        eerste betaling bijgeteld, als Early Member vervallen die.
      </p>

      <div className="mb-8">
        {/* COPY: confirm met Marlon */}
        <span className="tmc-eyebrow block mb-3">Basis</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {availableFamilies.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => handleFamilyChange(f)}
              className={`border px-5 py-4 text-left transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer ${
                family === f
                  ? "border-accent bg-bg-elevated text-text"
                  : "border-text-muted/25 text-text-muted hover:border-accent/50"
              }`}
            >
              <span className="block font-[family-name:var(--font-playfair)] text-lg">
                {FAMILY_LABELS[f]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        {/* COPY: confirm met Marlon */}
        <span className="tmc-eyebrow block mb-3">Frequentie</span>
        <div className="grid grid-cols-3 gap-3">
          {availableFrequencies.map((freq) => (
            <button
              key={freq}
              type="button"
              onClick={() => setFrequency(freq)}
              className={`border px-4 py-3 text-sm uppercase tracking-[0.1em] transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer ${
                frequency === freq
                  ? "border-accent bg-bg-elevated text-text"
                  : "border-text-muted/25 text-text-muted hover:border-accent/50"
              }`}
            >
              {FREQUENCY_LABELS[freq]}
            </button>
          ))}
        </div>
      </div>

      {upsellPlan && upsellDeltaCents !== null && upsellDeltaCents > 0 && (
        <div className="border border-accent/30 bg-bg-elevated px-5 py-4 mb-8 text-sm text-text-muted">
          {/* COPY: confirm met Marlon */}
          Onbeperkt vrij trainen erbij? Upgrade naar {FAMILY_LABELS.all_inclusive}{" "}
          voor +{formatEuro(Math.round(upsellDeltaCents / 100))}/4wk.
        </div>
      )}

      {plan.extended_access_mode === "addon" && extendedAccessAddon && (
        <label className="flex items-start gap-2.5 mb-6 text-sm text-text cursor-pointer select-none">
          <input
            type="checkbox"
            checked={extendedAccess}
            onChange={(e) => setExtendedAccess(e.target.checked)}
            className="mt-0.5 accent-[color:var(--color-accent)]"
          />
          <span>
            {/* COPY: confirm met Marlon */}
            Verlengde toegang 06:00-23:00
            <span className="text-text-muted">
              {" "}
              (+{formatEuro(Math.round(extendedAccessAddon.price_cents / 100))}/4wk)
            </span>
          </span>
        </label>
      )}
      {plan.extended_access_mode === "included" && (
        // COPY: confirm met Marlon
        <p className="text-sm text-text-muted mb-6">
          Inclusief verlengde toegang 06:00-23:00.
        </p>
      )}

      {/* Hidden while EM is open by design: mutual exclusivity plus
          pre-launch flexibility-first, returns after the EM deadline. */}
      {breakdown.commit24mAvailable && breakdown.commit24mDiscountPercent && (
        <label className="flex items-start gap-2.5 mb-6 text-sm text-text cursor-pointer select-none">
          <input
            type="checkbox"
            checked={commit24m}
            onChange={(e) => setCommit24m(e.target.checked)}
            className="mt-0.5 accent-[color:var(--color-accent)]"
          />
          <span>
            {/* COPY: confirm met Marlon */}
            24 maanden vastleggen, {breakdown.commit24mDiscountPercent}% korting
          </span>
        </label>
      )}

      <div className="border border-bg-subtle bg-bg-elevated p-6 mb-10">
        {/* COPY: confirm met Marlon */}
        <div className="text-xs uppercase tracking-[0.2em] text-text-muted mb-3">
          Jouw samenstelling
        </div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-text">{plan.display_name}</span>
          <span className="font-[family-name:var(--font-playfair)] text-2xl text-text">
            {formatEuro(Math.round(breakdown.recurringTotalCents / 100))}
            <span className="text-text-muted text-sm ml-1">/4wk</span>
          </span>
        </div>
        {breakdown.hasEmDiscount && (
          <div className="text-xs text-text-muted mb-2 line-through">
            {formatEuro(Math.round(breakdown.baseCatalogueCents / 100))}/4wk
          </div>
        )}
        {breakdown.extendedAccessCents > 0 && (
          // COPY: confirm met Marlon
          <div className="text-xs text-text-muted mb-2">
            incl. verlengde toegang +
            {formatEuro(Math.round(breakdown.extendedAccessCents / 100))}/4wk
          </div>
        )}
        <div className="text-xs text-text-muted mb-2">
          {breakdown.signupFeeCents > 0 ? (
            // COPY: confirm met Marlon
            <>
              + {formatEuro(Math.round(breakdown.signupFeeCents / 100))}{" "}
              inschrijfkosten, eenmalig bij de eerste betaling
            </>
          ) : (
            // COPY: confirm met Marlon
            <>Geen inschrijfkosten</>
          )}
        </div>
        {breakdown.emOpen && (
          <div className="border border-accent/30 bg-bg px-4 py-3 mt-3">
            <span className="text-[10px] uppercase tracking-[0.2em] text-accent block mb-1">
              Early Member
            </span>
            {/* COPY: confirm met Marlon */}
            <span className="text-xs text-text-muted">
              Per 4 weken opzegbaar, geen jaarcommitment.
            </span>
          </div>
        )}
        <div className="text-xs text-text-muted mt-3">
          {breakdown.emOpen ? (
            // COPY: confirm met Marlon
            "Geen commitment, per 4 weken opzegbaar"
          ) : (
            // COPY: confirm met Marlon
            `Commitment: ${breakdown.commitMonths} maanden`
          )}
        </div>
      </div>

      <Button type="button" onClick={handleContinue} className="w-full">
        {/* COPY: confirm met Marlon */}
        Ga verder
      </Button>
    </div>
  );
}
