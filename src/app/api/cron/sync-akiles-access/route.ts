import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { sendNotification } from "@/lib/ntfy";
import { syncAllAccess } from "@/lib/access/sync";
import { SYNC_TIME_BUDGET_MS } from "@/lib/access/constants";

export const dynamic = "force-dynamic";
// Vercel Fluid Compute: 300 s; het interne budget (SYNC_TIME_BUDGET_MS)
// stopt de sync ruim daarvoor, tussen twee profielen in.
export const maxDuration = 300;

/**
 * Sync-akiles-access cron (vercel.json "15 2 * * *", buiten het blok van
 * 03:00 tot 04:55 UTC waarin de lidmaatschapscrons draaien; de volgende
 * nacht neemt hij hun statuswijzigingen mee).
 *
 * Provisiont schedules en groepen (openingstijden komen zo door), zet per
 * profiel de gewenste toegang in Akiles en schuift het rollende venster
 * van zeven dagen op. Dat venster is de fail-closed-garantie: valt deze
 * cron uit, dan sluit de deur vanzelf. Daarom is het alarm hieronder niet
 * stil: elke gefaalde run, elk gefaald profiel en elke onvolledige run
 * gaat naar ntfy.
 *
 * Diff-check: Akiles wordt alleen gebeld voor profielen waarvan de
 * gewenste toestand afwijkt van access_credentials. `?full=1` dwingt een
 * volledige reconciliatie af die de diff-check overslaat (handmatig, met
 * dezelfde CRON_SECRET-header).
 *
 * Service-role-client, verifyCronAuth en emitEvent (access.granted en
 * access.revoked, na de geslaagde Akiles-mutatie) zitten in
 * src/lib/access/sync.ts en sync-core.ts; dit bestand is alleen de schil.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const force = url.searchParams.get("full") === "1";
  const startedAt = Date.now();

  const result = await syncAllAccess({
    force,
    deadlineMs: startedAt + SYNC_TIME_BUDGET_MS,
  });

  if (!result.ok) {
    console.error("[cron/sync-akiles-access] run failed", result.error);
    await sendNotification(
      "Akiles-sync mislukt",
      `De toegangssync draaide niet: ${result.error ?? "onbekende fout"}. Het rollende venster van zeven dagen schuift niet op; check de logs en het Akiles-paneel.`,
      "rotating_light",
    );
    return NextResponse.json(
      {
        ok: false,
        processed: result.processed,
        skipped: result.skipped,
        remaining: result.remaining,
        failed: result.failed,
        error: result.error,
      },
      { status: 500 },
    );
  }

  if (result.notConfigured) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      skipped: 0,
      remaining: 0,
      failed: 0,
      notConfigured: true,
    });
  }

  if (result.failed > 0) {
    const sample = result.failures
      .slice(0, 5)
      .map((f) => `${f.profileId}: ${f.error}`)
      .join("\n");
    await sendNotification(
      "Akiles-sync: profielen mislukt",
      `${result.failed} profiel(en) konden niet gesynct worden; hun toegang schuift niet op en sluit binnen zeven dagen. Zie last_error in access_credentials.\n${sample}`,
      "warning",
    );
  }

  if (result.remaining > 0) {
    await sendNotification(
      "Akiles-sync: run niet compleet",
      `Tijdsbudget op na ${Math.round((Date.now() - startedAt) / 1000)} s: ${result.processed} gesynct, ${result.skipped} overgeslagen zonder afwijking, ${result.remaining} nog niet aan de beurt. De volgende run pakt de oudste eerst op; de drempel op het rollende venster houdt ze ondertussen open.`,
      "warning",
    );
  }

  return NextResponse.json({
    ok: true,
    full: force,
    processed: result.processed,
    skipped: result.skipped,
    remaining: result.remaining,
    failed: result.failed,
    durationMs: Date.now() - startedAt,
  });
}
