"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatEuro } from "@/lib/format";
import { trackCTA } from "@/lib/analytics";
import type { CatalogueRow } from "@/lib/catalogue";
import {
  planSlug,
  computeBreakdown,
  FREQUENCY_LABELS,
  type FamilyKey,
  type FrequencyKey,
  type Selection,
  type PriceBreakdown,
} from "./lib";

interface Props {
  plans: Record<string, CatalogueRow>;
  extendedAccessAddon: CatalogueRow | null;
  signupFee: CatalogueRow | null;
  emActive: boolean;
  initial: Selection;
  onContinue: (selection: Selection) => void;
}

type BasisCardId =
  | "groepslessen-2x"
  | "groepslessen-3x"
  | "groepslessen-onbeperkt"
  | "vrij-trainen-2x"
  | "vrij-trainen-3x"
  | "vrij-trainen-onbeperkt";
type CardId = BasisCardId | "all-access";

interface CardToggleState {
  /** Plus-30: rij-wissel naar all_inclusive_{freq}. Alleen op 2x/3x. */
  vt: boolean;
  ext: boolean;
}

const DEFAULT_TOGGLE: CardToggleState = { vt: false, ext: false };

const CARD_META: Record<
  BasisCardId,
  { baseFamily: FamilyKey; frequency: FrequencyKey; hasVtToggle: boolean }
> = {
  "groepslessen-2x": {
    baseFamily: "groepslessen",
    frequency: "2x",
    hasVtToggle: true,
  },
  "groepslessen-3x": {
    baseFamily: "groepslessen",
    frequency: "3x",
    hasVtToggle: true,
  },
  "groepslessen-onbeperkt": {
    baseFamily: "groepslessen",
    frequency: "unl",
    hasVtToggle: false,
  },
  "vrij-trainen-2x": {
    baseFamily: "vrij_trainen",
    frequency: "2x",
    hasVtToggle: false,
  },
  "vrij-trainen-3x": {
    baseFamily: "vrij_trainen",
    frequency: "3x",
    hasVtToggle: false,
  },
  "vrij-trainen-onbeperkt": {
    baseFamily: "vrij_trainen",
    frequency: "unl",
    hasVtToggle: false,
  },
};

const GROEPSLESSEN_CARDS: BasisCardId[] = [
  "groepslessen-2x",
  "groepslessen-3x",
  "groepslessen-onbeperkt",
];
const VRIJ_TRAINEN_CARDS: BasisCardId[] = [
  "vrij-trainen-2x",
  "vrij-trainen-3x",
  "vrij-trainen-onbeperkt",
];

// COPY: confirm met Marlon — samengestelde naam zodra de plus-30-toggle aan
// staat. De catalogus-naam van de onderliggende all_inclusive_*-rij ("All
// Access 2×/wk") wordt hier bewust niet getoond: de swap moet zichtbaar zijn
// als "Groepslessen + erbij", niet als een ander product (besluit WS-4
// heroverwogen, zie discovery-staat-membership-flow.md).
const VT_TOGGLE_TITLES: Partial<Record<BasisCardId, string>> = {
  "groepslessen-2x": "Groepslessen 2× + onbeperkt vrij trainen",
  "groepslessen-3x": "Groepslessen 3× + onbeperkt vrij trainen",
};

function familyForCard(id: BasisCardId, toggle: CardToggleState): FamilyKey {
  const meta = CARD_META[id];
  return meta.hasVtToggle && toggle.vt ? "all_inclusive" : meta.baseFamily;
}

function deriveInitialCardId(initial: Selection): CardId {
  if (initial.family === "all_inclusive") {
    if (initial.frequency === "unl") return "all-access";
    return initial.frequency === "2x" ? "groepslessen-2x" : "groepslessen-3x";
  }
  if (initial.family === "vrij_trainen") {
    if (initial.frequency === "2x") return "vrij-trainen-2x";
    if (initial.frequency === "3x") return "vrij-trainen-3x";
    return "vrij-trainen-onbeperkt";
  }
  if (initial.frequency === "2x") return "groepslessen-2x";
  if (initial.frequency === "3x") return "groepslessen-3x";
  return "groepslessen-onbeperkt";
}

