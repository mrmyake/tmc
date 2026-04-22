import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

/**
 * Shared TMC email chrome. Dark warm near-black, one champagne accent,
 * serif-display for the headline slot, quiet sans for body. No emoji,
 * no em-dashes — consistent with the member-app skill.
 *
 * Keep inline styles literal — mail clients strip the cascade.
 */

const INK_900 = "#0E0C0B";
const INK_700 = "#1D1916";
const STONE_100 = "#F5F0E6";
const STONE_500 = "#A89C8B";
const CHAMPAGNE = "#B9986A";

const FONT_SERIF =
  "'Fraunces', 'Georgia', 'Times New Roman', serif";
const FONT_SANS =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="nl">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: INK_900,
          color: STONE_100,
          margin: 0,
          padding: 0,
          fontFamily: FONT_SANS,
          fontSize: 15,
          lineHeight: 1.6,
        }}
      >
        <Container
          style={{
            maxWidth: 560,
            margin: "0 auto",
            padding: "40px 24px",
          }}
        >
          <Section style={{ paddingBottom: 32 }}>
            <Text
              style={{
                fontFamily: FONT_SERIF,
                fontWeight: 300,
                fontSize: 22,
                letterSpacing: "-0.01em",
                color: STONE_100,
                margin: 0,
              }}
            >
              The Movement Club
            </Text>
            <Hr
              style={{
                borderTop: `1px solid ${CHAMPAGNE}`,
                width: 48,
                marginTop: 10,
                marginBottom: 0,
                borderBottom: "none",
                borderLeft: "none",
                borderRight: "none",
              }}
            />
          </Section>

          <Section>{children}</Section>

          <Hr
            style={{
              borderTop: `1px solid ${INK_700}`,
              marginTop: 48,
              marginBottom: 24,
              borderBottom: "none",
              borderLeft: "none",
              borderRight: "none",
            }}
          />
          <Section>
            <Text
              style={{
                color: STONE_500,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                margin: 0,
              }}
            >
              The Movement Club · Industrieweg 14P · Loosdrecht
            </Text>
            <Text style={{ color: STONE_500, fontSize: 12, marginTop: 8 }}>
              themovementclub.nl
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const emailTokens = {
  INK_900,
  INK_700,
  STONE_100,
  STONE_500,
  CHAMPAGNE,
  FONT_SERIF,
  FONT_SANS,
};
