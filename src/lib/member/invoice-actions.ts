"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Eerste signed-URL-patroon in de codebase (spec-facturatie.md 5.4). Geen
 * publieke bucket, geen raadbaar-maar-lang pad: facturen bevatten
 * NAW-gegevens, dus autorisatie loopt via RLS, niet via padobscurity.
 *
 * De factuur wordt via de COOKIE-client opgehaald zodat RLS de scoping
 * doet: een lid krijgt alleen zijn eigen gefinaliseerde niet-test-factuur
 * (invoices_self_read), een admin krijgt alles (invoices_admin_all). Dat
 * is bewust het enige autorisatiepad — geen route met een tweede check
 * ernaast, en dus herbruikbaar voor het admin-factuurscherm (9b) zonder
 * wijziging: dezelfde functie, een andere rol bepaalt via RLS wat de
 * select teruggeeft.
 *
 * Vijf minuten TTL: de URL wordt direct gevolgd en hoeft niet gedeeld te
 * kunnen worden; een korte TTL beperkt de schade als hij ergens beland.
 * Alleen createSignedUrl loopt via de service-role client (nodig omdat
 * storage-RLS op deze bucket ontbreekt, spec 5.3); de autorisatie zelf
 * gebeurt daarvoor al met de cookie-client.
 */

export type InvoiceDownloadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const SIGNED_URL_TTL_SECONDS = 300;

export async function getInvoiceDownloadUrl(
  invoiceId: string,
): Promise<InvoiceDownloadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Log opnieuw in om de factuur te downloaden." };
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("pdf_path")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) {
    console.error("[getInvoiceDownloadUrl] invoice lookup failed", invoiceError);
    // COPY: confirm met Marlon
    return { ok: false, error: "Kon de factuur niet ophalen. Probeer het later opnieuw." };
  }

  // Geen rij: bestaat niet, is niet van dit lid (RLS), of nog niet
  // gefinaliseerd/is_test. Één neutrale melding, geen onderscheid --
  // anders lekt het bestaan van andermans factuur.
  if (!invoice) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Deze factuur is niet beschikbaar." };
  }

  if (!invoice.pdf_path) {
    // Vandaag het enige pad dat in productie geraakt kan worden: er
    // bestaat nog geen enkele gerenderde PDF (9b bouwt de renderstap).
    // COPY: confirm met Marlon
    return { ok: false, error: "De PDF voor deze factuur wordt nog gemaakt. Probeer het later opnieuw." };
  }

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from("tmc-invoices")
    .createSignedUrl(invoice.pdf_path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    console.error("[getInvoiceDownloadUrl] createSignedUrl failed", signError);
    // COPY: confirm met Marlon
    return { ok: false, error: "De factuur kon niet geopend worden. Probeer het later opnieuw." };
  }

  return { ok: true, url: signed.signedUrl };
}
