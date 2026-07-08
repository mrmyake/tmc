import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";
import { utmToMailerliteFields, type UtmParams } from "@/lib/utm";

interface LeadPayload {
  email?: string;
  utm?: UtmParams;
  signupPath?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LeadPayload;
    const { email, utm = {}, signupPath } = body;

    if (!email) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await Promise.all([
      addSubscriber({
        email,
        fields: utmToMailerliteFields(utm, signupPath),
        // Gedeelde groep met de site-brede "blijf op de hoogte"-opt-in
        // (InfoOptInBanner / /api/leads/info): dezelfde MailerLite-groep
        // "Early Member Interested" (id 192312426174088430) had eerder een
        // eigen, nooit-geconfigureerde env-gebonden groep-constante in
        // mailerlite.ts. Die is verwijderd, zie PR-beschrijving voor de
        // consolidatie.
        groups: GROUPS.INFO_INTERESTED ? [GROUPS.INFO_INTERESTED] : [],
      }),
      sendNotification(
        "Early Member interesse",
        email,
        "eyes"
      ),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[API /leads/early-member]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
