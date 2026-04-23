import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface GuestConfirmationProps {
  guestFirstName: string;
  memberFirstName: string;
  className: string;
  trainerName: string;
  whenLabel: string;
  locationLabel?: string;
  siteUrl: string;
}

export default function GuestConfirmation({
  guestFirstName,
  memberFirstName,
  className,
  trainerName,
  whenLabel,
  locationLabel = "Industrieweg 14P, Loosdrecht",
  siteUrl,
}: GuestConfirmationProps) {
  return (
    <EmailLayout
      preview={`Je staat op de lijst: ${className} · ${whenLabel}`}
    >
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        Je bent uitgenodigd
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
        Hé {guestFirstName || "daar"}, tot dan.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        {memberFirstName} heeft je meegenomen naar {className} met{" "}
        {trainerName}, {whenLabel}.
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
        }}
      >
        Kom tien minuten eerder zodat je rustig kunt omkleden. Voor yoga of
        mobility-sessies is er mat en handdoek te huren aan de balie.
      </Text>

      <Button
        href={siteUrl}
        style={{
          backgroundColor: emailTokens.CHAMPAGNE,
          color: emailTokens.INK_900,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          padding: "14px 28px",
          textDecoration: "none",
        }}
      >
        Bekijk de studio
      </Button>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 12,
          margin: "28px 0 0 0",
        }}
      >
        {locationLabel}
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "40px 0 0 0",
          lineHeight: 1.6,
        }}
      >
        Beviel het na afloop? Bekijk op{" "}
        <a
          href={`${siteUrl}/aanbod`}
          style={{ color: emailTokens.CHAMPAGNE, textDecoration: "none" }}
        >
          themovementclub.nl/aanbod
        </a>{" "}
        wat een lidmaatschap voor je kan zijn.
      </Text>
    </EmailLayout>
  );
}
