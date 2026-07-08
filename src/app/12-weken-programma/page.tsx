import type { Metadata } from "next";
import { TwaalfWekenProgrammaContent } from "./TwaalfWekenProgrammaContent";

export const metadata: Metadata = {
  title: "Het 12 Weken Programma | The Movement Club Loosdrecht",
  description:
    "Eerst meten, dan pas trainen. Een persoonlijk traject van twaalf weken met Marlon: volledige meting, hormonaal profiel, voeding en dagelijkse begeleiding.",
  alternates: { canonical: "/12-weken-programma" },
  openGraph: {
    title: "Het 12 Weken Programma | The Movement Club Loosdrecht",
    description:
      "Eerst meten, dan pas trainen. Een persoonlijk traject van twaalf weken met Marlon: volledige meting, hormonaal profiel, voeding en dagelijkse begeleiding.",
  },
};

export default function TwaalfWekenProgrammaPage() {
  return <TwaalfWekenProgrammaContent />;
}
