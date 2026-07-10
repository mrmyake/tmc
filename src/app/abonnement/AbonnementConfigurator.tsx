"use client";

import { useState } from "react";
import { Container } from "@/components/layout/Container";
import type { CatalogueRow } from "@/lib/catalogue";
import { ConfigureStage } from "./ConfigureStage";
import { IdentifyStage } from "./IdentifyStage";
import { PayStage } from "./PayStage";
import { FAMILIES, FREQUENCIES, planSlug, type Selection } from "./lib";

interface Props {
  plans: Record<string, CatalogueRow>;
  extendedAccessAddon: CatalogueRow | null;
  signupFee: CatalogueRow | null;
  emActive: boolean;
  loggedIn: boolean;
}

type Stage = "configure" | "identify" | "pay";

function initialSelection(plans: Record<string, CatalogueRow>): Selection {
  const family =
    FAMILIES.find((f) => FREQUENCIES.some((freq) => plans[planSlug(f, freq)])) ??
    FAMILIES[0];
  const frequency =
    FREQUENCIES.find((freq) => plans[planSlug(family, freq)]) ?? FREQUENCIES[0];
  return { family, frequency, extendedAccess: false, commit24m: false };
}

export function AbonnementConfigurator({
  plans,
  extendedAccessAddon,
  signupFee,
  emActive,
  loggedIn,
}: Props) {
  const [stage, setStage] = useState<Stage>("configure");
  const [selection, setSelection] = useState<Selection>(() => initialSelection(plans));
  // Los van de server-bepaalde `loggedIn`: flipt zodra Stage 2 OTP + profiel
  // afrondt, zodat heen-en-weer navigeren (Pay → terug → Ga verder) niet
  // opnieuw om een inlogcode vraagt.
  const [identified, setIdentified] = useState(loggedIn);

  const plan = plans[planSlug(selection.family, selection.frequency)];

  function handleConfigured(next: Selection) {
    setSelection(next);
    setStage(identified ? "pay" : "identify");
  }

  function handleIdentified() {
    setIdentified(true);
    setStage("pay");
  }

  return (
    <Container className="py-16 md:py-24 max-w-2xl">
      {stage === "configure" && (
        <ConfigureStage
          plans={plans}
          extendedAccessAddon={extendedAccessAddon}
          signupFee={signupFee}
          emActive={emActive}
          initial={selection}
          onContinue={handleConfigured}
        />
      )}
      {stage === "identify" && (
        <IdentifyStage
          onDone={handleIdentified}
          onBack={() => setStage("configure")}
        />
      )}
      {stage === "pay" && plan && (
        <PayStage
          plan={plan}
          selection={selection}
          extendedAccessAddon={extendedAccessAddon}
          signupFee={signupFee}
          emActive={emActive}
          onBack={() => setStage("configure")}
        />
      )}
    </Container>
  );
}
