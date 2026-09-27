import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCatalogue } from "@/lib/catalogue";
import { TRAINER_HOME } from "@/lib/auth/safe-next";
import { resolveTrainerScope } from "@/lib/trainer/trainer-scope";
import { PtBookScreen } from "./_components/PtBookScreen";

export const metadata = {
  title: "PT boeken | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface TrainerRow {
  id: string;
  display_name: string;
  slug: string;
  is_active: boolean;
}

/**
 * PT-agenda C3: Boek-voor-klant-scherm, verhuisd van /app/admin/pt-boeken
 * naar /app/trainer/boeken. Toegang (fix/trainer-pt-scope): admin, of een
 * PT-trainer uitsluitend voor de eigen trainer_id, dezelfde gate als
 * tmc.is_pt_trainer_for(p_trainer_id) op de onderliggende RPC's
 * (admin_book_pt_for_member, admin_plan_pt_program, get_pt_busy). De
 * trainer-layout-guard checkt alleen de rol; resolveTrainerScope hier
 * voegt is_active en is_pt_available toe, en de server actions gaten
 * zichzelf nogmaals. Betaallinks (tmc.admin_create_order) blijven
 * admin-only, dus die betaalmodus gaat alleen als prop aan voor admins.
 */
export default async function PtBoekenPage(props: {
  searchParams: Promise<{ trainerId?: string }>;
}) {
  const { trainerId: requestedTrainerId } = await props.searchParams;
  const scope = await resolveTrainerScope(requestedTrainerId);
  if (!scope.ok) redirect("/app");
  // fix/trainer-pt-scope: een trainer zonder PT komt hier niet.
  if (!scope.isPtTrainer) redirect(TRAINER_HOME);

  // Admin kiest uit alle actieve trainers; een PT-trainer boekt uitsluitend
  // op de eigen agenda (tot fix/trainer-pt-scope mocht een trainer ook voor
  // een collega inplannen, dat is bewust dichtgezet). De RPC's dwingen
  // dezelfde grens af, de lijst hier voorkomt alleen een zinloze keuze.
  const admin = createAdminClient();
  const trainerQuery = admin
    .from("trainers")
    .select("id, display_name, slug, is_active")
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  const [{ data: trainerRows }, catalogue] = await Promise.all([
    (scope.isAdmin
      ? trainerQuery
      : trainerQuery.eq("id", scope.ownTrainerId ?? "")
    ).returns<TrainerRow[]>(),
    getCatalogue(),
  ]);

  const trainers = trainerRows ?? [];
  const defaultTrainerId =
    scope.selectedTrainerId ??
    trainers.find((t) => t.slug === "marlon")?.id ??
    trainers[0]?.id ??
    null;

  const studioProgram = catalogue.get("program_studio_12w");
  const onlineProgram = catalogue.get("program_online_12w");

  return (
    <PtBookScreen
      trainers={trainers.map((t) => ({ id: t.id, displayName: t.display_name }))}
      defaultTrainerId={defaultTrainerId}
      studioProgram={{
        priceCents: studioProgram?.price_cents ?? 240000,
        displayName: studioProgram?.display_name ?? "12-weken-programma studio",
      }}
      onlineProgram={{
        priceCents: onlineProgram?.price_cents ?? 125000,
        displayName: onlineProgram?.display_name ?? "12-weken-programma online",
      }}
      paymentLinksEnabled={scope.isAdmin}
    />
  );
}
