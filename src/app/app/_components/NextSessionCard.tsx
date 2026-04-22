import { Button } from "@/components/ui/Button";
import { formatRelativeWhen } from "@/lib/format-date";

interface NextSessionProps {
  session:
    | {
        startAt: Date;
        className: string;
        trainerName: string;
        durationMinutes: number;
      }
    | null;
}

export function NextSessionCard({ session }: NextSessionProps) {
  if (!session) {
    return (
      <section
        aria-labelledby="next-session-empty"
        className="bg-bg-elevated p-10 md:p-12"
      >
        <span className="tmc-eyebrow block mb-4">Komende sessie</span>
        <h2
          id="next-session-empty"
          className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4"
        >
          Nog geen sessie geboekt.
        </h2>
        <p className="text-text-muted text-base leading-relaxed mb-8 max-w-md">
          De agenda staat open. Reserveer je eerste moment en kom langs.
        </p>
        <Button href="/app/rooster">Boek je eerste les</Button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="next-session-title"
      className="relative bg-bg-elevated p-10 md:p-12"
    >
      <div
        aria-hidden
        className="absolute top-0 left-10 right-10 h-px bg-accent"
      />
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
        Volgende sessie
      </span>
      <p className="text-text-muted text-sm font-medium uppercase tracking-[0.2em] mb-6">
        {formatRelativeWhen(session.startAt)}
      </p>
      <h2
        id="next-session-title"
        className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text leading-[1.05] tracking-[-0.02em] mb-4"
      >
        {session.className}
      </h2>
      <p className="text-text-muted text-sm mb-10">
        Met {session.trainerName} · {session.durationMinutes} minuten
      </p>
      <div className="flex flex-wrap gap-3">
        <Button href="/app/boekingen" variant="secondary">
          Bekijk boekingen
        </Button>
        <Button href="/app/rooster" variant="ghost">
          Naar rooster
        </Button>
      </div>
    </section>
  );
}
