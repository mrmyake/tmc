import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, role")
    .eq("id", user.id)
    .maybeSingle();

  const firstName = profile?.first_name?.trim() || user.email?.split("@")[0] || "Member";
  const isAdmin = profile?.role === "admin";

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav firstName={firstName} isAdmin={isAdmin} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