function deriveInitialToggles(
  initial: Selection,
): Record<BasisCardId, CardToggleState> {
  const toggles: Record<BasisCardId, CardToggleState> = {
    "groepslessen-2x": { ...DEFAULT_TOGGLE },
    "groepslessen-3x": { ...DEFAULT_TOGGLE },
    "groepslessen-onbeperkt": { ...DEFAULT_TOGGLE },
    "vrij-trainen-2x": { ...DEFAULT_TOGGLE },
    "vrij-trainen-3x": { ...DEFAULT_TOGGLE },
    "vrij-trainen-onbeperkt": { ...DEFAULT_TOGGLE },
  };
  if (initial.family === "all_inclusive" && initial.frequency !== "unl") {
    const id: BasisCardId =
      initial.frequency === "2x" ? "groepslessen-2x" : "groepslessen-3x";
    toggles[id] = { vt: true, ext: initial.extendedAccess };
  } else if (initial.family === "vrij_trainen") {
    const id: BasisCardId =
      initial.frequency === "2x"
        ? "vrij-trainen-2x"
        : initial.frequency === "3x"
          ? "vrij-trainen-3x"
          : "vrij-trainen-onbeperkt";
    toggles[id] = { vt: false, ext: initial.extendedAccess };
  }
  return toggles;
}

