import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TrainerInvoicePdf,
  type TrainerInvoiceData,
  type TrainerInvoiceLine,
} from "@/pdfs/TrainerInvoicePdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH_LABEL = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

function parseMonth(param: string | null): { year: number; month: number } {
  const now = new Date();
  if (!param) {
    // Default: previous month (admin typically runs this at start of
    // a new month for the completed one).
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const m = now.getMonth() === 0 ? 12 : now.getMonth();
    return { year: y, month: m };
  }
  const match = /^(\d{4})-(\d{1,2})$/.exec(param);
  if (!match) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

function firstOfMonthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function firstOfNextMonthIso(year: number, month: number): string {
  if (month === 12) return `${year + 1}-01-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: trainerId } = await ctx.params;

  // Admin gate via cookie client.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (callerProfile?.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const { year, month } = parseMonth(url.searchParams.get("month"));
  const periodStart = firstOfMonthIso(year, month);
  const periodEnd = firstOfNextMonthIso(year, month);

  const admin = createAdminClient();
  const { data: trainer } = await admin
    .from("trainers")
    .select(
      `id, display_name, hourly_rate_in_cents,
       profile:profiles!profile_id(first_name, last_name, email)`,
    )
    .eq("id", trainerId)
    .maybeSingle();

  if (!trainer) return new Response("Not found", { status: 404 });

  const { data: rows } = await admin
    .from("trainer_hours")
    .select("work_date, hours, notes, status")
    .eq("trainer_id", trainerId)
    .eq("status", "approved")
    .gte("work_date", periodStart)
    .lt("work_date", periodEnd)
    .order("work_date", { ascending: true });

  const rate = trainer.hourly_rate_in_cents ?? 0;
  let totalHours = 0;
  let totalCents = 0;
  const lines: TrainerInvoiceLine[] = (rows ?? []).map((r) => {
    const hours =
      typeof r.hours === "number" ? r.hours : Number(r.hours) || 0;
    const amountCents = Math.round(hours * rate);
    totalHours += hours;
    totalCents += amountCents;
    return {
      workDate: r.work_date,
      hours,
      amountCents,
      notes: r.notes ?? null,
    };
  });

  type ProfileRef = {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
  const p = (Array.isArray(trainer.profile)
    ? trainer.profile[0]
    : trainer.profile) as ProfileRef | null;

  const invoiceRef = `TMC-${year}${String(month).padStart(2, "0")}-${trainer.id.slice(0, 8).toUpperCase()}`;

  const data: TrainerInvoiceData = {
    invoiceRef,
    generatedAt: new Date().toISOString(),
    periodLabel: `${MONTH_LABEL[month - 1]} ${year}`,
    trainerName: trainer.display_name,
    trainerEmail: p?.email ?? "",
    hourlyRateCents: rate > 0 ? rate : null,
    lines,
    totalHours,
    totalCents,
    tmcName: "The Movement Club",
    tmcAddress: "Industrieweg 14P, 1231 MX Loosdrecht",
    tmcMeta: "themovementclub.nl",
  };

  const buffer = await renderToBuffer(TrainerInvoicePdf(data));

  await admin.from("admin_audit_log").insert({
    admin_id: user.id,
    action: "trainer_invoice_generated",
    target_type: "trainer",
    target_id: trainer.id,
    details: {
      period: `${year}-${String(month).padStart(2, "0")}`,
      total_hours: totalHours,
      total_cents: totalCents,
    },
  });

  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoiceRef}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
