import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { name, email } = await request.json();

  if (!name || !email) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // TODO: Brevo API — add contact + tag "pdf_lead"
  // const response = await fetch("https://api.brevo.com/v3/contacts", {
  //   method: "POST",
  //   headers: {
  //     "api-key": process.env.BREVO_API_KEY!,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //     email,
  //     attributes: { FIRSTNAME: name },
  //     listIds: [/* your list ID */],
  //     updateEnabled: true,
  //   }),
  // });

  console.log("[Lead] beweeg-beter:", { name, email });

  return NextResponse.json({ success: true });
}
