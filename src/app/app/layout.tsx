import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { AppNav } from "./AppNav";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Proxy doet dit ook, maar defence-in-depth voor als er iets met de
    // matcher misgaat.
    redirect("/login");
  }

  // Self-heal: als de auth-trigger ooit heeft gefaald of een user via
  // admin-API is aangemaakt zonder profile-rij, repareren we dat hier.
  await ensureProfile(user);

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, role")
    .eq("id", user.id)
    .maybeSingle();

  const firstName = profile?.first_name?.trim() || user.email?.split("@")[0] || "Member";
  const isAdmin = profile?.role === "admin";
  const isTrainer = profile?.role === "trainer";

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav firstName={firstName} isAdmin={isAdmin} isTrainer={isTrainer} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
