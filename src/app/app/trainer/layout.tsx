import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Autorisatie-guard voor `/app/trainer/*`. Chrome (TrainerNav) komt
 * uit de outer `AppChrome`. Members zonder trainer-rol worden naar
 * `/app/rooster` geredirect (spec §8).
 */
export default async function TrainerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // Admin is een superset en mag hier binnen via de context-switcher.
  if (!profile || (profile.role !== "trainer" && profile.role !== "admin")) {
    redirect("/app/rooster");
  }

  return children;
}
