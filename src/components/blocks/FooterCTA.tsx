import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";

export function FooterCTA() {
  return (
    <section className="bg-bg-elevated border-t border-bg-subtle py-12">
      <Container>
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 max-w-4xl mx-auto">
          <div>
            <p className="font-[family-name:var(--font-playfair)] text-lg text-text mb-1">
              Gratis: Beweeg Beter Guide
            </p>
            <p className="text-text-muted text-sm">
              5 dagelijkse oefeningen voor meer mobiliteit en kracht
            </p>
          </div>
          <Button href="/beweeg-beter" className="shrink-0">
            Download gratis
          </Button>
        </div>
      </Container>
    </section>
  );
}
