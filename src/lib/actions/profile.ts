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
import { parsePhone } from "@/lib/phone-parse";
import {
  PHONE_INVALID_MESSAGE,
  describeWriteError,
  mapProfileWriteError,
  validateProfileField,
  type ProfileField,
} from "@/lib/profile-validation";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; reason?: string; field?: ProfileField };

/**
 * Logt alleen code en constraint-naam van een schrijffout, nooit het
 * error-object (details bevat bij 23505 het volledige telefoonnummer).
 */
function logWriteError(tag: string, error: { code?: string | null; message?: string | null }) {
  console.error(tag, describeWriteError(error));
}

/** Thrown errors: alleen de soort, nooit de inhoud. */
function logThrown(tag: string, e: unknown) {
  console.error(tag, { thrown: e instanceof Error ? e.name : "unknown" });
}

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
    for (const [field, value] of [
      ["first_name", first],
      ["last_name", last],
    ] as const) {
      const msg = validateProfileField(field, value, { required: true });
      if (msg) return { ok: false, error: msg, field };
    }

    const phoneRaw = String(data.get("phone") ?? "").trim();
    const dobRaw = String(data.get("date_of_birth") ?? "").trim();
    const streetRaw = String(data.get("street_address") ?? "").trim();
    const postalRaw = String(data.get("postal_code") ?? "").trim();
    const cityRaw = String(data.get("city") ?? "").trim();

    // Telefoon is hier optioneel (leeg wordt null), maar als hij is ingevuld
    // moet hij profiles_phone_e164 kunnen passeren: zelfde helper als
    // /abonnement.
    let phone: string | null = null;
    if (phoneRaw) {
      const parsed = parsePhone(phoneRaw);
      if (!parsed.ok) {
        return { ok: false, error: PHONE_INVALID_MESSAGE, field: "phone" };
      }
      phone = parsed.e164;
    }

    const payload: ProfileUpdate = {
      first_name: first,
      last_name: last,
      phone,
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
      logWriteError("[updateProfile]", error);
      return { ok: false, ...mapProfileWriteError(error) };
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
    return { ok: true };
  } catch (e) {
    logThrown("[updateProfile]", e);
    return { ok: false, error: "Er ging iets mis." };
  }
}

/**
 * Dedicated action for the /abonnement Stage 2 identify step: requires
 * name, phone and address together (SEPA + createOrderAndCheckout need
 * first_name/last_name; address is required as a set, same validation
 * shape the old /nieuw AddressGate used for address alone).
 */
export async function saveIdentityDetails(data: FormData): Promise<ActionResult> {
  try {
    const { userId, supabase } = await getUserIdOrThrow();

    const first = String(data.get("first_name") ?? "").trim();
    const last = String(data.get("last_name") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const street = String(data.get("street_address") ?? "").trim();
    const postal = String(data.get("postal_code") ?? "").trim();
    const city = String(data.get("city") ?? "").trim();

    // Volgorde van het formulier: de eerste ontbrekende of foute waarde
    // komt terug met zijn veld, zodat de UI de melding bij het veld toont.
    for (const [field, value] of [
      ["first_name", first],
      ["last_name", last],
      ["phone", phone],
      ["street_address", street],
      ["postal_code", postal],
      ["city", city],
    ] as const) {
      const msg = validateProfileField(field, value, { required: true });
      if (msg) return { ok: false, error: msg, field };
    }

    // profiles_phone_e164 eist E.164. parsePhone valideert en normaliseert
    // (vroeger toE164, dat niets valideert en een opaak "Opslaan mislukt"
    // gaf, zie PR #175); de validatie hierboven garandeert dat dit slaagt.
    const parsed = parsePhone(phone);
    if (!parsed.ok) {
      return { ok: false, error: PHONE_INVALID_MESSAGE, field: "phone" };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: first,
        last_name: last,
        phone: parsed.e164,
        street_address: street,
        postal_code: postal,
        city,
      })
      .eq("id", userId);

    if (error) {
      logWriteError("[saveIdentityDetails]", error);
      return { ok: false, ...mapProfileWriteError(error) };
    }

    revalidatePath("/app/profiel");
    return { ok: true };
  } catch (e) {
    logThrown("[saveIdentityDetails]", e);
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

    // Via de SECURITY DEFINER-RPC (migratie 20260928100000): een lid heeft
    // geen UPDATE-grant op health_notes en health_intake_completed_at, en de
    // database zet het stempel alleen samen met de notes, voor auth.uid().
    const { error } = await supabase.rpc("submit_health_intake", {
      p_health_notes: JSON.stringify(payload),
    });

    if (error) {
      console.error("[submitHealthIntake]", error, "user", userId);
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
      .from("tmc-avatars")
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
    } = supabase.storage.from("tmc-avatars").getPublicUrl(path);

    // Ruim oudere avatars op — we bewaren alleen de laatste.
    const { data: files } = await supabase.storage
      .from("tmc-avatars")
      .list(userId);
    if (files && files.length > 0) {
      const toRemove = files
        .filter((f) => `${userId}/${f.name}` !== path)
        .map((f) => `${userId}/${f.name}`);
      if (toRemove.length > 0) {
        await supabase.storage.from("tmc-avatars").remove(toRemove);
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
      .from("tmc-avatars")
      .list(userId);

    if (files && files.length > 0) {
      await supabase.storage
        .from("tmc-avatars")
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
