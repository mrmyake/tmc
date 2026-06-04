import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortableText } from "@portabletext/react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { QuietLink } from "@/components/ui/QuietLink";
import { YogaFaqAccordion } from "@/components/blocks/yoga/YogaFaqAccordion";
import { YogaWaitlistCta } from "@/components/blocks/yoga/YogaWaitlistCta";
import {
  getYogaStyleBySlug,
  getYogaStyleSlugs,
} from "../../../../sanity/lib/fetch";

export const revalidate = 60;

export async function generateStaticParams() {
  const slugs = await getYogaStyleSlugs();
  return slugs.map((style) => ({ style }));
}

export async function generateMetadata(props: {
  params: Promise<{ style: string }>;
}): Promise<Metadata> {
  const { style } = await props.params;
  const data = await getYogaStyleBySlug(style);
  if (!data) {
    return { title: "Yoga | The Movement Club" };
  }
  const title = data.seoTitle ?? `${data.title} in Loosdrecht | The Movement Club`;
  const description = data.seoDescription ?? data.definition;
  return {
    title,
    description,
    alternates: { canonical: `/yoga/${data.slug}` },
    openGraph: { title, description },
  };
}

export default async function YogaStylePage(props: {
  params: Promise<{ style: string }>;
}) {
  const { style } = await props.params;
  const data = await getYogaStyleBySlug(style);
  if (!data) notFound();

  const activeTeachers = (data.teachers ?? []).filter((t) => t.isActive);

  return (
    <>
      {/* Intro met citatie-klare definitiezin */}
      <Section className="pt-32 md:pt-40">
        <Container className="max-w-3xl">
          <ScrollReveal>
            <Link
              href="/yoga"
              className="tmc-eyebrow text-text-muted hover:text-accent transition-colors"
            >
              ← Alle yogavormen
            </Link>
            <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl lg:text-7xl text-text leading-[1.02] tracking-[-0.02em] mt-6">
              {data.title}
            </h1>
            <p className="mt-8 text-text text-xl md:text-2xl leading-relaxed">
              {data.definition}
            </p>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Voor wie + wat het je brengt */}
      <Section bg="elevated">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
            {data.forWho && (
              <ScrollReveal>
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
                  Voor wie
                </span>
                <p className="text-text-muted text-lg leading-relaxed">
                  {data.forWho}
                </p>
              </ScrollReveal>
            )}

            {data.benefits && data.benefits.length > 0 && (
              <ScrollReveal delay={0.1}>
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
                  Wat het je brengt
                </span>
                <ul className="border-y border-bg-subtle divide-y divide-bg-subtle">
                  {data.benefits.map((benefit, i) => (
                    <li
                      key={benefit}
                      className="py-3.5 flex items-baseline gap-5"
                    >
                      <span className="tmc-eyebrow text-text-muted/70 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-text text-sm leading-relaxed">
                        {benefit}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollReveal>
            )}
          </div>
        </Container>
      </Section>

      {/* Uitgebreide tekst */}
      {data.body && data.body.length > 0 && (
        <Section>
          <Container className="max-w-3xl">
            <ScrollReveal>
              <div className="space-y-5 text-text-muted text-lg leading-relaxed prose-invert max-w-none">
                <PortableText
                  value={
                    data.body as Parameters<typeof PortableText>[0]["value"]
                  }
                />
              </div>
            </ScrollReveal>
          </Container>
        </Section>
      )}

      {/* Wie geeft de les */}
      {activeTeachers.length > 0 && (
        <Section bg="elevated">
          <Container className="max-w-3xl">
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
              Wie geeft de les
            </span>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {activeTeachers.map((teacher) => (
                <QuietLink
                  key={teacher._id}
                  href={`/yoga/docenten/${teacher.slug}`}
                >
                  {teacher.name}
                  {teacher.specialty ? ` · ${teacher.specialty}` : ""}
                </QuietLink>
              ))}
            </div>
          </Container>
        </Section>
      )}

      {/* FAQ */}
      {data.faqs && data.faqs.length > 0 && (
        <Section>
          <Container>
            <div className="text-center mb-12 md:mb-16">
              <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 block">
                FAQ
              </span>
              <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text">
                Veelgestelde vragen over {data.title}
              </h2>
            </div>
            <YogaFaqAccordion
              faqs={data.faqs.map((f) => ({
                question: f.question,
                answer: f.answer,
              }))}
            />
          </Container>
        </Section>
      )}

      {/* Wachtlijst-CTA */}
      <YogaWaitlistCta
        bg="elevated"
        heading={`Klaar voor ${data.title}?`}
        subtext="De studio opent binnenkort. Schrijf je in voor de wachtlijst en je krijgt als eerste bericht zodra de lessen starten."
      />
    </>
  );
}
