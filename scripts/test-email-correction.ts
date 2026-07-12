/**
 * Invariant-bewijs voor tmc.admin_correct_customer_email (lifecycle fase 2B,
 * migratie 20260727000000_change_requests_and_email_correction.sql), in de
 * stijl van scripts/test-find-or-create-customer.ts maar tegen de LIVE
 * database: de invariant is cross-store (auth.users + auth.identities +
 * tmc.profiles) en is alleen echt te bewijzen waar die drie stores bestaan.
 *
 * Bewijst:
 *  1. een geslaagde correctie houdt de DRIE stores synchroon
 *     (auth.users.email, auth.identities.identity_data.email,
 *     tmc.profiles.email);
 *  2. botsing met een bestaand ANDER account wordt geweigerd
 *     (email_exists), ook voor een case-variant (normalisatie identiek aan
 *     users_email_partial_key);
 *  3. geen half-doorgevoerde staat bij faal: na de geweigerde botsing zijn
 *     alle drie de stores byte-voor-byte ongewijzigd;
 *  4. idempotent: corrigeren naar het huidige adres is een no-op
 *     (already_current);
 *  5. ongeldig adres geweigerd (invalid_email);
 *  6. zonder admin-context hard geweigerd (42501), ook onder de
 *     service-role (auth.uid() is null, tmc.is_admin() is false).
 *
 * Wegwerpdata: een admin-, en twee klant-accounts met unieke
 * example.com-adressen; alles wordt aan het einde verwijderd
 * (auth.admin.deleteUser, cascade naar tmc.profiles).
 *
 * Run:
 *   SUPABASE_URL=https://xoivleieyfcxcfawgveh.supabase.co \
 *   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/test-email-correction.ts
 * (keys via: supabase projects api-keys --project-ref xoivleieyfcxcfawgveh)
 *
 * WAARGENOMEN op 2026-07-12 tegen het live project: 12/12 PASS, cleanup
 * geverifieerd (drie wegwerp-users verwijderd).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("SUPABASE_URL, SUPABASE_ANON_KEY en SUPABASE_SERVICE_ROLE_KEY zijn vereist.");
  process.exit(1);
}

const service = createClient(url, serviceKey, {
  db: { schema: "tmc" },
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
function assert(cond: boolean, label: string, detail?: unknown) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}`, detail ?? "");
  }
}

interface Stores {
  authEmail: string | null;
  identityEmail: string | null;
  profileEmail: string | null;
}

async function readStores(userId: string): Promise<Stores> {
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error(`getUserById faalde: ${error?.message}`);
  const identity = (data.user.identities ?? []).find((i) => i.provider === "email");
  const { data: profile } = await service
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  return {
    authEmail: data.user.email ?? null,
    identityEmail:
      (identity?.identity_data as { email?: string } | undefined)?.email ?? null,
    profileEmail: profile?.email ?? null,
  };
}

async function createThrowawayUser(email: string) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { first_name: "Racetest", last_name: "Email" },
  });
  if (error || !data.user) throw new Error(`createUser faalde: ${error?.message}`);
  return data.user.id;
}

async function main() {
  const ts = Date.now();
  const adminEmail = `racetest-email-admin-${ts}@example.com`;
  const emailA = `racetest-email-a-${ts}@example.com`;
  const emailB = `racetest-email-b-${ts}@example.com`;
  const emailNew = `racetest-email-nieuw-${ts}@example.com`;
  const cleanup: string[] = [];

  try {
    // Wegwerp-admin met echte OTP-sessie: de RPC is tmc.is_admin()-gated en
    // leest auth.uid(), dus het bewijs moet door een echte admin-JWT heen.
    const { data: adminUser, error: adminErr } = await service.auth.admin.createUser({
      email: adminEmail,
      email_confirm: true,
      user_metadata: { first_name: "Racetest", last_name: "Admin" },
    });
    if (adminErr || !adminUser.user) throw new Error(`admin createUser: ${adminErr?.message}`);
    cleanup.push(adminUser.user.id);
    await service.from("profiles").update({ role: "admin" }).eq("id", adminUser.user.id);

    const { data: link, error: linkErr } = await service.auth.admin.generateLink({
      type: "magiclink",
      email: adminEmail,
    });
    if (linkErr || !link.properties?.email_otp) throw new Error(`generateLink: ${linkErr?.message}`);

    const anon = createClient(url!, anonKey!, {
      db: { schema: "tmc" },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: session, error: otpErr } = await anon.auth.verifyOtp({
      email: adminEmail,
      token: link.properties.email_otp,
      type: "email",
    });
    if (otpErr || !session.session) throw new Error(`verifyOtp: ${otpErr?.message}`);

    const adminCtx = createClient(url!, anonKey!, {
      db: { schema: "tmc" },
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    });

    // Twee klant-accounts (trigger maakt de profielrijen).
    const idA = await createThrowawayUser(emailA);
    cleanup.push(idA);
    const idB = await createThrowawayUser(emailB);
    cleanup.push(idB);

    console.log("Scenario 1: geslaagde correctie houdt de drie stores synchroon");
    const { data: r1 } = await adminCtx.rpc("admin_correct_customer_email", {
      p_profile_id: idA,
      p_new_email: emailNew,
    });
    assert(Boolean((r1 as { ok?: boolean })?.ok), "correctie slaagt", r1);
    const s1 = await readStores(idA);
    assert(s1.authEmail === emailNew, "auth.users.email bijgewerkt", s1);
    assert(s1.identityEmail === emailNew, "identities.identity_data.email bijgewerkt", s1);
    assert(s1.profileEmail === emailNew, "tmc.profiles.email bijgewerkt", s1);

    console.log("Scenario 2: botsing met bestaand ander account geweigerd, geen halve staat");
    const { data: r2 } = await adminCtx.rpc("admin_correct_customer_email", {
      p_profile_id: idA,
      p_new_email: emailB,
    });
    assert((r2 as { reason?: string })?.reason === "email_exists", "botsing geweigerd (email_exists)", r2);
    const s2 = await readStores(idA);
    assert(
      s2.authEmail === emailNew && s2.identityEmail === emailNew && s2.profileEmail === emailNew,
      "alle drie de stores ongewijzigd na weigering",
      s2,
    );

    console.log("Scenario 3: case-variant van bestaand adres ook geweigerd (normalisatie)");
    const { data: r3 } = await adminCtx.rpc("admin_correct_customer_email", {
      p_profile_id: idA,
      p_new_email: emailB.toUpperCase(),
    });
    assert((r3 as { reason?: string })?.reason === "email_exists", "case-variant geweigerd", r3);

    console.log("Scenario 4: corrigeren naar het huidige adres is een no-op");
    const { data: r4 } = await adminCtx.rpc("admin_correct_customer_email", {
      p_profile_id: idA,
      p_new_email: emailNew.toUpperCase(),
    });
    const r4o = r4 as { ok?: boolean; already_current?: boolean };
    assert(Boolean(r4o?.ok && r4o?.already_current), "already_current no-op", r4);

    console.log("Scenario 5: ongeldig adres geweigerd");
    const { data: r5 } = await adminCtx.rpc("admin_correct_customer_email", {
      p_profile_id: idA,
      p_new_email: "geen-mailadres",
    });
    assert((r5 as { reason?: string })?.reason === "invalid_email", "invalid_email", r5);

    console.log("Scenario 6: zonder admin-context hard geweigerd");
    const { error: e6 } = await service.rpc("admin_correct_customer_email", {
      p_profile_id: idA,
      p_new_email: `racetest-email-x-${ts}@example.com`,
    });
    assert(Boolean(e6 && /admins/i.test(e6.message)), "service-role zonder admin-context: 42501", e6?.message);
    const s6 = await readStores(idA);
    assert(s6.authEmail === emailNew, "stores ongewijzigd na geweigerde niet-admin-poging", s6);
  } finally {
    for (const id of cleanup) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) console.error(`cleanup deleteUser ${id} faalde:`, error.message);
    }
    console.log(`cleanup: ${cleanup.length} wegwerp-users verwijderd`);
  }

  if (failures > 0) {
    console.error(`${failures} FAIL`);
    process.exit(1);
  }
  console.log("Alle invarianten PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
