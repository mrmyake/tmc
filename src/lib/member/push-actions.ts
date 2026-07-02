"use server";

import { createClient } from "@/lib/supabase/server";

export type PushActionResult = { ok: true } | { ok: false; message: string };

/**
 * Upsert op `token` (uniek per device-installatie) — dekt zowel eerste
 * registratie als token-rotatie (herinstallatie, OS-vernieuwing) zonder
 * dubbele rijen. Gebruikt de user-scoped client: RLS dwingt
 * profile_id = auth.uid() af, dus een lid kan nooit een token onder
 * andermans profiel registreren.
 */
export async function registerPushToken(
  token: string,
  platform: "ios" | "android",
): Promise<PushActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { error } = await supabase
    .from("device_push_tokens")
    .upsert(
      { profile_id: user.id, token, platform },
      { onConflict: "token" },
    );

  if (error) {
    console.error("[registerPushToken] upsert failed", error);
    return { ok: false, message: "Token registreren lukte niet." };
  }
  return { ok: true };
}

/** Verwijdert het token van dit device — voorkomt pushes naar een uitgelogde sessie. */
export async function unregisterPushToken(token: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("device_push_tokens")
    .delete()
    .eq("token", token)
    .eq("profile_id", user.id);

  if (error) {
    console.error("[unregisterPushToken] delete failed", error);
  }
}
