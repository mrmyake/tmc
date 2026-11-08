"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { trackFormStart, trackLead } from "@/lib/analytics";

/**
 * Overstap is admin-mediated: de inschrijfkosten-waiver leeft alleen in
 * admin_create_order, dus deze kaart vangt de aanvraag als lead (MailerLite
 * + ntfy-alert), geen self-service /abonnement-checkout (besluit WS-4 §3).
 */
export function OverstapLeadForm() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const tracked = useRef(false);

  function handleFocus() {
    if (!tracked.current) {
      trackFormStart("overstap_lead");
      tracked.current = true;
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError(null);

    const form = e.currentTarget;
    const payload = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      phone: (form.elements.namedItem("phone") as HTMLInputElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
    };

    try {
      const res = await fetch("/api/leads/overstap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("request failed");
    } catch {
      setStatus("idle");
      // COPY: confirm met Marlon
      setError("Versturen mislukt. Probeer opnieuw.");
      return;
    }

    trackLead("overstap_aanvraag", 1);
    setStatus("done");
  }

  function handleClose() {
    setOpen(false);
    // Reset pas nadat de dialoog dicht is, anders flitst de content om
    // terwijl de close-animatie nog loopt.
    setTimeout(() => {
      setStatus("idle");
      setError(null);
    }, 300);
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        {/* COPY: confirm met Marlon */}
        Vraag het overstapaanbod aan
      </Button>

      <Dialog
        open={open}
        onClose={handleClose}
        eyebrow="Overstappen"
        title="Vertel ons over je huidige abonnement"
      >
        {status === "done" ? (
          <div>
            {/* COPY: confirm met Marlon */}
            <p className="text-text mb-2">Bedankt, we nemen snel contact op.</p>
            <p className="text-text-muted text-sm mb-6">
              We denken mee over de overstap, zodat je nergens dubbel voor
              betaalt.
            </p>
            <Button type="button" onClick={handleClose}>
              Sluiten
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            onFocus={handleFocus}
            className="flex flex-col gap-5"
          >
            <Field label="Naam" htmlFor="overstap-name">
              <input
                id="overstap-name"
                name="name"
                type="text"
                required
                autoComplete="name"
                className={fieldInputClasses}
              />
            </Field>
            <Field label="E-mailadres" htmlFor="overstap-email">
              <input
                id="overstap-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className={fieldInputClasses}
              />
            </Field>
            <Field label="Telefoon" htmlFor="overstap-phone">
              <input
                id="overstap-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                className={fieldInputClasses}
              />
            </Field>
            <Field
              label="Huidige sportschool + bericht (optioneel)"
              htmlFor="overstap-message"
            >
              <textarea
                id="overstap-message"
                name="message"
                rows={3}
                className={fieldInputClasses}
              />
            </Field>
            {error && (
              <p role="alert" className="text-[color:var(--danger)] text-sm">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className={status === "loading" ? "opacity-50 pointer-events-none" : ""}
            >
              {/* COPY: confirm met Marlon */}
              {status === "loading" ? "Versturen..." : "Versturen"}
            </Button>
          </form>
        )}
      </Dialog>
    </>
  );
}
