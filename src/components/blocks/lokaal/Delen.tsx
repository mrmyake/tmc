import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { YogaFaqAccordion } from "@/components/blocks/yoga/YogaFaqAccordion";
import type {
  Afsluiter as AfsluiterData,
  AanbodRegel,
  FaqConcept,
  FaqLive,
  PlaatsLink,
} from "@/content/lokaal";
import { paginaUrl, resolveHref } from "@/lib/lokaal/links";

/** Kop in de stijl van /yoga: eyebrow plus serif-h2, links uitgelijnd. */
export function Kop({
  eyebrow,
  titel,
  licht = false,
  intro,
}: {
  eyebrow: string;
  titel: string;
  licht?: boolean;
  intro?: string;
}) {
  return (
    <div>
      <span
        className="tmc-eyebrow block mb-4"
        style={{ color: licht ? "var(--champagne-deep)" : "var(--champagne)" }}
      >
        {eyebrow}
      </span>
      <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl leading-[1.05] tracking-[-0.02em]">
        {titel}
      </h2>
      {intro && (
        <p
          className={`mt-4 max-w-xl text-base md:text-lg leading-relaxed ${
            licht ? "text-on-light/70" : "text-text-muted"
          }`}
        >
          {intro}
        </p>
      )}
    </div>
  );
}

export function Kruimels({ items }: { items: ReadonlyArray<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Kruimelpad" className="text-[12.5px] text-text-muted">
      <ol className="flex flex-wrap items-center gap-x-2">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className="opacity-60">/</span>}
            {item.href ? (
              <Link href={item.href} className="hover:text-accent">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** De regel voor bezoekers die via een oude PT Loosdrecht-link binnenkomen. */
export function Voorheen({ tekst }: { tekst: string }) {
  return (
    <p className="mt-5 border-l-2 border-accent pl-3 text-[13px] text-text-muted">{tekst}</p>
  );
}

export function faqItems(faq: ReadonlyArray<FaqConcept | FaqLive>) {
  return faq.flatMap((f) =>
    f.antwoord ? [{ question: f.vraag, answer: f.antwoord }] : [],
  );
}

/** FAQ in twee kolommen: kop links, bestaand accordeon rechts. */
export function FaqSectie({
  eyebrow,
  titel,
  faq,
}: {
  eyebrow: string;
  titel: string;
  faq: ReadonlyArray<FaqConcept | FaqLive>;
}) {
  const items = faqItems(faq);
  if (items.length === 0) return null;
  return (
    <Section>
      <Container>
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <ScrollReveal>
            <Kop eyebrow={eyebrow} titel={titel} />
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <YogaFaqAccordion faqs={items} />
          </ScrollReveal>
        </div>
      </Container>
    </Section>
  );
}

/** Rij met links; een rij naar een nog niet live pagina wordt platte tekst. */
export function AanbodLijst({ regels }: { regels: readonly AanbodRegel[] }) {
  return (
    <ul className="border-t border-ink-500/60">
      {regels.map((r) => {
        const href = resolveHref(r.href);
        const inhoud = (
          <>
            <span className="font-[family-name:var(--font-playfair)] text-xl md:text-2xl text-text">
              {r.titel}
            </span>
            <span className="col-start-1 text-sm text-text-muted">{r.tekst}</span>
            {href && (
              <span aria-hidden className="col-start-2 row-span-2 row-start-1 self-center text-accent">
                →
              </span>
            )}
          </>
        );
        const klassen = "grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-ink-500/60 py-4";
        return (
          <li key={r.titel}>
            {href ? (
              <Link href={href} className={`${klassen} hover:bg-bg-elevated/40`}>
                {inhoud}
              </Link>
            ) : (
              <div className={klassen}>{inhoud}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Plaatsnamen als chips; alleen live pagina's zijn een link. */
export function PlaatsChips({ plaatsen }: { plaatsen: readonly PlaatsLink[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {plaatsen.map((p) => {
        const href = p.pagina ? resolveHref(paginaUrl(p.pagina)) : null;
        const klassen = "rounded-full border border-ink-500 px-3.5 py-2 text-[13.5px] text-text";
        return (
          <li key={p.label}>
            {href ? (
              <Link href={href} className={`${klassen} hover:border-accent`}>
                {p.label}
              </Link>
            ) : (
              <span className={klassen}>{p.label}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function RegioRegel({ tekst, plaatsen }: { tekst: string; plaatsen: readonly PlaatsLink[] }) {
  return (
    <section className="border-t border-ink-500/60 py-6">
      <Container>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <p className="flex-1 basis-72 text-[14.5px] text-text-muted">{tekst}</p>
          <PlaatsChips plaatsen={plaatsen} />
        </div>
      </Container>
    </section>
  );
}

/** Afsluiter in het patroon van YogaTrialCta. */
export function Afsluiter({ data }: { data: AfsluiterData }) {
  const primair = resolveHref(data.primair.href);
  const secundair = data.secundair ? resolveHref(data.secundair.href) : null;
  return (
    <Section bg="elevated">
      <Container className="max-w-3xl text-center">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">Proefles</span>
        <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
          {data.titel}
        </h2>
        <p className="text-text-muted text-lg mb-10 max-w-xl mx-auto">{data.tekst}</p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {primair && <Button href={primair}>{data.primair.label}</Button>}
          {secundair && data.secundair && (
            <Button href={secundair} variant="secondary">
              {data.secundair.label}
            </Button>
          )}
        </div>
      </Container>
    </Section>
  );
}
