"use client";

import Image from "next/image";
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
import { getStoredUtm } from "@/lib/utm";
import { urlFor } from "../../../sanity/lib/client";
import type { SanityImage } from "../../../sanity/lib/fetch";

interface BeweegBeterContentProps {
  coverImage?: SanityImage;
}

const bullets = [
  "5 oefeningen die je in 10 minuten doet",
  "Van hip mobility tot thoracic rotation",
  "Met veelgemaakte fouten en tips",
];

export function BeweegBeterContent({ coverImage }: BeweegBeterContentProps) {
  const [loading, setLoading] = useState(false);
  const tracked = useRef(false);
  const router = useRouter();

  const handleFocus = () => {
    if (!tracked.current) {
      trackFormStart("beweeg_beter_form");
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
      utm: getStoredUtm(),
      signupPath: window.location.pathname,
    };

    try {
      await fetch("/api/leads/beweeg-beter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      // Continue even if API fails — still deliver the PDF
    }

    trackLead("pdf_beweeg_beter", 1);
    router.push("/beweeg-beter/bedankt");
  };

  return (
    <LeadPageLayout>
      <Section className="pt-24 md:pt-32">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center max-w-5xl mx-auto">
            {/* Left: cover uit Sanity, met editorial fallback */}
            <ScrollReveal>
              {coverImage?.asset ? (
                <div className="relative aspect-[3/4] bg-bg-elevated overflow-hidden">
                  <Image
                    src={urlFor(coverImage).width(900).height(1200).url()}
                    alt="Beweeg Beter guide — The Movement Club"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-[3/4] bg-bg-elevated flex flex-col items-center justify-center p-10 text-center relative">
                  <div
                    aria-hidden
                    className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
                  />
                  <span className="tmc-eyebrow tmc-eyebrow--accent mb-8">
                    PDF guide
                  </span>
                  <p className="font-[family-name:var(--font-playfair)] text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4">
                    Beweeg beter.
                  </p>
                  <p className="text-text-muted text-sm max-w-[22ch]">
                    Vijf oefeningen voor meer mobiliteit en kracht.
                  </p>
                  <div
                    aria-hidden
                    className="my-8 w-16 h-px bg-text-muted/30"
                  />
                  <span className="tmc-eyebrow text-text-muted/70">
                    Door Marlon · The Movement Club
                  </span>
                </div>
              )}
            </ScrollReveal>

            {/* Right: form */}
            <ScrollReveal delay={0.15}>
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                Gratis guide
              </span>
              <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
                Beweeg beter in tien minuten per dag
              </h1>
              <p className="text-text-muted text-lg mb-8">
                Vijf oefeningen die Marlon zelf gebruikt. Direct bruikbaar,
                rustig uitgelegd.
              </p>

              <ul className="space-y-0 mb-10 border-y border-bg-subtle divide-y divide-bg-subtle">
                {bullets.map((item, i) => (
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
                  {loading ? "Versturen" : "Download gratis"}
                </Button>
                <p className="text-text-muted text-xs text-center">
                  We respecteren je privacy. Geen spam, uitschrijven kan altijd.
                </p>
              </form>

              <GoogleReviewsBadge />
            </ScrollReveal>
          </div>
        </Container>
      </Section>
    </LeadPageLayout>
  );
}
