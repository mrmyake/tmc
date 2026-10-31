import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { euroShort } from "@/lib/extra-class/core";
import type { RideCredit } from "@/lib/member/rooster-weergave";

/**
 * Kaarten rond het rooster (spec-rooster-vrij-trainen.md, besluiten
 * 2026-10-31). Alleen weergave: de prijzen komen van de server
 * (extra_class_price) en wat een lid kan boeken bepaalt canBook() en
 * tmc.booking_gate.
 */

const shortDate = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "30 apr" uit een yyyy-mm-dd; de datum is een kalenderdag, geen tijdstip. */
function formatExpiry(iso: string): string {
  return shortDate.format(new Date(`${iso}T12:00:00Z`));
}

/** Scherm A: tegoed van de bruikbare rittenkaart(en), onder de schakelaar. */
export function TegoedBalk({ ride }: { ride: RideCredit }) {
  return (
    <div className="mb-8 flex items-baseline justify-between gap-4 rounded-lg bg-bg-elevated px-5 py-4">
      <span className="tmc-eyebrow">
        {/* COPY: confirm met Marlon */}
        Rittenkaart
      </span>
      <span className="text-sm text-text">
        {/* COPY: confirm met Marlon */}
        {ride.rides} {ride.rides === 1 ? "rit" : "ritten"}
        {ride.expiresAt ? `, geldig t/m ${formatExpiry(ride.expiresAt)}` : ""}
      </span>
    </div>
  );
}

/** Meldingskaart onder de schakelaar (scherm B, C en de check-in-variant). */
export function MeldingsKaart({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 rounded-lg bg-bg-elevated px-5 py-5">
      <p className="font-[family-name:var(--font-playfair)] text-xl leading-tight text-text">{title}</p>
      {children && <p className="mt-2 text-sm leading-relaxed text-text-muted">{children}</p>}
    </div>
  );
}

/** Scherm B: abonnement zonder groepslessen, elke les los bij te boeken. */
export function GroepslessenNietInAbonnement({ priceCents }: { priceCents: number }) {
  return (
    // COPY: confirm met Marlon
    <MeldingsKaart title="Groepslessen zitten niet in je abonnement">
      {/* COPY: confirm met Marlon */}
      Je kunt elke les los bijboeken als extra les voor {euroShort(priceCents)}.
    </MeldingsKaart>
  );
}

/** Scherm C: abonnement zonder vrij trainen, een tijd los bij te boeken. */
export function VrijTrainenNietInAbonnement({ priceCents }: { priceCents: number | null }) {
  return (
    // COPY: confirm met Marlon
    <MeldingsKaart title="Vrij trainen zit niet in je abonnement">
      {priceCents !== null
        ? // COPY: confirm met Marlon
          `Je kunt een tijd los bijboeken als extra les voor ${euroShort(priceCents)}.`
        : // COPY: confirm met Marlon
          "Met een Vrij Trainen- of All Access-abonnement train je hier op je eigen tijd."}
    </MeldingsKaart>
  );
}

/** Bestaande pauzekaart, nu ook voor de groepslessentab. */
export function PauzeKaart({ weergave }: { weergave: "lessen" | "vrij" }) {
  return (
    <div
      role="status"
      className="mb-8 rounded-lg border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/5 p-5"
    >
      <span className="tmc-eyebrow block mb-2">
        {/* COPY: confirm met Marlon */}
        Abonnement gepauzeerd
      </span>
      <p className="text-text-muted text-sm leading-relaxed">
        {weergave === "vrij"
          ? // COPY: confirm met Marlon
            "Zolang je pauze loopt kun je niet vrij trainen. Als je het abbo hervat staat je plek weer open."
          : // COPY: confirm met Marlon
            "Zolang je pauze loopt kun je geen groepslessen boeken. Als je het abbo hervat staat je plek weer open."}
      </p>
    </div>
  );
}

/** Scherm D: geen actief abonnement, vrij trainen zit er niet in. */
export function OpenStudioKaart({
  ride,
  hasRideCard,
}: {
  ride: RideCredit | null;
  hasRideCard: boolean;
}) {
  return (
    <div>
      <div className="rounded-lg bg-bg-elevated px-6 py-8">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          {/* COPY: confirm met Marlon */}
          Open studio
        </span>
        <p className="font-[family-name:var(--font-playfair)] text-3xl leading-tight text-text">
          {/* COPY: confirm met Marlon */}
          Train op je eigen tijd
        </p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-muted">
          {/* COPY: confirm met Marlon */}
          Vrij trainen zit niet in je {hasRideCard ? "rittenkaart" : "lidmaatschap"}. Met een Vrij Trainen- of
          All Access-abonnement boek je hier zelf je tijd in de studio.
        </p>
        <div className="mt-6">
          {/* De configurator kent geen parameter om op vrij trainen te openen. */}
          <Button href="/abonnement">
            {/* COPY: confirm met Marlon */}
            Bekijk abonnementen
          </Button>
        </div>
      </div>

      {ride && (
        <div className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-[color:var(--ink-500)]/60 px-5 py-4">
          <div>
            <span className="tmc-eyebrow block mb-1">
              {/* COPY: confirm met Marlon */}
              Je rittenkaart
            </span>
            <span className="text-sm text-text">
              {/* COPY: confirm met Marlon */}
              {ride.rides} {ride.rides === 1 ? "rit" : "ritten"} over voor groepslessen
            </span>
          </div>
          <Link
            href="/app/rooster?weergave=lessen"
            className="min-h-11 inline-flex items-center text-xs font-medium uppercase tracking-[0.14em] text-accent"
          >
            {/* COPY: confirm met Marlon */}
            Naar lessen
          </Link>
        </div>
      )}
    </div>
  );
}
