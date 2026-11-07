import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { addSubscriber } from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";
import { siteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeLeadAttribution } from "@/lib/attribution/params";
import { clientIp } from "@/lib/trial-codes/server";
import YogaTestResult from "@/emails/yoga_test_result";
import { outcomes, yogaQuiz } from "@/lib/yoga-test/config";
import { codeBookingPath, paidBookingPath } from "@/lib/yoga-test/links";
import { getYogaSchedule, isYogaCodeActive } from "@/lib/yoga-test/server";
import {
  chosenBucket,
  formatSlot,
  parseAnswers,
  rankOutcomes,
  sortSlots,
} from "@/lib/yoga-test/scoring";

/**
 * POST /api/yoga-test: mailblok van de quiz "Welke yoga past bij jou?"
 * (spec-yoga-test.md).
 *
 * - De server rekent de uitslag zelf opnieuw uit de antwoorden. De client
 *   mag alleen aangeven welke van de eerste twee uitkomsten hij bekijkt
 *   (`show`); de server controleert dat tegen zijn eigen rangschikking. De zorgvraag (vraag 8) wordt
 *   niet meegestuurd en nooit verwerkt.
 * - De uitslagmail gaat altijd via MailerSend (transactioneel: de bezoeker
 *   vraagt erom). De code staat er alleen in als hij nu bruikbaar is.
 * - MailerLite alleen bij aangevinkte opt-in, in de groep
 *   MAILERLITE_YOGA_TEST_GROUP_ID, met het veld yoga_test_result. Bestaat het
 *   veld (nog) niet, dan wordt de abonnee zonder veld toegevoegd.
 * - Rate limiting per IP via de generieke teller tmc.register_rate_limited_attempt.
 * - ntfy zonder persoonsgegevens: alleen de les en of er opt-in was.
 */

const RATE_SCOPE = "yoga_test";
const RATE_MAX = 10;
const RATE_WINDOW = "30 minutes";
const RATE_LOCK = "15 minutes";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MAX_NAME = 120;

/**
 * true = toegestaan. Faalt de RPC (bv. een preview voordat de migratie is
 * gepusht), dan laten we op preview en lokaal door en weigeren we op
 * productie: een mailendpoint zonder teller blijft nooit open staan.
 */
async function allowed(ip: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("register_rate_limited_attempt", {
      p_scope: RATE_SCOPE,
      p_key: ip,
      p_max: RATE_MAX,
      p_window: RATE_WINDOW,
      p_lock: RATE_LOCK,
    });
    if (error) throw error;
    return data === true;
  } catch (err) {
    console.error("[api/yoga-test] rate limit RPC faalde", err);
    return process.env.VERCEL_ENV !== "production";
  }
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  if (!(await allowed(await clientIp()))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email) || name.length > MAX_NAME) {
    return NextResponse.json({ error: "invalid_fields" }, { status: 400 });
  }
  const answers = parseAnswers(body.answers);
  if (!answers) return NextResponse.json({ error: "invalid_answers" }, { status: 400 });
  const optIn = body.optIn === true;

  const [schedule, codeActive] = await Promise.all([getYogaSchedule(), isYogaCodeActive()]);
  const ranking = rankOutcomes(answers, schedule);
  if (ranking.length === 0) {
    return NextResponse.json({ error: "no_schedule" }, { status: 409 });
  }
  // De bezoeker kan op de uitslag wisselen naar de nummer 2. De server
  // accepteert dat alleen voor de eerste twee van zijn eigen rangschikking;
  // elke andere waarde valt terug op de nummer 1.
  const show = typeof body.show === "string" ? body.show : null;
  const picked = ranking.slice(0, 2).find((r) => r.key === show) ?? ranking[0];
  const outcome = outcomes[picked.key];
  const bucket = chosenBucket(answers);
  const attribution = sanitizeLeadAttribution(body.attribution)?.params ?? null;
  const path = codeActive
    ? codeBookingPath(outcome.classTypeId, bucket, attribution)
    : paidBookingPath(outcome.classTypeId, bucket, attribution);

  const sent = await sendEmail({
    to: email,
    toName: name || undefined,
    // COPY: confirm met Marlon
    subject: `Jouw yogales: ${outcome.name}`,
    react: YogaTestResult({
      firstName: name,
      lessonName: outcome.name,
      why: outcome.why,
      what: outcome.what,
      times: sortSlots(schedule[outcome.key]).map(formatSlot),
      code: codeActive ? yogaQuiz.trialCode : null,
      ctaHref: `${siteUrl()}${path}`,
    }),
  });
  if (!sent) {
    return NextResponse.json({ error: "mail_failed" }, { status: 502 });
  }

  await Promise.all([
    optIn ? subscribeToTips(email, name, outcome.name) : Promise.resolve(),
    // Geen persoonsgegevens in ntfy (PR #205): alleen de les en de opt-in.
    sendNotification(
      "Nieuwe yoga-test uitslag",
      `Uitslag ${outcome.name}, ${optIn ? "met" : "zonder"} opt-in.`,
      "yoga_mat",
    ),
  ]);

  return NextResponse.json({ ok: true, lesson: outcome.name });
}

/**
 * MailerLite alleen met opt-in. Zonder groep-id in de env: overslaan met een
 * waarschuwing. Weigert MailerLite het veld yoga_test_result (bestaat nog
 * niet), probeer het dan zonder veld, zodat de abonnee niet verloren gaat.
 */
async function subscribeToTips(email: string, name: string, lessonName: string): Promise<void> {
  const groupId = process.env.MAILERLITE_YOGA_TEST_GROUP_ID?.trim();
  if (!groupId) {
    console.warn("[api/yoga-test] MAILERLITE_YOGA_TEST_GROUP_ID ontbreekt; opt-in overgeslagen");
    return;
  }
  try {
    const withField = await addSubscriber({
      email,
      name: name || undefined,
      fields: { yoga_test_result: lessonName },
      groups: [groupId],
    });
    if (withField) return;
    await addSubscriber({ email, name: name || undefined, groups: [groupId] });
  } catch (err) {
    console.error("[api/yoga-test] MailerLite faalde", err);
  }
}
