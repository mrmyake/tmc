import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { YogaTeacherStrip } from "@/components/blocks/yoga/YogaTeacherStrip";
import { YogaWaitlistCta } from "@/components/blocks/yoga/YogaWaitlistCta";
import { JsonLd } from "@/components/seo/JsonLd";
import { getBreadcrumbSchema } from "@/lib/structuredData";
import { SITE } from "@/lib/constants";
import { getYogaTeachers } from "../../../../sanity/lib/fetch";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Yoga docenten | The Movement Club Loosdrecht",
  description:
    "Maak kennis met de yogadocenten van The Movement Club in Loosdrecht. Een klein team met elk een eigen stem en specialisatie, van Yin tot Flow.",
  alternates: { canonical: "/yoga/docenten" },
  openGraph: {
    title: "Yoga docenten | The Movement Club Loosdrecht",
    description:
      "Maak kennis met de yogadocenten van The Movement Club in Loosdrecht. Van Yin tot Flow.",
  },
};

export default async function YogaTeachersPage() {
  const teachers = await getYogaTeachers();

  const breadcrumb = getBreadcrumbSchema([
    { name: "Home", url: SITE.url },
    { name: "Yoga", url: `${SITE.url}/yoga` },
    { name: "Docenten", url: `${SITE.url}/yoga/docenten` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Section className="pt-32 md:pt-40">
        <Container>
          <ScrollReveal>
            <SectionHeading
              label="De docenten"
              heading="Wie je begeleidt"
              subtext="Een klein team met elk een eigen stem en specialisatie. Klik door voor het verhaal achter de mat."
            />
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <YogaTeacherStrip teachers={teachers} />
          </ScrollReveal>
        </Container>
      </Section>

      <YogaWaitlistCta bg="elevated" />
    </>
  );
}
