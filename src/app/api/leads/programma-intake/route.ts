import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";
import { utmToMailerliteFields, type UtmParams } from "@/lib/utm";

// Mirrors /api/leads/mobility-check: MailerLite upsert + intern ntfy-berichtje
// naar Marlon. Geen Supabase, geen boekingssysteem — zelfde lichte
// mechanisme als de Mobility Check aanvraag, alleen voor het 12 Weken
// Programma (studio of online, dat onderscheid maakt de intake zelf niet).
export async function POST(request: Request) {
  try {
    const data = (await request.json()) as {
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      day?: string;
      message?: string;
      utm?: UtmParams;
      signupPath?: string;
    };

    if (!data.email || !data.firstName) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const name = `${data.firstName} ${data.lastName || ""}`.trim();

    await Promise.all([
      addSubscriber({
        email: data.email,
        name,
        fields: {
          phone: data.phone || "",
          preferred_day: data.day || "",
          message: data.message || "",
          ...utmToMailerliteFields(data.utm ?? {}, data.signupPath),
        },
        groups: GROUPS.PROGRAMMA_INTAKE ? [GROUPS.PROGRAMMA_INTAKE] : [],
      }),
      sendNotification(
        "12 Weken Programma: intake aanvraag!",
        `${name} (${data.email})\nTel: ${data.phone || "-"}\nDag: ${data.day || "-"}\nBericht: ${data.message || "-"}`,
        "eyes,star"
      ),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[API /leads/programma-intake]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