export function ConfigureStage({
  plans,
  extendedAccessAddon,
  signupFee,
  emActive,
  initial,
  onContinue,
}: Props) {
  const [selectedCardId, setSelectedCardId] = useState<CardId>(() =>
    deriveInitialCardId(initial),
  );
  const [cardToggles, setCardToggles] = useState<
    Record<BasisCardId, CardToggleState>
  >(() => deriveInitialToggles(initial));
  const [commit24m, setCommit24m] = useState(initial.commit24m);

  const allAccessPlan = plans[planSlug("all_inclusive", "unl")];

  function toggleVt(id: BasisCardId) {
    setCardToggles((prev) => {
      const current = prev[id] ?? DEFAULT_TOGGLE;
      const nextVt = !current.vt;
      // Uitzetten van de plus-30 reset ook de plus-10: zonder vt-toggle
      // heeft de kaart geen addon-modus meer, dus geen stale ext-state.
      return {
        ...prev,
        [id]: { vt: nextVt, ext: nextVt ? current.ext : false },
      };
    });
  }

  function toggleExt(id: BasisCardId) {
    setCardToggles((prev) => {
      const current = prev[id] ?? DEFAULT_TOGGLE;
      return { ...prev, [id]: { ...current, ext: !current.ext } };
    });
  }

  /** Enige resolutie naar een catalogus-rij: planSlug(), geen optelling. */
  function planForSelection(id: CardId): CatalogueRow | undefined {
    if (id === "all-access") return allAccessPlan;
    const meta = CARD_META[id];
    const toggle = cardToggles[id] ?? DEFAULT_TOGGLE;
    return plans[planSlug(familyForCard(id, toggle), meta.frequency)];
  }

  function extendedAccessForSelection(id: CardId): boolean {
    const plan = planForSelection(id);
    if (id === "all-access" || !plan || plan.extended_access_mode !== "addon") {
      return false;
    }
    const toggle = cardToggles[id] ?? DEFAULT_TOGGLE;
    return toggle.ext;
  }

  /** Spiegelt computeBreakdown ongewijzigd (lib.ts) — geen herimplementatie
   * van de EM/24m-phase-gate hier. */
  function breakdownForSelection(id: CardId): PriceBreakdown | null {
    const plan = planForSelection(id);
    if (!plan) return null;
    return computeBreakdown({
      plan,
      extendedAccessAddon: extendedAccessAddon ?? undefined,
      signupFee: signupFee ?? undefined,
      extendedAccess: extendedAccessForSelection(id),
      commit24m,
      emActive,
    });
  }

  function titleForCard(id: CardId): string {
    if (id === "all-access") return allAccessPlan?.display_name ?? "All Access";
    const toggle = cardToggles[id] ?? DEFAULT_TOGGLE;
    if (toggle.vt && VT_TOGGLE_TITLES[id]) return VT_TOGGLE_TITLES[id]!;
    return planForSelection(id)?.display_name ?? "";
  }

  const selectedPlan = planForSelection(selectedCardId);
  const selectedBreakdown = breakdownForSelection(selectedCardId);

  function handleContinue() {
    if (!selectedPlan || !selectedBreakdown) return;
    const family: FamilyKey =
      selectedCardId === "all-access"
        ? "all_inclusive"
        : familyForCard(
            selectedCardId,
            cardToggles[selectedCardId] ?? DEFAULT_TOGGLE,
          );
    const frequency: FrequencyKey =
      selectedCardId === "all-access"
        ? "unl"
        : CARD_META[selectedCardId].frequency;
    trackCTA("Ga verder", "/abonnement");
    onContinue({
      family,
      frequency,
      extendedAccess: extendedAccessForSelection(selectedCardId),
      // Nooit een 24m-intentie sturen die create_order zou afwijzen: bij EM
      // is commit24mAvailable al false, dus deze AND houdt de raw toggle en
      // de daadwerkelijk toegepaste korting synchroon.
      commit24m: commit24m && selectedBreakdown.commit24mAvailable,
    });
  }

  function renderBasisCard(id: BasisCardId) {
    const meta = CARD_META[id];
    const toggle = cardToggles[id] ?? DEFAULT_TOGGLE;
    const plan = planForSelection(id);
    if (!plan) return null;

    const basePlanForDelta = plans[planSlug(meta.baseFamily, meta.frequency)];
    const vtPlanForDelta = meta.hasVtToggle
      ? plans[planSlug("all_inclusive", meta.frequency)]
      : undefined;
    const hasVtToggle =
      meta.hasVtToggle && Boolean(vtPlanForDelta) && Boolean(basePlanForDelta);
    const vtDeltaCents =
      hasVtToggle && vtPlanForDelta && basePlanForDelta
        ? vtPlanForDelta.price_cents - basePlanForDelta.price_cents
        : null;

    const breakdown = breakdownForSelection(id);
    if (!breakdown) return null;

    const isSelected = selectedCardId === id;
    const showWasLine = breakdown.chargeCents !== breakdown.baseCatalogueCents;

    return (
      <article
        key={id}
        className={`border p-6 flex flex-col transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
          isSelected
            ? "border-accent bg-bg-elevated"
            : "border-text-muted/20 bg-bg-elevated/40"
        }`}
      >
        <div>
          <span className="block font-[family-name:var(--font-playfair)] text-lg text-text leading-snug">
            {titleForCard(id)}
          </span>
          <span className="text-text-muted text-xs">
            {FREQUENCY_LABELS[meta.frequency]}
          </span>
        </div>

        <div className="flex items-baseline gap-1 mt-4">
          <span className="font-[family-name:var(--font-playfair)] text-3xl text-text">
            {formatEuro(Math.round(breakdown.recurringTotalCents / 100))}
          </span>
          {/* COPY: confirm met Marlon */}
          <span className="text-text-muted text-xs">/4wk</span>
        </div>
        <div className="min-h-[16px] mt-1 text-xs text-text-muted">
          {showWasLine && (
            <span className="line-through">
              {formatEuro(Math.round(breakdown.baseCatalogueCents / 100))}/4wk
            </span>
          )}
        </div>

        {hasVtToggle && (
          <label className="flex items-center justify-between gap-3 py-3 border-t border-text-muted/10 mt-3 text-sm text-text cursor-pointer select-none">
            {/* COPY: confirm met Marlon */}
            <span>Onbeperkt vrij trainen erbij</span>
            <span className="flex items-center gap-2">
              {vtDeltaCents !== null && (
                <span className="text-xs text-accent">
                  +{formatEuro(Math.round(vtDeltaCents / 100))}
                </span>
              )}
              <input
                type="checkbox"
                checked={toggle.vt}
                onChange={() => toggleVt(id)}
                className="accent-[color:var(--color-accent)]"
                aria-label="Onbeperkt vrij trainen toevoegen"
              />
            </span>
          </label>
        )}

        {plan.extended_access_mode === "addon" && extendedAccessAddon && (
          <label className="flex items-center justify-between gap-3 py-3 border-t border-text-muted/10 text-sm text-text cursor-pointer select-none">
            {/* COPY: confirm met Marlon */}
            <span>Verlengde toegang 06:00-23:00</span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-text-muted">
                +{formatEuro(Math.round(extendedAccessAddon.price_cents / 100))}
              </span>
              <input
                type="checkbox"
                checked={toggle.ext}
                onChange={() => toggleExt(id)}
                className="accent-[color:var(--color-accent)]"
                aria-label="Verlengde toegang toevoegen"
              />
            </span>
          </label>
        )}

        {!hasVtToggle && id === "groepslessen-onbeperkt" && (
          <p className="text-xs text-text-muted py-3 border-t border-text-muted/10 mt-3">
            {/* COPY: confirm met Marlon */}
            Ook onbeperkt vrij trainen erbij? Dat is{" "}
            <span className="text-accent">All Access</span>, hierboven.
          </p>
        )}

        {breakdown.emOpen && (
          <div className="border border-accent/30 bg-bg px-3 py-2 mt-3 text-xs text-text-muted">
            <span className="text-[10px] uppercase tracking-[0.16em] text-accent block mb-0.5">
              Early Member
            </span>
            {/* COPY: confirm met Marlon */}
            Per 4 weken opzegbaar, geen jaarcommitment.
          </div>
        )}

        <button
          type="button"
          onClick={() => setSelectedCardId(id)}
          className={`mt-auto pt-4 text-xs uppercase tracking-[0.14em] font-medium border cursor-pointer transition-colors duration-300 px-4 py-3 ${
            isSelected
              ? "bg-accent text-bg border-accent"
              : "border-text-muted/30 text-text hover:border-accent hover:text-accent"
          }`}
        >
          {/* COPY: confirm met Marlon */}
          {isSelected ? "Gekozen" : "Kies dit abonnement"}
        </button>
      </article>
    );
  }

  function renderFeaturedCard() {
    if (!allAccessPlan) return null;
    const isSelected = selectedCardId === "all-access";
    const breakdown = breakdownForSelection("all-access");
    if (!breakdown) return null;
    const showWasLine = breakdown.chargeCents !== breakdown.baseCatalogueCents;

    return (
      <article
        className={`border p-6 sm:p-8 mb-10 flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10 transition-colors duration-300 ${
          isSelected ? "border-accent bg-bg-elevated" : "border-accent/40 bg-bg"
        }`}
      >
        <div className="flex-1">
          {/* COPY: confirm met Marlon */}
          <span className="inline-block text-[10px] uppercase tracking-[0.18em] text-bg bg-accent px-3 py-1 mb-3 font-medium">
            All Access
          </span>
          <div className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-2">
            {allAccessPlan.display_name}
          </div>
          {/* COPY: confirm met Marlon */}
          <p className="text-text-muted text-sm max-w-md">
            Onbeperkt groepslessen en onbeperkt vrij trainen. Verlengde toegang
            van 06:00 tot 23:00 is inbegrepen.
          </p>
          {breakdown.emOpen && (
            <div className="inline-block border border-accent/30 bg-bg px-3 py-2 mt-4 text-xs text-text-muted">
              <span className="text-[10px] uppercase tracking-[0.16em] text-accent block mb-0.5">
                Early Member
              </span>
              {/* COPY: confirm met Marlon */}
              Per 4 weken opzegbaar, geen jaarcommitment.
            </div>
          )}
        </div>
        <div className="flex flex-col items-start sm:items-end shrink-0">
          <div className="flex items-baseline gap-1">
            <span className="font-[family-name:var(--font-playfair)] text-4xl text-text">
              {formatEuro(Math.round(breakdown.recurringTotalCents / 100))}
            </span>
            {/* COPY: confirm met Marlon */}
            <span className="text-text-muted text-xs">/4wk</span>
          </div>
          {showWasLine && (
            <span className="text-xs text-text-muted line-through mt-1">
              {formatEuro(Math.round(breakdown.baseCatalogueCents / 100))}/4wk
            </span>
          )}
          <button
            type="button"
            onClick={() => setSelectedCardId("all-access")}
            className={`mt-4 text-xs uppercase tracking-[0.14em] font-medium border cursor-pointer transition-colors duration-300 px-5 py-3 ${
              isSelected
                ? "bg-accent text-bg border-accent"
                : "border-accent text-accent hover:bg-accent hover:text-bg"
            }`}
          >
            {/* COPY: confirm met Marlon */}
            {isSelected ? "Gekozen" : "Kies All Access"}
          </button>
        </div>
      </article>
    );
  }

  if (
    !allAccessPlan &&
    GROEPSLESSEN_CARDS.every((id) => !planForSelection(id))
  ) {
    return (
      // COPY: confirm met Marlon
      <p className="text-text-muted">
        Abonnementen zijn momenteel niet beschikbaar. Neem contact met ons op.
      </p>
    );
  }

  return (
    <div className={selectedPlan ? "pb-28" : ""}>
      {/* Stage-eigen breakout: alleen de configure-stap wordt breder dan de
          gedeelde max-w-2xl Container in AbonnementConfigurator.tsx (die
          blijft ongewijzigd voor Identify/Pay, smalle formulieren). Klassiek
          full-bleed-recentreer-patroon (ml-50%/-translate-x-1/2/w-screen):
          werkt onafhankelijk van de breedte van de ouder. max-w-5xl (~1024px)
          benadert de mockup (~1080px) en gebruikt hetzelfde
          Container+override-patroon als /prijzen (max-w-3xl daar). */}
      <div className="w-screen ml-[50%] -translate-x-1/2">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
            Stap 01 · Kies je abonnement
          </span>
          {/* COPY: confirm met Marlon */}
          <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3">
            Stel je abonnement samen.
          </h1>
          {/* COPY: confirm met Marlon */}
          <p className="text-text-muted mb-8 max-w-xl">
            Alle prijzen zijn per 4 weken.
          </p>

          <div className="mb-10 flex items-center gap-4">
            {/* COPY: confirm met Marlon */}
            <span className="text-xs uppercase tracking-[0.14em] text-text-muted">
              Looptijd
            </span>
            <div className="inline-flex border border-text-muted/25">
              <button
                type="button"
                onClick={() => setCommit24m(false)}
                className={`px-4 py-2 text-xs uppercase tracking-[0.1em] cursor-pointer transition-colors duration-300 ${
                  !commit24m
                    ? "bg-bg-elevated text-text"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {/* COPY: confirm met Marlon */}
                12 maanden
              </button>
              <button
                type="button"
                onClick={() => setCommit24m(true)}
                className={`px-4 py-2 text-xs uppercase tracking-[0.1em] cursor-pointer transition-colors duration-300 flex items-center gap-2 ${
                  commit24m
                    ? "bg-bg-elevated text-text"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {/* COPY: confirm met Marlon */}
                24 maanden
                <span className="text-accent border border-accent/40 px-1.5 py-0.5 text-[10px]">
                  8%
                </span>
              </button>
            </div>
          </div>

          {renderFeaturedCard()}

          <div className="mb-10">
            {/* COPY: confirm met Marlon */}
            <div className="flex items-baseline gap-3 mb-5">
              <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text">
                Groepslessen
              </h2>
              <span className="flex-1 h-px bg-text-muted/15" />
              <span className="text-text-muted text-xs">
                Yoga, mobility en kettlebell
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {GROEPSLESSEN_CARDS.map(renderBasisCard)}
            </div>
          </div>

          <div className="mb-10">
            {/* COPY: confirm met Marlon */}
            <div className="flex items-baseline gap-3 mb-5">
              <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text">
                Vrij Trainen
              </h2>
              <span className="flex-1 h-px bg-text-muted/15" />
              <span className="text-text-muted text-xs">
                Op je eigen moment de studio in
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {VRIJ_TRAINEN_CARDS.map(renderBasisCard)}
            </div>
          </div>

          <section className="border border-text-muted/15 bg-bg-elevated p-6 sm:p-8 mb-10">
            {/* COPY: confirm met Marlon */}
            <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-6">
              Kosten en voorwaarden
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-accent mb-2">
                  {/* COPY: confirm met Marlon */}
                  Inschrijfkosten
                </div>
                {/* COPY: confirm met Marlon */}
                <p className="text-text">
                  Eenmalig{" "}
                  {signupFee
                    ? formatEuro(Math.round(signupFee.price_cents / 100))
                    : "€39"}{" "}
                  bij je eerste betaling.
                </p>
                <p className="text-text-muted text-xs mt-1">
                  Vervalt als je Early Member wordt of overstapt.
                </p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-accent mb-2">
                  {/* COPY: confirm met Marlon */}
                  Looptijd
                </div>
                <p className="text-text">
                  {/* COPY: confirm met Marlon */}
                  {commit24m
                    ? "24 maanden, met 8% korting."
                    : "12 maanden, daarna per 4 weken opzegbaar."}
                </p>
                <p className="text-text-muted text-xs mt-1">
                  {commit24m
                    ? "Niet-restitueerbaar bij tussentijds stoppen."
                    : "Kies 24 maanden voor 8% korting."}
                </p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-accent mb-2">
                  {/* COPY: confirm met Marlon */}
                  Betaling
                </div>
                {/* COPY: confirm met Marlon */}
                <p className="text-text">Automatische incasso per 4 weken.</p>
                <p className="text-text-muted text-xs mt-1">
                  Je geeft hiervoor een doorlopende SEPA-machtiging.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {selectedPlan && selectedBreakdown && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-bg-elevated/95 backdrop-blur-sm border-t border-text-muted/20 safe-bottom">
          <div className="max-w-5xl mx-auto px-6 py-4 flex flex-wrap items-center gap-4">
            <div>
              <div className="font-[family-name:var(--font-playfair)] text-base text-text">
                {titleForCard(selectedCardId)}
              </div>
              <div className="text-text-muted text-xs mt-0.5">
                {/* COPY: confirm met Marlon */}
                {formatEuro(
                  Math.round(selectedBreakdown.recurringTotalCents / 100),
                )}
                /4wk ·{" "}
                {selectedBreakdown.emOpen
                  ? "per 4 weken opzegbaar"
                  : `${selectedBreakdown.commitMonths} maanden looptijd`}
              </div>
            </div>
            <div className="flex-1" />
            <div className="text-right">
              {/* COPY: confirm met Marlon */}
              <div className="text-[10px] uppercase tracking-[0.1em] text-text-muted">
                Eerste betaling
              </div>
              <div className="font-[family-name:var(--font-playfair)] text-lg text-text">
                {formatEuro(
                  Math.round(
                    (selectedBreakdown.recurringTotalCents +
                      selectedBreakdown.signupFeeCents) /
                      100,
                  ),
                )}
              </div>
            </div>
            <Button type="button" onClick={handleContinue}>
              {/* COPY: confirm met Marlon */}
              Ga verder
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
