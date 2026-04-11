import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";

export async function POST(request: Request) {
  const data = await request.json();

  if (!data.email || !data.name) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await addSubscriber({
    email: data.email,
    name: data.name,
    fields: {
      phone: data.phone || "",
      preference: data.preference || "",
      experience: data.experience || "",
      message: data.message || "",
    },
    groups: GROUPS.PROEFLES ? [GROUPS.PROEFLES] : [],
  });

  return NextResponse.json({ success: true });
}
