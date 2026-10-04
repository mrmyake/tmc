import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Terugbelformulier op /proefles (kaart "Liever gebeld worden").
 *
 * Supabase (tmc.trial_requests) is de bron van proefles-aanvragen; de
 * insert gaat voor MailerLite en ntfy uit. Faalt de insert, dan loggen we
 * en gaat de bestaande flow door, zodat een database-storing de aanvraag
 * niet onzichtbaar maakt. MailerLite blijft alleen mailinglijst: de account
 * kent uitsluitend de velden name en phone, dus voorkeur, ervaring en
 * bericht gaan daar niet meer heen.
 *
 * Geen rate limiting: er bestaat geen generieke helper per IP in de
 * codebase (de tellers voor proefcodes en kiosk-PIN zijn feature-specifieke
 * RPC's met eigen tabel). Bewust niet gebouwd in deze PR.
 */

const MAX_LENGTH = {
  name: 120,
  email: 254,
  phone: 40,
  preference: 200,
  experience: 40,
  message: 2000,
} as const;

type FieldKey = keyof typeof MAX_LENGTH;

// Eenvoudige formaatcheck: iets@iets.iets, geen whitespace. Strenger is
// hier niet nodig; het adres wordt nergens automatisch gemaild.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface TrialRequestInput {
  name: string;
  email: string;
  phone: string | null;
  preference: string | null;
  experience: string | null;
  message: string | null;
}

/** Trim; een lege string of een niet-string wordt null. */
function cleanField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

type ParseResult =
  | { ok: true; input: TrialRequestInput }
  | { ok: false; error: string };

function parseTrialRequest(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid body" };
  const data = raw as Record<string, unknown>;

  const fields = {} as Record<FieldKey, string | null>;
  for (const key of Object.keys(MAX_LENGTH) as FieldKey[]) {
    const value = cleanField(data[key]);
    if (value && value.length > MAX_LENGTH[key]) {
      return { ok: false, error: "Invalid fields" };
    }
    fields[key] = value;
  }

  if (!fields.name || !fields.email) return { ok: false, error: "Missing fields" };
  if (!EMAIL_RE.test(fields.email)) return { ok: false, error: "Invalid fields" };

  return {
    ok: true,
    input: {
      name: fields.name,
      email: fields.email,
      phone: fields.phone,
      preference: fields.preference,
      experience: fields.experience,
      message: fields.message,
    },
  };
}

async function storeTrialRequest(input: TrialRequestInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("trial_requests").insert({
      name: input.name,
      email: input.email,
      phone: input.phone,
      preference: input.preference,
      experience: input.experience,
      message: input.message,
    });
    if (error) console.error("[proefles] trial_requests insert failed", error);
  } catch (e) {
    console.error("[proefles] trial_requests insert failed", e);
  }
}

export async function POST(request: Request) {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const parsed = parseTrialRequest(raw);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { input } = parsed;

    await storeTrialRequest(input);

    await Promise.all([
      addSubscriber({
        email: input.email,
        name: input.name,
        fields: {
          phone: input.phone ?? "",
        },
        groups: GROUPS.PROEFLES ? [GROUPS.PROEFLES] : [],
      }),
      // Geen persoonsgegevens in ntfy (PR #205); de melding verwijst alleen.
      sendNotification(
        "Nieuwe proefles aanvraag!",
        "Nieuwe proefles-aanvraag. Bekijk hem in de admin onder Proeflessen (/app/admin/proeflessen).",
        "muscle,fire"
      ),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[API /proefles]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
