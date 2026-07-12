import { loadDashboardData } from "../_lib/dashboard-data";
import { LightGreeting } from "./_components/LightGreeting";
import { LightOnboarding } from "./_components/LightOnboarding";
import { LightNextClass } from "./_components/LightNextClass";
import { LightCredits } from "./_components/LightCredits";
import { LightSchema } from "./_components/LightSchema";
import { LightEntitlements } from "./_components/LightEntitlements";

export const metadata = {
  title: "The Movement Club — preview (licht)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Design-variant B (licht, mockup-leden-overzicht.html 1:1). Tijdelijke
 * preview-route naast /app (variant A, donker) zodat Marlon kan kiezen.
 * Consumeert exact dezelfde loadDashboardData() als variant A — geen eigen
 * reads, geen eigen copy, alleen de skin verschilt. Kleuren zijn letterlijk
 * uit de mockup-CSS overgenomen, niet uit de donkere /app-tokens (zie de
 * componenten in ./_components voor de bron per hex-waarde).
 */
export default async function PreviewLichtPage() {
  const data = await loadDashboardData();

  return (
    <div className="bg-[#F4EFE6] min-h-screen">
      <div className="mx-auto max-w-2xl lg:max-w-3xl px-5 md:px-10 py-12 md:py-16">
        {data.kind === "onboarding" ? (
          <LightOnboarding
            firstName={data.firstName}
            intakeDone={data.intakeDone}
          />
        ) : (
          <div className="flex flex-col gap-8 md:gap-10">
            <LightGreeting
              salutation={data.greeting.salutation}
              firstName={data.greeting.firstName}
              initials={data.greeting.initials}
              subline={data.greeting.subline}
              planBadge={data.planBadge}
              statusLine={data.statusLine}
            />

            <LightNextClass session={data.nextSession} />

            <LightCredits credits={data.credits} />

            {data.schemaTeaser && <LightSchema {...data.schemaTeaser} />}

            <LightEntitlements
              rows={data.entitlements.rows}
              upsell={data.entitlements.upsell}
            />
          </div>
        )}
      </div>
    </div>
  );
}
