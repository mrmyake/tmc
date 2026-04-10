import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const data = await request.json();

  if (!data.email || !data.firstName) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // TODO: Brevo API — add contact + tag "mobility_check"
  // TODO: Send notification email to Marlon
  console.log("[Lead] mobility-check:", data);

  return NextResponse.json({ success: true });
}
