import { KeyRound, Plus, Minus, AlertTriangle } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import type { ExtendedAccessState } from "@/lib/admin/members-query";

/**
 * Verlengde-toegang-cel in de ledenlijst. Elke toestand heeft een eigen
 * label, tone en Lucide-icoon zodat de kolom afleesbaar is zonder de
 * betekenis van een leeg vak te hoeven raden. De `no_membership`-toestand
 * rendert bewust niets: die rijen tonen elders al "Geen abbo" en houden de
 * bestaande weergave (streepje in de tabelcel, niets op de mobiele kaart).
 */
const ICON = { size: 12, strokeWidth: 1.75 } as const;

const CONFIG: Record<
  Exclude<ExtendedAccessState, "no_membership">,
  { label: string; tone: ChipTone; icon: React.ReactNode; title: string }
> = {
  included: {
    // COPY: confirm met Marlon
    label: "Inbegrepen",
    tone: "success",
    icon: <KeyRound {...ICON} />,
    // COPY: confirm met Marlon
    title: "Verlengde toegang, inbegrepen bij het abonnement",
  },
  addon: {
    // COPY: confirm met Marlon
    label: "Add-on",
    tone: "accent",
    icon: <KeyRound {...ICON} />,
    // COPY: confirm met Marlon
    title: "Verlengde toegang, betaalde add-on",
  },
  addon_available: {
    // COPY: confirm met Marlon
    label: "Mogelijk",
    tone: "muted",
    icon: <Plus {...ICON} />,
    // COPY: confirm met Marlon
    title: "Geen verlengde toegang, wel mogelijk als add-on",
  },
  na: {
    // COPY: confirm met Marlon
    label: "N.v.t.",
    tone: "muted",
    icon: <Minus {...ICON} />,
    // COPY: confirm met Marlon
    title: "Niet van toepassing bij dit abonnement",
  },
  catalogue_missing: {
    // COPY: confirm met Marlon
    label: "Datafout",
    tone: "danger",
    icon: <AlertTriangle {...ICON} />,
    // COPY: confirm met Marlon
    title: "Geen catalogusrij voor dit abonnement; zie de serverlogs",
  },
  inconsistent: {
    // COPY: confirm met Marlon
    label: "Inconsistent",
    tone: "danger",
    icon: <AlertTriangle {...ICON} />,
    // COPY: confirm met Marlon
    title:
      "Abonnement zegt inbegrepen, maar de membership staat op geen verlengde toegang",
  },
};

interface ExtendedAccessBadgeProps {
  state: ExtendedAccessState;
  /** Wat te tonen bij `no_membership`; tabelcel geeft een streepje, kaart niets. */
  emptyFallback?: React.ReactNode;
}

export function ExtendedAccessBadge({
  state,
  emptyFallback = null,
}: ExtendedAccessBadgeProps) {
  if (state === "no_membership") return <>{emptyFallback}</>;
  const cfg = CONFIG[state];
  return (
    <Chip tone={cfg.tone} icon={cfg.icon} title={cfg.title}>
      {cfg.label}
    </Chip>
  );
}
