"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./require-admin";
import {
  leadAttributionsCsv,
  type LeadAttributionExportRow,
} from "@/lib/attribution/csv";
import { parseAdConsent } from "@/lib/attribution/params";

/**
 * Export van tmc.lead_attributions voor de knop "Attributie CSV" op
 * /app/admin/proeflessen (spec-marketing-attribution.md). Gate requireAdmin,
 * daarna service-role (de tabel heeft geen grants voor authenticated). Beide
 * brontypen in een bestand, met status en bron van de gekoppelde
 * proefboeking of de status van de terugbelaanvraag. Testboekingen (is_test)
 * en attributierijen zonder bestaande bron blijven weg. Alleen lezen.
 */

export type ExportLeadAttributionsResult =
  | { ok: true; csv: string; count: number }
  | { ok: false; message: string };

// Bovengrens; geen paginering. Ruim boven wat de studio aan leads verwacht.
const EXPORT_LIMIT = 5000;

type RawAttribution = {
  id: string;
  created_at: string;
  source_type: string;
  source_id: string;
  email: string;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_path: string | null;
  ad_consent: string;
};

export async function exportLeadAttributionsCsv(): Promise<ExportLeadAttributionsResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lead_attributions")
    .select(
      "id, created_at, source_type, source_id, email, gclid, gbraid, wbraid, fbclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_path, ad_consent",
    )
    .order("created_at", { ascending: false })
    .limit(EXPORT_LIMIT);
  if (error) {
    console.error("[lead-attributions] export failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Export mislukt. Probeer het opnieuw." };
  }

  const rows = (data ?? []) as RawAttribution[];
  const bookingIds = rows.filter((r) => r.source_type === "trial_booking").map((r) => r.source_id);
  const requestIds = rows.filter((r) => r.source_type === "trial_request").map((r) => r.source_id);

  const [bookingsRes, requestsRes] = await Promise.all([
    bookingIds.length
      ? admin.from("trial_bookings").select("id, status, source, is_test").in("id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
    requestIds.length
      ? admin.from("trial_requests").select("id, status").in("id", requestIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (bookingsRes.error || requestsRes.error) {
    console.error("[lead-attributions] join failed", bookingsRes.error ?? requestsRes.error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Export mislukt. Probeer het opnieuw." };
  }

  const bookings = new Map(
    ((bookingsRes.data ?? []) as Array<{ id: string; status: string; source: string | null; is_test: boolean }>).map(
      (b) => [b.id, b] as const,
    ),
  );
  const requests = new Map(
    ((requestsRes.data ?? []) as Array<{ id: string; status: string }>).map((r) => [r.id, r] as const),
  );

  const exportRows: LeadAttributionExportRow[] = [];
  for (const r of rows) {
    let status: string;
    let bookingSource = "";
    if (r.source_type === "trial_booking") {
      const booking = bookings.get(r.source_id);
      if (!booking || booking.is_test) continue;
      status = booking.status;
      bookingSource = booking.source ?? "";
    } else if (r.source_type === "trial_request") {
      const request = requests.get(r.source_id);
      if (!request) continue;
      status = request.status;
    } else {
      continue;
    }
    exportRows.push({
      createdAt: r.created_at,
      sourceType: r.source_type,
      sourceId: r.source_id,
      status,
      bookingSource,
      email: r.email,
      gclid: r.gclid,
      gbraid: r.gbraid,
      wbraid: r.wbraid,
      fbclid: r.fbclid,
      utmSource: r.utm_source,
      utmMedium: r.utm_medium,
      utmCampaign: r.utm_campaign,
      utmTerm: r.utm_term,
      utmContent: r.utm_content,
      landingPath: r.landing_path,
      adConsent: parseAdConsent(r.ad_consent),
    });
  }

  return { ok: true, csv: leadAttributionsCsv(exportRows), count: exportRows.length };
}
