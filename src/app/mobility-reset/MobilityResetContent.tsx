"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { LeadPageLayout } from "@/components/layout/LeadPageLayout";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { GoogleReviewsBadge } from "@/components/ui/GoogleReviewsBadge";
import { trackLead, trackFormStart } from "@/lib/analytics";
import { Play } from "lucide-react";

const inputStyles =
  "w-full bg-bg-elevated border border-bg-subtle px-4 py-3 text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

const days = [
  "Heupen & Onderrug",
  "Schouders & Thoracic",
  "Adem & Core",
  "Enkels & Voeten",
  "Full Body Flow",
  "Strength Basics",
  "Jouw Volgende Stap",
];

export function MobilityResetContent() {
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
      <Section className="pt-16 md:pt-24">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start max-w-5xl mx-auto">
            {/* Left: pitch */}
            <ScrollReveal>
              <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 block">
                Gratis 7-dagen programma
              </span>
              <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-4 leading-[1.15]">
                7 Dagen Mobility Reset
              </h1>
              <p className="text-text-muted text-lg mb-8">
                Elke dag een korte video van Marlon. Beweeg beter in een week.
              </p>

              {/* Video preview */}
              <div className="aspect-video bg-bg-elevated border border-bg-subtle flex items-center justify-center mb-8">
                <div className="text-center">
                  <Play size={40} className="text-accent mx-auto mb-2" />
                  <p className="text-text-muted text-sm">
                    Preview: Dag 1 — Heupen & Onderrug
                  </p>
                </div>
                {/* {FOTO: Video thumbnail dag 1} */}
              </div>

              <h3 className="text-text font-medium text-sm uppercase tracking-widest mb-4">
                Wat je krijgt
              </h3>
              <ul className="space-y-3 mb-8">
                {[
                  "7 video's van 2-3 minuten",
                  "Van heupen tot schouders, van adem tot kracht",
                  "Dag 7: jouw persoonlijke volgende stap",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-text text-sm"
                  >
                    <span className="text-accent mt-0.5">—</span>
                    {item}
                  </li>
                ))}
              </ul>

              {/* Day overview */}
              <h3 className="text-text font-medium text-sm uppercase tracking-widest mb-4">
                Het programma
              </h3>
              <div className="space-y-2">
                {days.map((day, i) => (
                  <div
                    key={day}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="text-accent font-medium w-12 shrink-0">
                      Dag {i + 1}
                    </span>
                    <span className="text-text-muted">{day}</span>
                  </div>
                ))}
              </div>

              <GoogleReviewsBadge />
            </ScrollReveal>

            {/* Right: form */}
            <ScrollReveal delay={0.15}>
              <div className="bg-bg-elevated border border-bg-subtle p-6 md:p-8 sticky top-24">
                <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-2">
                  Start mijn reset
                </h2>
                <p className="text-text-muted text-sm mb-6">
                  Morgenochtend ontvang je de eerste video.
                </p>
                <form
                  onSubmit={handleSubmit}
                  onFocus={handleFocus}
                  className="space-y-4"
                >
                  <input
                    type="text"
                    name="name"
                    placeholder="Voornaam *"
                    required
                    className={inputStyles}
                  />
                  <input
                    type="email"
                    name="email"
                    placeholder="E-mailadres *"
                    required
                    className={inputStyles}
                  />
                  <Button
                    type="submit"
                    className={`w-full text-center ${loading ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    {loading ? "Bezig..." : "Start mijn reset"}
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
