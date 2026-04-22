"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type TrainerHoursResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

interface SubmitInput {
  workDate: string; // yyyy-mm-dd
  hours: number;
  notes?: string;
}

/**
 * Trainer zelf dient uren in. RLS `trainer_hours_self_insert` eist
 * status='pending' en trainer_id van eigen profile. We gebruiken hier de
 * cookie-scoped client zodat RLS leidend is.
 */
export async function submitOwnHours(
  input: SubmitInput,
): Promise<TrainerHoursResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  if (!input.workDate) {
    return { ok: false, message: "Geef een datum op." };
  }
  if (!(input.hours > 0 && input.hours <= 24)) {
    return { ok: false, message: "Uren moeten tussen 0 en 24 liggen." };
  }

  // Trainer lookup via admin-client — RLS op trainers zou de query niet
  // toestaan voor sommige rollen. We lezen alleen eigen id.
  const admin = createAdminClient();
  const { data: trainer } = await admin
    .from("trainers")
    .select("id, is_active")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!trainer) {
    return { ok: false, message: "Geen trainer-profiel gevonden." };
  }
  if (!trainer.is_active) {
    return { ok: false, message: "Je bent niet actief als trainer." };
  }

  const { error } = await supabase.from("trainer_hours").insert({
    trainer_id: trainer.id,
    work_date: input.workDate,
    hours: input.hours,
    notes: input.notes?.trim() || null,
    status: "pending",
  });

  if (error) {
    console.error("[submitOwnHours] insert failed", error);
    return { ok: false, message: "Opslaan lukte niet. Probeer opnieuw." };
  }

  revalidatePath("/app/trainer");
  revalidatePath("/app/trainer/uren");

  return {
    ok: true,
    message: "Uren ingediend. Admin keurt goed of wijst af.",
  };
}
