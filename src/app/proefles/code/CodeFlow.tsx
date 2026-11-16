"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TrialSessionOption } from "@/lib/trial-sessions";
import type { TrialCodeScope } from "@/lib/trial-codes/scope";
import { TrialBookingList } from "../boeken/TrialBookingList";
import type { VisitorSlotData } from "@/lib/trial-codes/vrij-trainen-query";
import { CodeEntry } from "./CodeEntry";
import { CodeAllFlow } from "./CodeAllFlow";
import { VisitorSlotPicker } from "./VisitorSlotPicker";
import type { AttributionParams } from "@/lib/attribution/params";
import { codeDisplayKey, type CodeDisplay } from "../_components/CodeInfoBanner";

/**
 * De codeflow: eerst de codestap, na een door de server geldig bevonden code
 * dezelfde sessiekiezer en hetzelfde gegevensformulier als de betaalde flow,
 * in code-modus (geen prijzen, "Gratis boeken"). De startstap volgt uit de
 * server: `scope` is alleen gezet als het ondertekende cookie een nu nog
 * bruikbare code bevat, en de lijst is al op die scope gefilterd. Na een
 * geslaagde codecheck vraagt deze component de server om de pagina opnieuw
 * te renderen, zodat lijst en scope uit de database komen en niet uit de
 * client. Bij scope all gaat het via CodeAllFlow: eerst de keuze groepsles of
 * vrij trainen, daarna dezelfde lijst of slotkiezer.
 *
 * `display` is wat de bezoeker van zijn toegang ziet: de zelf ingevoerde
 * code, of in de actieflow (/actie/[slug]) alleen de naam van het aanbod. In
 * de actieflow krijgt deze component geen code (spec-proefles-funnel.md, B1)
 * en is `scope` al versmald tot het pijlerfilter van de slug, zodat de
 * keuzestap en de tabs wegvallen.
 */

/** De keuze van de bezoeker bij een code met scope all (?soort=les|vrij). */
export type CodeSoort = "les" | "vrij";

export function CodeFlow({
  options,
  slotData,
  display,
  scope,
  soort = null,
  initialCode = "",
  attribution = {},
  preselectedSessionId = null,
}: {
  options: TrialSessionOption[];
  /** Alleen bij scope vrij trainen (of all met soort vrij): dagstrip en kwartieren voor de slotkiezer. */
  slotData: VisitorSlotData | null;
  /** null = nog geen (geldige) toegang: de codestap. */
  display: CodeDisplay | null;
  scope: TrialCodeScope | null;
  /** Alleen bij scope all: de gekozen tak uit de URL, null = nog niet gekozen. */
  soort?: CodeSoort | null;
  /** Vooraf ingevulde code uit ?code= (genormaliseerd); de bezoeker bevestigt zelf. */
  initialCode?: string;
  /** Advertentie- en campagneparameters uit de URL; reizen mee in de dagstrip en de boeking. */
  attribution?: AttributionParams;
  /** Voorgeselecteerde sessie (yoga-quiz, ?les=); de bezoeker kiest vrij een andere. */
  preselectedSessionId?: string | null;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  // Bewust een andere code invoeren, of de code bleek bij het boeken
  // ongeldig: terug naar de codestap, ook al is er nog een scope.
  const [forceEntry, setForceEntry] = useState(false);

  if (!scope || !display || forceEntry) {
    return (
      <CodeEntry
        initialCode={initialCode}
        initialMessage={message}
        finishing={refreshing}
        onValid={() => {
          setMessage("");
          setForceEntry(false);
          startTransition(() => router.refresh());
        }}
      />
    );
  }

  const invalid = (m: string) => {
    setMessage(m);
    setForceEntry(true);
    startTransition(() => router.refresh());
  };

  const key = codeDisplayKey(display);

  if (scope === "all") {
    return (
      <CodeAllFlow
        key={key}
        display={display}
        soort={soort}
        options={options}
        slotData={slotData}
        onChangeCode={() => setForceEntry(true)}
        onCodeInvalid={invalid}
        attribution={attribution}
      />
    );
  }

  if (scope === "vrij_trainen" && slotData) {
    return (
      <VisitorSlotPicker
        key={key}
        data={slotData}
        display={display}
        scope={scope}
        onChangeCode={() => setForceEntry(true)}
        onCodeInvalid={invalid}
        attribution={attribution}
      />
    );
  }

  return (
    <TrialBookingList
      // Nieuwe scope of code = verse lijst; de lijst houdt zelf state vast.
      key={`${key}:${scope}`}
      options={options}
      mode="code"
      codeInfo={{ display, scope, onChangeCode: () => setForceEntry(true) }}
      onCodeInvalid={invalid}
      attribution={attribution}
      initialSelectedId={preselectedSessionId}
    />
  );
}
