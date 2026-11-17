import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { JsonLd } from "@/components/seo/JsonLd";
import type { LocatiePagina } from "@/content/lokaal";
import { getOpeningHours } from "../../../../sanity/lib/fetch";
import { getTrainerPresenceWindows } from "@/lib/trainer-presence";
import { bouwDagbalk } from "@/lib/lokaal/dagbalk";
import { resolveHref } from "@/lib/lokaal/links";
import { SITE } from "@/lib/constants";
import { STUDIO_COORDINAAT } from "@/content/lokaal";
import { getBreadcrumbSchema, getServiceSchema } from "@/lib/structuredData";
import { Dagbalk } from "./Dagbalk";
import { RegioKaart } from "./RegioKaart";
import {
  Afsluiter,
  AanbodLijst,
  FaqSectie,
  Kop,
  Kruimels,
  PlaatsChips,
  Voorheen,
} from "./Delen";

function minuten(n: number | undefined): string {
  return n === undefined ? "volgt" : `${n} min`;
}

/**
 * Locatiesjabloon (mockup v2): de reis is de hero. Routekaart met de autotijd
 * groot in beeld, quote, dagbalk, aanbod, FAQ, buurplaatsen en afsluiter.
 */
export async function LocatieTemplate({ pagina }: { pagina: LocatiePagina }) {
  const [openingstijden, presence] = await Promise.all([
    getOpeningHours(),
    getTrainerPresenceWindows(),
  ]);
  const dagbalk = bouwDagbalk(openingstijden.schedule, presence);

  const url = `${SITE.url}/${pagina.slug}`;
  const schema = [
    getBreadcrumbSchema([
      { name: "Home", url: SITE.url },
      { name: pagina.h1, url },
    ]),
    getServiceSchema({
      name: pagina.h1,
      serviceType: pagina.serviceType,
      description: pagina.seo.description,
      url,
      areaServed: pagina.areaServed,
    }),
  ];

  const primair = resolveHref(pagina.cta.primair.href);
  const secundair = pagina.cta.secundair ? resolveHref(pagina.cta.secundair.href) : null;

  const modi = [
    { label: "Fiets", waarde: minuten(pagina.reistijdFietsMin) },
    ...(pagina.ov ? [{ label: "Ov", waarde: pagina.ov }] : []),
    { label: "Aankomst", waarde: pagina.parkeren ?? "volgt" },
  ];

  return (
    <>
      <JsonLd data={schema} />

      {/* Hero: de reis */}
      <Section className="pt-32 md:pt-40 !pb-10 md:!pb-16">
        <Container>
          <Kruimels items={[{ label: "Home", href: "/" }, { label: pagina.h1 }]} />
          <div className="mt-5 grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-14">
            <div>
              <span className="tmc-eyebrow tmc-eyebrow--accent block">{pagina.eyebrow}</span>
              <h1 className="mt-3 font-[family-name:var(--font-playfair)] text-4xl leading-[1.06] tracking-[-0.02em] text-text md:text-6xl">
                {pagina.h1}
              </h1>
              <p className="mt-4 max-w-[32em] text-base leading-relaxed text-text-muted md:text-lg">
                {pagina.lead}
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                {primair && <Button href={primair}>{pagina.cta.primair.label}</Button>}
                {secundair && pagina.cta.secundair && (
                  <Button href={secundair} variant="secondary">
                    {pagina.cta.secundair.label}
                  </Button>
                )}
              </div>
              <Voorheen tekst={pagina.voorheen} />
            </div>

            <div className="overflow-hidden rounded-lg border border-ink-500/60 bg-bg-elevated">
              <div
                className="relative h-[210px] md:h-[280px]"
                style={{
                  background:
                    "radial-gradient(90% 90% at 80% 10%, rgba(185,152,106,0.18), transparent 60%), #13100e",
                }}
              >
                <RegioKaart
                  variant="route"
                  studio={STUDIO_COORDINAAT}
                  punten={[{ ...pagina.kaart, naam: `${pagina.plaats} centrum`, uitgelicht: true }]}
                />
              </div>
              <div className="flex items-baseline gap-3 px-5 pb-1.5 pt-4">
                <b className="whitespace-nowrap font-[family-name:var(--font-playfair)] text-6xl font-normal leading-none text-accent md:text-7xl">
                  {pagina.reistijdAutoMin === undefined ? "volgt" : `${pagina.reistijdAutoMin}`}
                </b>
                <span className="text-sm leading-snug text-text-muted">
                  {pagina.reistijdAutoMin === undefined ? (
                    "minuten met de auto"
                  ) : (
                    <>
                      minuten met de auto
                      <br />
                      vanaf {pagina.reistijdAutoVanaf ?? `het centrum van ${pagina.plaats}`}
                    </>
                  )}
                </span>
              </div>
              {pagina.extraVertrekpunten && pagina.extraVertrekpunten.length > 0 && (
                <ul className="px-5 pt-1 text-[13px] text-text-muted">
                  {pagina.extraVertrekpunten.map((v) => (
                    <li key={v.van}>
                      Vanaf {v.van}: {v.autoMin} min met de auto
                    </li>
                  ))}
                </ul>
              )}
              <dl
                className="mt-3 grid divide-x divide-ink-500/60 border-t border-ink-500/60"
                style={{ gridTemplateColumns: `repeat(${modi.length}, minmax(0, 1fr))` }}
              >
                {modi.map((m) => (
                  <div key={m.label} className="px-3.5 py-3 text-[12.5px] text-text-muted">
                    <dt className="mb-0.5 text-[13.5px] font-medium text-text">{m.label}</dt>
                    <dd>{m.waarde}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Container>
      </Section>

      {/* Quote (licht) */}
      {pagina.quote && (
        <Section bg="stone">
          <Container>
            <span
              className="tmc-eyebrow mb-3 block"
              style={{ color: "var(--champagne-deep)" }}
            >
              {pagina.quoteEyebrow}
            </span>
            <h2 className="mb-6 font-[family-name:var(--font-playfair)] text-2xl leading-tight text-on-light md:text-3xl">
              {pagina.quoteKop}
            </h2>
            <blockquote>
              <p className="max-w-[24em] font-[family-name:var(--font-playfair)] text-3xl font-light leading-[1.32] text-on-light md:text-5xl">
                {pagina.quote.tekst}
              </p>
              <cite className="mt-5 block text-[13.5px] not-italic text-on-light/70">
                {pagina.quote.voornaam}, {pagina.quote.woonplaats}
              </cite>
            </blockquote>
          </Container>
        </Section>
      )}

      {/* Wanneer het past */}
      <Section>
        <Container>
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <ScrollReveal>
              <Kop eyebrow={pagina.tijden.eyebrow} titel={pagina.tijden.titel} />
              <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted md:text-lg">
                {pagina.tijden.tekst}
                {pagina.tijden.ptTijden ? ` ${pagina.tijden.ptTijden}` : ""}
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <Dagbalk data={dagbalk} />
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* Aanbod */}
      <Section>
        <Container>
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <ScrollReveal>
              <Kop eyebrow={pagina.aanbod.eyebrow} titel={pagina.aanbod.titel} />
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <AanbodLijst regels={pagina.aanbod.regels} />
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      <FaqSectie eyebrow={pagina.faqKop.eyebrow} titel={pagina.faqKop.titel} faq={pagina.faq} />

      {/* Buurplaatsen */}
      <section className="border-t border-ink-500/60 py-6">
        <Container>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* COPY: confirm met Marlon */}
            <p className="text-[14.5px] text-text-muted">Ook in de buurt:</p>
            <PlaatsChips plaatsen={pagina.buurplaatsen} />
          </div>
        </Container>
      </section>

      <Afsluiter data={pagina.afsluiter} />
    </>
  );
}
