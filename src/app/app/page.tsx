import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { TRAINER_LANDING } from "@/lib/auth/role-landing";
import { loadDashboardData } from "./_lib/dashboard-data";
import { DashboardGreeting } from "./_components/DashboardGreeting";
import { DashboardOnboarding } from "./_components/DashboardOnboarding";
import { DashboardNextClass } from "./_components/DashboardNextClass";
import { DashboardCredits } from "./_components/DashboardCredits";
import { DashboardSchema } from "./_components/DashboardSchema";
import { DashboardEntitlements } from "./_components/DashboardEntitlements";

export const metadata = {
  title: "The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Home-dashboard-landing (donker, on-brand skin uit docs/design-system/).
 * Consumeert uitsluitend loadDashboardData() — geen eigen reads of copy.
 */
export default async function AppDashboardPage() {
  // Een trainer heeft geen membership en geen credits, dus dit dashboard
  // zou voor hem het onboarding-scherm (intake, kies een abonnement)
  // tonen. Trainers gaan daarom door naar hun agenda. Admins bewust niet:
  // hun "Member view" in de avatar-switcher wijst hierheen. De outer
  // layout heeft de user al geverifieerd (redirect naar /login zonder).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "trainer") redirect(TRAINER_LANDING);
  }

  const data = await loadDashboardData();

  if (data.kind === "onboarding") {
    return (
      <Container className="py-16 md:py-20">
        <DashboardOnboarding
          firstName={data.firstName}
          intakeDone={data.intakeDone}
        />
      </Container>
    );
  }

  return (
    <Container className="py-16 md:py-20">
      <DashboardGreeting
        salutation={data.greeting.salutation}
        firstName={data.greeting.firstName}
        initials={data.greeting.initials}
        subline={data.greeting.subline}
        planBadge={data.planBadge}
        statusLine={data.statusLine}
      />

      <DashboardNextClass session={data.nextSession} />

      <DashboardCredits credits={data.credits} />

      {data.schemaTeaser && <DashboardSchema {...data.schemaTeaser} />}

      <DashboardEntitlements
        rows={data.entitlements.rows}
        upsell={data.entitlements.upsell}
      />
    </Container>
  );
}
