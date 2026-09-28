import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface PriorFreeTrial {
  code: string;
  className: string;
  whenLabel: string;
  redeemedAtLabel: string;
  cancelled: boolean;
}

export interface TrialCodeAbuseAlertProps {
  name: string;
  email: string;
  phone: string;
  code: string;
  className: string;
  whenLabel: string;
  prior: PriorFreeTrial[];
  adminUrl: string;
}

/**
 * Interne melding aan Marlon en Ilja (spec-community-growth.md §1
 * "Proefcodes"): hetzelfde e-mailadres boekt voor de tweede of latere keer
 * een gratis proefles. De boeking is al gewoon doorgegaan; bij misbruik
 * annuleert een admin de boeking handmatig in de admin-cockpit. Bevat
 * persoonsgegevens en gaat daarom per mail, niet via het openbare
 * ntfy-topic.
 */
export default function TrialCodeAbuseAlert({
  name,
  email,
  phone,
  code,
  className,
  whenLabel,
  prior,
  adminUrl,
}: TrialCodeAbuseAlertProps) {
  return (
    // COPY: confirm met Marlon
    <EmailLayout preview={`Herhaalde gratis proefles: ${email}`}>
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
        Proefcodes
      </Text>
      <Heading
        as="h1"
        style={{
          fontFamily: emailTokens.FONT_SERIF,
          fontWeight: 300,
          fontSize: 30,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          color: emailTokens.STONE_100,
          margin: "0 0 24px 0",
        }}
      >
        {/* COPY: confirm met Marlon */}
        Herhaalde gratis proefles
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        {/* COPY: confirm met Marlon */}
        Dit e-mailadres heeft al eerder een gratis proefles geboekt. De nieuwe
        boeking is gewoon doorgegaan; beoordeel zelf of dit klopt en annuleer
        de boeking anders in de admin-cockpit.
      </Text>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 4px 0" }}>
        {/* COPY: confirm met Marlon */}
        Naam: {name}
      </Text>
      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 4px 0" }}>
        {/* COPY: confirm met Marlon */}
        E-mail: {email}
      </Text>
      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 4px 0" }}>
        {/* COPY: confirm met Marlon */}
        Telefoon: {phone}
      </Text>
      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 4px 0" }}>
        {/* COPY: confirm met Marlon */}
        Gebruikte code: {code}
      </Text>
      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 24px 0" }}>
        {/* COPY: confirm met Marlon */}
        Geboekte les: {className}, {whenLabel}
      </Text>

      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 12px 0",
        }}
      >
        {/* COPY: confirm met Marlon */}
        Eerdere gratis proeflessen van dit adres
      </Text>
      {prior.map((p, i) => (
        <Text
          key={i}
          style={{ color: emailTokens.STONE_500, fontSize: 13, margin: "0 0 6px 0" }}
        >
          {/* COPY: confirm met Marlon */}
          {p.redeemedAtLabel}: {p.className}, {p.whenLabel} (code {p.code})
          {p.cancelled ? ", geannuleerd" : ""}
        </Text>
      ))}

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 12,
          margin: "28px 0 0 0",
        }}
      >
        {/* COPY: confirm met Marlon */}
        Beheer: {adminUrl}
      </Text>
    </EmailLayout>
  );
}
