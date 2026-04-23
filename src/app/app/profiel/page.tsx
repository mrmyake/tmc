import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { formatDateLong } from "@/lib/format-date";
import { ProfileForm } from "./ProfileForm";
import { EmergencyContactForm } from "./EmergencyContactForm";
import { AvatarUpload } from "./AvatarUpload";
import { MarketingOptInToggle } from "./_components/MarketingOptInToggle";
import { AccountDeletionSection } from "./_components/AccountDeletionSection";
import { MobileAccountActions } from "@/components/nav/MobileAccountActions";
import type {
  ActiveContext,
  Role,
} from "@/components/nav/AvatarDropdown";

export const metadata = {
  title: "Profiel | The Movement Club",
  robots: { index: false, follow: false },
};

export default async function ProfielPage({
  searchParams,
}: {
  searchParams: Promise<{ intake?: string }>;
}) {
  const params = await searchParams;
  const justCompletedIntake = params.intake === "done";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "first_name, last_name, email, phone, date_of_birth, street_address, postal_code, city, emergency_contact_name, emergency_contact_phone, avatar_url, health_intake_completed_at, marketing_opt_in, role",
    )
    .eq("id", user.id)
    .maybeSingle();

  const role: Role = (profile?.role as Role) ?? "member";
  // Profiel is context-agnostisch — standaard member-context (trainer/
  // admin-switcher rendered als de user die rol heeft).
  const activeContext: ActiveContext = "member";

  if (!profile) {
    return (
      <Container className="py-20 text-center">
        <p className="text-text-muted">Profiel niet gevonden.</p>
      </Container>
    );
  }

  const initials =
    `${(profile.first_name?.[0] ?? "").toUpperCase()}${(
      profile.last_name?.[0] ?? ""
    ).toUpperCase()}` || "—";
  const intakeDoneOn = profile.health_intake_completed_at
    ? formatDateLong(new Date(profile.health_intake_completed_at))
    : null;

  return (
    <Container className="py-16 md:py-20 max-w-3xl">
      <header className="mb-14">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Member account
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
          Profiel.
        </h1>
      </header>

      {justCompletedIntake && (
        <aside
          role="status"
          className="relative bg-bg-elevated p-6 md:p-8 mb-14"
        >
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
          />
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
            Intake voltooid
          </span>
          <p className="text-text text-base">
            Dank je. Je kunt nu sessies boeken in het rooster.
          </p>
        </aside>
      )}

      <MobileAccountActions role={role} activeContext={activeContext} />

      <AvatarUpload avatarUrl={profile.avatar_url} initials={initials} />

      <div className="mt-14 border-t border-[color:var(--ink-500)]/60 pt-10">
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text leading-[1.05] tracking-[-0.02em] mb-8">
          Persoonlijke gegevens
        </h2>
        <ProfileForm
          profile={{
            first_name: profile.first_name,
            last_name: profile.last_name,
            phone: profile.phone,
            date_of_birth: profile.date_of_birth,
            street_address: profile.street_address,
            postal_code: profile.postal_code,
            city: profile.city,
          }}
        />
        <p className="mt-6 text-text-muted text-xs">
          E-mailadres ({profile.email}) is gekoppeld aan je login en kun je
          niet zelf wijzigen. Laat het Marlon weten als je hier aanpassingen
          voor nodig hebt.
        </p>
      </div>

      <div className="mt-14 border-t border-[color:var(--ink-500)]/60 pt-10">
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text leading-[1.05] tracking-[-0.02em] mb-3">
          Noodcontact
        </h2>
        <p className="text-text-muted text-sm leading-relaxed mb-8 max-w-md">
          Wie bellen we bij een noodgeval in de studio?
        </p>
        <EmergencyContactForm
          name={profile.emergency_contact_name}
          phone={profile.emergency_contact_phone}
        />
      </div>

      <div className="mt-14 border-t border-[color:var(--ink-500)]/60 pt-10">
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text leading-[1.05] tracking-[-0.02em] mb-3">
          Health intake
        </h2>
        {intakeDoneOn ? (
          <>
            <p className="text-text-muted text-sm leading-relaxed mb-6 max-w-md">
              Voltooid op <span className="text-text">{intakeDoneOn}</span>.
              Pas &rsquo;m aan als er iets verandert in je situatie.
            </p>
            <Link
              href="/app/profiel/intake"
              className="inline-flex items-center justify-center px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent cursor-pointer"
            >
              Bijwerken
            </Link>
          </>
        ) : (
          <>
            <aside className="relative bg-bg-elevated p-6 md:p-8 mb-6">
              <div
                aria-hidden
                className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
              />
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
                Even kort
              </span>
              <p className="text-text text-base mb-1">
                Voltooi eerst je health intake.
              </p>
              <p className="text-text-muted text-sm leading-relaxed">
                Vijf korte vragen zodat we je veilig en gericht kunnen
                begeleiden. Duurt twee minuten.
              </p>
            </aside>
            <Button href="/app/profiel/intake">Start intake</Button>
          </>
        )}
      </div>

      <div className="mt-14 border-t border-[color:var(--ink-500)]/60 pt-10">
        <MarketingOptInToggle initialOptIn={profile.marketing_opt_in} />
      </div>

      <AccountDeletionSection />
    </Container>
  );
}
