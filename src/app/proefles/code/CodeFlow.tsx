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
 */

/** De keuze van de bezoeker bij een code met scope all (?soort=les|vrij). */
export type CodeSoort = "les" | "vrij";

export function CodeFlow({
  options,
  slotData,
  code,
  scope,
  soort = null,
  attribution = {},
}: {
  options: TrialSessionOption[];
  /** Alleen bij scope vrij trainen (of all met soort vrij): dagstrip en kwartieren voor de slotkiezer. */
  slotData: VisitorSlotData | null;
  code: string | null;
  scope: TrialCodeScope | null;
  /** Alleen bij scope all: de gekozen tak uit de URL, null = nog niet gekozen. */
  soort?: CodeSoort | null;
  /** Advertentie- en campagneparameters uit de URL; reizen mee in de dagstrip en de boeking. */
  attribution?: AttributionParams;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  // Bewust een andere code invoeren, of de code bleek bij het boeken
  // ongeldig: terug naar de codestap, ook al is er nog een scope.
  const [forceEntry, setForceEntry] = useState(false);

  if (!scope || !code || forceEntry) {
    return (
      <CodeEntry
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

  if (scope === "all") {
    return (
      <CodeAllFlow
        key={code}
        code={code}
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
        key={code}
        data={slotData}
        code={code}
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
      key={`${code}:${scope}`}
      options={options}
      mode="code"
      codeInfo={{ code, scope, onChangeCode: () => setForceEntry(true) }}
      onCodeInvalid={invalid}
      attribution={attribution}
    />
  );
}
