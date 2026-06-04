"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { trackLead, trackFormStart } from "@/lib/analytics";
import { getStoredUtm } from "@/lib/utm";

/**
 * Wachtlijst-inschrijving voor de yoga-minisite. Post naar
 * /api/leads/yoga-waitlist, dat de subscriber in de MailerLite-groep
 * "Yoga Wachtlijst" zet. Toont na succes een inline bevestiging in plaats
 * van een redirect, zodat de CTA op elke yoga-pagina herbruikbaar is.
 */
export function YogaWaitlistForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const tracked = useRef(false);

  const handleFocus = () => {
    if (!tracked.current) {
      trackFormStart("yoga_waitlist");
      tracked.current = true;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");

    const form = e.currentTarget;
    const payload = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      utm: getStoredUtm(),
      signupPath:
        typeof window !== "undefined" ? window.location.pathname : undefined,
    };

    try {
      await fetch("/api/leads/yoga-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      /* lead-routes falen stil; we tonen alsnog de bevestiging */
    }

    trackLead("yoga_waitlist", 5);
    setStatus("done");
  };

  if (status === "done") {
    return (
      <div className="max-w-md mx-auto text-center">
        <p className="text-text text-lg font-medium mb-2">
          Je staat op de wachtlijst.
        </p>
        <p className="text-text-muted text-sm">
          We laten als eerste van je horen zodra de yogalessen starten.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onFocus={handleFocus}
      className="max-w-md mx-auto grid grid-cols-1 sm:grid-cols-2 gap-5 text-left"
    >
      <Field label="Voornaam">
        <input
          type="text"
          name="name"
          required
          autoComplete="given-name"
          className={fieldInputClasses}
        />
      </Field>
      <Field label="E-mailadres">
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className={fieldInputClasses}
        />
      </Field>
      <div className="sm:col-span-2 mt-2">
        <Button
          type="submit"
          className={`w-full text-center ${
            status === "loading" ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          {status === "loading" ? "Versturen" : "Zet me op de wachtlijst"}
        </Button>
      </div>
    </form>
  );
}
