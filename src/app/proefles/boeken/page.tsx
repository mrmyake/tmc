import type { Metadata } from "next";
import { getTrialSessionOptions } from "@/lib/trial-sessions";
import { resolveAttribution } from "@/lib/attribution/params";
import { pickPreselectedSessionId } from "@/lib/yoga-test/preselect";
import { TrialBookingList } from "./TrialBookingList";

export const metadata: Metadata = {
  title: "Boek direct een Proefles | The Movement Club",
  description:
    "Kies zelf een sessie en boek direct een proefles bij The Movement Club in Loosdrecht.",
  alternates: { canonical: "/proefles/boeken" },
};

export const dynamic = "force-dynamic";

export default async function TrialBookingPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Advertentie- en campagneparameters reizen mee in de redirect en in de
  // boeking (spec-marketing-attribution.md).
  const sp = await props.searchParams;
  const attribution = resolveAttribution(sp, "/proefles/boeken");

  const options = await getTrialSessionOptions({ withPrices: true });
  // Voorselectie vanuit de yoga-quiz (?les=<class_type_id>&tijd=...).
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const preselected = pickPreselectedSessionId(options, first(sp.les), first(sp.tijd));
  return (
    <TrialBookingList
      options={options}
      mode="paid"
      attribution={attribution}
      initialSelectedId={preselected}
    />
  );
}
