import { formatEuro } from "@/lib/crowdfunding-helpers";
import type { CatalogueRow } from "@/lib/catalogue";
import { BuyButton } from "./BuyButton";

// COPY: confirm met Marlon — lokale marketing-copy per slug, zelfde
// patroon als PLAN_BENEFITS in /app/abonnement/page.tsx: tmc.catalogue
// draagt bewust geen marketing-tekst, alleen prijsdata.
const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  ten_ride_card: "Tien groepslessen, vrij in te zetten.",
  pt_single: "Eén persoonlijke sessie met een trainer.",
  pt_10: "Tien persoonlijke sessies.",
  duo_single: "Eén sessie voor twee personen.",
  duo_10: "Tien duo-sessies.",
};

interface ProductGroup {
  // COPY: confirm met Marlon
  title: string;
  // COPY: confirm met Marlon
  hint: string;
  slugs: string[];
}

// GEEN drop_in/drop_in_kids/drop_in_senior — bewust buiten scope (blijft op
// de publieke/proefles-kant). GEEN ten_ride_card_kids/_senior — is_active
// false in de catalogus.
const GROUPS: ProductGroup[] = [
  {
    title: "Groepslessen los",
    hint: "Zonder abonnement",
    slugs: ["ten_ride_card"],
  },
  {
    title: "Personal Training",
    hint: "1 op 1 met een trainer",
    slugs: ["pt_single", "pt_10"],
  },
  {
    title: "Duo Training",
    hint: "Samen trainen, 2 personen",
    slugs: ["duo_single", "duo_10"],
  },
];

function ProductCard({ product }: { product: CatalogueRow }) {
  return (
    <article className="bg-bg-elevated border border-text-muted/15 p-6 flex flex-col">
      <span className="font-[family-name:var(--font-playfair)] text-lg text-text">
        {product.display_name}
      </span>
      <p className="text-text-muted text-sm mt-1 flex-1">
        {PRODUCT_DESCRIPTIONS[product.slug] ?? ""}
      </p>
      <div className="flex items-end justify-between gap-4 mt-6">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="font-[family-name:var(--font-playfair)] text-3xl text-text">
              {formatEuro(Math.round(product.price_cents / 100))}
            </span>
            {product.credits && product.credits > 1 && (
              <span className="text-text-muted text-xs">
                {/* COPY: confirm met Marlon */}
                {product.credits} ritten
              </span>
            )}
          </div>
          {/* COPY: confirm met Marlon — eenmalig, geen /4wk: rittenkaarten
              en losse sessies zijn geen terugkerend abonnement. */}
          <span className="text-text-muted text-xs">Eenmalig</span>
        </div>
        <BuyButton slug={product.slug} productLabel={product.display_name} />
      </div>
    </article>
  );
}

export function KopenPanel({
  plans,
}: {
  plans: Record<string, CatalogueRow>;
}) {
  return (
    <div role="tabpanel" aria-label="Producten kopen" className="animate-tab-in">
      {GROUPS.map((group) => {
        const products = group.slugs
          .map((slug) => plans[slug])
          .filter((p): p is CatalogueRow => Boolean(p));
        if (products.length === 0) return null;
        return (
          <div key={group.title} className="mb-12">
            <div className="flex items-baseline gap-3 mb-5">
              <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text">
                {group.title}
              </h2>
              <span className="flex-1 h-px bg-text-muted/15" />
              <span className="text-text-muted text-xs">{group.hint}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {products.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
