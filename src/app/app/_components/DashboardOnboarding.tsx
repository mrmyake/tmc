import { Button } from "@/components/ui/Button";

interface DashboardOnboardingProps {
  firstName: string;
  intakeDone: boolean;
}

export function DashboardOnboarding({
  firstName,
  intakeDone,
}: DashboardOnboardingProps) {
  return (
    <section className="bg-bg-elevated p-10 md:p-12 mb-14">
      <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.05] tracking-[-0.02em] mb-5">
        {/* COPY: akkoord Marlon 2026-07-12 */}
        Welkom bij The Movement Club, {firstName}.
      </h1>
      <p className="text-text-muted text-base leading-relaxed max-w-xl mb-8">
        {/* COPY: akkoord Marlon 2026-07-12 */}
        Hier zie je straks je lessen, je tegoed en je voortgang op één plek.
        Voor nu: plan je eerste sessie in het rooster.
      </p>
      <div className="flex flex-wrap gap-3">
        {/* COPY: akkoord Marlon 2026-07-12 */}
        <Button href="/app/rooster">Bekijk het rooster</Button>
        {!intakeDone && (
          <Button href="/app/profiel/intake" variant="secondary">
            {/* COPY: akkoord Marlon 2026-07-12 */}
            Naar mijn intake
          </Button>
        )}
      </div>
      {!intakeDone && (
        <p className="mt-6 text-text-muted text-sm max-w-xl">
          {/*
            COPY: confirm met Marlon — herschreven t.o.v. copy-ledenomgeving-landing.md §7.
            De bron-regel ("Rond eerst je intake af, dan kun je je eerste les
            boeken.") veronderstelt dat een onvolledige intake boeken blokkeert;
            book_class_session checkt daar niet op (discovery Fase 1, punt 5).
            Dit is dus een zachte aanmoediging, geen harde voorwaarde.
          */}
          Rond ook je health intake af: twee minuten, en Marlon kent je
          blessures en doelen voor je eerste sessie.
        </p>
      )}
    </section>
  );
}
