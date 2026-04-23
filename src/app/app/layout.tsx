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

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, role")
    .eq("id", user.id)
    .maybeSingle();

  const firstName =
    profile?.first_name?.trim() || user.email?.split("@")[0] || "Member";
  const role: Role = (profile?.role as Role) ?? "member";

  return (
    <AppChrome firstName={firstName} role={role}>
      {children}
    </AppChrome>
  );
}
