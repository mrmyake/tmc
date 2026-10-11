import { Heading, Link, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface TrialBookingReminderProps {
  firstName: string;
  className: string;
  trainerName: string;
  whenLabel: string;
  /** Annuleerlink op cancel_token; alleen als tekstlink, nooit als zichtbare URL. */
  cancelUrl: string;
  /** Uit tmc.booking_settings.cancellation_window_hours. */
  cancellationWindowHours: number;
  locationLabel?: string;
  /** "vrij_trainen" voor een proefuur vrij trainen; standaard de groepsles-variant. */
  variant?: "group" | "vrij_trainen";
}

/**
 * Herinnering een dag van tevoren voor een proefles (betaald, via code of
 * gratis in de openingsperiode), verstuurd door de send-reminders cron. Een
 * bezoeker heeft geen account, dus geen knop naar de app zoals in
 * booking_reminder.tsx; in plaats daarvan de annuleerlink als tekstlink
 * (linkregel: nooit een URL als zichtbare tekst).
 */
export default function TrialBookingReminder({
  firstName,
  className,
  trainerName,
  whenLabel,
  cancelUrl,
  cancellationWindowHours,
  locationLabel = "Industrieweg 14P, Loosdrecht",
  variant = "group",
}: TrialBookingReminderProps) {
  return (
    // COPY: confirm met Marlon
    <EmailLayout preview={`Morgen: ${className} · ${whenLabel}`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        {/* COPY: confirm met Marlon */}
        Morgen je proefles
      </Text>
      <Heading
        as="h1"
        style={{
          fontFamily: emailTokens.FONT_SERIF,
          fontWeight: 300,
          fontSize: 34,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          color: emailTokens.STONE_100,
          margin: "0 0 24px 0",
        }}
      >
        {/* COPY: confirm met Marlon */}
        Tot morgen, {firstName || "daar"}.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 24px 0" }}>
        {/* COPY: confirm met Marlon */}
        {className} met {trainerName}, {whenLabel}.
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
        }}
      >
        {variant === "vrij_trainen"
          ? // COPY: confirm met Marlon
            "Kom tien minuten eerder zodat je rustig kunt omkleden. Neem sportkleding, schone schoenen en een eigen handdoek mee; matten en materiaal zijn aanwezig."
          : // COPY: confirm met Marlon
            "Kom tien minuten eerder zodat je rustig kunt omkleden. Voor yoga of mobility-sessies is er mat en handdoek te huren aan de balie."}
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 8px 0",
          lineHeight: 1.6,
        }}
      >
        {/* COPY: confirm met Marlon */}
        Kun je toch niet? Laat het ons weten, dan komt je plek vrij voor iemand
        anders. Annuleren kan tot {cancellationWindowHours} uur van tevoren.
      </Text>
      <Text style={{ margin: "0 0 28px 0" }}>
        <Link
          href={cancelUrl}
          style={{
            color: emailTokens.CHAMPAGNE,
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            textDecoration: "underline",
          }}
        >
          {/* COPY: confirm met Marlon */}
          Annuleer je proefles
        </Link>
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 12,
          margin: "0",
        }}
      >
        {locationLabel}
      </Text>
    </EmailLayout>
  );
}
