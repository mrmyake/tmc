import Link from "next/link";

interface LightOnboardingProps {
  firstName: string;
  intakeDone: boolean;
}

export function LightOnboarding({ firstName, intakeDone }: LightOnboardingProps) {
  return (
    <section className="bg-white border border-[rgba(14,12,11,0.10)] rounded-[14px] p-8 md:p-10">
      <h1 className="font-[family-name:var(--font-playfair)] font-medium text-3xl md:text-5xl text-[#0E0C0B] leading-[1.1] tracking-[-0.01em] mb-4">
        {/* COPY: akkoord Marlon 2026-07-12 */}
        Welkom bij The Movement Club, {firstName}.
      </h1>
      <p className="text-[rgba(14,12,11,0.60)] text-[15px] leading-relaxed max-w-xl mb-7">
        {/* COPY: akkoord Marlon 2026-07-12 */}
        Hier zie je straks je lessen, je tegoed en je voortgang op één plek.
        Voor nu: plan je eerste sessie in het rooster.
      </p>
      <div className="flex flex-wrap gap-3">
        {/* COPY: akkoord Marlon 2026-07-12 */}
        <Link
          href="/app/rooster"
          className="inline-flex items-center justify-center rounded-[10px] bg-[#0E0C0B] text-[#F4EFE6] px-5 py-3 text-sm font-medium hover:bg-[#1a1714] transition-colors duration-300"
        >
          Bekijk het rooster
        </Link>
        {!intakeDone && (
          <Link
            href="/app/profiel/intake"
            className="inline-flex items-center justify-center rounded-[10px] border border-[rgba(14,12,11,0.20)] text-[#0E0C0B] px-5 py-3 text-sm font-medium hover:border-[#B9986A] hover:text-[#B9986A] transition-colors duration-300"
          >
            {/* COPY: akkoord Marlon 2026-07-12 */}
            Naar mijn intake
          </Link>
        )}
      </div>
      {!intakeDone && (
        <p className="mt-6 text-[rgba(14,12,11,0.60)] text-sm max-w-xl">
          {/* COPY: confirm met Marlon — zelfde herschreven regel als variant A, zie DashboardOnboarding.tsx */}
          Rond ook je health intake af: twee minuten, en Marlon kent je
          blessures en doelen voor je eerste sessie.
        </p>
      )}
    </section>
  );
}
