import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { sendNotification } from "@/lib/ntfy";
import { processDueAccountDeletions } from "@/lib/account-deletion/service";
import { DELETION_TIME_BUDGET_MS } from "@/lib/account-deletion/config";

export const dynamic = "force-dynamic";
// Vercel Fluid Compute: 300 s; het interne budget stopt tussen twee rijen
// in, ruim daarvoor. Zelfde model als sync-akiles-access.
export const maxDuration = 300;

/**
 * Process-account-deletions cron (vercel.json "5 5 * * *", na
 * process-cancellations om 03:30 en expire-orders om 04:45, zodat een
 * opzegging die vannacht effectief werd en een verlopen order al verwerkt
 * zijn voordat de purge ernaar kijkt).
 *
 * Pakt rijen in tmc.account_deletions met een verstreken purge_after op en
 * draait per rij runPurgeCore (src/lib/account-deletion/core.ts): freeze,
 * Mollie-subscriptions, Akiles, MailerLite, push, profiel (anonimiseren of
 * hard delete), afsluitmail. Elke stap is idempotent en schrijft zijn
 * uitkomst in step_status en last_error; wat faalt komt de volgende nacht
 * terug. Daarna de retentiestap: Mollie-customers van afgeronde rijen die
 * ouder zijn dan de retentietermijn.
 *
 * Elke aanroep naar Supabase valt onder de statement_timeout van 8 s; de
 * kern doet per rij een handvol kleine queries, nooit een bulk-update.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const startedAt = Date.now();
  const result = await processDueAccountDeletions({
    deadlineMs: startedAt + DELETION_TIME_BUDGET_MS,
  });

  if (result.remaining > 0) {
    await sendNotification(
      "Accountverwijdering: run niet compleet",
      `Tijdsbudget op na ${Math.round((Date.now() - startedAt) / 1000)} s: ${result.processed} verwerkt, ${result.remaining} nog niet aan de beurt. De volgende run pakt de oudste eerst op.`,
      "warning",
    );
  }

  return NextResponse.json({
    ok: true,
    ...result,
    durationMs: Date.now() - startedAt,
  });
}
