"use client";

import { useEffect, useState } from "react";
import { Container } from "@/components/layout/Container";
import { trackConfiguratorStageView } from "@/lib/analytics";
import type { CatalogueRow } from "@/lib/catalogue";
import { IdentifyStage } from "@/components/checkout/IdentifyStage";
import type { CheckoutIdentity } from "@/lib/checkout/profile-complete-core";
import { PayStage } from "@/components/checkout/PayStage";
import { ConfigureStage } from "./ConfigureStage";
import { FAMILIES, FREQUENCIES, planSlug, type Selection } from "./lib";

interface Props {
  plans: Record<string, CatalogueRow>;
  extendedAccessAddon: CatalogueRow | null;
  signupFee: CatalogueRow | null;
  emActive: boolean;
  /** Uitkomst van profileCompleteForCheckout() in page.tsx. */
  identity: CheckoutIdentity;
  /** Opzegtermijn in dagen, uit getCancellationNoticeDays() in page.tsx. */
  cancellationNoticeDays: number;
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
  identity,
  cancellationNoticeDays,
}: Props) {
  const [stage, setStage] = useState<Stage>("configure");
  const [selection, setSelection] = useState<Selection>(() => initialSelection(plans));
  // Los van de server-bepaalde `identity`: flipt zodra Stage 2 (OTP plus
  // profiel, of alleen de gegevens bij een ingelogd onvolledig profiel)
  // afrondt, zodat heen-en-weer navigeren (Pay, terug, Ga verder) niet
  // opnieuw om een inlogcode of gegevens vraagt. Alleen "complete" mag
  // Stage 2 overslaan; "incomplete" ziet de gegevensstap voorgevuld.
  const [identified, setIdentified] = useState(identity.status === "complete");
  const account =
    identity.status === "anonymous"
      ? undefined
      : { email: identity.email, prefill: identity.prefill };

  const plan = plans[planSlug(selection.family, selection.frequency)];

  // Vuurt óók bij mount (stage "configure"), wat meteen het ontbrekende
  // view-event op pagina-load van /abonnement oplevert. Geen URL-state:
  // de stage blijft puur React-state.
  useEffect(() => {
    trackConfiguratorStageView(stage);
  }, [stage]);

  function handleConfigured(next: Selection) {
    setSelection(next);
    setStage(identified ? "pay" : "identify");
  }

  function handleIdentified() {
    setIdentified(true);
    setStage("pay");
  }

  // createOrderAndCheckout oordeelde "profile_incomplete" terwijl de pagina
  // nog "complete" dacht (profiel intussen gewijzigd, of verouderde render):
  // terug naar de gegevensstap in plaats van naar de profielpagina.
  function handleProfileIncomplete() {
    setIdentified(false);
    setStage("identify");
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
          account={account}
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
          cancellationNoticeDays={cancellationNoticeDays}
          onBack={() => setStage("configure")}
          onProfileIncomplete={handleProfileIncomplete}
        />
      )}
    </Container>
  );
}
