import { Container } from "@/components/layout/Container";
import { SITE } from "@/lib/constants";

/**
 * Eigen footer voor /12-weken-programma (en /intake): alleen merk, adres en
 * de gezondheidsdisclaimer, zoals in de mockup. Bewust geen 3-koloms
 * nav-footer van de rest van de site — die hoort niet bij deze losse,
 * funnel-achtige pagina.
 */
export function ProgrammaFooter() {
  return (
    <footer className="border-t border-bg-subtle bg-bg py-12 md:py-14">
      <Container className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
        <div>
          {/* COPY: confirm met Marlon */}
          <p className="font-[family-name:var(--font-playfair)] text-lg tracking-[0.02em] text-text">
            The Movement <span className="text-accent">Club</span>
          </p>
          {/* COPY: confirm met Marlon */}
          <p className="text-text-muted text-sm mt-2.5">
            {SITE.address.street}, {SITE.address.city}
          </p>
        </div>
        {/* COPY: confirm met Marlon */}
        <p className="text-text-muted text-xs leading-relaxed max-w-[52ch]">
          Dit programma is gericht op leefstijl, training en voeding en is
          geen medische behandeling of vervanging van een consult bij een
          arts. Heb je twijfels over je gezondheid, raadpleeg dan altijd je
          huisarts.
        </p>
      </Container>
    </footer>
  );
}
