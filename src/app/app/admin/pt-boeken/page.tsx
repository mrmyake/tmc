import { createAdminClient } from "@/lib/supabase/admin";
import { getCatalogue } from "@/lib/catalogue";
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
 * PT-agenda C2: Boek-voor-klant-scherm. Admin-only, matching de
 * onderliggende RPC's uit C1 (admin_book_pt_for_member,
 * admin_plan_pt_program, get_pt_busy zijn allemaal tmc.is_admin()-gated;
 * er bestaat geen trainer-pad op deze RPC's). De layout-guard
 * (src/app/app/admin/layout.tsx) redirect non-admins al naar /app; deze
 * pagina voegt geen los-staande check toe, en de server actions gaten
 * zichzelf nogmaals via requireAdmin().
 */
export default async function PtBoekenPage() {
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
    />
  );
}
