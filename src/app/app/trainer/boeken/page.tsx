import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCatalogue } from "@/lib/catalogue";
import { requireTrainerOrAdmin } from "@/lib/admin/require-trainer-or-admin";
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
 * naar /app/trainer/boeken. Toegang: admin of actieve trainer, dezelfde
 * gate als tmc.is_staff() op de onderliggende RPC's
 * (admin_book_pt_for_member, admin_plan_pt_program, get_pt_busy). De
 * trainer-layout-guard checkt alleen de rol; requireTrainerOrAdmin hier
 * voegt de is_active-voorwaarde toe, en de server actions gaten zichzelf
 * nogmaals. Betaallinks (tmc.admin_create_order) blijven admin-only, dus
 * die betaalmodus gaat alleen als prop aan voor admins.
 */
export default async function PtBoekenPage() {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) redirect("/app");

  const admin = createAdminClient();

  const [{ data: trainerRows }, catalogue] = await Promise.all([
    admin
      .from("trainers")
      .select("id, display_name, slug, is_active")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .returns<TrainerRow[]>(),
    getCatalogue(),
  ]);

  const trainers = trainerRows ?? [];
  const defaultTrainer =
    trainers.find((t) => t.slug === "marlon") ?? trainers[0] ?? null;

  const studioProgram = catalogue.get("program_studio_12w");
  const onlineProgram = catalogue.get("program_online_12w");

  return (
    <PtBookScreen
      trainers={trainers.map((t) => ({ id: t.id, displayName: t.display_name }))}
      defaultTrainerId={defaultTrainer?.id ?? null}
      studioProgram={{
        priceCents: studioProgram?.price_cents ?? 240000,
        displayName: studioProgram?.display_name ?? "12-weken-programma studio",
      }}
      onlineProgram={{
        priceCents: onlineProgram?.price_cents ?? 125000,
        displayName: onlineProgram?.display_name ?? "12-weken-programma online",
      }}
      paymentLinksEnabled={gate.actorType === "admin"}
    />
  );
}
