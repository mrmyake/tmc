import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Dumbbell, Flower2, Users, Smartphone, Target } from "lucide-react";

const items = [
  {
    icon: Dumbbell,
    title: "Vrij trainen",
    sub: "High-end equipment",
  },
  {
    icon: Flower2,
    title: "Yoga & mobility",
    sub: "Meerdere lessen per week",
  },
  {
    icon: Users,
    title: "Groepslessen",
    sub: "Kracht, conditie, functioneel",
  },
  {
    icon: Smartphone,
    title: "Online programma's",
    sub: "Trainingsschema's op maat",
  },
  {
    icon: Target,
    title: "Personal training",
    sub: "Met Marlon en team",
  },
] as const;

export function OfferingPills() {
  return (
    <Section>
      <Container>
        <SectionHeading
          label="Wat krijg je"
          heading="Alles onder één dak"
          subtext="Eén gym, één community, één plek waar je écht verder komt."
        />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <ScrollReveal key={item.title} delay={i * 0.08}>
                <div className="h-full bg-bg-elevated border border-bg-subtle p-6 text-center hover:border-accent/40 transition-colors">
                  <Icon
                    className="mx-auto mb-4 text-accent"
                    size={28}
                    strokeWidth={1.5}
                  />
                  <div className="text-text font-medium mb-1">{item.title}</div>
                  <div className="text-text-muted text-xs">{item.sub}</div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
