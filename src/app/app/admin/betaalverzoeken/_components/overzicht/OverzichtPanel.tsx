import { listPaymentRequests, type PaymentRequestGroup } from "@/lib/admin/payment-requests-query";
import { OverzichtToolbar } from "./OverzichtToolbar";
import { OverzichtTable } from "./OverzichtTable";

type GroupFilter = PaymentRequestGroup | "all";

const VALID_GROUPS: GroupFilter[] = ["all", "open", "paid", "expired", "cancelled"];

function parseGroup(value: string | undefined): GroupFilter {
  return (VALID_GROUPS as string[]).includes(value ?? "")
    ? (value as GroupFilter)
    : "all";
}

interface OverzichtPanelProps {
  groupParam: string | undefined;
}

/**
 * Server component: haalt alle admin-aangemaakte betaalverzoeken op
 * (listPaymentRequests, puur lezen) en rendert de statusgroepering + tabel.
 * De groep-telling gebeurt hier in-memory op de volledige set, niet via een
 * aparte DB-query per filter — bij dit volume (handmatig door Marlon
 * aangemaakte verzoeken) is dat de eenvoudigste correcte aanpak.
 */
export async function OverzichtPanel({ groupParam }: OverzichtPanelProps) {
  const group = parseGroup(groupParam);
  const allRows = await listPaymentRequests();

  const counts: Record<GroupFilter, number> = {
    all: allRows.length,
    open: 0,
    paid: 0,
    expired: 0,
    cancelled: 0,
  };
  for (const row of allRows) counts[row.group] += 1;

  const rows = group === "all" ? allRows : allRows.filter((r) => r.group === group);

  return (
    <div className="px-6 md:px-10 lg:px-12 pb-14 md:pb-20">
      <header className="mb-10 mt-8">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Betaalverzoeken.
        </h1>
        <p className="tmc-eyebrow mt-4">
          {/* COPY: confirm met Marlon */}
          {allRows.length} {allRows.length === 1 ? "verzoek" : "verzoeken"} totaal
        </p>
      </header>

      <OverzichtToolbar active={group} counts={counts} />
      <OverzichtTable rows={rows} />
    </div>
  );
}
