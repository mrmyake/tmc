import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";

export async function POST(request: Request) {
  try {
    const data = await request.json();

    if (!data.email || !data.name) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await Promise.all([
      addSubscriber({
        email: data.email,
        name: data.name,
        fields: {
          phone: data.phone || "",
          subject: data.subject || "",
          message: data.message || "",
        },
        groups: GROUPS.CONTACT ? [GROUPS.CONTACT] : [],
      }),
      sendNotification(
        "Nieuw contactbericht",
        "Nieuw bericht via het contactformulier. Inhoud staat in MailerLite, groep Contact.",
        "speech_balloon"
      ),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[API /contact]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
