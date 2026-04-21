"use client";

import { useState, useRef } from "react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { GoogleReviewsBadge } from "@/components/ui/GoogleReviewsBadge";
import { ChevronDown } from "lucide-react";
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
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-6">
              Verstuurd
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              Je aanmelding is ontvangen.
            </h1>
            <p className="text-text-muted text-lg mb-3">
              Bedankt voor je interesse in The Movement Club.
            </p>
            <p className="text-text-muted">
              We nemen binnen 24 uur contact met je op om een moment in te
              plannen. Tot snel.
            </p>
            <div className="mt-10">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-start">
            {/* Left: pitch */}
            <ScrollReveal>
              <span className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8">
                <span aria-hidden className="w-12 h-px bg-accent" />
                Gratis · Vrijblijvend
                <span aria-hidden className="w-12 h-px bg-accent" />
              </span>
              <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text mb-8 leading-[1.05] tracking-[-0.02em]">
                Ervaar The Movement Club
              </h1>
              <p className="text-text-muted text-lg leading-relaxed mb-10">
                Benieuwd of The Movement Club bij je past? Plan een gratis
                proefles en ontdek het zelf. Geen verplichtingen, geen
                verkooppraatje, gewoon een goede training.
              </p>
              <ul className="border-y border-bg-subtle divide-y divide-bg-subtle">
                {benefits.map((benefit, i) => (
                  <li
                    key={benefit}
                    className="py-4 flex items-baseline gap-5"
                  >
                    <span className="tmc-eyebrow text-text-muted/70 shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-text text-sm leading-relaxed">
                      {benefit}
                    </span>
                  </li>
                ))}
              </ul>
              <GoogleReviewsBadge />
            </ScrollReveal>

            {/* Right: form */}
            <ScrollReveal delay={0.15}>
              <div className="bg-bg-elevated p-8 md:p-10 relative">
                <div
                  aria-hidden
                  className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
                />
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                  Plan je sessie
                </span>
                <h2 className="text-2xl font-medium text-text mb-8 tracking-[-0.01em]">
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
