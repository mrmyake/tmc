import { NextResponse } from "next/server";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeLeadAttribution } from "@/lib/attribution/params";
import { recordLeadAttribution } from "@/lib/attribution/record";
import { utmToMailerliteFields } from "@/lib/utm";
import { parseProgrammaIntake } from "@/lib/programma-intake/validate";
import { sendProgrammaIntakeMail } from "@/lib/programma-intake/notify";

// Intake-aanvraag voor het 12 weken programma (studio of online, dat
// onderscheid maakt de intake zelf niet).
//
// Volgorde: eerst de rij in tmc.programma_intakes (de bron; faalt dat, dan 500
// en de bestaande foutmelding in het formulier), daarna parallel MailerLite,
// ntfy, de mail aan Marlon en de attributierij. Elk van die vier is
// best-effort: een fout wordt gelogd met het intake-id en blokkeert niets,
// ook geen MailerLite-storing meer.
//
// Idempotentie: de client stuurt per pagina-load een submissionId mee, dat de
// unieke idempotency_key van de rij wordt. Een dubbele inzending botst
// (23505) en krijgt succes terug zonder tweede rij of tweede mail.
//
// Attributie (spec-marketing-attribution.md): `attribution` uit de body wordt
// opnieuw gevalideerd; de velden staan op de rij zelf en, als er minstens een
// advertentie- of campagneparameter is, ook in tmc.lead_attributions met
// source_id = id van de intake-rij.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = parseProgrammaIntake(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Missing or invalid fields", field: parsed.field, reason: parsed.reason },
      { status: 400 },
    );
  }
  const input = parsed.value;
  const attributionRaw = (body as { attribution?: unknown }).attribution;
  const sanitized = sanitizeLeadAttribution(attributionRaw);
  const params = sanitized?.params ?? {};

  let intakeId: string;
  let createdAt: Date;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("programma_intakes")
      .insert({
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        preferred_day: input.day,
        message: input.message,
        signup_path: input.signupPath,
        gclid: params.gclid ?? null,
        gbraid: params.gbraid ?? null,
        wbraid: params.wbraid ?? null,
        fbclid: params.fbclid ?? null,
        utm_source: params.utm_source ?? null,
        utm_medium: params.utm_medium ?? null,
        utm_campaign: params.utm_campaign ?? null,
        utm_term: params.utm_term ?? null,
        utm_content: params.utm_content ?? null,
        landing_path: params.landing_path ?? null,
        idempotency_key: input.submissionId ?? crypto.randomUUID(),
      })
      .select("id, created_at")
      .single();

    if (error) {
      // Dubbele inzending: de eerste heeft alles al afgehandeld.
      if (error.code === "23505") {
        console.warn("[API /leads/programma-intake] dubbele inzending genegeerd");
        return NextResponse.json({ success: true });
      }
      console.error("[API /leads/programma-intake] insert failed", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    intakeId = data.id as string;
    createdAt = new Date(data.created_at as string);
  } catch (e) {
    console.error("[API /leads/programma-intake] insert threw", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const name = `${input.firstName} ${input.lastName}`.trim();
  const steps: [string, () => Promise<unknown>][] = [
    [
      "mailerlite",
      () =>
        addSubscriber({
          email: input.email,
          name,
          fields: {
            phone: input.phone,
            preferred_day: input.day,
            message: input.message ?? "",
            ...utmToMailerliteFields(
              {
                utm_source: params.utm_source,
                utm_medium: params.utm_medium,
                utm_campaign: params.utm_campaign,
                utm_content: params.utm_content,
                utm_term: params.utm_term,
              },
              params.landing_path ?? input.signupPath ?? undefined,
            ),
          },
          groups: GROUPS.PROGRAMMA_INTAKE ? [GROUPS.PROGRAMMA_INTAKE] : [],
        }),
    ],
    [
      "ntfy",
      // Het topic is publiek: geen persoonsgegevens in de tekst.
      () =>
        sendNotification(
          "12 Weken Programma: intake aanvraag!",
          // COPY: confirm met Marlon
          "Nieuwe intake-aanvraag. Gegevens staan in de mail aan Marlon en in het admin-dashboard.",
          "eyes,star",
        ),
    ],
    ["mail", () => sendProgrammaIntakeMail({ intakeId, input, params, createdAt })],
    [
      "attribution",
      () =>
        recordLeadAttribution({
          sourceType: "programma_intake",
          sourceId: intakeId,
          email: input.email,
          attribution: attributionRaw,
        }),
    ],
  ];

  // De async wrapper vangt ook een synchrone throw van een stap op: een throw of
  // rejection wordt een gelogde fout, nooit een foutmelding voor de bezoeker.
  const results = await Promise.allSettled(steps.map(async ([, run]) => run()));
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`[API /leads/programma-intake] ${steps[i][0]} failed`, intakeId, result.reason);
    }
  });

  return NextResponse.json({ success: true });
}
