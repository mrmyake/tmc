import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { sendNotification } from "@/lib/ntfy";
import { syncAllAccess } from "@/lib/access/sync";

export const dynamic = "force-dynamic";

/**
 * Sync-akiles-access cron (vercel.json "15 2 * * *", buiten het blok van
 * 03:00 tot 04:55 UTC waarin de lidmaatschapscrons draaien; de volgende
 * nacht neemt hij hun statuswijzigingen mee).
 *
 * Provisiont schedules en groepen (openingstijden komen zo door), zet per
 * profiel de gewenste toegang in Akiles en schuift het rollende venster
 * van zeven dagen op. Dat venster is de fail-closed-garantie: valt deze
 * cron uit, dan sluit de deur vanzelf. Daarom is het alarm hieronder niet
 * stil: elke gefaalde run en elk gefaald profiel gaat naar ntfy.
 *
 * Service-role-client, verifyCronAuth en emitEvent (access.granted en
 * access.revoked, na de geslaagde Akiles-mutatie) zitten in
 * src/lib/access/sync.ts en sync-core.ts; dit bestand is alleen de schil.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const result = await syncAllAccess();

  if (!result.ok) {
    console.error("[cron/sync-akiles-access] run failed", result.error);
    await sendNotification(
      "Akiles-sync mislukt",
      `De toegangssync draaide niet: ${result.error ?? "onbekende fout"}. Het rollende venster van zeven dagen schuift niet op; check de logs en het Akiles-paneel.`,
      "rotating_light",
    );
    return NextResponse.json(
      { ok: false, processed: result.processed, failed: result.failed, error: result.error },
      { status: 500 },
    );
  }

  if (result.skipped) {
    return NextResponse.json({ ok: true, processed: 0, failed: 0, skipped: true });
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

  return NextResponse.json({
    ok: true,
    processed: result.processed,
    failed: result.failed,
  });
}
