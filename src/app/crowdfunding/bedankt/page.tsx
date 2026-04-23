import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { Button } from "@/components/ui/Button";
import { ShareButtons } from "@/components/blocks/crowdfunding/ShareButtons";
import { Confetti } from "@/components/blocks/crowdfunding/Confetti";
import { PurchaseTracker } from "@/components/blocks/crowdfunding/PurchaseTracker";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import { getAdminClient } from "@/lib/supabase";
import { getCrowdfundingSettings } from "../../../../sanity/lib/fetch";

export const metadata: Metadata = {
  title: "Welkom bij The Movement Club",
  robots: { index: false, follow: false },
};

// Altijd vers — geen cache op bedankpagina
export const dynamic = "force-dynamic";

async function getBackerInfo(backerId: string | undefined) {
  if (!backerId) return null;
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("crowdfunding_backers")
    .select("id,tier_id,tier_name,amount,name,payment_status,mollie_payment_id")
    .eq("id", backerId)
    .maybeSingle();
  return data;
}

export default async function BedanktPage({
  searchParams,
}: {
  searchParams: Promise<{ backer?: string }>;
}) {
  const params = await searchParams;
  const [settings, backer] = await Promise.all([
    getCrowdfundingSettings(),
    getBackerInfo(params.backer),
  ]);

  const title = settings?.thankYouTitle ?? "Welkom bij The Movement Club!";
  const text =
    settings?.thankYouText ??
    "Je hebt zojuist je plek gereserveerd als founding member. We houden je op de hoogte.";
  const shareUrl = "https://themovementclub.nl/crowdfunding";
  const shareText =
    settings?.whatsappShareText ??
    "Ik heb mijn move gemaakt. Jij ook? Word founding member van The Movement Club in Loosdrecht:";

  const paid = backer?.payment_status === "paid";

  return (
    <>
      {paid && <Confetti />}
      {paid && backer && (
        <PurchaseTracker
          transactionId={backer.mollie_payment_id ?? backer.id}
          tierId={backer.tier_id}
          tierName={backer.tier_name}
          value={backer.amount}
        />
      )}
      <Section className="min-h-screen flex items-center">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <span className="tmc-eyebrow tmc-eyebrow--accent inline-block mb-6">
              {paid ? "Jouw move staat" : backer ? "Bedankt" : "Welkom"}
            </span>

            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text mb-6 leading-tight">
              {title}
            </h1>

            <p className="text-text-muted text-lg leading-relaxed mb-10">
              {text}
            </p>

            {backer && (
              <div className="inline-block bg-bg-elevated border border-accent/20 px-8 py-6 mb-10 text-left">
                <div className="text-xs text-text-muted uppercase tracking-[0.2em] mb-2">
                  Jouw tier
                </div>
                <div className="font-[family-name:var(--font-playfair)] text-2xl text-text">
                  {backer.tier_name}
                </div>
                <div className="text-accent mt-1">
                  {formatEuro(backer.amount)}
                </div>
                {!paid && (
                  <div className="text-xs text-text-muted mt-3 max-w-sm">
                    Status:{" "}
                    <span className="text-text">{backer.payment_status}</span>.
                    Bij een geslaagde betaling zie je dit binnen enkele
                    seconden terug.
                  </div>
                )}
              </div>
            )}

            <div className="mb-10">
              <div className="text-text mb-4 font-medium">
                Deel met je netwerk
              </div>
              <div className="flex justify-center">
                <ShareButtons shareUrl={shareUrl} shareText={shareText} />
              </div>
            </div>

            <Button href="/crowdfunding" variant="secondary">
              Terug naar de campagne
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
