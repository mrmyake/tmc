"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { LeadPageLayout } from "@/components/layout/LeadPageLayout";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { GoogleReviewsBadge } from "@/components/ui/GoogleReviewsBadge";
import { trackLead, trackFormStart } from "@/lib/analytics";
import { getStoredUtm } from "@/lib/utm";
import { ChevronDown } from "lucide-react";

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

const steps = [
  {
    title: "Intake",
    description: "Korte vragenlijst over je doelen, klachten en sportervaring.",
  },
  {
    title: "Screening",
    description: "6-8 bewegingspatronen worden geanalyseerd door Marlon.",
  },
  {
    title: "Jouw profiel",
    description: "Persoonlijk rapport met bevindingen en aanbevelingen per email.",
  },
];

const forWhom = [
  "Bureauwerker met rugklachten",
  "Ervaren sporter die een plateau raakt",
  "Herintreder na een lange pauze",
  "Of je nu beginner bent of al jaren traint",
];

const faqs = [
  {
    q: "Is het echt gratis?",
    a: "Ja, volledig vrijblijvend. Geen verplichtingen, geen verkooppraatje.",
  },
  {
    q: "Moet ik sportkleding aan?",
    a: "Comfortabele kleding is voldoende. Je hoeft niet te sporten.",
  },
  {
    q: "Hoe lang duurt het?",
    a: "Ongeveer 20-30 minuten. We nemen de tijd voor een grondige screening.",
  },
  {
    q: "Wat als ik blessures heb?",
    a: "Juist dan is een screening waardevol. Marlon past alles aan op jouw situatie.",
  },
];

export function MobilityCheckContent() {
  const [loading, setLoading] = useState(false);
  const tracked = useRef(false);
  const router = useRouter();

  const handleFocus = () => {
    if (!tracked.current) {
      trackFormStart("mobility_check_form");
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
      await fetch("/api/leads/mobility-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      // Continue even if API fails
    }

    trackLead("mobility_check_booking", 25);
    router.push("/mobility-check/bedankt");
  };

  return (
    <LeadPageLayout>
      {/* Hero */}
      <Section className="pt-24 md:pt-32">
        <Container className="max-w-3xl text-center">
          <ScrollReveal>
            <span className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8">
              <span aria-hidden className="w-12 h-px bg-accent" />
              Gratis · Vrijblijvend
              <span aria-hidden className="w-12 h-px bg-accent" />
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl lg:text-7xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              Ontdek hoe je beweegt
            </h1>
            <p className="text-text-muted text-lg md:text-xl max-w-2xl mx-auto mb-10">
              Twintig minuten, één-op-één met Marlon. Een rustige screening van
              hoe je lichaam beweegt, en een persoonlijk profiel per email.
            </p>
            <Button href="#formulier" variant="primary">
              Plan mijn Mobility Check
            </Button>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Hoe het werkt */}
      <Section bg="elevated">
        <Container>
          <ScrollReveal>
            <SectionHeading label="Hoe het werkt" heading="In drie stappen" />
          </ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-4xl mx-auto">
            {steps.map((step, i) => (
              <ScrollReveal key={step.title} delay={i * 0.1}>
                <div className="pt-6 border-t border-accent">
                  <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-xl font-medium text-text mb-3 tracking-[-0.01em]">
                    {step.title}
                  </h3>
                  <p className="text-text-muted text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Voor wie */}
      <Section>
        <Container className="max-w-3xl">
          <ScrollReveal>
            <SectionHeading label="Voor wie" heading="Herken je dit?" />
          </ScrollReveal>
          <ul className="divide-y divide-bg-subtle border-y border-bg-subtle">
            {forWhom.map((item, i) => (
              <ScrollReveal key={item} delay={i * 0.06}>
                <li className="py-5 flex items-baseline gap-6">
                  <span className="tmc-eyebrow text-text-muted/70 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-text text-base">{item}</span>
                </li>
              </ScrollReveal>
            ))}
          </ul>
        </Container>
      </Section>

      {/* Formulier */}
      <Section id="formulier" bg="elevated">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start max-w-5xl mx-auto">
            <ScrollReveal>
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                Plan je check
              </span>
              <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
                Boek je moment
              </h2>
              <p className="text-text-muted text-lg mb-10 max-w-md">
                Vul het formulier in en Marlon neemt binnen 24 uur contact op om
                een moment te prikken.
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
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
                  <Field label="Voorkeur tijdstip">
                    <div className="relative">
                      <select
                        name="time"
                        required
                        defaultValue=""
                        className={`${fieldInputClasses} appearance-none pr-8`}
                      >
                        <option value="" disabled>
                          Kies een tijdstip
                        </option>
                        <option value="ochtend">Ochtend</option>
                        <option value="middag">Middag</option>
                        <option value="avond">Avond</option>
                      </select>
                      <SelectChevron />
                    </div>
                  </Field>
                </div>
                <Field label="Sportervaring">
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
                      <option value="beginner">Beginner</option>
                      <option value="gemiddeld">Gemiddeld</option>
                      <option value="gevorderd">Gevorderd</option>
                    </select>
                    <SelectChevron />
                  </div>
                </Field>
                <Field
                  label="Klachten of doelen"
                  hint="Optioneel"
                >
                  <textarea
                    name="goals"
                    rows={3}
                    className={`${fieldInputClasses} resize-none`}
                  />
                </Field>
                <Button
                  type="submit"
                  className={`w-full text-center ${loading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  {loading ? "Versturen" : "Plan mijn Mobility Check"}
                </Button>
                <p className="text-text-muted text-xs text-center">
                  Volledig gratis en vrijblijvend.
                </p>
              </form>
            </ScrollReveal>

            {/* FAQ */}
            <ScrollReveal delay={0.15}>
              <div className="sticky top-24">
                <span className="tmc-eyebrow block mb-4">Veelgestelde vragen</span>
                <div className="border-t border-bg-subtle">
                  {faqs.map((faq) => (
                    <div
                      key={faq.q}
                      className="py-5 border-b border-bg-subtle"
                    >
                      <h4 className="text-text font-medium text-base mb-2 tracking-[-0.01em]">
                        {faq.q}
                      </h4>
                      <p className="text-text-muted text-sm leading-relaxed">
                        {faq.a}
                      </p>
                    </div>
                  ))}
                </div>
                <GoogleReviewsBadge />
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>
    </LeadPageLayout>
  );
}
