"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { trackLead, trackFormStart } from "@/lib/analytics";

const inputStyles =
  "w-full bg-bg-elevated border border-bg-subtle px-4 py-3 text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const tracked = useRef(false);

  const handleFocus = () => {
    if (!tracked.current) {
      trackFormStart("contact_form");
      tracked.current = true;
    }
  };

  if (submitted) {
    return (
      <div className="bg-bg-elevated border border-accent/30 p-8 text-center">
        <h3 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-3">
          Bedankt voor je bericht!
        </h3>
        <p className="text-text-muted">
          We nemen zo snel mogelijk contact met je op.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        trackLead("contact_form", 10);
        // TODO: Brevo API integratie
        setSubmitted(true);
      }}
      onFocus={handleFocus}
      className="space-y-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <input
          type="text"
          name="name"
          placeholder="Naam"
          required
          className={inputStyles}
        />
        <input
          type="email"
          name="email"
          placeholder="E-mailadres"
          required
          className={inputStyles}
        />
      </div>
      <input
        type="tel"
        name="phone"
        placeholder="Telefoonnummer"
        className={inputStyles}
      />
      <select name="subject" required className={inputStyles}>
        <option value="">Onderwerp</option>
        <option value="proefles">Proefles aanvragen</option>
        <option value="vraag">Vraag over het aanbod</option>
        <option value="anders">Anders</option>
      </select>
      <textarea
        name="message"
        placeholder="Je bericht"
        rows={5}
        required
        className={`${inputStyles} resize-none`}
      />
      <Button type="submit" className="w-full sm:w-auto">
        Verstuur bericht
      </Button>
    </form>
  );
}
