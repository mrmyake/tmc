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
          preference: data.preference || "",
          experience: data.experience || "",
          message: data.message || "",
        },
        groups: GROUPS.PROEFLES ? [GROUPS.PROEFLES] : [],
      }),
      sendNotification(
        "Nieuwe proefles aanvraag!",
        `${data.name} (${data.email})\nTel: ${data.phone || "-"}\nVoorkeur: ${data.preference || "-"}\nErvaring: ${data.experience || "-"}`,
        "muscle,fire"
      ),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[API /proefles]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
