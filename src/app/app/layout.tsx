import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { AppChrome } from "./AppChrome";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { PushNotificationRegister } from "@/components/capacitor/PushNotificationRegister";
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

  const [profileRes, membershipRes, activeProgramRes, workoutHistoryRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("first_name, role")
        .eq("id", user.id)
        .maybeSingle(),
      // Membership in active/paused — bepaalt of iemand "nog lid" is, nodig
      // voor de Schema- en PT-nav-condities hieronder. covered_pillars is
      // hier niet meer nodig: "Vrij trainen" heeft geen eigen nav-entry
      // meer (zie MemberNav.tsx nav-cleanup), die ingang loopt nu via de
      // bestaande link op /app/rooster.
      supabase
        .from("memberships")
        .select("id")
        .eq("profile_id", user.id)
        .in("status", ["active", "paused"])
        .limit(1)
        .maybeSingle(),
      // "Ooit protocol gehad" (deel 1/2): heeft nu een actief programma.
      // RLS (training_programs_self_active_read) laat een lid alleen z'n
      // eigen 'active'-rij lezen, geen 'archived' — vandaar de aanvullende
      // workout_sessions-check hieronder voor protocollen die niet meer
      // actief zijn.
      supabase
        .from("training_programs")
        .select("id")
        .eq("profile_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      // "Ooit protocol gehad" (deel 2/2): workout_sessions kent geen
      // status-filter in RLS (workout_sessions_self_read), dus een gelogde
      // workout bewijst een protocol uit het verleden, ook als dat
      // programma inmiddels is gearchiveerd.
      supabase
        .from("workout_sessions")
        .select("id")
        .eq("profile_id", user.id)
        .limit(1)
        .maybeSingle(),
    ]);

  const profile = profileRes.data;
  const firstName =
    profile?.first_name?.trim() || user.email?.split("@")[0] || "Member";
  const role: Role = (profile?.role as Role) ?? "member";

  const isActiveMember = Boolean(membershipRes.data);
  const everHadProgram =
    Boolean(activeProgramRes.data) || Boolean(workoutHistoryRes.data);
  // Besloten conditie (discovery-navigatie-structuur.md, punt 6): "ooit
  // protocol gehad EN nog lid" — niet onvoorwaardelijk, zoals het nav-item
  // dat sinds de regressie wél deed.
  const eligibleForSchema = everHadProgram && isActiveMember;
  // Nav-cleanup, bewuste minimale invulling: "conditioneel" voor PT is in de
  // opdracht niet verder gespecificeerd en dit is puur een nav-ingang, geen
  // nieuwe business-rule. We hergebruiken alleen de al bestaande "nog
  // lid"-status; de fijnmaziger hasPtCredits-check (creditType-rijen met
  // plan_type 'pt_package', gebruikt in dashboard-data.ts) toepassen op de
  // nav zelf is een aparte productbeslissing en bewust buiten deze PR
  // gehouden (zie besluiten-sectie in discovery-navigatie-structuur.md).
  const eligibleForPt = isActiveMember;

  return (
    <>
      <ServiceWorkerRegister />
      <PushNotificationRegister />
      <AppChrome
        firstName={firstName}
        role={role}
        eligibleForSchema={eligibleForSchema}
        eligibleForPt={eligibleForPt}
      >
        {children}
      </AppChrome>
    </>
  );
}
