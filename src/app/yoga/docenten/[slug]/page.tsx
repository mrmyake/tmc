import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PortableText } from "@portabletext/react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { QuietLink } from "@/components/ui/QuietLink";
import { Button } from "@/components/ui/Button";
import { YogaWaitlistCta } from "@/components/blocks/yoga/YogaWaitlistCta";
import { teacherPhotoSrc } from "@/lib/yoga";
import {
  getYogaTeacherBySlug,
  getYogaTeacherSlugs,
} from "../../../../../sanity/lib/fetch";

export const revalidate = 60;

export async function generateStaticParams() {
  const slugs = await getYogaTeacherSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const teacher = await getYogaTeacherBySlug(slug);
  if (!teacher || !teacher.isActive) {
    return { title: "Yoga docenten | The Movement Club" };
  }
  const specialty = teacher.specialty ? ` (${teacher.specialty})` : "";
  const title = `${teacher.name}${specialty} | Yoga docent in Loosdrecht | The Movement Club`;
  const description =
    teacher.heroQuote ??
    `Maak kennis met ${teacher.name}, yogadocent bij The Movement Club in Loosdrecht.`;
  return {
    title,
    description,
    alternates: { canonical: `/yoga/docenten/${teacher.slug}` },
    openGraph: { title, description },
  };
}

export default async function YogaTeacherPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const teacher = await getYogaTeacherBySlug(slug);
  if (!teacher || !teacher.isActive) notFound();

  const photo = teacherPhotoSrc(teacher);
  const styles = teacher.styles ?? [];

  return (
    <>
      {/* Hero */}
      <Section className="pt-32 md:pt-40">
        <Container>
          <Link
            href="/yoga/docenten"
            className="tmc-eyebrow text-text-muted hover:text-accent transition-colors"
          >
            ← Alle docenten
          </Link>
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
            <ScrollReveal className="lg:col-span-5">
              <div className="relative aspect-[4/5] bg-bg-subtle overflow-hidden">
                {photo ? (
                  <Image
                    src={photo}
                    alt={`${teacher.name}, yogadocent bij The Movement Club in Loosdrecht`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    priority
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="tmc-eyebrow text-text-muted">
                      {teacher.name}
                    </span>
                  </div>
                )}
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.1} className="lg:col-span-7">
              {teacher.specialty && (
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                  {teacher.specialty}
                </span>
              )}
              <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl lg:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
                {teacher.name}
              </h1>
              {teacher.heroQuote && (
                <p className="mt-8 text-text text-xl md:text-2xl leading-relaxed italic">
                  &ldquo;{teacher.heroQuote}&rdquo;
                </p>
              )}
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* Bio */}
      {teacher.bio && (teacher.bio as unknown[]).length > 0 && (
        <Section bg="elevated">
          <Container className="max-w-3xl">
            <ScrollReveal>
              <div className="space-y-5 text-text-muted text-lg leading-relaxed prose-invert max-w-none">
                <PortableText
                  value={
                    teacher.bio as Parameters<typeof PortableText>[0]["value"]
                  }
                />
              </div>
            </ScrollReveal>
          </Container>
        </Section>
      )}

      {/* Vormen die zij geeft */}
      {styles.length > 0 && (
        <Section>
          <Container className="max-w-3xl">
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
              Lessen van {teacher.name}
            </span>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {styles.map((style) => (
                <QuietLink key={style.slug} href={`/yoga/${style.slug}`}>
                  {style.title}
                </QuietLink>
              ))}
            </div>
            <div className="mt-10">
              <Button href="/yoga/rooster" variant="secondary">
                Bekijk het rooster
              </Button>
            </div>
          </Container>
        </Section>
      )}

      {/* Wachtlijst-CTA */}
      <YogaWaitlistCta bg="elevated" />
    </>
  );
}
