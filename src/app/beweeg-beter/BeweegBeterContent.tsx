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
import { FileDown } from "lucide-react";

const inputStyles =
  "w-full bg-bg-elevated border border-bg-subtle px-4 py-3 text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

export function BeweegBeterContent() {
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
      <Section className="pt-16 md:pt-24">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-5xl mx-auto">
            {/* Left: PDF mockup */}
            <ScrollReveal>
              <div className="aspect-[3/4] bg-bg-elevated border border-bg-subtle flex flex-col items-center justify-center p-8">
                <FileDown size={48} className="text-accent mb-6" />
                <p className="font-[family-name:var(--font-playfair)] text-2xl text-text text-center mb-2">
                  Beweeg Beter
                </p>
                <p className="text-text-muted text-sm text-center">
                  5 dagelijkse oefeningen voor meer mobiliteit en kracht
                </p>
                {/* {FOTO: PDF mockup / cover design} */}
              </div>
            </ScrollReveal>

            {/* Right: form */}
            <ScrollReveal delay={0.15}>
              <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 block">
                Gratis guide
              </span>
              <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-4 leading-[1.15]">
                Beweeg Beter — 5 dagelijkse oefeningen voor meer mobiliteit en
                kracht
              </h1>
              <p className="text-text-muted text-lg mb-6">
                Gratis guide van trainer Marlon. Download direct.
              </p>

              <ul className="space-y-3 mb-8">
                {[
                  "5 oefeningen die je in 10 minuten doet",
                  "Van hip mobility tot thoracic rotation",
                  "Inclusief veelgemaakte fouten en tips",
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
                  {loading ? "Bezig..." : "Download gratis"}
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
