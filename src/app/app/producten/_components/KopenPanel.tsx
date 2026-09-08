import { formatEuro } from "@/lib/format";
import type { CatalogueRow } from "@/lib/catalogue";
import { PRODUCT_DESCRIPTIONS, PRODUCT_GROUPS } from "@/lib/product-groups";
import { BuyButton } from "./BuyButton";

// Slug-selectie, groepering en marketing-copy per slug staan sinds /kopen
// in src/lib/product-groups.ts, gedeeld met de publieke productcheckout.
// Nog steeds GEEN drop_in* (proeflesflow) en GEEN ten_ride_card_kids/
// _senior (is_active false); zie de toelichting daar.

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
      {PRODUCT_GROUPS.map((group) => {
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
