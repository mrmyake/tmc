import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { Button } from "@/components/ui/Button";
import { ProgressPanel } from "./ProgressPanel";
import { ShareButtons } from "./ShareButtons";

interface Props {
  totalRaised: number;
  totalBackers: number;
  goal: number;
  daysLeft: number | null;
  shareUrl: string;
  shareText: string;
}

export function CrowdfundingFooterCta({
  totalRaised,
  totalBackers,
  goal,
  daysLeft,
  shareUrl,
  shareText,
}: Props) {
  return (
    <Section bg="elevated">
      <Container>
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-5">
            Make a move
          </span>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-5xl text-text mb-6 leading-tight">
            Je hebt nu de kans er vanaf het begin bij te zijn.
          </h2>
          <p className="text-text-muted text-lg mb-10">
            Kies jouw tier, claim je plek, en bouw met ons mee. Deel het met je
            crew — samen maken we The Movement Club.
          </p>

          <div className="mb-10">
            <ProgressPanel
              totalRaised={totalRaised}
              totalBackers={totalBackers}
              goal={goal}
              daysLeft={daysLeft}
            />
          </div>

          <div className="flex flex-col items-center gap-6">
            <Button href="#tiers">Doe mee</Button>
            <ShareButtons shareUrl={shareUrl} shareText={shareText} />
          </div>
        </div>
      </Container>
    </Section>
  );
}
