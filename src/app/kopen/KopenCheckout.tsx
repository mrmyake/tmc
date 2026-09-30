"use client";

import { useEffect, useRef, useState } from "react";
import { Container } from "@/components/layout/Container";
import { IdentifyStage } from "@/components/checkout/IdentifyStage";
import type { CheckoutIdentity } from "@/lib/checkout/profile-complete-core";
import { PayStage } from "@/components/checkout/PayStage";
import { trackConfiguratorStageView } from "@/lib/analytics";
import type { CatalogueRow } from "@/lib/catalogue";
import { ProductChoiceStage } from "./ProductChoiceStage";

interface Props {
  products: Record<string, CatalogueRow>;
  /** Uitkomst van profileCompleteForCheckout() in page.tsx. */
  identity: CheckoutIdentity;
}

type Stage = "configure" | "identify" | "pay";

/**
 * Stage-machine voor /kopen, spiegel van AbonnementConfigurator zonder
 * de abonnements-specifieke props. Geen URL-state: de stage is pure
 * React-state, net als op /abonnement.
 */
export function KopenCheckout({ products, identity }: Props) {
  const [stage, setStage] = useState<Stage>("configure");
  const [product, setProduct] = useState<CatalogueRow | null>(null);
  // Los van de server-bepaalde `identity`: flipt zodra IdentifyStage (OTP
  // plus profiel, of alleen de gegevens bij een ingelogd onvolledig
  // profiel) afrondt, zodat Pay -> Terug -> Ga verder niet opnieuw om een
  // code of gegevens vraagt. Zelfde regel als AbonnementConfigurator.
  const [identified, setIdentified] = useState(identity.status === "complete");
  const account =
    identity.status === "anonymous"
      ? undefined
      : { email: identity.email, prefill: identity.prefill };

  // Zelfde stage-event als /abonnement; GA4 hangt er page_location aan,
  // dus de twee checkouts blijven in de rapportage uit elkaar te houden.
  useEffect(() => {
    trackConfiguratorStageView(stage);
  }, [stage]);

  // "Ga verder" staat onder een lange productlijst; zonder dit blijft de
  // bezoeker na de stage-wissel op de footer staan en ziet hij de volgende
  // stap niet (gezien in de browsertest). Niet bij mount: dan is er nog
  // niets gewisseld. Expliciet "instant": globals.css zet html op
  // scroll-behavior smooth, en een lopende smooth scroll wordt door Chrome
  // afgebroken zodra de documenthoogte verandert, wat hier precies gebeurt
  // (de nieuwe stage is veel korter dan de productlijst).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [stage]);

  function handleChosen(next: CatalogueRow) {
    setProduct(next);
    setStage(identified ? "pay" : "identify");
  }

  function handleIdentified() {
    setIdentified(true);
    setStage("pay");
  }

  function handleProfileIncomplete() {
    setIdentified(false);
    setStage("identify");
  }

  return (
    <Container className="py-16 md:py-24 max-w-2xl">
      {stage === "configure" && (
        <ProductChoiceStage
          products={products}
          initial={product}
          onContinue={handleChosen}
        />
      )}
      {stage === "identify" && (
        <IdentifyStage
          formName="kopen_identify"
          account={account}
          onDone={handleIdentified}
          onBack={() => setStage("configure")}
        />
      )}
      {stage === "pay" && product && (
        <PayStage
          kind="product"
          product={product}
          onBack={() => setStage("configure")}
          onProfileIncomplete={handleProfileIncomplete}
        />
      )}
    </Container>
  );
}
