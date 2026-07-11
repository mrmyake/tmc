"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { PaymentRequestGroup } from "@/lib/admin/payment-requests-query";

type GroupFilter = PaymentRequestGroup | "all";

const GROUPS: GroupFilter[] = ["all", "open", "paid", "expired", "cancelled"];

// COPY: confirm met Marlon
const GROUP_LABEL: Record<GroupFilter, string> = {
  all: "Alles",
  open: "Wacht op betaling",
  paid: "Betaald",
  expired: "Verlopen",
  cancelled: "Geannuleerd",
};

interface OverzichtToolbarProps {
  active: GroupFilter;
  counts: Record<GroupFilter, number>;
}

/**
 * Statusgroepering zodat Marlon in één blik ziet wat openstaat, betaald en
 * verlopen is (zelfde pil-stijl als de "Inactief > 30 dagen"-toggle in
 * MembersToolbar). Eén query-param (group); tab=overzicht blijft altijd
 * staan zodat de link naar de wizard-tab niet per ongeluk terugvalt.
 */
export function OverzichtToolbar({ active, counts }: OverzichtToolbarProps) {
  const router = useRouter();
  const sp = useSearchParams();

  function pushGroup(group: GroupFilter) {
    const next = new URLSearchParams(sp.toString());
    next.set("tab", "overzicht");
    if (group === "all") next.delete("group");
    else next.set("group", group);
    router.push(`/app/admin/betaalverzoeken?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-8">
      {GROUPS.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => pushGroup(g)}
          aria-pressed={active === g}
          className={`inline-flex items-center gap-2 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] border transition-colors duration-300 cursor-pointer ${
            active === g
              ? "border-accent text-accent"
              : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
          }`}
        >
          {GROUP_LABEL[g]} ({counts[g]})
        </button>
      ))}
    </div>
  );
}
