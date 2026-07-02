import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { AppChrome } from "./AppChrome";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import type { Role } from "@/components/nav/AvatarDropdown";

export const dynamic = "force-dynamic";

// Manifest + iOS-installatie-tags horen alleen bij de member-app, niet bij
// de marketing-site — daarom hier op het /app-segment, niet in de root
// layout. Next merged dit automatisch in de <head> voor elke /app/**-pagina
// zonder de root-metadata te overschrijven.
export const metadata: Metadata = {
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TMC",
  },
  icons: {
    icon: [
      { url: "/images/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/images/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/images/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0B",
};

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
    <>
      <ServiceWorkerRegister />
      <AppChrome
        firstName={firstName}
        role={role}
        eligibleForVrijTrainen={eligibleForVrijTrainen}
      >
        {children}
      </AppChrome>
    </>
  );
}
