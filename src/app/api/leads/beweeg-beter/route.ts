import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";

export async function POST(request: Request) {
  try {
    const { name, email } = await request.json();

    if (!name || !email) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await Promise.all([
      addSubscriber({
        email,
        name,
        groups: GROUPS.PDF_LEAD ? [GROUPS.PDF_LEAD] : [],
      }),
      sendNotification(
        "Beweeg Beter guide download",
        `${name} (${email})`,
        "book"
      ),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[API /leads/beweeg-beter]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
