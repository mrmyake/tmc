"use client";

import type { CatalogueRow } from "@/lib/catalogue";

export interface Voorwaarden {
  waiveSignupFee: boolean;
  commit24m: boolean;
}

interface VoorwaardenStapProps {
  isSubscription: boolean;
  plan: CatalogueRow | null;
  voorwaarden: Voorwaarden;
  onChange: (next: Voorwaarden) => void;
}

/**
 * WS-5 PR C, stap 3. Alleen twee booleans die als-is naar createPaymentRequest
 * gaan (waiveSignupFee -> admin_create_order p_waive_signup_fee, commit24m ->
 * p_commit_24m). Geen bedrag wordt hier berekend; de server past de waiver en
 * de 24m-factor toe (tmc._compute_order_price), niet deze component.
 *
 * Bij een los product is er niets in te stellen: _compute_order_price wijst
 * commit_24m/extended_access/early_member voor kind='product' sowieso af
 * (invalid_product_options), en signup_fee_cents is voor producten altijd 0,
 * dus een waiver heeft daar geen betekenis.
 */
export function VoorwaardenStap({
  isSubscription,
  plan,
  voorwaarden,
  onChange,
}: VoorwaardenStapProps) {
  if (!isSubscription) {
    return (
      <div className="bg-bg-elevated border border-[color:var(--ink-500)] p-6">
        <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-1">
          Voorwaarden
        </h2>
        {/* COPY: confirm met Marlon */}
        <p className="text-text-muted text-sm">
          Bij een los product is er niets in te stellen.
        </p>
      </div>
    );
  }

  const commit24mAvailable = plan?.price_cents_24m_computed != null;

  return (
    <div className="bg-bg-elevated border border-[color:var(--ink-500)] p-6">
      <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-1">
        Voorwaarden
      </h2>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-sm mb-2">
        Kies hier de looptijd en schrijf eventueel de inschrijfkosten kwijt.
      </p>

      <div className="flex items-center justify-between gap-4 py-4 border-t border-[color:var(--ink-500)]/60">
        <div>
          {/* COPY: confirm met Marlon */}
          <div className="text-sm font-medium text-text">
            Inschrijfkosten kwijtschelden
          </div>
          <div className="text-text-muted text-xs mt-0.5">
            {/* COPY: confirm met Marlon */}
            Bijvoorbeeld bij een overstap. Wordt door de server toegepast.
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={voorwaarden.waiveSignupFee}
            onChange={(e) =>
              onChange({ ...voorwaarden, waiveSignupFee: e.target.checked })
            }
            className="sr-only peer"
          />
          <span className="w-11 h-6 bg-[color:var(--ink-500)] peer-checked:bg-accent transition-colors relative">
            <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white transition-transform peer-checked:translate-x-5" />
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between gap-4 py-4 border-t border-[color:var(--ink-500)]/60">
        <div>
          {/* COPY: confirm met Marlon */}
          <div className="text-sm font-medium text-text">
            Looptijd 24 maanden (8% korting)
          </div>
          <div className="text-text-muted text-xs mt-0.5">
            {/* COPY: confirm met Marlon */}
            {commit24mAvailable
              ? "Standaard 12 maanden."
              : "Niet beschikbaar op dit abonnement."}
          </div>
        </div>
        <label
          className={`relative inline-flex items-center ${
            commit24mAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-50"
          }`}
        >
          <input
            type="checkbox"
            checked={voorwaarden.commit24m}
            disabled={!commit24mAvailable}
            onChange={(e) =>
              onChange({ ...voorwaarden, commit24m: e.target.checked })
            }
            className="sr-only peer"
          />
          <span className="w-11 h-6 bg-[color:var(--ink-500)] peer-checked:bg-accent transition-colors relative">
            <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white transition-transform peer-checked:translate-x-5" />
          </span>
        </label>
      </div>
    </div>
  );
}
