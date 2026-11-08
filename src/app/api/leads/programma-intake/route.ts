import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";
import { sanitizeLeadAttribution } from "@/lib/attribution/params";
import { recordLeadAttribution } from "@/lib/attribution/record";
import { utmToMailerliteFields } from "@/lib/utm";

// Simpel lead-intake mechanisme: MailerLite upsert + intern ntfy-berichtje
// naar Marlon. Geen brontabel in Supabase, alleen voor het 12 Weken
// Programma (studio of online, dat onderscheid maakt de intake zelf niet).
// De advertentie- en campagneparameters komen uit de URL via het veld
// `attribution` (spec-marketing-attribution.md) en gaan naar
// tmc.lead_attributions (source_type programma_intake); een fout daar laat de
// aanvraag nooit falen.
export async function POST(request: Request) {
  try {
    const data = (await request.json()) as {
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      day?: string;
      message?: string;
      /** Ruw uit de body; sanitizeLeadAttribution valideert. */
      attribution?: unknown;
      signupPath?: string;
    };

    if (!data.email || !data.firstName) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const name = `${data.firstName} ${data.lastName || ""}`.trim();
    const sanitized = sanitizeLeadAttribution(data.attribution);
    const params = sanitized?.params ?? {};

    await Promise.all([
      addSubscriber({
        email: data.email,
        name,
        fields: {
          phone: data.phone || "",
          preferred_day: data.day || "",
          message: data.message || "",
          ...utmToMailerliteFields(
            {
              utm_source: params.utm_source,
              utm_medium: params.utm_medium,
              utm_campaign: params.utm_campaign,
              utm_content: params.utm_content,
              utm_term: params.utm_term,
            },
            params.landing_path ?? data.signupPath,
          ),
        },
        groups: GROUPS.PROGRAMMA_INTAKE ? [GROUPS.PROGRAMMA_INTAKE] : [],
      }),
      // De subscriber staat er al; een ntfy-storing mag de bezoeker geen
      // foutmelding geven (en het GA4-event niet tegenhouden).
      sendNotification(
        "12 Weken Programma: intake aanvraag!",
        "Nieuwe intake-aanvraag. Gegevens staan in MailerLite, groep Programma intake.",
        "eyes,star"
      ).catch((err) => console.error("[API /leads/programma-intake] ntfy", err)),
    ]);

    // Geen brontabel: source_id is alleen een idempotentiesleutel.
    await recordLeadAttribution({
      sourceType: "programma_intake",
      sourceId: crypto.randomUUID(),
      email: data.email,
      attribution: data.attribution,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[API /leads/programma-intake]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
