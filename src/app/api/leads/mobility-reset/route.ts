import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";

export async function POST(request: Request) {
  const { name, email } = await request.json();

  if (!name || !email) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await Promise.all([
    addSubscriber({
      email,
      name,
      groups: GROUPS.MOBILITY_RESET ? [GROUPS.MOBILITY_RESET] : [],
    }),
    sendNotification(
      "Mobility Reset aanmelding",
      `${name} (${email})`,
      "calendar"
    ),
  ]);

  return NextResponse.json({ success: true });
}
