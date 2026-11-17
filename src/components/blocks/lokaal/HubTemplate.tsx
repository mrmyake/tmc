import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { JsonLd } from "@/components/seo/JsonLd";
import { STUDIO_COORDINAAT, type HubPagina } from "@/content/lokaal";
import { paginaUrl, resolveHref } from "@/lib/lokaal/links";
import { SITE } from "@/lib/constants";
import { getBreadcrumbSchema, getServiceSchema } from "@/lib/structuredData";
import { RegioKaart } from "./RegioKaart";
import { AanbodLijst, Afsluiter, Kop, Kruimels, Voorheen } from "./Delen";

function minuten(n: number | undefined): string {
  return n === undefined ? "volgt" : `± ${n} min`;
}

/**
 * Hubsjabloon (mockup v2): de regiokaart is de hero. Plaatskaarten voor de
 * plaatsen met een eigen pagina, de reistijdtabel, waarom-punten en aanbod.
 */
export function HubTemplate({ pagina }: { pagina: HubPagina }) {
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
  const kaartPlaatsen = pagina.plaatsen.filter((p) => p.pagina);

  return (
    <>
      <JsonLd data={schema} />

      {/* Hero: de regiokaart */}
      <Section className="pt-32 md:pt-40 !pb-10 md:!pb-14">
        <Container>
          <Kruimels items={[{ label: "Home", href: "/" }, { label: pagina.h1 }]} />
          <div className="mt-5 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-10">
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
            <div
              className="relative aspect-[560/440] overflow-hidden rounded-lg border border-ink-500/60"
              style={{
                background:
                  "radial-gradient(70% 70% at 15% 90%, rgba(185,152,106,0.16), transparent 65%), #13100e",
              }}
            >
              <RegioKaart
                variant="regio"
                studio={STUDIO_COORDINAAT}
                punten={pagina.plaatsen.map((p) => ({
                  naam: p.naam,
                  lat: p.lat,
                  lon: p.lon,
                  uitgelicht: Boolean(p.pagina),
                  badge:
                    p.pagina && p.reistijdAutoMin !== undefined
                      ? `± ${p.reistijdAutoMin} min`
                      : undefined,
                }))}
              />
              <span className="absolute bottom-2.5 right-3 text-[10px] uppercase tracking-[0.06em] text-text/50">
                Schematisch
              </span>
            </div>
          </div>
        </Container>
      </Section>

      {/* Per plaats (licht) */}
      <Section bg="stone">
        <Container>
          <ScrollReveal>
            <Kop licht eyebrow={pagina.plaatsenKop.eyebrow} titel={pagina.plaatsenKop.titel} />
          </ScrollReveal>
          <ul className="mt-8 grid border-t border-on-light/15 lg:grid-cols-3 lg:gap-x-8 lg:border-t-0">
            {kaartPlaatsen.map((p) => {
              const href = p.pagina ? resolveHref(paginaUrl(p.pagina)) : null;
              const klassen =
                "grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-on-light/15 py-5 text-on-light lg:border-b-0 lg:border-t lg:py-6";
              const inhoud = (
                <>
                  <b className="font-[family-name:var(--font-playfair)] text-3xl font-normal leading-tight lg:text-4xl">
                    {p.naam}
                  </b>
                  <span className="col-start-1 text-sm text-on-light/65">{p.omschrijving}</span>
                  <em className="col-start-2 row-span-2 row-start-1 self-center text-right font-[family-name:var(--font-playfair)] text-xl not-italic text-[color:var(--champagne-deep)]">
                    {minuten(p.reistijdAutoMin)}
                  </em>
                </>
              );
              return (
                <li key={p.naam}>
                  {href ? (
                    <Link href={href} className={klassen}>
                      {inhoud}
                    </Link>
                  ) : (
                    <div className={klassen}>{inhoud}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Container>
      </Section>

      {/* Reistijden */}
      <Section>
        <Container>
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <ScrollReveal>
              <Kop
                eyebrow={pagina.reistijden.eyebrow}
                titel={pagina.reistijden.titel}
                intro={pagina.reistijden.intro}
              />
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                    <th scope="col" className="pb-2.5 pr-2.5 font-semibold">Vanaf</th>
                    <th scope="col" className="pb-2.5 pr-2.5 font-semibold">Auto</th>
                    <th scope="col" className="hidden pb-2.5 pr-2.5 font-semibold md:table-cell">Fiets</th>
                    <th scope="col" className="pb-2.5"><span className="sr-only">Pagina</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.plaatsen.map((p) => {
                    const href = p.pagina ? resolveHref(paginaUrl(p.pagina)) : null;
                    return (
                      <tr key={p.naam} className="border-t border-ink-500/60">
                        <th
                          scope="row"
                          className="py-3.5 pr-2.5 text-left font-[family-name:var(--font-playfair)] text-lg font-normal text-text md:text-xl"
                        >
                          {p.naam}
                        </th>
                        <td className="whitespace-nowrap py-3.5 pr-2.5 tabular-nums text-text-muted">
                          {minuten(p.reistijdAutoMin)}
                        </td>
                        <td className="hidden whitespace-nowrap py-3.5 pr-2.5 tabular-nums text-text-muted md:table-cell">
                          {minuten(p.reistijdFietsMin)}
                        </td>
                        <td className="py-3.5 text-right">
                          {href && (
                            <Link href={href} className="whitespace-nowrap text-[13.5px] text-accent">
                              Meer
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* Waarom */}
      <Section>
        <Container>
          <ScrollReveal>
            <Kop eyebrow={pagina.waarom.eyebrow} titel={pagina.waarom.titel} />
          </ScrollReveal>
          <ol className="mt-8 grid gap-0 border-t border-ink-500/60 lg:grid-cols-3 lg:gap-8 lg:border-t-0">
            {pagina.waarom.punten.map((punt, i) => (
              <li
                key={punt.titel}
                className="grid grid-cols-[30px_1fr] gap-2.5 border-b border-ink-500/60 py-4 lg:border-b-0 lg:border-t"
              >
                <span className="font-[family-name:var(--font-playfair)] text-[19px] leading-tight text-accent">
                  {i + 1}
                </span>
                <div>
                  <b className="mb-0.5 block font-medium text-text">{punt.titel}</b>
                  <span className="text-sm leading-relaxed text-text-muted">{punt.tekst}</span>
                </div>
              </li>
            ))}
          </ol>
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

      <Afsluiter data={pagina.afsluiter} />
    </>
  );
}
