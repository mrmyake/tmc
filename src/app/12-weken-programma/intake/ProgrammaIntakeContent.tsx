"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { trackFormStart, trackLead } from "@/lib/analytics";
import { getStoredUtm } from "@/lib/utm";

function SelectChevron() {
  return (
    <ChevronDown
      size={16}
      strokeWidth={1.5}
      aria-hidden
      className="absolute right-0 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
    />
  );
}

/**
 * Aanvraagformulier achter beide CTA's op /12-weken-programma ("Plan je
 * intake" en "Liever gebeld worden"). Mirrort het mechanisme van
 * MobilityCheckContent/api/leads/mobility-check exact: MailerLite upsert +
 * interne ntfy-melding naar Marlon, geen Supabase, geen boekingssysteem.
 * Veldset is bewust kleiner dan de Mobility Check-form (geen tijdstip/
 * ervaring/doelen) — voornaam, achternaam, e-mail, telefoon, voorkeursdag,
 * optioneel bericht, zoals afgesproken.
 *
 * In plaats van een aparte /bedankt-route (zoals mobility-check heeft)
 * toont dit formulier de bevestiging inline: dat voorkomt een extra,
 * niet-gevraagde pagina/sitemap-entry voor een simpele "bedankt"-state.
 */
export function ProgrammaIntakeContent() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const tracked = useRef(false);

  const handleFocus = () => {
    if (!tracked.current) {
      trackFormStart("programma_intake_form");
      tracked.current = true;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const data = {
      ...Object.fromEntries(formData.entries()),
      utm: getStoredUtm(),
      signupPath: window.location.pathname,
    };

    try {
      await fetch("/api/leads/programma-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      // Formulier bevestigt ook als de API-call faalt: de bezoeker heeft
      // zijn gegevens al ingevuld, een foutmelding hier helpt niemand.
    }

    trackLead("programma_intake_booking", 25);
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <Section id="top" className="pt-32 pb-24 md:pt-40 md:pb-32">
      <Container className="max-w-xl">
        <ScrollReveal>
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
            Het 12 weken programma
          </span>

          {submitted ? (
            <>
              {/* COPY: confirm met Marlon */}
              <h1 className="font-[family-name:var(--font-playfair)] text-text text-4xl md:text-5xl mb-6 tracking-[-0.01em]">
                Bedankt voor je aanvraag
              </h1>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-lg leading-relaxed mb-10">
                Marlon neemt binnen 24 uur persoonlijk contact met je op om
                een moment voor de intake te prikken.
              </p>
              <Link
                href="/12-weken-programma"
                className="text-accent text-sm hover:underline"
              >
                Terug naar het programma
              </Link>
            </>
          ) : (
            <>
              {/* COPY: confirm met Marlon */}
              <h1 className="font-[family-name:var(--font-playfair)] text-text text-4xl md:text-5xl mb-6 tracking-[-0.01em]">
                Plan je intake
              </h1>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-lg leading-relaxed mb-10">
                Een vrijblijvende kennismaking met Marlon. Vul je gegevens
                in en zij neemt binnen 24 uur contact met je op om een
                moment te prikken.
              </p>
              <form
                onSubmit={handleSubmit}
                onFocus={handleFocus}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <Field label="Voornaam">
                    <input
                      type="text"
                      name="firstName"
                      required
                      autoComplete="given-name"
                      className={fieldInputClasses}
                    />
                  </Field>
                  <Field label="Achternaam">
                    <input
                      type="text"
                      name="lastName"
                      required
                      autoComplete="family-name"
                      className={fieldInputClasses}
                    />
                  </Field>
                </div>
                <Field label="E-mailadres">
                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    className={fieldInputClasses}
                  />
                </Field>
                <Field label="Telefoon">
                  <input
                    type="tel"
                    name="phone"
                    required
                    autoComplete="tel"
                    className={fieldInputClasses}
                  />
                </Field>
                <Field label="Voorkeur dag">
                  <div className="relative">
                    <select
                      name="day"
                      required
                      defaultValue=""
                      className={`${fieldInputClasses} appearance-none pr-8`}
                    >
                      <option value="" disabled>
                        Kies een dag
                      </option>
                      <option value="maandag">Maandag</option>
                      <option value="dinsdag">Dinsdag</option>
                      <option value="woensdag">Woensdag</option>
                      <option value="donderdag">Donderdag</option>
                      <option value="vrijdag">Vrijdag</option>
                      <option value="zaterdag">Zaterdag</option>
                    </select>
                    <SelectChevron />
                  </div>
                </Field>
                <Field label="Bericht" hint="Optioneel">
                  <textarea
                    name="message"
                    rows={3}
                    className={`${fieldInputClasses} resize-none`}
                  />
                </Field>
                <Button
                  type="submit"
                  className={`w-full text-center ${loading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  {loading ? "Versturen" : "Plan mijn intake"}
                </Button>
                {/* COPY: confirm met Marlon */}
                <p className="text-text-muted text-xs text-center">
                  Volledig vrijblijvend.
                </p>
              </form>
            </>
          )}
        </ScrollReveal>
      </Container>
    </Section>
  );
}
