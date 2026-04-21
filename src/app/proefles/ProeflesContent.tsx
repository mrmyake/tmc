"use client";

import { useState, useRef } from "react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { GoogleReviewsBadge } from "@/components/ui/GoogleReviewsBadge";
import { Check, ChevronDown } from "lucide-react";
import { trackLead, trackFormStart } from "@/lib/analytics";

const benefits = [
  "Kennismaking met trainer Marlon",
  "Ervaar de sfeer en apparatuur",
  "Training afgestemd op jouw niveau",
  "Volledig vrijblijvend, geen verplichtingen",
];

export function ProeflesContent() {
  const [submitted, setSubmitted] = useState(false);
  const tracked = useRef(false);

  const handleFocus = () => {
    if (!tracked.current) {
      trackFormStart("proefles_form");
      tracked.current = true;
    }
  };

  if (submitted) {
    return (
      <Section className="pt-32 md:pt-40 min-h-[80vh] flex items-center">
        <Container className="max-w-2xl text-center">
          <ScrollReveal>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent/10 text-accent mb-6">
              <Check size={32} />
            </div>
            <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-4">
              Je aanmelding is ontvangen!
            </h1>
            <p className="text-text-muted text-lg mb-2">
              Bedankt voor je interesse in The Movement Club.
            </p>
            <p className="text-text-muted">
              We nemen binnen 24 uur contact met je op om een moment in te
              plannen. Tot snel!
            </p>
            <div className="mt-8">
              <Button href="/" variant="secondary">
                Terug naar home
              </Button>
            </div>
          </ScrollReveal>
        </Container>
      </Section>
    );
  }

  return (
    <>
      {/* Hero */}
      <Section className="pt-32 md:pt-40">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Left: pitch */}
            <ScrollReveal>
              <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 block">
                Gratis & Vrijblijvend
              </span>
              <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text mb-6 leading-[1.15]">
                Ervaar The Movement Club
              </h1>
              <p className="text-text-muted text-lg leading-relaxed mb-8">
                Benieuwd of The Movement Club bij je past? Boek een gratis
                proefles en ontdek het zelf. Geen verplichtingen, geen
                verkooppraatje, gewoon een goede training.
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li
                    key={benefit}
                    className="flex items-center gap-3 text-text"
                  >
                    <span className="flex items-center justify-center w-6 h-6 bg-accent/10 text-accent shrink-0">
                      <Check size={14} />
                    </span>
                    {benefit}
                  </li>
                ))}
              </ul>
              <GoogleReviewsBadge />
            </ScrollReveal>

            {/* Right: form */}
            <ScrollReveal delay={0.15}>
              <div className="bg-bg-elevated border border-bg-subtle p-6 md:p-8">
                <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-6">
                  Meld je aan
                </h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    trackLead("proefles_booking", 20);
                    const form = e.currentTarget;
                    const formData = new FormData(form);
                    try {
                      await fetch("/api/proefles", {
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
                  className="space-y-7"
                >
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
                  <Field label="Telefoon">
                    <input
                      type="tel"
                      name="phone"
                      required
                      autoComplete="tel"
                      className={fieldInputClasses}
                    />
                  </Field>
                  <Field label="Voorkeur dag of tijd" hint="Optioneel">
                    <input
                      type="text"
                      name="preference"
                      className={fieldInputClasses}
                    />
                  </Field>
                  <Field label="Ervaring">
                    <div className="relative">
                      <select
                        name="experience"
                        required
                        defaultValue=""
                        className={`${fieldInputClasses} appearance-none pr-8`}
                      >
                        <option value="" disabled>
                          Kies je niveau
                        </option>
                        <option value="beginner">
                          Beginner (weinig tot geen ervaring)
                        </option>
                        <option value="gemiddeld">
                          Gemiddeld (ik train regelmatig)
                        </option>
                        <option value="gevorderd">
                          Gevorderd (ik train al jaren)
                        </option>
                      </select>
                      <ChevronDown
                        size={16}
                        strokeWidth={1.5}
                        aria-hidden
                        className="absolute right-0 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                      />
                    </div>
                  </Field>
                  <Field label="Nog iets te delen" hint="Optioneel">
                    <textarea
                      name="message"
                      rows={3}
                      className={`${fieldInputClasses} resize-none`}
                    />
                  </Field>
                  <Button type="submit" className="w-full text-center">
                    Plan mijn proefles
                  </Button>
                  <p className="text-text-muted text-xs text-center pt-2">
                    Vrijblijvend en gratis. We nemen binnen 24 uur contact op.
                  </p>
                </form>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>
    </>
  );
}
