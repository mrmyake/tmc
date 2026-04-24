import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { AppChrome } from "./AppChrome";
import type { Role } from "@/components/nav/AvatarDropdown";

export const dynamic = "force-dynamic";

/**
 * Outer `/app` layout: één plek voor auth-guard + profile-fetch. De
 * daadwerkelijke chrome (MemberNav / TrainerNav / geen) wordt gekozen
 * door de client-side AppChrome op basis van pathname. Admin-pagina's
 * hebben een eigen shell in hun eigen layout.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Self-heal ontbrekende profile-rij
  await ensureProfile(user);

  const [profileRes, membershipRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, role")
      .eq("id", user.id)
      .maybeSingle(),
    // Membership in active/paused met covered_pillars — bepaalt of de
    // "Vrij trainen" nav-entry voor deze user zichtbaar moet zijn.
    supabase
      .from("memberships")
      .select("covered_pillars")
      .eq("profile_id", user.id)
      .in("status", ["active", "paused"])
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  const firstName =
    profile?.first_name?.trim() || user.email?.split("@")[0] || "Member";
  const role: Role = (profile?.role as Role) ?? "member";
  const eligibleForVrijTrainen =
    membershipRes.data?.covered_pillars?.includes("vrij_trainen") ?? false;

  return (
    <AppChrome
      firstName={firstName}
      role={role}
      eligibleForVrijTrainen={eligibleForVrijTrainen}
    >
      {children}
    </AppChrome>
  );
}
