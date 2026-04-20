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
    .select("first_name, role")
    .eq("id", user!.id)
    .maybeSingle();

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
        </div>
      </div>
    </Container>
  );
}
