import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { loadActiveProgramForMember } from "@/lib/member/training-program-query";
import { DayScheduleCard } from "./_components/DayScheduleCard";

export const metadata = {
  title: "Trainingsschema | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SchemaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const program = await loadActiveProgramForMember();

  return (
    <Container className="py-16 md:py-20 max-w-3xl">
      <header className="mb-12">
        {/* COPY: confirm met Marlon */}
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Trainingsschema
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em] mb-6">
          {/* COPY: confirm met Marlon */}
          {program?.title || "Jouw schema."}
        </h1>
        {program?.notes && (
          <p className="text-text-muted text-lg leading-relaxed max-w-xl whitespace-pre-wrap mb-6">
            {program.notes}
          </p>
        )}
        <Link
          href="/app/schema/geschiedenis"
          className="inline-flex items-center text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors"
        >
          {/* COPY: confirm met Marlon */}
          Bekijk je voortgang
        </Link>
      </header>

      {!program && (
        <div className="py-12 text-center border-t border-[color:var(--ink-500)]/60">
          {/* COPY: confirm met Marlon */}
          <p className="text-text-muted text-sm">
            Je hebt nog geen trainingsschema. Marlon stelt deze voor je samen
            op basis van je traject.
          </p>
        </div>
      )}

      {program && (
        <div className="flex flex-col gap-10">
          {program.days.map((day) => (
            <DayScheduleCard key={day.id} day={day} />
          ))}
        </div>
      )}
    </Container>
  );
}
