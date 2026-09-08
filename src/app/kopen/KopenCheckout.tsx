"use client";

import { useEffect, useRef, useState } from "react";
import { Container } from "@/components/layout/Container";
import { IdentifyStage } from "@/components/checkout/IdentifyStage";
import { PayStage } from "@/components/checkout/PayStage";
import { trackConfiguratorStageView } from "@/lib/analytics";
import type { CatalogueRow } from "@/lib/catalogue";
import { ProductChoiceStage } from "./ProductChoiceStage";

interface Props {
  products: Record<string, CatalogueRow>;
  loggedIn: boolean;
}

type Stage = "configure" | "identify" | "pay";

/**
 * Stage-machine voor /kopen, spiegel van AbonnementConfigurator zonder
 * de abonnements-specifieke props. Geen URL-state: de stage is pure
 * React-state, net als op /abonnement.
 */
export function KopenCheckout({ products, loggedIn }: Props) {
  const [stage, setStage] = useState<Stage>("configure");
  const [product, setProduct] = useState<CatalogueRow | null>(null);
  // Los van de server-bepaalde `loggedIn`: flipt zodra IdentifyStage OTP +
  // profiel afrondt, zodat Pay -> Terug -> Ga verder niet opnieuw om een
  // code vraagt.
  const [identified, setIdentified] = useState(loggedIn);

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
          onDone={handleIdentified}
          onBack={() => setStage("configure")}
        />
      )}
      {stage === "pay" && product && (
        <PayStage
          kind="product"
          product={product}
          onBack={() => setStage("configure")}
        />
      )}
    </Container>
  );
}
