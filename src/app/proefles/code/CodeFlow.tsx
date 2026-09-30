"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TrialSessionOption } from "@/lib/trial-sessions";
import type { TrialCodeScope } from "@/lib/trial-codes/scope";
import { TrialBookingList } from "../boeken/TrialBookingList";
import { CodeEntry } from "./CodeEntry";

/**
 * De codeflow: eerst de codestap, na een door de server geldig bevonden code
 * dezelfde sessiekiezer en hetzelfde gegevensformulier als de betaalde flow,
 * in code-modus (geen prijzen, "Gratis boeken"). De startstap volgt uit de
 * server: `scope` is alleen gezet als het ondertekende cookie een nu nog
 * bruikbare code bevat, en de lijst is al op die scope gefilterd. Na een
 * geslaagde codecheck vraagt deze component de server om de pagina opnieuw
 * te renderen, zodat lijst en scope uit de database komen en niet uit de
 * client.
 */
export function CodeFlow({
  options,
  code,
  scope,
}: {
  options: TrialSessionOption[];
  code: string | null;
  scope: TrialCodeScope | null;
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

  return (
    <TrialBookingList
      // Nieuwe scope of code = verse lijst; de lijst houdt zelf state vast.
      key={`${code}:${scope}`}
      options={options}
      mode="code"
      codeInfo={{ code, scope, onChangeCode: () => setForceEntry(true) }}
      onCodeInvalid={(m) => {
        setMessage(m);
        setForceEntry(true);
        startTransition(() => router.refresh());
      }}
    />
  );
}
