"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addSubscriber,
  setSubscriberUnsubscribed,
  GROUPS,
} from "@/lib/mailerlite";
import { sendNotification } from "@/lib/ntfy";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function getUserIdOrThrow(): Promise<{
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Niet ingelogd.");
  }
  return { userId: user.id, supabase };
}

// ---- Persoonsgegevens ---------------------------------------------------

interface ProfileUpdate {
  first_name: string;
  last_name: string;
  phone: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  street_address: string | null;
  postal_code: string | null;
  city: string | null;
}

export async function updateProfile(data: FormData): Promise<ActionResult> {
  try {
    const { userId, supabase } = await getUserIdOrThrow();

    const first = String(data.get("first_name") ?? "").trim();
    const last = String(data.get("last_name") ?? "").trim();
    if (!first || !last) {
      return { ok: false, error: "Voor- en achternaam zijn verplicht." };
    }

    const phoneRaw = String(data.get("phone") ?? "").trim();
    const dobRaw = String(data.get("date_of_birth") ?? "").trim();
    const streetRaw = String(data.get("street_address") ?? "").trim();
    const postalRaw = String(data.get("postal_code") ?? "").trim();
    const cityRaw = String(data.get("city") ?? "").trim();

    const payload: ProfileUpdate = {
      first_name: first,
      last_name: last,
      phone: phoneRaw || null,
      date_of_birth: dobRaw || null,
      street_address: streetRaw || null,
      postal_code: postalRaw || null,
      city: cityRaw || null,
    };

    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId);

    if (error) {
      console.error("[updateProfile]", error);
      return { ok: false, error: "Opslaan mislukt. Probeer opnieuw." };
    }

    // Keep auth.users.raw_user_meta_data in sync with the profile, so
    // email templates can personalise via {{ .Data.first_name }}.
    try {
      const admin = createAdminClient();
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: { first_name: first, last_name: last },
      });
    } catch (metaErr) {
      console.warn("[updateProfile] user_metadata sync warning:", metaErr);
    }

    revalidatePath("/app/profiel");
    revalidatePath("/app");
    revalidatePath("/app/abonnement/nieuw");
    return { ok: true };
  } catch (e) {
    console.error("[updateProfile]", e);
    return { ok: false, error: "Er ging iets mis." };
  }
}

/**
 * Dedicated action for the sign-up flow — requires all three address fields.
 * Used by /app/abonnement/nieuw before plan selection unlocks.
 */
export async function saveRegistrationAddress(
  data: FormData,
): Promise<ActionResult> {
  try {
    const { userId, supabase } = await getUserIdOrThrow();

    const street = String(data.get("street_address") ?? "").trim();
    const postal = String(data.get("postal_code") ?? "").trim();
    const city = String(data.get("city") ?? "").trim();

    if (!street || !postal || !city) {
      return {
        ok: false,
        error: "Vul straat, postcode en plaats in om door te gaan.",
      };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        street_address: street,
        postal_code: postal,
        city,
      })
      .eq("id", userId);

    if (error) {
      console.error("[saveRegistrationAddress]", error);
      return { ok: false, error: "Opslaan mislukt. Probeer opnieuw." };
    }

    revalidatePath("/app/abonnement/nieuw");
    revalidatePath("/app/profiel");
    return { ok: true };
  } catch (e) {
    console.error("[saveRegistrationAddress]", e);
    return { ok: false, error: "Er ging iets mis." };
  }
}

// ---- Emergency contact --------------------------------------------------

export async function updateEmergencyContact(
  data: FormData
): Promise<ActionResult> {
  try {
    const { userId, supabase } = await getUserIdOrThrow();

    const name = String(data.get("emergency_contact_name") ?? "").trim();
    const phone = String(data.get("emergency_contact_phone") ?? "").trim();

    const { error } = await supabase
      .from("profiles")
      .update({
        emergency_contact_name: name || null,
        emergency_contact_phone: phone || null,
      })
      .eq("id", userId);

    if (error) {
      console.error("[updateEmergencyContact]", error);
      return { ok: false, error: "Opslaan mislukt. Probeer opnieuw." };
    }

    revalidatePath("/app/profiel");
    return { ok: true };
  } catch (e) {
    console.error("[updateEmergencyContact]", e);
    return { ok: false, error: "Er ging iets mis." };
  }
}

// ---- Health intake ------------------------------------------------------

export interface HealthIntakePayload {
  injuries: string;
  medications: string;
  pregnancy_status: "none" | "pregnant" | "post_partum" | "not_applicable";
  pregnancy_notes: string;
  goals: string;
  experience_level: "beginner" | "intermediate" | "advanced";
  additional_notes: string;
}

export async function submitHealthIntake(data: FormData): Promise<ActionResult> {
  try {
    const { userId, supabase } = await getUserIdOrThrow();

    const payload: HealthIntakePayload = {
      injuries: String(data.get("injuries") ?? "").trim(),
      medications: String(data.get("medications") ?? "").trim(),
      pregnancy_status:
        (String(data.get("pregnancy_status") ?? "not_applicable") as
          | "none"
          | "pregnant"
          | "post_partum"
          | "not_applicable"),
      pregnancy_notes: String(data.get("pregnancy_notes") ?? "").trim(),
      goals: String(data.get("goals") ?? "").trim(),
      experience_level:
        (String(data.get("experience_level") ?? "beginner") as
          | "beginner"
          | "intermediate"
          | "advanced"),
      additional_notes: String(data.get("additional_notes") ?? "").trim(),
    };

    if (!payload.goals) {
      return { ok: false, error: "Vertel ons je doelen (verplicht veld)." };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        health_notes: JSON.stringify(payload),
        health_intake_completed_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      console.error("[submitHealthIntake]", error);
      return { ok: false, error: "Opslaan mislukt. Probeer opnieuw." };
    }

    revalidatePath("/app/profiel");
    revalidatePath("/app");
  } catch (e) {
    console.error("[submitHealthIntake]", e);
    return { ok: false, error: "Er ging iets mis." };
  }
  redirect("/app/profiel?intake=done");
}

