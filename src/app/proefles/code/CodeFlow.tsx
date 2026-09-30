"use client";

import { useState } from "react";
import type { TrialSessionOption } from "@/lib/trial-sessions";
import { TrialBookingList } from "../boeken/TrialBookingList";
import { CodeEntry } from "./CodeEntry";

/**
 * De codeflow: eerst de codestap, na een door de server geldig bevonden code
 * dezelfde sessiekiezer en hetzelfde gegevensformulier als de betaalde flow,
 * in code-modus (geen prijzen, "Gratis boeken"). De startstap volgt uit het
 * ondertekende cookie (server-side), niet uit een client-vlag.
 */
export function CodeFlow({
  options,
  hasValidCookie,
}: {
  options: TrialSessionOption[];
  hasValidCookie: boolean;
}) {
  const [step, setStep] = useState<"code" | "sessions">(
    hasValidCookie ? "sessions" : "code",
  );
  const [message, setMessage] = useState("");

  if (step === "code") {
    return (
      <CodeEntry
        initialMessage={message}
        onValid={() => {
          setMessage("");
          setStep("sessions");
        }}
      />
    );
  }

  return (
    <TrialBookingList
      options={options}
      mode="code"
      onCodeInvalid={(m) => {
        setMessage(m);
        setStep("code");
      }}
    />
  );
}
