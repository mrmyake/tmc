"use client";

import { useState, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { trackLead, trackFormStart } from "@/lib/analytics";

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
      <div className="border-y border-accent/30 py-10 text-center">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          Verstuurd
        </span>
        <h3 className="text-2xl font-medium text-text mb-3 tracking-[-0.01em]">
          Bedankt voor je bericht.
        </h3>
        <p className="text-text-muted">
          We nemen zo snel mogelijk contact met je op.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        trackLead("contact_form", 10);
        const form = e.currentTarget;
        const formData = new FormData(form);
        try {
          await fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(formData.entries())),
          });
        } catch {
          /* continue */
        }
        setSubmitted(true);
      }}
      onFocus={handleFocus}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <Field label="Naam">
          <input
            type="text"
            name="name"
            required
            autoComplete="name"
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
      </div>
      <Field label="Telefoon">
        <input
          type="tel"
          name="phone"
          autoComplete="tel"
          className={fieldInputClasses}
        />
      </Field>
      <Field label="Onderwerp">
        <div className="relative">
          <select
            name="subject"
            required
            defaultValue=""
            className={`${fieldInputClasses} appearance-none pr-8`}
          >
            <option value="" disabled>
              Selecteer een onderwerp
            </option>
            <option value="proefles">Proefles aanvragen</option>
            <option value="vraag">Vraag over het aanbod</option>
            <option value="anders">Anders</option>
          </select>
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            aria-hidden
            className="absolute right-0 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          />
        </div>
      </Field>
      <Field label="Bericht">
        <textarea
          name="message"
          rows={5}
          required
          className={`${fieldInputClasses} resize-none`}
        />
      </Field>
      <Button type="submit" className="w-full sm:w-auto">
        Verstuur bericht
      </Button>
    </form>
  );
}
