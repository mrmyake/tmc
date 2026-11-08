import type { Metadata } from "next";
import { resolveAttribution } from "@/lib/attribution/params";
import { ProgrammaIntakeContent } from "./ProgrammaIntakeContent";

// COPY: confirm met Marlon
export const metadata: Metadata = {
  title: "Plan je gratis intake | Het 12 Weken Programma | The Movement Club",
  description:
    "Plan een gratis en vrijblijvende intake voor het 12 weken programma van The Movement Club. Marlon neemt binnen 24 uur persoonlijk contact met je op.",
  alternates: { canonical: "/12-weken-programma/intake" },
  openGraph: {
    title: "Plan je gratis intake | Het 12 Weken Programma | The Movement Club",
    description:
      "Plan een gratis en vrijblijvende intake voor het 12 weken programma van The Movement Club. Marlon neemt binnen 24 uur persoonlijk contact met je op.",
  },
};

// Dynamisch vanwege de campagneparameters in searchParams (alleen URL, geen
// opslag). De parameters die de landing meegaf (inclusief lp) blijven staan.
export const dynamic = "force-dynamic";

export default async function ProgrammaIntakePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const attribution = resolveAttribution(sp, "/12-weken-programma/intake");
  return <ProgrammaIntakeContent attribution={attribution} />;
}
