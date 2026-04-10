"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { LeadPageLayout } from "@/components/layout/LeadPageLayout";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { GoogleReviewsBadge } from "@/components/ui/GoogleReviewsBadge";
import { trackLead, trackFormStart } from "@/lib/analytics";
import { ClipboardCheck, Eye, FileText } from "lucide-react";

const inputStyles =
  "w-full bg-bg-elevated border border-bg-subtle px-4 py-3 text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

const steps = [
  {
    icon: ClipboardCheck,
    title: "1. Intake",
    description: "Korte vragenlijst over je doelen, klachten en sportervaring.",
  },
  {
    icon: Eye,
    title: "2. Screening",
    description: "6-8 bewegingspatronen worden geanalyseerd door Marlon.",
  },
  {
    icon: FileText,
    title: "3. Jouw Profiel",
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
    const data = Object.fromEntries(formData.entries());

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
      <Section className="pt-16 md:pt-24">
        <Container className="max-w-3xl text-center">
          <ScrollReveal>
            <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 block">
              Gratis & Vrijblijvend
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-5xl text-text mb-4 leading-[1.15]">
              Ontdek hoe je beweegt
            </h1>
            <p className="text-text-muted text-lg mb-8">
              Gratis 20-minuten mobility screening met trainer Marlon
            </p>
            <Button
              href="#formulier"
              variant="primary"
            >
              Plan mijn Mobility Check
            </Button>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Hoe het werkt */}
      <Section bg="elevated">
        <Container>
          <ScrollReveal>
            <SectionHeading label="Hoe het werkt" heading="In 3 stappen" />
          </ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <ScrollReveal key={step.title} delay={i * 0.1}>
                  <div className="text-center p-6">
                    <div className="inline-flex items-center justify-center w-14 h-14 mb-4 border border-accent/30 text-accent">
                      <Icon size={24} />
                    </div>
                    <h3 className="font-[family-name:var(--font-playfair)] text-lg text-text mb-2">
                      {step.title}
                    </h3>
                    <p className="text-text-muted text-sm">{step.description}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* Voor wie */}
      <Section>
        <Container className="max-w-3xl">
          <ScrollReveal>
            <SectionHeading label="Voor wie" heading="Herken je dit?" />
          </ScrollReveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {forWhom.map((item, i) => (
              <ScrollReveal key={item} delay={i * 0.08}>
                <div className="bg-bg-elevated border border-bg-subtle p-5 text-text text-sm">
                  {item}
                </div>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Formulier */}
      <Section id="formulier" bg="elevated">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start max-w-5xl mx-auto">
            <ScrollReveal>
              <h2 className="font-[family-name:var(--font-playfair)] text-3xl text-text mb-4">
                Plan je Mobility Check
              </h2>
              <p className="text-text-muted mb-8">
                Vul het formulier in en Marlon neemt binnen 24 uur contact op om
                een moment te prikken.
              </p>
              <form
                onSubmit={handleSubmit}
                onFocus={handleFocus}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    name="firstName"
                    placeholder="Voornaam *"
                    required
                    className={inputStyles}
                  />
                  <input
                    type="text"
                    name="lastName"
                    placeholder="Achternaam *"
                    required
                    className={inputStyles}
                  />
                </div>
                <input
                  type="email"
                  name="email"
                  placeholder="E-mailadres *"
                  required
                  className={inputStyles}
                />
                <input
                  type="tel"
                  name="phone"
                  placeholder="Telefoonnummer *"
                  required
                  className={inputStyles}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <select name="day" required className={inputStyles}>
                    <option value="">Voorkeur dag *</option>
                    <option value="maandag">Maandag</option>
                    <option value="dinsdag">Dinsdag</option>
                    <option value="woensdag">Woensdag</option>
                    <option value="donderdag">Donderdag</option>
                    <option value="vrijdag">Vrijdag</option>
                    <option value="zaterdag">Zaterdag</option>
                  </select>
                  <select name="time" required className={inputStyles}>
                    <option value="">Voorkeur tijdstip *</option>
                    <option value="ochtend">Ochtend</option>
                    <option value="middag">Middag</option>
                    <option value="avond">Avond</option>
                  </select>
                </div>
                <select name="experience" required className={inputStyles}>
                  <option value="">Sportervaring *</option>
                  <option value="beginner">Beginner</option>
                  <option value="gemiddeld">Gemiddeld</option>
                  <option value="gevorderd">Gevorderd</option>
                </select>
                <textarea
                  name="goals"
                  placeholder="Klachten of doelen (optioneel)"
                  rows={3}
                  className={`${inputStyles} resize-none`}
                />
                <Button
                  type="submit"
                  className={`w-full text-center ${loading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  {loading ? "Bezig..." : "Plan mijn Mobility Check"}
                </Button>
                <p className="text-text-muted text-xs text-center">
                  Volledig gratis en vrijblijvend.
                </p>
              </form>
            </ScrollReveal>

            {/* FAQ */}
            <ScrollReveal delay={0.15}>
              <div className="sticky top-24">
                <h3 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-6">
                  Veelgestelde vragen
                </h3>
                <div className="space-y-5">
                  {faqs.map((faq) => (
                    <div key={faq.q}>
                      <h4 className="text-text font-medium text-sm mb-1">
                        {faq.q}
                      </h4>
                      <p className="text-text-muted text-sm">{faq.a}</p>
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
