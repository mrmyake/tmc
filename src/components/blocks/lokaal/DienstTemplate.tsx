import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { JsonLd } from "@/components/seo/JsonLd";
import type { DienstPagina } from "@/content/lokaal";
import { getBreadcrumbSchema, getServiceSchema } from "@/lib/structuredData";
import { resolveHref } from "@/lib/lokaal/links";
import { SITE } from "@/lib/constants";
import { Beeld } from "./Beeld";
import { RoosterPijlerStrip } from "./RoosterPijlerStrip";
import { Afsluiter, FaqSectie, Kop, Kruimels, RegioRegel, Voorheen } from "./Delen";

/**
 * Dienstsjabloon (mockup v2): beeldvullende hero met cijferbalk, basissectie,
 * trainer met live rooster, vormen, FAQ, regio-regel en afsluiter.
 */
export function DienstTemplate({ pagina }: { pagina: DienstPagina }) {
  const url = `${SITE.url}/${pagina.slug}`;
  const schema = [
    getBreadcrumbSchema([
      { name: "Home", url: SITE.url },
      { name: "Aanbod", url: `${SITE.url}/aanbod` },
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
  const kaarten = pagina.vormen.kaarten;
  const kolommen =
    kaarten.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";
  const stats = pagina.stats.slice(0, 3);

  return (
    <>
      <JsonLd data={schema} />

      {/* Hero */}
      <header className="relative flex min-h-[520px] items-end md:min-h-[640px]">
        <Beeld
          beeld={pagina.heroImage}
          className="absolute inset-0"
          priority
          toonLabel
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(14,12,11,0.35) 0%, rgba(14,12,11,0.15) 25%, rgba(14,12,11,0.92) 90%)",
          }}
        />
        <Container className="relative z-10 w-full pb-8 pt-36 md:pb-14">
          <Kruimels
            items={[
              { label: "Aanbod", href: "/aanbod" },
              { label: pagina.h1 },
            ]}
          />
          <span className="tmc-eyebrow tmc-eyebrow--accent mt-6 block">{pagina.eyebrow}</span>
          <h1 className="mt-3 max-w-[11em] font-[family-name:var(--font-playfair)] text-5xl leading-[1.04] tracking-[-0.02em] text-text md:text-7xl lg:text-8xl">
            {pagina.h1}
          </h1>
          <p className="mt-4 max-w-[30em] text-base leading-relaxed text-text/80 md:text-lg">
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
          {pagina.voorheen && <Voorheen tekst={pagina.voorheen} />}
        </Container>
      </header>

      {/* Cijferbalk */}
      {stats.length > 0 && (
        <div className="border-y border-ink-500/60">
          <Container>
            <dl
              className="grid divide-x divide-ink-500/60"
              style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
            >
              {stats.map((s, i) => (
                <div key={s.waarde} className={`py-5 md:py-7 ${i > 0 ? "pl-4 md:pl-8" : ""}`}>
                  <dt className="font-[family-name:var(--font-playfair)] text-xl leading-tight text-accent md:text-4xl">
                    {s.waarde}
                  </dt>
                  <dd className="mt-1 text-xs text-text-muted md:text-sm">{s.label}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </div>
      )}

      {/* Basis (licht) */}
      {pagina.basis && (
        <Section bg="stone">
          <Container>
            <ScrollReveal>
              <Kop
                licht
                eyebrow={pagina.basis.eyebrow}
                titel={pagina.basis.titel}
                intro={pagina.basis.intro}
              />
            </ScrollReveal>
            <ul className="mt-8 grid gap-4 md:mt-10 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
              {pagina.basis.items.map((item, i) => (
                <li key={item.titel} className="overflow-hidden rounded-lg bg-stone-200">
                  {item.beeld && (
                    <Beeld
                      beeld={item.beeld}
                      className="relative h-44 md:h-56"
                      sizes="(min-width: 1024px) 33vw, 100vw"
                    />
                  )}
                  <div className="p-5">
                    <span className="font-[family-name:var(--font-playfair)] text-[13px] text-[color:var(--champagne-deep)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mb-1.5 mt-1 font-[family-name:var(--font-playfair)] text-2xl text-on-light">
                      {item.titel}
                    </h3>
                    <p className="text-sm leading-relaxed text-on-light/70">{item.tekst}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Container>
        </Section>
      )}

      {/* Trainer en rooster */}
      <Section>
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <ScrollReveal>
              <span className="tmc-eyebrow tmc-eyebrow--accent mb-4 block">Wie je begeleidt</span>
              <h2 className="font-[family-name:var(--font-playfair)] text-3xl leading-[1.05] tracking-[-0.02em] md:text-4xl lg:text-5xl">
                {pagina.trainerKop}
              </h2>
              <div className="mt-6 grid grid-cols-[84px_1fr] items-center gap-4">
                <Beeld
                  beeld={pagina.trainer.foto}
                  className="relative h-[84px] w-[84px] rounded-full"
                  sizes="84px"
                  toonLabel={false}
                />
                <div>
                  <b className="block font-[family-name:var(--font-playfair)] text-xl font-normal text-text">
                    {pagina.trainer.naam}
                  </b>
                  <span className="text-sm leading-relaxed text-text-muted">
                    {pagina.trainer.tekst}
                    {pagina.trainer.opleiding ? ` ${pagina.trainer.opleiding}` : ""}
                  </span>
                </div>
              </div>
            </ScrollReveal>
            {pagina.rooster && "pijler" in pagina.rooster && (
              <RoosterPijlerStrip
                pijler={pagina.rooster.pijler}
                titel={pagina.rooster.titel}
                roosterHref={`/rooster?pijler=${pagina.rooster.pijler}`}
              />
            )}
            {pagina.rooster && "link" in pagina.rooster && (
              <div>
                <p className="mb-4 text-text-muted">{pagina.rooster.tekst}</p>
                <QuietLink href={pagina.rooster.link.href}>{pagina.rooster.link.label}</QuietLink>
              </div>
            )}
          </div>
        </Container>
      </Section>

      {/* Vormen */}
      <Section>
        <Container>
          <ScrollReveal>
            <Kop eyebrow={pagina.vormen.eyebrow} titel={pagina.vormen.titel} />
          </ScrollReveal>
          <ul className={`mt-8 grid gap-3 md:grid-cols-2 ${kolommen} lg:gap-4`}>
            {kaarten.map((k) => {
              const href = resolveHref(k.link.href);
              const klassen = `flex h-full flex-col gap-2 rounded-lg border border-ink-500/60 bg-bg-elevated p-5 ${
                k.uitgelicht ? "border-t-2 border-t-accent" : ""
              }`;
              const inhoud = (
                <>
                  <h3 className="font-[family-name:var(--font-playfair)] text-[21px] text-text">
                    {k.titel}
                  </h3>
                  <p className="text-sm leading-relaxed text-text-muted">{k.tekst}</p>
                  {href && <span className="mt-auto pt-2 text-sm text-accent">{k.link.label}</span>}
                </>
              );
              return (
                <li key={k.titel}>
                  {href ? (
                    <Link href={href} className={`${klassen} transition-colors hover:border-accent`}>
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

      <FaqSectie eyebrow={pagina.faqKop.eyebrow} titel={pagina.faqKop.titel} faq={pagina.faq} />

      <RegioRegel tekst={pagina.regio.tekst} plaatsen={pagina.regio.plaatsen} />

      <Afsluiter data={pagina.afsluiter} />
    </>
  );
}
