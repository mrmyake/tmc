import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard | The Movement Club",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, role, health_intake_completed_at, avatar_url")
    .eq("id", user!.id)
    .maybeSingle();

  const intakeDone = Boolean(profile?.health_intake_completed_at);

  return (
    <Container className="py-12">
      <span className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-4">
        Dashboard
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3">
        Welkom{profile?.first_name ? `, ${profile.first_name}` : ""}.
      </h1>
      <p className="text-text-muted mb-10">
        Je member-dashboard is in aanbouw. Rooster, boekingen en abonnement
        komen binnenkort live.
      </p>

      {!intakeDone && (
        <div className="mb-10 border border-accent/40 bg-accent/10 p-6 md:p-8 max-w-2xl">
          <div className="flex items-start gap-4">
            <AlertCircle className="text-accent flex-shrink-0 mt-1" size={22} />
            <div className="flex-1">
              <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-2">
                Voltooi eerst je health intake
              </h2>
              <p className="text-text-muted text-sm leading-relaxed mb-5">
                Voor jouw veiligheid vragen we even kort naar blessures,
                medicatie en je doelen. Duurt 2 minuten, en daarna kun je
                lessen boeken.
              </p>
              <Link
                href="/app/profiel/intake"
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium uppercase tracking-[0.15em] bg-accent text-bg hover:bg-accent-hover transition-colors"
              >
                Start intake
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="bg-bg-elevated border border-bg-subtle p-6 md:p-8 max-w-xl">
        <div className="text-xs uppercase tracking-[0.2em] text-text-muted mb-2">
          Jouw account
        </div>
        <div className="text-text text-sm space-y-1">
          <div>
            E-mail: <span className="text-text-muted">{user?.email}</span>
          </div>
          <div>
            Rol:{" "}
            <span className="text-text-muted">
              {profile?.role ?? "member"}
            </span>
          </div>
          <div>
            Health intake:{" "}
            <span className="text-text-muted">
              {intakeDone ? "voltooid" : "nog niet voltooid"}
            </span>
          </div>
        </div>
      </div>
    </Container>
  );
}
