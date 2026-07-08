import type { Metadata } from "next";
import { ProgrammaIntakeContent } from "./ProgrammaIntakeContent";

export const metadata: Metadata = {
  title: "Plan je intake | Het 12 Weken Programma | The Movement Club",
  description:
    "Plan een vrijblijvende intake voor het 12 weken programma van The Movement Club. Marlon neemt binnen 24 uur persoonlijk contact met je op.",
  alternates: { canonical: "/12-weken-programma/intake" },
  openGraph: {
    title: "Plan je intake | Het 12 Weken Programma | The Movement Club",
    description:
      "Plan een vrijblijvende intake voor het 12 weken programma van The Movement Club. Marlon neemt binnen 24 uur persoonlijk contact met je op.",
  },
};

export default function ProgrammaIntakePage() {
  return <ProgrammaIntakeContent />;
}
