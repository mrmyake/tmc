"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";
import type { SanitySettings, SanityOpeningHours } from "../../../sanity/lib/fetch";

interface ContactSectionProps {
  settings: SanitySettings;
  hours: SanityOpeningHours;
}

export function ContactSection({ settings, hours }: ContactSectionProps) {
  const whatsappUrl = `https://wa.me/${settings.whatsappNumber}`;

  return (
    <Section id="contact">
      <Container>
        <ScrollReveal>
          <SectionHeading
            label="Locatie · Contact"
            heading="Kom langs"
            subtext={`We verwelkomen je graag in onze studio aan de ${settings.address.street} in ${settings.address.city}.`}
          />
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
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
            <div className="space-y-10">
              <div>
                <span className="tmc-eyebrow block mb-3">Adres</span>
                <p className="text-text-muted text-sm leading-relaxed">
                  {settings.address.street}
                  <br />
                  {settings.address.postalCode} · {settings.address.city}
                </p>
              </div>

              <div>
                <span className="tmc-eyebrow block mb-3">Openingstijden</span>
                <div className="text-text-muted text-sm space-y-1">
                  {hours.schedule.map((s) => (
                    <p key={s.day}>
                      {s.day}: {s.closed ? "Gesloten" : `${s.open} – ${s.close}`}
                    </p>
                  ))}
                </div>
                {hours.note && (
                  <p className="text-text-muted text-xs mt-3">{hours.note}</p>
                )}
              </div>

              <div>
                <span className="tmc-eyebrow block mb-3">Direct contact</span>
                <p className="text-text-muted text-sm mb-4">
                  Stuur ons een bericht via WhatsApp, of mail naar{" "}
                  <QuietLink
                    href={`mailto:${settings.email}`}
                    className="inline"
                  >
                    {settings.email}
                  </QuietLink>
                  .
                </p>
                <Button href={whatsappUrl} variant="secondary">
                  WhatsApp ons
                </Button>
              </div>

              <div className="pt-2">
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
