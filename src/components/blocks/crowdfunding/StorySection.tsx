import { PortableText } from "@portabletext/react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import type { SanityBudgetItem } from "../../../../sanity/lib/fetch";

interface Props {
  story?: unknown[];
  budgetItems?: SanityBudgetItem[];
}

export function StorySection({ story, budgetItems }: Props) {
  return (
    <Section id="verhaal" bg="elevated">
      <Container>
        <SectionHeading
          label="Het verhaal"
          heading="Waarom we dit samen bouwen"
        />

        <div className="grid lg:grid-cols-12 gap-12">
          <ScrollReveal className="lg:col-span-7">
            <div className="prose prose-invert max-w-none text-text-muted text-lg leading-relaxed space-y-5">
              {story && story.length > 0 ? (
                <PortableText
                  value={story as Parameters<typeof PortableText>[0]["value"]}
                />
              ) : (
                <>
                  <p>
                    The Movement Club is de nieuwe boutique gym in Loosdrecht.
                    Klein, persoonlijk en high-end. Geen anonieme massa, geen
                    eindeloze contracten.
                  </p>
                  <p>
                    Geen anonieme investeerders. Wij bouwen deze gym samen met
                    onze toekomstige leden. Make A Move.
                  </p>
                </>
              )}
            </div>
          </ScrollReveal>

          <ScrollReveal className="lg:col-span-5" delay={0.15}>
            <div className="bg-bg-subtle border border-accent/10 p-6 md:p-8">
              <h3 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-6">
                Waar gaat het geld naartoe
              </h3>
              <ul className="space-y-4">
                {(budgetItems ?? []).map((item, i) => (
                  <li
                    key={item._key ?? i}
                    className="flex items-center justify-between border-b border-bg-elevated/80 pb-3 last:border-0 last:pb-0"
                  >
                    <span className="text-text">{item.label}</span>
                    <span className="text-accent font-medium tabular-nums">
                      {formatEuro(item.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>
        </div>
      </Container>
    </Section>
  );
}
