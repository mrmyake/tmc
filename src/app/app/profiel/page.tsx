import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";
import { EmergencyContactForm } from "./EmergencyContactForm";
import { AvatarUpload } from "./AvatarUpload";

export const metadata = {
  title: "Profiel | The Movement Club",
  robots: { index: false, follow: false },
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

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
      "first_name,last_name,phone,date_of_birth,emergency_contact_name,emergency_contact_phone,avatar_url,health_intake_completed_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return (
      <Container className="py-12">
        <p className="text-text-muted">Profiel niet gevonden.</p>
      </Container>
    );
  }

  const initials = `${(profile.first_name?.[0] ?? "").toUpperCase()}${(
    profile.last_name?.[0] ?? ""
  ).toUpperCase()}` || "—";
  const intakeDoneOn = formatDate(profile.health_intake_completed_at);

  return (
    <Container className="py-12 max-w-3xl">
      <span className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-4">
        Profiel
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-10">
        Jouw profiel
      </h1>

      {justCompletedIntake && (
        <div className="mb-10 bg-accent/10 border border-accent/40 text-text px-6 py-4 text-sm flex items-start gap-3">
          <Check className="text-accent flex-shrink-0 mt-0.5" size={18} />
          <div>
            <div className="font-medium">Health intake voltooid.</div>
            <div className="text-text-muted text-xs mt-0.5">
              Je kunt nu lessen boeken in het rooster.
            </div>
          </div>
        </div>
      )}

      <div className="space-y-10">
        {/* Avatar */}
        <section className="bg-bg-elevated border border-bg-subtle p-6 md:p-8">
          <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-6">
            Profielfoto
          </h2>
          <AvatarUpload avatarUrl={profile.avatar_url} initials={initials} />
        </section>

        {/* Persoonsgegevens */}
        <section className="bg-bg-elevated border border-bg-subtle p-6 md:p-8">
          <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-6">
            Persoonsgegevens
          </h2>
          <ProfileForm
            profile={{
              first_name: profile.first_name,
              last_name: profile.last_name,
              phone: profile.phone,
              date_of_birth: profile.date_of_birth,
            }}
          />
        </section>

        {/* Emergency contact */}
        <section className="bg-bg-elevated border border-bg-subtle p-6 md:p-8">
          <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-2">
            Emergency contact
          </h2>
          <p className="text-text-muted text-sm mb-6">
            Wie bellen we bij een noodgeval in de studio?
          </p>
          <EmergencyContactForm
            name={profile.emergency_contact_name}
            phone={profile.emergency_contact_phone}
          />
        </section>

        {/* Health intake */}
        <section className="bg-bg-elevated border border-bg-subtle p-6 md:p-8">
          <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-2">
            Health intake
          </h2>
          {intakeDoneOn ? (
            <>
              <p className="text-text-muted text-sm mb-6">
                Voltooid op{" "}
                <span className="text-text">{intakeDoneOn}</span>. Pas &rsquo;m aan als
                je situatie wijzigt.
              </p>
              <Link
                href="/app/profiel/intake"
                className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-accent hover:text-accent-hover transition-colors"
              >
                Intake bijwerken
              </Link>
            </>
          ) : (
            <>
              <p className="text-text-muted text-sm mb-6">
                Nog niet voltooid. Deze is verplicht voordat je je eerste les
                kunt boeken — het duurt 2 minuten.
              </p>
              <Link
                href="/app/profiel/intake"
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium uppercase tracking-[0.15em] bg-accent text-bg hover:bg-accent-hover transition-colors"
              >
                Voltooi health intake
              </Link>
            </>
          )}
        </section>
      </div>
    </Container>
  );
}
