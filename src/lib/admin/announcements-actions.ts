"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnnouncementAudience } from "@/lib/announcements-query";

export type AnnouncementActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

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

function revalidateAll() {
  revalidatePath("/app/admin/aankondigingen");
  revalidatePath("/app/trainer");
  revalidatePath("/app");
}

const VALID_AUDIENCES: AnnouncementAudience[] = ["all", "trainers", "members"];

interface UpsertInput {
  id?: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  publishNow: boolean;
  publishedAt?: string | null; // optional future-schedule
  expiresAt?: string | null;
}

export async function saveAnnouncement(
  input: UpsertInput,
): Promise<AnnouncementActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const title = input.title?.trim();
  if (!title) return { ok: false, message: "Titel is verplicht." };
  if (title.length > 120) {
    return { ok: false, message: "Titel mag max 120 tekens zijn." };
  }
  if (!VALID_AUDIENCES.includes(input.audience)) {
    return { ok: false, message: "Ongeldige doelgroep." };
  }
  const body = input.body ?? "";
  if (body.length > 4000) {
    return { ok: false, message: "Body mag max 4000 tekens zijn." };
  }

  const publishedAt = input.publishNow
    ? new Date().toISOString()
    : (input.publishedAt ?? null);
  const expiresAt = input.expiresAt ?? null;

  if (publishedAt && expiresAt && expiresAt <= publishedAt) {
    return {
      ok: false,
      message: "Verloopdatum moet na publicatiedatum liggen.",
    };
  }

  const admin = createAdminClient();

  if (input.id) {
    const { error } = await admin
      .from("announcements")
      .update({
        title,
        body,
        audience: input.audience,
        published_at: publishedAt,
        expires_at: expiresAt,
      })
      .eq("id", input.id);

    if (error) {
      console.error("[saveAnnouncement] update failed", error);
      return { ok: false, message: "Bijwerken lukte niet." };
    }
    revalidateAll();
    return { ok: true, message: "Aankondiging bijgewerkt.", id: input.id };
  }

  const { data, error } = await admin
    .from("announcements")
    .insert({
      title,
      body,
      audience: input.audience,
      author_id: auth.userId,
      published_at: publishedAt,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[saveAnnouncement] insert failed", error);
    return { ok: false, message: "Aanmaken lukte niet." };
  }

  revalidateAll();
  return { ok: true, message: "Aankondiging geplaatst.", id: data.id };
}

export async function deleteAnnouncement(
  id: string,
): Promise<AnnouncementActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin.from("announcements").delete().eq("id", id);
  if (error) {
    console.error("[deleteAnnouncement] failed", error);
    return { ok: false, message: "Verwijderen lukte niet." };
  }
  revalidateAll();
  return { ok: true, message: "Verwijderd." };
}
