import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";

/**
 * Eigen, minimale topbar voor /12-weken-programma (en /intake): merknaam +
 * één "Plan je intake"-CTA, transparant over de donkere hero. Bewust géén
 * standaard Navbar (geen navigatielinks, geen scroll-naar-solid gedrag) —
 * zie mockup `.topbar`. Niet sticky/fixed: hij schuift, net als in de
 * mockup, gewoon mee met de hero uit beeld bij het scrollen.
 */
export function ProgrammaTopbar() {
  return (
    <div className="absolute inset-x-0 top-0 z-10">
      <Container className="flex items-center justify-between py-6">
        {/* COPY: confirm met Marlon */}
        <Link
          href="/12-weken-programma"
          className="font-[family-name:var(--font-playfair)] text-lg tracking-[0.02em] text-text"
        >
          The Movement <span className="text-accent">Club</span>
        </Link>
        {/*
          Deviation van de mockup, bewust: de mockup verbergt deze knop op
          mobiel (@media max-width:860px .topbar .btn{display:none}), en
          dat is hier overgenomen. De topbar is niet sticky, dus de knop is
          op zowel mobiel als desktop toch alleen zichtbaar zolang de hero
          in beeld is — en de hero zelf toont "Plan je intake" al
          prominent als primaire CTA in diezelfde viewport. Verbergen op
          mobiel voorkomt een gedrongen header zonder dat bezoekers de CTA
          daadwerkelijk kwijtraken.
        */}
        <Button
          href="/12-weken-programma/intake"
          variant="primary"
          className="hidden md:inline-flex"
        >
          Plan je intake
        </Button>
      </Container>
    </div>
  );
}
