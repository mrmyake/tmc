import { Container } from "@/components/layout/Container";
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
