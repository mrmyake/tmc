"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/constants";
import { MapPin, Clock, MessageCircle } from "lucide-react";

export function ContactSection() {
  return (
    <Section id="contact">
      <Container>
        <ScrollReveal>
          <SectionHeading
            label="Locatie & Contact"
            heading="Kom langs"
            subtext="We verwelkomen je graag in onze studio aan de Industrieweg in Loosdrecht."
          />
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          {/* Map */}
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

          {/* Info */}
          <ScrollReveal delay={0.15}>
            <div className="space-y-8">
              <div className="flex gap-4">
                <MapPin
                  size={20}
                  className="text-accent mt-1 shrink-0"
                />
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
                <Clock
                  size={20}
                  className="text-accent mt-1 shrink-0"
                />
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
                <MessageCircle
                  size={20}
                  className="text-accent mt-1 shrink-0"
                />
                <div>
                  <h4 className="text-text font-medium mb-1">Direct contact</h4>
                  <p className="text-text-muted text-sm mb-3">
                    Stuur ons een bericht via WhatsApp of mail naar{" "}
                    <a
                      href={`mailto:${SITE.email}`}
                      className="text-accent hover:text-accent-hover transition-colors"
                    >
                      {SITE.email}
                    </a>
                  </p>
                  <Button
                    href={SITE.whatsapp}
                    variant="secondary"
                    className="text-sm"
                  >
                    WhatsApp ons
                  </Button>
                </div>
              </div>

              <div className="pt-4">
                <Button href="/contact" className="w-full md:w-auto text-center">
                  Naar contactpagina
                </Button>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </Container>
    </Section>
  );
}
