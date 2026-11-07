import { Heading, Link, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface YogaTestResultProps {
  firstName: string;
  lessonName: string;
  why: string;
  what: string;
  /** Regels als "ma 10:30, met Kim"; leeg laat de rooster-sectie weg. */
  times: string[];
  /** Alleen gezet als de proefcode nu bruikbaar is. */
  code: string | null;
  /** Absolute link voor de knop; wordt nooit als zichtbare tekst getoond. */
  ctaHref: string;
  /** Adres van de studio; standaard het vaste adres. */
  address?: string;
}

/**
 * Uitslagmail van de yoga-quiz (spec-yoga-test.md). Alle Nederlandse tekst:
 * COPY: confirm met Marlon. Links zijn tekstlinks: de href staat alleen in
 * het attribuut, nooit als zichtbare tekst (mail met zichtbare URL belandde
 * eerder in spam). Geen gezondheidsinformatie: de zorgvraag blijft in de
 * browser. Yogamatjes zijn gratis aanwezig; een handdoek neem je zelf mee.
 */
export default function YogaTestResult({
  firstName,
  lessonName,
  why,
  what,
  times,
  code,
  ctaHref,
  address = "Industrieweg 14P, Loosdrecht",
}: YogaTestResultProps) {
  const body = { color: emailTokens.STONE_100, margin: "0 0 20px 0" } as const;
  const linkLabel = code ? "Boek je gratis proefles" : "Boek je proefles";
  return (
    <EmailLayout preview={`Jouw yogales: ${lessonName}`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        Jouw uitslag
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
        {firstName ? `${firstName}, ` : ""}jouw les is {lessonName}.
      </Heading>

      <Text style={body}>{why}</Text>
      <Text style={body}>{what}</Text>

      {times.length > 0 && (
        <>
          <Text
            style={{
              color: emailTokens.CHAMPAGNE,
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              margin: "28px 0 8px 0",
            }}
          >
            Op het rooster
          </Text>
          {times.map((t) => (
            <Text key={t} style={{ color: emailTokens.STONE_100, margin: "0 0 4px 0" }}>
              {t}
            </Text>
          ))}
        </>
      )}

      {code && (
        <Text style={{ color: emailTokens.STONE_100, margin: "28px 0 0 0" }}>
          Je eerste les is gratis met code{" "}
          <span style={{ color: emailTokens.CHAMPAGNE, letterSpacing: "0.12em" }}>{code}</span>.
        </Text>
      )}

      <Text style={{ margin: "28px 0 0 0" }}>
        <Link
          href={ctaHref}
          style={{
            color: emailTokens.CHAMPAGNE,
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            textDecoration: "underline",
          }}
        >
          {linkLabel}
        </Link>
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "32px 0 0 0",
        }}
      >
        Voor je eerste les: kom tien minuten eerder zodat je rustig kunt omkleden. Yogamatjes
        liggen gratis voor je klaar. Neem wel je eigen handdoek mee. Elke les is ook geschikt als
        je net begint.
      </Text>
      <Text style={{ color: emailTokens.STONE_500, fontSize: 12, margin: "20px 0 0 0" }}>
        {address}
      </Text>
    </EmailLayout>
  );
}
