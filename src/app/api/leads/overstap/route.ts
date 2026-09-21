import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";

interface OverstapLeadPayload {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
}

export async function POST(request: Request) {
  try {
    const data = (await request.json()) as OverstapLeadPayload;

    if (!data.email || !data.name) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // allSettled, niet all: de ntfy-staffalert is het signaal dat een mens
    // ziet, MailerLite is de opslag van de lead zelf (de melding bevat geen
    // persoonsgegevens, zie PR fix/ntfy-pii-leak). Met
    // Promise.all zou een afgewezen addSubscriber() de hele request
    // 500'en en, in een serverless runtime, de functie kunnen bevriezen
    // vóórdat de ntfy-fetch klaar is, waardoor de staff-alert alsnog
    // verloren gaat.
    const [mailerliteResult, ntfyResult] = await Promise.allSettled([
      addSubscriber({
        email: data.email,
        name: data.name,
        fields: {
          phone: data.phone || "",
          message: data.message || "",
        },
        groups: GROUPS.OVERSTAP ? [GROUPS.OVERSTAP] : [],
      }),
      sendNotification(
        "Overstap aanvraag",
        "Nieuwe overstap-aanvraag. Gegevens staan in MailerLite, groep Overstap.",
        "arrows_counterclockwise",
      ),
    ]);

    if (mailerliteResult.status === "rejected") {
      console.error("[API /leads/overstap] mailerlite", mailerliteResult.reason);
      // De melding hierboven bevat geen gegevens meer, dus zonder MailerLite
      // is de lead nergens vastgelegd. Dat moet een mens weten.
      await sendNotification(
        "Overstap-aanvraag niet opgeslagen",
        "MailerLite weigerde de aanmelding; de lead is niet vastgelegd. Check de Vercel-logs van /api/leads/overstap.",
        "warning",
      );
    }
    if (ntfyResult.status === "rejected") {
      console.error("[API /leads/overstap] ntfy", ntfyResult.reason);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[API /leads/overstap]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
