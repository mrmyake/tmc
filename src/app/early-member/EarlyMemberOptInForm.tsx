"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { trackLead, trackFormStart } from "@/lib/analytics";
import { getStoredUtm } from "@/lib/utm";

/**
 * Opt-in voor wie nog niet klaar is om Early Member te worden. Post naar
 * /api/leads/early-member, dat de subscriber in de MailerLite-groep
 * "Early Member Interested" zet. Inline bevestiging i.p.v. redirect, zelfde
 * patroon als YogaWaitlistForm.
 */
export function EarlyMemberOptInForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const tracked = useRef(false);

  const handleFocus = () => {
    if (!tracked.current) {
      trackFormStart("early_member_optin");
      tracked.current = true;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");

    const form = e.currentTarget;
    const payload = {
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      utm: getStoredUtm(),
      signupPath:
        typeof window !== "undefined" ? window.location.pathname : undefined,
    };

    try {
      await fetch("/api/leads/early-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      /* lead-routes falen stil; we tonen alsnog de bevestiging */
    }

    trackLead("early_member_optin", 1);
    setStatus("done");
  };

  if (status === "done") {
    return (
      // COPY: confirm met Marlon
      <div className="max-w-md mx-auto text-center">
        <p className="text-text text-lg font-medium mb-2">
          Bedankt, we houden je op de hoogte.
        </p>
        <p className="text-text-muted text-sm">
          Zodra er nieuws is over Early Member, hoor je het als eerste.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onFocus={handleFocus}
      className="max-w-md mx-auto flex flex-col sm:flex-row gap-4 sm:gap-3 items-start"
    >
      <div className="flex-1 w-full">
        {/* COPY: confirm met Marlon */}
        <Field label="E-mailadres" htmlFor="early-member-optin-email">
          <input
            id="early-member-optin-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            className={fieldInputClasses}
          />
        </Field>
      </div>
      {/* COPY: confirm met Marlon */}
      <Button
        type="submit"
        className={`sm:mt-6 whitespace-nowrap ${
          status === "loading" ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        {status === "loading" ? "Versturen" : "Blijf op de hoogte"}
      </Button>
    </form>
  );
}
