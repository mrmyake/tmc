import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface InvoicePaidNoticeProps {
  title: string;
  lines: string[];
}

/** Interne melding aan de studio zodra een factuur betaald is (9.7). */
// COPY: confirm met Marlon
export default function InvoicePaidNotice({ title, lines }: InvoicePaidNoticeProps) {
  return (
    <EmailLayout preview={title}>
      <Heading
        style={{
          color: emailTokens.STONE_100,
          fontSize: 24,
          fontWeight: 500,
          lineHeight: 1.2,
          margin: "0 0 16px 0",
        }}
      >
        {title}
      </Heading>
      {lines.map((l, i) => (
        <Text
          key={i}
          style={{ color: emailTokens.STONE_500, fontSize: 15, lineHeight: 1.6, margin: "0 0 8px 0" }}
        >
          {l}
        </Text>
      ))}
    </EmailLayout>
  );
}
