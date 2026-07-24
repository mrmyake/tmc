import type { Metadata } from "next";
import { getCatalogue } from "@/lib/catalogue";
import { getCampaignWindow, getCampaignPhase } from "@/lib/campaign";
import { EarlyMemberContent, type EarlyMemberPricing } from "./EarlyMemberContent";

// ISR: prijzen en de countdown-deadline mogen maximaal een minuut achterlopen.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Early Member | The Movement Club Loosdrecht",
  description:
    "Medio augustus opent The Movement Club in Loosdrecht. Word Early Member en train zonder inschrijfkosten, zonder jaarcontract en met een All Access-tarief dat daarna verdwijnt.",
  alternates: { canonical: "/early-member" },
  openGraph: {
    title: "Early Member | The Movement Club Loosdrecht",
    description:
      "Medio augustus opent The Movement Club in Loosdrecht. Word Early Member en train zonder inschrijfkosten, zonder jaarcontract en met een All Access-tarief dat daarna verdwijnt.",
  },
};

// Noodgreep, alleen gebruikt als de Supabase-fetch faalt. Bewust niet de
// bron van waarheid, zie tmc.catalogue.
const FALLBACK_PRICING: EarlyMemberPricing = {
  groepslessen: { twoX: 7900, threeX: 9900, unl: 11900 },
  allAccessTwoXCents: 10900,
  allAccessThreeXCents: 12900,
  allAccessUnlCents: 14900,
  allAccessUnlEarlyMemberCents: 13900,
  signupFeeCents: 3900,
  programStudioCents: 240000,
  programOnlineCents: 125000,
};

async function getPricing(): Promise<EarlyMemberPricing> {
  const catalogue = await getCatalogue();
  if (catalogue.size === 0) return FALLBACK_PRICING;

  const price = (slug: string, fallback: number) =>
    catalogue.get(slug)?.price_cents ?? fallback;
  const priceOrNull = (slug: string) => catalogue.get(slug)?.price_cents ?? null;

  const allAccessUnl = catalogue.get("all_inclusive_unl");

  return {
    groepslessen: {
      twoX: price("groepslessen_2x", FALLBACK_PRICING.groepslessen.twoX),
      threeX: price("groepslessen_3x", FALLBACK_PRICING.groepslessen.threeX),
      unl: price("groepslessen_unl", FALLBACK_PRICING.groepslessen.unl),
    },
    allAccessTwoXCents: price("all_inclusive_2x", FALLBACK_PRICING.allAccessTwoXCents),
    allAccessThreeXCents: price("all_inclusive_3x", FALLBACK_PRICING.allAccessThreeXCents),
    allAccessUnlCents: price("all_inclusive_unl", FALLBACK_PRICING.allAccessUnlCents),
    // Zelfde coalesce als tmc._compute_order_price(): de EM-catalogusprijs
    // als die bestaat, anders de reguliere prijs (een familie kan EM-
    // eligible zijn zonder eigen prijsverlaging, bv. Groepslessen). Wat
    // hier getoond wordt is dus altijd exact wat create_order zou rekenen.
    allAccessUnlEarlyMemberCents:
      allAccessUnl?.early_member_price_cents ??
      allAccessUnl?.price_cents ??
      FALLBACK_PRICING.allAccessUnlEarlyMemberCents,
    // Reguliere inschrijfkosten (het bedrag dat een Early Member juist NIET
    // betaalt) — niet de early_member_price_cents-kolom op de fee-rij, die
    // is hier 0.
    signupFeeCents: price("signup_fee", FALLBACK_PRICING.signupFeeCents),
    // Lead items (purchasable=false): een ontbrekende rij geeft "op
    // aanvraag" i.p.v. een verouderd noodgreep-bedrag.
    programStudioCents: priceOrNull("program_studio_12w"),
    programOnlineCents: priceOrNull("program_online_12w"),
  };
}

export default async function EarlyMemberPage() {
  const [pricing, campaignWindow] = await Promise.all([
    getPricing(),
    getCampaignWindow(),
  ]);
  // Eén fasebron voor de hele pagina (pre-open / open-em / closed), zelfde
  // getCampaignPhase() als de root layout en /prijzen. Beide grenzen komen
  // sinds migratie 20260813 uit tmc.early_member_pools (opens_at plus
  // closes_at), dezelfde bron waar _compute_order_price tegen handhaaft.
  const deadlineIso = campaignWindow.closesAtIso;
  const campaignPhase = getCampaignPhase(campaignWindow);

  return (
    <EarlyMemberContent
      deadline={deadlineIso}
      pricing={pricing}
      campaignPhase={campaignPhase}
    />
  );
}
