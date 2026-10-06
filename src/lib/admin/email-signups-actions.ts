"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "./require-admin";
import { EMAIL_SIGNUPS_TAG } from "./email-signups-query";

export type RefreshEmailSignupsResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Knop "Verversen" op /app/admin/aanmeldingen: gooit de MailerLite-snapshot
 * (5 minuten gecachet) weg, zodat de eerstvolgende render opnieuw ophaalt.
 * Alleen admins; de actie leest of schrijft zelf niets.
 */
export async function refreshEmailSignups(): Promise<RefreshEmailSignupsResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  revalidateTag(EMAIL_SIGNUPS_TAG, "max");
  revalidatePath("/app/admin/aanmeldingen");
  // COPY: confirm met Marlon
  return { ok: true, message: "Lijst ververst." };
}
