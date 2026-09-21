import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

/**
 * Afsluitmail van de accountverwijdering. Gaat naar het adres dat bij de
 * aanvraag is vastgelegd (account_deletions.email_at_request), want het
 * profiel is op dit moment al geanonimiseerd of weg. Bewust zonder naam:
 * die kennen we niet meer.
 */
export interface AccountDeletedProps {
  siteUrl: string;
}

export default function AccountDeleted({ siteUrl }: AccountDeletedProps) {
  return (
    // COPY: confirm met Marlon
    <EmailLayout preview="Je account bij The Movement Club is verwijderd.">
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        Account verwijderd
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
        Je account is verwijderd.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        Zoals je hebt gevraagd, hebben we je account bij The Movement Club
        verwijderd. Je persoonsgegevens, boekingen en toegang zijn weg.
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 20px 0",
        }}
      >
        Facturen en betaalgegevens bewaren we zeven jaar, omdat de
        Belastingdienst dat van ons vraagt. Die zijn niet meer aan een
        account gekoppeld.
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 0 0",
        }}
      >
        Kom je ooit terug, dan ben je welkom. Vragen? Mail ons via {siteUrl}
        /contact.
      </Text>
    </EmailLayout>
  );
}
