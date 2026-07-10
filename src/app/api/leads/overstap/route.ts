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

    await Promise.all([
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
        `${data.name} (${data.email})\nTel: ${data.phone || "-"}\n${data.message || ""}`,
        "arrows_counterclockwise",
      ),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[API /leads/overstap]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
