import { SITE } from "@/lib/constants";
import type { Link, Placeholder, PlaatsLink, Trainer, BeeldConcept } from "./types";

// COPY: confirm met Marlon (alle Nederlandse tekst in src/content/lokaal/)

/** Kale links: geen UTM's op interne links (spec-locatiepaginas.md, besluit 7). */
export const PROEFLES_HREF = "/proefles";
export const KENNISMAKING_HREF = "/proefles?kaart=bellen";

export const CTA_PROEFLES: Link = { label: "Plan je proefles", href: PROEFLES_HREF };
export const CTA_KENNISMAKING: Link = {
  label: "Plan een kennismaking",
  href: KENNISMAKING_HREF,
};
export const CTA_ROOSTER: Link = { label: "Bekijk het rooster", href: "/rooster" };

export const VOORHEEN_KORT = "Voorheen PT Loosdrecht. Zelfde trainer, nieuwe studio.";

/** Tijdelijk beeld, alleen toegestaan bij status 'concept'. */
export function placeholder(label: string): Placeholder {
  return { placeholder: true, label };
}

export const MARLON_FOTO: BeeldConcept = placeholder("Portret Marlon");

export function marlon(tekst: string, opleiding?: string): Trainer<BeeldConcept> {
  return {
    naam: SITE.trainer.name,
    rol: SITE.trainer.role,
    tekst,
    opleiding,
    foto: MARLON_FOTO,
  };
}

/** Plaatsen waarnaar de dienstpagina's in de regio-regel linken. */
export const REGIO_PLAATSEN: readonly PlaatsLink[] = [
  { label: "Hilversum", pagina: "personal-trainer-hilversum" },
  { label: "Bussum", pagina: "personal-trainer-bussum" },
  { label: "Laren", pagina: "personal-trainer-laren" },
  { label: "Het Gooi", pagina: "personal-trainer-gooi" },
];

export const AREA_SERVED_REGIO = [
  "Loosdrecht",
  "Hilversum",
  "Bussum",
  "Laren",
] as const;
