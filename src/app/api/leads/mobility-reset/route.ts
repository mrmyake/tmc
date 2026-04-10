import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { name, email } = await request.json();

  if (!name || !email) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // TODO: Brevo API — add contact + tag "mobility_reset"
  console.log("[Lead] mobility-reset:", { name, email });

  return NextResponse.json({ success: true });
}
