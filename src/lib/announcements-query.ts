import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AnnouncementAudience = "all" | "trainers" | "members";

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  authorName: string;
}

type RawRow = {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  author: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

function authorNameOf(
  ref: RawRow["author"] | RawRow["author"][] | null,
): string {
  const n = Array.isArray(ref) ? ref[0] : ref;
  return [n?.first_name, n?.last_name].filter(Boolean).join(" ") || "Admin";
}

/**
 * Fetch announcements the current user is allowed to see. RLS enforces the
 * audience + published/expired filter — we just request everything and let
 * Postgres do the work. Uses the cookie-scoped client.
 */
export async function listVisibleAnnouncements(
  limit = 10,
): Promise<AnnouncementRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select(
      `id, title, body, audience, published_at, expires_at, created_at,
       author:profiles!author_id(first_name, last_name)`,
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<RawRow[]>();

  if (error) {
    console.error("[listVisibleAnnouncements] query failed", error);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    audience: r.audience,
    publishedAt: r.published_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    authorName: authorNameOf(r.author),
  }));
}

/**
 * Admin-only: list everything including drafts + expired. Uses cookie client
 * so RLS admin_all policy kicks in. Caller must already be admin (enforce
 * at page/action level).
 */
export async function listAdminAnnouncements(): Promise<AnnouncementRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select(
      `id, title, body, audience, published_at, expires_at, created_at,
       author:profiles!author_id(first_name, last_name)`,
    )
    .order("created_at", { ascending: false })
    .returns<RawRow[]>();

  if (error) {
    console.error("[listAdminAnnouncements] query failed", error);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    audience: r.audience,
    publishedAt: r.published_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    authorName: authorNameOf(r.author),
  }));
}
