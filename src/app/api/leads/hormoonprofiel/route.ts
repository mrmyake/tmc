import { NextResponse } from "next/server";
import { addSubscriber } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";
import { isTestEmail } from "@/lib/test-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeLeadAttribution } from "@/lib/attribution/params";
import { recordLeadAttribution } from "@/lib/attribution/record";
import { utmToMailerliteFields } from "@/lib/utm";
import {
  HP_PREFERRED_DAY,
  buildLandingPath,
  parseHormoonprofielIntake,
} from "@/lib/hormoonprofiel/intake";
import { sendHormoonprofielMail } from "@/lib/hormoonprofiel/notify";

// Kennismakingsformulier van hormoonprofiel.com en de sectie /hormoonprofiel
// op TMC (spec-hormoonprofiel.md). Dezelfde stroom als de 12 weken-intake
// (/api/leads/programma-intake), geen tweede systeem: eerst de rij in
// tmc.programma_intakes (faalt dat, dan 500), daarna parallel en best-effort
// MailerLite, ntfy, de mail aan Marlon en de attributierij.
//
// Verschillen met de intake: een eigen MailerLite-groep
// (MAILERLITE_HORMOONPROFIEL_GROUP_ID; leeg = MailerLite overslaan met een
// warning), een eigen ntfy-titel en mail zonder voorkeursdag, en
// signup_path '/hormoonprofiel' in beide modi. De host en de modus gaan mee in
// landing_path.
//
// Spam: honeypot en minimaal 3 seconden invultijd. Beide geven een stil
// succes terug zonder iets op te slaan. Er is geen herbruikbare rate limit
// (open punt in spec-hormoonprofiel.md).
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = parseHormoonprofielIntake(body);
  if (!parsed.ok) {
    if (parsed.reason === "spam") {
      console.warn("[API /leads/hormoonprofiel] spam genegeerd");
      return NextResponse.json({ success: true });
    }
    return NextResponse.json(
      { error: "Missing or invalid fields", field: parsed.field, reason: parsed.reason },
      { status: 400 },
    );
  }
  const input = parsed.value;
  const attributionRaw = (body as { attribution?: unknown }).attribution;
  const sanitized = sanitizeLeadAttribution(attributionRaw);
  const adParams = sanitized?.params ?? {};
  const landingPath = buildLandingPath(
    new URL(request.url).host,
    input.variant,
    adParams.landing_path,
  );
  const params = { ...adParams, landing_path: landingPath };

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
        preferred_day: HP_PREFERRED_DAY,
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
        landing_path: params.landing_path,
        idempotency_key: input.submissionId ?? crypto.randomUUID(),
      })
      .select("id, created_at")
      .single();

    if (error) {
      // Dubbele inzending: de eerste heeft alles al afgehandeld.
      if (error.code === "23505") {
        console.warn("[API /leads/hormoonprofiel] dubbele inzending genegeerd");
        return NextResponse.json({ success: true });
      }
      console.error("[API /leads/hormoonprofiel] insert failed", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    intakeId = data.id as string;
    createdAt = new Date(data.created_at as string);
  } catch (e) {
    console.error("[API /leads/hormoonprofiel] insert threw", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const name = `${input.firstName} ${input.lastName}`.trim();
  const groupId = (process.env.MAILERLITE_HORMOONPROFIEL_GROUP_ID ?? "").trim();
  const steps: [string, () => Promise<unknown>][] = [
    [
      "mailerlite",
      async () => {
        if (!groupId) {
          console.warn(
            "[API /leads/hormoonprofiel] MAILERLITE_HORMOONPROFIEL_GROUP_ID ontbreekt; MailerLite overgeslagen",
            intakeId,
          );
          return;
        }
        await addSubscriber({
          email: input.email,
          name,
          fields: {
            phone: input.phone,
            message: input.message ?? "",
            ...utmToMailerliteFields(
              {
                utm_source: params.utm_source,
                utm_medium: params.utm_medium,
                utm_campaign: params.utm_campaign,
                utm_content: params.utm_content,
                utm_term: params.utm_term,
              },
              params.landing_path,
            ),
          },
          groups: [groupId],
        });
      },
    ],
    [
      "ntfy",
      // Het topic is publiek: geen persoonsgegevens in de tekst. Buiten
      // productie zet sendNotification zelf "TEST: " voor de titel.
      () =>
        sendNotification(
          // COPY: confirm met Marlon
          "Hormoonprofiel: kennismaking aangevraagd!",
          // COPY: confirm met Marlon
          "Nieuwe kennismaking. Gegevens staan in de mail aan Marlon en in het admin-dashboard.",
          "eyes,star",
          { test: isTestEmail(input.email) },
        ),
    ],
    ["mail", () => sendHormoonprofielMail({ intakeId, input, params, createdAt })],
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

  const results = await Promise.allSettled(steps.map(async ([, run]) => run()));
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`[API /leads/hormoonprofiel] ${steps[i][0]} failed`, intakeId, result.reason);
    }
  });

  return NextResponse.json({ success: true });
}
