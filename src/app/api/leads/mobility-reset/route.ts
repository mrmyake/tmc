import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";
import { utmToMailerliteFields, type UtmParams } from "@/lib/utm";

interface LeadPayload {
  name?: string;
  email?: string;
  utm?: UtmParams;
  signupPath?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LeadPayload;
    const { name, email, utm = {}, signupPath } = body;

    if (!name || !email) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await Promise.all([
      addSubscriber({
        email,
        name,
        fields: utmToMailerliteFields(utm, signupPath),
        groups: GROUPS.MOBILITY_RESET ? [GROUPS.MOBILITY_RESET] : [],
      }),
      sendNotification(
        "Mobility Reset aanmelding",
        `${name} (${email})`,
        "calendar"
      ),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[API /leads/mobility-reset]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
