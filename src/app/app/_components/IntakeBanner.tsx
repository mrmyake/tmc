import { Button } from "@/components/ui/Button";

export function IntakeBanner() {
  return (
    <section
      aria-labelledby="intake-banner-title"
      className="relative bg-bg-elevated p-8 md:p-10 mb-12"
    >
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
      />
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        Even kort: je health intake
      </span>
      <h2
        id="intake-banner-title"
        className="text-2xl md:text-3xl font-medium text-text mb-3 tracking-[-0.01em] leading-[1.15]"
      >
        Voltooi eerst je health intake
      </h2>
      <p className="text-text-muted text-sm leading-relaxed mb-6 max-w-xl">
        Voor jouw veiligheid vragen we even kort naar blessures, medicatie en
        je doelen. Duurt twee minuten, en daarna kun je sessies boeken.
      </p>
      <Button href="/app/profiel/intake">Start intake</Button>
    </section>
  );
}
