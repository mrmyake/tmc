"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { ContactForm } from "@/components/blocks/ContactForm";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/constants";
import { MapPin, Clock, Phone, Mail, MessageCircle } from "lucide-react";

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
              subtext="Heb je een vraag, wil je meer weten over ons aanbod, of wil je een proefles boeken? We horen graag van je."
            />
          </ScrollReveal>
        </Container>
      </Section>

      {/* Form + Info */}
      <Section bg="elevated">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            {/* Form */}
            <ScrollReveal>
              <h3 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-6">
                Stuur ons een bericht
              </h3>
              <ContactForm />
            </ScrollReveal>

            {/* Info */}
            <ScrollReveal delay={0.15}>
              <div className="space-y-8">
                <div className="flex gap-4">
                  <MapPin size={20} className="text-accent mt-1 shrink-0" />
                  <div>
                    <h4 className="text-text font-medium mb-1">Adres</h4>
                    <p className="text-text-muted text-sm">
                      {SITE.address.street}
                      <br />
                      {SITE.address.zip} {SITE.address.city}
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Phone size={20} className="text-accent mt-1 shrink-0" />
                  <div>
                    <h4 className="text-text font-medium mb-1">Telefoon</h4>
                    <a
                      href={`tel:${SITE.phone.replace(/\s/g, "")}`}
                      className="text-text-muted text-sm hover:text-text transition-colors"
                    >
                      {SITE.phone}
                    </a>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Mail size={20} className="text-accent mt-1 shrink-0" />
                  <div>
                    <h4 className="text-text font-medium mb-1">E-mail</h4>
                    <a
                      href={`mailto:${SITE.email}`}
                      className="text-text-muted text-sm hover:text-text transition-colors"
                    >
                      {SITE.email}
                    </a>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Clock size={20} className="text-accent mt-1 shrink-0" />
                  <div>
                    <h4 className="text-text font-medium mb-1">Openingstijden</h4>
                    <div className="text-text-muted text-sm space-y-1">
                      <p>Maandag – Vrijdag: 07:00 – 21:00</p>
                      <p>Zaterdag: 08:00 – 14:00</p>
                      <p>Zondag: Gesloten</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <MessageCircle size={20} className="text-accent mt-1 shrink-0" />
                  <div>
                    <h4 className="text-text font-medium mb-1">WhatsApp</h4>
                    <p className="text-text-muted text-sm mb-3">
                      Liever direct chatten? Stuur ons een WhatsApp-bericht.
                    </p>
                    <Button href={SITE.whatsapp} variant="secondary" className="text-sm">
                      Open WhatsApp
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* Map + Route */}
      <Section>
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            <ScrollReveal>
              <div className="aspect-[4/3] bg-bg-elevated overflow-hidden">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2438.5!2d5.095!3d52.2!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sIndustrieweg+14P+Loosdrecht!5e0!3m2!1snl!2snl!4v1"
                  className="w-full h-full border-0 grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all duration-500"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="The Movement Club locatie"
                />
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.15}>
              <h3 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-6">
                Routebeschrijving
              </h3>
              <div className="space-y-6">
                <div>
                  <h4 className="text-text font-medium text-sm uppercase tracking-widest mb-2">
                    Met de auto
                  </h4>
                  <p className="text-text-muted text-sm leading-relaxed">
                    Vanuit Amsterdam of Utrecht ben je via de A2 in circa 30 minuten
                    bij onze studio. Neem afslag Loosdrecht/Hilversum en volg de
                    borden richting Industrieweg. Gratis parkeren voor de deur.
                  </p>
                </div>
                <div>
                  <h4 className="text-text font-medium text-sm uppercase tracking-widest mb-2">
                    Met het openbaar vervoer
                  </h4>
                  <p className="text-text-muted text-sm leading-relaxed">
                    Station Hilversum is het dichtstbijzijnde treinstation. Vanaf
                    daar neem je bus 108 richting Loosdrecht. De halte
                    Industrieweg is op 2 minuten loopafstand van de studio.
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
