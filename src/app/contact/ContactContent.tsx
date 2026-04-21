"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { ContactForm } from "@/components/blocks/ContactForm";
import { GoogleReviewsBadge } from "@/components/ui/GoogleReviewsBadge";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";
import { SITE } from "@/lib/constants";

export function ContactContent() {
  return (
    <>
      {/* Header */}
      <Section className="pt-32 md:pt-40">
        <Container>
          <ScrollReveal>
            <SectionHeading
              label="Contact"
              heading="Neem contact op"
              subtext="Heb je een vraag, wil je meer weten over het aanbod, of wil je een proefles plannen? We horen graag van je."
            />
          </ScrollReveal>
        </Container>
      </Section>

      {/* Form + Info */}
      <Section bg="elevated">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
            {/* Form */}
            <ScrollReveal>
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                Bericht sturen
              </span>
              <h3 className="text-3xl md:text-4xl font-medium text-text mb-8 tracking-[-0.01em] leading-[1.1]">
                Stuur ons een bericht
              </h3>
              <ContactForm />
              <GoogleReviewsBadge />
            </ScrollReveal>

            {/* Info */}
            <ScrollReveal delay={0.15}>
              <div className="space-y-10">
                <div>
                  <span className="tmc-eyebrow block mb-3">Adres</span>
                  <p className="text-text-muted text-sm leading-relaxed">
                    {SITE.address.street}
                    <br />
                    {SITE.address.zip} · {SITE.address.city}
                  </p>
                </div>

                <div>
                  <span className="tmc-eyebrow block mb-3">Telefoon</span>
                  <QuietLink href={`tel:${SITE.phone.replace(/\s/g, "")}`}>
                    {SITE.phone}
                  </QuietLink>
                </div>

                <div>
                  <span className="tmc-eyebrow block mb-3">E-mail</span>
                  <QuietLink href={`mailto:${SITE.email}`}>
                    {SITE.email}
                  </QuietLink>
                </div>

                <div>
                  <span className="tmc-eyebrow block mb-3">Openingstijden</span>
                  <div className="text-text-muted text-sm space-y-1">
                    <p>Maandag – vrijdag: 07:00 – 21:00</p>
                    <p>Zaterdag: 08:00 – 14:00</p>
                    <p>Zondag: gesloten</p>
                  </div>
                </div>

                <div>
                  <span className="tmc-eyebrow block mb-3">WhatsApp</span>
                  <p className="text-text-muted text-sm mb-4">
                    Liever direct chatten? Stuur ons een WhatsApp-bericht.
                  </p>
                  <Button href={SITE.whatsapp} variant="secondary">
                    Open WhatsApp
                  </Button>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* Map + Route */}
      <Section>
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
            <ScrollReveal>
              <div className="aspect-[4/3] bg-bg-elevated overflow-hidden">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2438.5!2d5.095!3d52.2!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sIndustrieweg+14P+Loosdrecht!5e0!3m2!1snl!2snl!4v1"
                  className="w-full h-full border-0 saturate-0 brightness-75 hover:saturate-100 hover:brightness-100 transition-all duration-700 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="The Movement Club locatie"
                />
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.15}>
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                Hoe je hier komt
              </span>
              <h3 className="text-3xl md:text-4xl font-medium text-text mb-8 tracking-[-0.01em] leading-[1.1]">
                Routebeschrijving
              </h3>
              <div className="space-y-8">
                <div>
                  <span className="tmc-eyebrow block mb-3">Met de auto</span>
                  <p className="text-text-muted text-sm leading-relaxed">
                    Vanuit Amsterdam of Utrecht ben je via de A2 in circa 30
                    minuten bij de studio. Neem afslag Loosdrecht/Hilversum en
                    volg de borden richting Industrieweg. Gratis parkeren voor
                    de deur.
                  </p>
                </div>
                <div>
                  <span className="tmc-eyebrow block mb-3">
                    Met het openbaar vervoer
                  </span>
                  <p className="text-text-muted text-sm leading-relaxed">
                    Station Hilversum is het dichtstbijzijnde treinstation.
                    Vanaf daar neem je bus 108 richting Loosdrecht. Halte
                    Industrieweg ligt op twee minuten loopafstand.
                  </p>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>
    </>
  );
}
