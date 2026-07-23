"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { formatCampaignDeadline, type CampaignPhase } from "@/lib/campaign";

interface CampaignTeaserProps {
  phase: CampaignPhase;
  /** ISO deadline (closesAtIso), uit getCampaignWindow() (src/lib/campaign.ts). */
  deadline: string;
}

/**
 * Site-wide bar boven de nav. `phase` komt server-side uit de root layout
 * (getCampaignPhase(), geen client Date()-drift), dus SSR en eerste client
 * render tonen altijd dezelfde tekst. Alleen de dismiss-state is client-only
 * (localStorage) en kan dus een klein flitsje geven voor terugkerende
 * bezoekers die 'm al wegklikten — zelfde afweging als de auth-swap in
 * Navbar.tsx.
 */
export function CampaignTeaser({ phase, deadline }: CampaignTeaserProps) {
  const [dismissed, setDismissed] = useState(false);
  const storageKey = `tmc_teaser_dismissed_${phase}`;

  useEffect(() => {
    if (phase === "closed") return;
    try {
      if (window.localStorage.getItem(storageKey) === "1") setDismissed(true);
    } catch {
      // localStorage kan geblokkeerd zijn (privacy-mode); dan toont de bar
      // gewoon elke keer, geen harde fout.
    }
  }, [phase, storageKey]);

  if (phase === "closed" || dismissed) return null;

  // COPY: confirm met Marlon voor alle teksten, inclusief de mobile-variant.
  // De volledige zin wrapt op smalle schermen naar 2 regels, wat de vaste
  // header (teaser + nav samen, zie Navbar.tsx) hoger maakt dan de
  // hero-padding op elke pagina toelaat — daarom een kortere variant onder
  // het sm-breakpoint (zie de sm:hidden / hidden sm:inline split hieronder).
  const deadlineLabel = formatCampaignDeadline(new Date(deadline));
  const teaserText: Record<Exclude<CampaignPhase, "closed">, string> = {
    "pre-open":
      "Binnenkort open in Loosdrecht. Word Early Member en profiteer als eerste mee.",
    "open-em": `We zijn open. Early Member nog beschikbaar tot ${deadlineLabel}.`,
  };
  const teaserTextCompact: Record<Exclude<CampaignPhase, "closed">, string> = {
    "pre-open": "Binnenkort open in Loosdrecht.",
    "open-em": `Early Member nog tot ${deadlineLabel}.`,
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // zie hierboven
    }
  };

  return (
    <div className="relative bg-accent text-bg tmc-fade-up">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-8 py-2.5 text-center text-[13px] font-medium tracking-[0.01em] sm:px-10">
        <span className="sm:hidden">{teaserTextCompact[phase]}</span>
        <span className="hidden sm:inline">{teaserText[phase]}</span>
        <Link
          href="/early-member"
          className="underline underline-offset-2 hover:no-underline"
        >
          Word Early Member →
        </Link>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Sluiten"
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 opacity-60 transition-opacity hover:opacity-100"
      >
        <X size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}
