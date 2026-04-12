import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";

export async function POST(request: Request) {
  try {
    const data = await request.json();

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
          preferred_time: data.time || "",
          experience: data.experience || "",
          goals: data.goals || "",
        },
        groups: GROUPS.MOBILITY_CHECK ? [GROUPS.MOBILITY_CHECK] : [],
      }),
      sendNotification(
        "Mobility Check aanvraag!",
        `${name} (${data.email})\nTel: ${data.phone || "-"}\nDag: ${data.day || "-"} ${data.time || ""}\nErvaring: ${data.experience || "-"}\nDoelen: ${data.goals || "-"}`,
        "eyes,star"
      ),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[API /leads/mobility-check]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