// ---- Avatar -------------------------------------------------------------

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function uploadAvatar(data: FormData): Promise<ActionResult> {
  try {
    const { userId, supabase } = await getUserIdOrThrow();

    const file = data.get("avatar") as File | null;
    if (!file || file.size === 0) {
      return { ok: false, error: "Kies een afbeelding om te uploaden." };
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return { ok: false, error: "Maximaal 3 MB." };
    }
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      return { ok: false, error: "Alleen JPG, PNG of WebP." };
    }

    const ext = (file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
      ? "webp"
      : "jpg") as string;
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, bytes, {
        contentType: file.type,
        upsert: false,
      });
    if (upErr) {
      console.error("[uploadAvatar] storage", upErr);
      return { ok: false, error: "Upload mislukt." };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    // Ruim oudere avatars op — we bewaren alleen de laatste.
    const { data: files } = await supabase.storage
      .from("avatars")
      .list(userId);
    if (files && files.length > 0) {
      const toRemove = files
        .filter((f) => `${userId}/${f.name}` !== path)
        .map((f) => `${userId}/${f.name}`);
      if (toRemove.length > 0) {
        await supabase.storage.from("avatars").remove(toRemove);
      }
    }

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);
    if (profileErr) {
      console.error("[uploadAvatar] profile update", profileErr);
      return { ok: false, error: "Opslaan URL mislukt." };
    }

    revalidatePath("/app/profiel");
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    console.error("[uploadAvatar]", e);
    return { ok: false, error: "Er ging iets mis." };
  }
}

export async function removeAvatar(): Promise<ActionResult> {
  try {
    const { userId, supabase } = await getUserIdOrThrow();

    // Storage objects onder {userId}/* — list + delete
    const { data: files } = await supabase.storage
      .from("avatars")
      .list(userId);

    if (files && files.length > 0) {
      await supabase.storage
        .from("avatars")
        .remove(files.map((f) => `${userId}/${f.name}`));
    }

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", userId);

    if (error) {
      console.error("[removeAvatar]", error);
      return { ok: false, error: "Verwijderen mislukt." };
    }

    revalidatePath("/app/profiel");
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    console.error("[removeAvatar]", e);
    return { ok: false, error: "Er ging iets mis." };
  }
}

// ---- Marketing opt-in ---------------------------------------------------

export async function updateMarketingOptIn(
  optIn: boolean,
): Promise<ActionResult> {
  try {
    const { userId, supabase } = await getUserIdOrThrow();

    const { data: profile, error: readErr } = await supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", userId)
      .maybeSingle();
    if (readErr || !profile) {
      return { ok: false, error: "Profiel niet gevonden." };
    }

    const { error } = await supabase
      .from("profiles")
      .update({ marketing_opt_in: optIn })
      .eq("id", userId);
    if (error) {
      console.error("[updateMarketingOptIn]", error);
      return { ok: false, error: "Opslaan mislukt." };
    }

    // Bidirectional MailerLite sync. Graceful if env var or group missing —
    // DB is the source of truth, MailerLite is a best-effort mirror.
    try {
      if (optIn) {
        await addSubscriber({
          email: profile.email,
          name: `${profile.first_name} ${profile.last_name}`.trim(),
          groups: GROUPS.MEMBERS ? [GROUPS.MEMBERS] : [],
        });
      } else {
        await setSubscriberUnsubscribed(profile.email);
      }
    } catch (syncErr) {
      console.warn("[updateMarketingOptIn] MailerLite sync warning:", syncErr);
    }

    revalidatePath("/app/profiel");
    return { ok: true };
  } catch (e) {
    console.error("[updateMarketingOptIn]", e);
    return { ok: false, error: "Er ging iets mis." };
  }
}

// ---- Account deletion request ------------------------------------------

export async function requestAccountDeletion(
  reason: string,
): Promise<ActionResult> {
  try {
    const { userId, supabase } = await getUserIdOrThrow();

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    const admin = createAdminClient();
    const { error: auditErr } = await admin.from("admin_audit_log").insert({
      admin_id: userId, // self-initiated, target + actor are the same
      action: "account_deletion_requested",
      target_type: "profile",
      target_id: userId,
      details: {
        reason: reason?.trim() || null,
        email: profile?.email ?? null,
        requested_via: "member_app",
      },
    });
    if (auditErr) {
      console.error("[requestAccountDeletion] audit log:", auditErr);
      return { ok: false, error: "Registreren verzoek mislukt." };
    }

    // Heads-up naar admin via bestaande ntfy-kanaal. Geen dedicated mail
    // infra (Resend/MailerSend) geïnstalleerd nog; ntfy matcht het
    // bestaande lead-notification patroon.
    await sendNotification(
      "Account-verwijder verzoek",
      `${profile?.first_name ?? ""} ${profile?.last_name ?? ""} (${profile?.email ?? "?"}) heeft verwijdering aangevraagd.${reason?.trim() ? ` Reden: ${reason.trim()}` : ""}`,
      "wastebasket",
    );

    revalidatePath("/app/profiel");
    return { ok: true };
  } catch (e) {
    console.error("[requestAccountDeletion]", e);
    return { ok: false, error: "Er ging iets mis." };
  }
}
