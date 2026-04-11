import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";

export async function POST(request: Request) {
  const { name, email } = await request.json();

  if (!name || !email) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await addSubscriber({
    email,
    name,
    groups: GROUPS.PDF_LEAD ? [GROUPS.PDF_LEAD] : [],
  });

  return NextResponse.json({ success: true });
}
