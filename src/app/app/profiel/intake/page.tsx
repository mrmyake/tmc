import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { IntakeForm } from "./IntakeForm";
import type { HealthIntakePayload } from "@/lib/actions/profile";

export const metadata = {
  title: "Health intake | The Movement Club",
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
    <Container className="py-16 md:py-20 max-w-3xl">
      <Link
        href="/app/profiel"
        scroll={false}
        className="group inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-accent mb-10"
      >
        <ChevronLeft
          size={14}
          strokeWidth={1.5}
          className="transition-transform duration-300 group-hover:-translate-x-0.5"
        />
        Terug naar profiel
      </Link>

      <header className="mb-14">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Health intake
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.05] tracking-[-0.02em]">
          {isUpdate ? "Intake bijwerken." : "Vertel ons iets over jezelf."}
        </h1>
        <p className="mt-6 text-text-muted text-lg max-w-xl">
          Vijf korte stappen. We stellen alleen wat we echt nodig hebben om je
          veilig en gericht te coachen.
        </p>
      </header>

      <IntakeForm initial={initial} />
    </Container>
  );
}
