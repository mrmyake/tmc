"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { LeadPageLayout } from "@/components/layout/LeadPageLayout";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { GoogleReviewsBadge } from "@/components/ui/GoogleReviewsBadge";
import { trackLead, trackFormStart } from "@/lib/analytics";
import { Play } from "lucide-react";
import Image from "next/image";
import { urlFor } from "../../../sanity/lib/client";
import type { SanityImage } from "../../../sanity/lib/fetch";

interface MobilityResetContentProps {
  thumb?: SanityImage;
}

const days = [
  "Heupen & Onderrug",
  "Schouders & Thoracic",
  "Adem & Core",
  "Enkels & Voeten",
  "Full Body Flow",
  "Strength Basics",
  "Jouw Volgende Stap",
];

export function MobilityResetContent({ thumb }: MobilityResetContentProps) {
  const [loading, setLoading] = useState(false);
  const tracked = useRef(false);
  const router = useRouter();

  const handleFocus = () => {
    if (!tracked.current) {
      trackFormStart("mobility_reset_form");
      tracked.current = true;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
    };

    try {
      await fetch("/api/leads/mobility-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      // Continue even if API fails
    }

    trackLead("mobility_reset_optin", 5);
    router.push("/mobility-reset/bedankt");
  };

  return (
    <LeadPageLayout>
      <Section className="pt-24 md:pt-32">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-start max-w-5xl mx-auto">
            {/* Left: pitch */}
            <ScrollReveal>
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                Gratis 7-dagen programma
              </span>
              <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
                Zeven dagen mobility reset
              </h1>
              <p className="text-text-muted text-lg mb-10">
                Elke dag een korte video van Marlon. Beweeg vrijer in een week.
              </p>

              {/* Video preview — Sanity thumb met Play-overlay, fallback placeholder */}
              {thumb?.asset ? (
                <div className="relative aspect-video bg-bg-elevated mb-12 overflow-hidden">
                  <Image
                    src={urlFor(thumb).width(1280).height(720).url()}
                    alt="Mobility Reset video preview"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-bg/40"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Play
                      size={44}
                      strokeWidth={1.5}
                      className="text-accent"
                      aria-hidden
                    />
                  </div>
                </div>
              ) : (
                <div className="aspect-video bg-bg-elevated flex items-center justify-center mb-12 relative">
                  <div
                    aria-hidden
                    className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
                  />
                  <div className="text-center">
                    <Play
                      size={40}
                      strokeWidth={1.5}
                      className="text-accent mx-auto mb-3"
                    />
                    <span className="tmc-eyebrow text-text-muted">
                      Preview · Dag 01 · Heupen & onderrug
                    </span>
                  </div>
                </div>
              )}

              <span className="tmc-eyebrow block mb-5">Wat je krijgt</span>
              <ul className="space-y-0 mb-12 border-y border-bg-subtle divide-y divide-bg-subtle">
                {[
                  "7 video's van 2-3 minuten",
                  "Van heupen tot schouders, van adem tot kracht",
                  "Dag 7: je persoonlijke volgende stap",
                ].map((item, i) => (
                  <li
                    key={item}
                    className="py-4 flex items-baseline gap-5"
                  >
                    <span className="tmc-eyebrow text-text-muted/70 shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-text text-sm leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Day overview */}
              <span className="tmc-eyebrow block mb-5">Het programma</span>
              <ul className="border-y border-bg-subtle divide-y divide-bg-subtle">
                {days.map((day, i) => (
                  <li
                    key={day}
                    className="py-3.5 flex items-baseline gap-6"
                  >
                    <span className="tmc-eyebrow tmc-eyebrow--accent w-16 shrink-0">
                      Dag {i + 1}
                    </span>
                    <span className="text-text-muted text-sm">{day}</span>
                  </li>
                ))}
              </ul>

              <GoogleReviewsBadge />
            </ScrollReveal>

            {/* Right: form */}
            <ScrollReveal delay={0.15}>
              <div className="bg-bg-elevated p-8 md:p-10 sticky top-24 relative">
                <div
                  aria-hidden
                  className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
                />
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                  Start nu
                </span>
                <h2 className="text-2xl font-medium text-text mb-3 tracking-[-0.01em]">
                  Ontvang dag 1
                </h2>
                <p className="text-text-muted text-sm mb-8">
                  Morgenochtend staat de eerste video in je inbox.
                </p>
                <form
                  onSubmit={handleSubmit}
                  onFocus={handleFocus}
                  className="space-y-6"
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
                  <Button
                    type="submit"
                    className={`w-full text-center ${loading ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    {loading ? "Versturen" : "Start mijn reset"}
                  </Button>
                  <p className="text-text-muted text-xs text-center">
                    Gratis en vrijblijvend. Geen spam.
                  </p>
                </form>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>
    </LeadPageLayout>
  );
}
