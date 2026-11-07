import type { Metadata } from "next";
import { resolveAttribution } from "@/lib/attribution/params";
import { QUIZ_PATH } from "@/lib/yoga-test/links";
import { getYogaSchedule, isYogaCodeActive } from "@/lib/yoga-test/server";
import { YogaTest } from "./YogaTest";

// COPY: confirm met Marlon
// Title zonder merknaam: de layout-template (%s | The Movement Club) voegt die toe.
export const metadata: Metadata = {
  title: "Welke yoga past bij jou?",
  description:
    "Beantwoord 8 korte vragen en ontdek welke yogales, pilates of nidra bij je past, met de lestijden op ons rooster. Je eerste les is gratis met een proefcode.",
  alternates: { canonical: QUIZ_PATH },
  openGraph: {
    title: "Welke yoga past bij jou? | The Movement Club",
    description:
      "8 korte vragen, direct je uitslag: Vinyasa Flow, Pilates, Yin Movement, Yin, Restorative of Nidra.",
    url: QUIZ_PATH,
    type: "website",
    locale: "nl_NL",
  },
};

// Dynamisch vanwege de attributieparameters in searchParams. Het rooster en
// de codestatus komen uit een cache van 5 minuten (src/lib/yoga-test/server.ts).
export const dynamic = "force-dynamic";

export default async function WelkeYogaPastBijJouPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  // Advertentie- en campagneparameters van deze pagina reizen mee naar
  // /proefles/*; resolveAttribution leest alleen de URL van de huidige pagina.
  const attribution = resolveAttribution(sp, QUIZ_PATH);
  const [schedule, codeActive] = await Promise.all([getYogaSchedule(), isYogaCodeActive()]);
  return <YogaTest schedule={schedule} codeActive={codeActive} attribution={attribution} />;
}
