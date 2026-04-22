"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type MembersActionResult =
  | { ok: true; message: string; groupId?: string; groupName?: string; count?: number }
  | { ok: false; message: string };

const MAILERLITE_API = "https://connect.mailerlite.com/api";

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return { ok: false, message: "Geen toegang." };
  }
  return { ok: true, userId: user.id };
}

async function mlRequest(
  path: string,
  body: Record<string, unknown> | null,
  method: "POST" | "PUT" | "DELETE" = "POST",
): Promise<unknown> {
  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    throw new Error("MAILERLITE_API_KEY ontbreekt.");
  }
  const res = await fetch(`${MAILERLITE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MailerLite ${res.status}: ${text}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

/**
 * Maak (of hergebruik) een MailerLite-group met het opgegeven label, zet
 * geselecteerde leden erin, en log het naar admin_audit_log zodat er een
 * spoor is wie wat gepusht heeft. Returns de group-ID zodat de admin in
 * MailerLite-UI direct een campagne kan opzetten.
 */
export async function pushSelectionToMailerLite(
  profileIds: string[],
  label: string,
): Promise<MembersActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    return { ok: false, message: "Geef een groepnaam op." };
  }
  if (profileIds.length === 0) {
    return { ok: false, message: "Geen leden geselecteerd." };
  }

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name, email, marketing_opt_in")
    .in("id", profileIds);

  const optedIn = (profiles ?? []).filter((p) => p.marketing_opt_in);
  if (optedIn.length === 0) {
    return {
      ok: false,
      message:
        "Geen van de geselecteerde leden heeft marketing-opt-in aanstaan.",
    };
  }

  let groupId: string;
  try {
    const created = (await mlRequest("/groups", { name: trimmedLabel })) as {
      data?: { id?: string };
    };
    if (!created?.data?.id) {
      throw new Error("MailerLite group-respons mist id.");
    }
    groupId = created.data.id;
  } catch (err) {
    console.error("[pushSelectionToMailerLite] group create failed", err);
    return {
      ok: false,
      message: "MailerLite-groep aanmaken lukte niet.",
    };
  }

  let synced = 0;
  for (const p of optedIn) {
    try {
      await mlRequest("/subscribers", {
        email: p.email,
        fields: {
          name: [p.first_name, p.last_name].filter(Boolean).join(" "),
        },
        groups: [groupId],
        status: "active",
      });
      synced++;
    } catch (err) {
      console.error(
        "[pushSelectionToMailerLite] subscriber upsert failed",
        p.email,
        err,
      );
    }
  }

  // admin_audit_log.target_id is typed uuid; the MailerLite group-id is a
  // string and doesn't fit. Generate a fresh uuid per action and stash the
  // actual group-id in details.
  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "mailerlite_push",
    target_type: "mailerlite_group",
    target_id: crypto.randomUUID(),
    details: {
      label: trimmedLabel,
      mailerlite_group_id: groupId,
      selected_count: profileIds.length,
      opted_in_count: optedIn.length,
      synced_count: synced,
      profile_ids: profileIds,
    },
  });

  return {
    ok: true,
    message: `${synced} lid/leden toegevoegd aan groep "${trimmedLabel}". Open MailerLite om de campagne te sturen.`,
    groupId,
    groupName: trimmedLabel,
    count: synced,
  };
}
