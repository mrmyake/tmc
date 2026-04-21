import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { IntakeForm } from "./IntakeForm";
import type { HealthIntakePayload } from "@/lib/actions/profile";

export const metadata = {
  title: "Health Intake | The Movement Club",
  robots: { index: false, follow: false },
};

function parseIntake(notes: string | null): Partial<HealthIntakePayload> {
  if (!notes) return {};
  try {
    return JSON.parse(notes) as Partial<HealthIntakePayload>;
  } catch {
    return {};
  }
}

export default async function IntakePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("health_notes, health_intake_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  const initial = parseIntake(profile?.health_notes ?? null);
  const isUpdate = Boolean(profile?.health_intake_completed_at);

  return (
    <Container className="py-12 max-w-2xl">
      <Link
        href="/app/profiel"
        className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-text-muted hover:text-accent transition-colors mb-8"
      >
        <ChevronLeft size={14} />
        Terug naar profiel
      </Link>

      <span className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-4">
        Health intake
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3">
        {isUpdate ? "Intake bijwerken" : "Vertel ons iets over jezelf"}
      </h1>
      <p className="text-text-muted mb-10 leading-relaxed">
        Een paar vragen zodat Marlon en het trainer-team je veilig en op maat
        kunnen begeleiden. Invullen duurt 2 minuten. Alles behalve &ldquo;doelen&rdquo; is
        optioneel.
      </p>

      <IntakeForm initial={initial} />
    </Container>
  );
}
