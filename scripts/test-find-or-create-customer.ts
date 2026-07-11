/**
 * Bewijs van de geen-dubbele-klant-invarianten in findOrCreateCustomerCore
 * (src/lib/admin/customer-core.ts). Draait de ECHTE productiecode met fake
 * deps; de fake auth-laag dwingt e-mail-uniciteit af exact zoals
 * users_email_partial_key op auth.users dat doet, en de fake createUser
 * maakt synchroon de profielrij aan zoals de on_auth_user_created-trigger.
 *
 * Run: node --experimental-strip-types scripts/test-find-or-create-customer.ts
 */
import {
  findOrCreateCustomerCore,
  normalizeEmail,
  type CustomerDeps,
  type CustomerProfile,
} from "../src/lib/admin/customer-core.ts";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
}

interface Harness {
  deps: CustomerDeps;
  /** e-mail (genormaliseerd) -> profiel; dubbele sleutel is onmogelijk (Map). */
  profilesByEmail: Map<string, CustomerProfile>;
  createCalls: number;
  eventsEmitted: string[];
  /** Vertraag de zoekfase zodat een race beide callers erdoorheen laat. */
  searchDelayMs: number;
  /** Simuleer een auth-user zonder profielrij (legacy edge). */
  authOnlyEmails: Set<string>;
}

function makeHarness(): Harness {
  const profilesByEmail = new Map<string, CustomerProfile>();
  const profilesById = new Map<string, CustomerProfile>();
  let seq = 0;

  const h: Harness = {
    profilesByEmail,
    createCalls: 0,
    eventsEmitted: [],
    searchDelayMs: 0,
    authOnlyEmails: new Set(),
    deps: {
      db: {
        async findProfileByEmail(emailNormalized) {
          // Snapshot VOOR de vertraging: zo modelleert de fake een read die
          // committe voordat de andere caller insertte, met een antwoord dat
          // later binnenkomt. Precies de race die het duplicate-pad raakt.
          const snapshot = profilesByEmail.get(emailNormalized) ?? null;
          if (h.searchDelayMs > 0) {
            await new Promise((r) => setTimeout(r, h.searchDelayMs));
          }
          return snapshot;
        },
        async getProfileById(id) {
          return profilesById.get(id) ?? null;
        },
      },
      auth: {
        async createUser({ email, firstName, lastName }) {
          h.createCalls++;
          // users_email_partial_key: tweede registratie op hetzelfde adres
          // is onmogelijk, GoTrue geeft email_exists terug.
          if (profilesByEmail.has(email) || h.authOnlyEmails.has(email)) {
            return { duplicate: true };
          }
          seq++;
          const profile: CustomerProfile = {
            id: `profile-${seq}`,
            firstName,
            lastName,
            email,
            memberCode: String(100000 + seq),
          };
          // De trigger draait synchroon in dezelfde transactie als de
          // auth-insert: profiel bestaat zodra createUser terugkeert.
          profilesByEmail.set(email, profile);
          profilesById.set(profile.id, profile);
          return { userId: profile.id };
        },
      },
      async emitCustomerCreated(profileId) {
        h.eventsEmitted.push(profileId);
      },
    },
  };
  return h;
}

const VALID = {
  email: "jan@voorbeeld.nl",
  emailRepeat: "jan@voorbeeld.nl",
  firstName: "Jan",
  lastName: "Jansen",
};

async function run() {
  console.log("\n1. Nieuwe klant: aanmaken, profiel terug, precies een audit-event");
  {
    const h = makeHarness();
    const res = await findOrCreateCustomerCore(h.deps, VALID);
    assert(res.ok && res.created, "ok en created=true");
    assert(
      res.ok && res.profile.email === "jan@voorbeeld.nl" && !!res.profile.memberCode,
      "profiel met genormaliseerd adres en member_code",
    );
    assert(h.eventsEmitted.length === 1, "precies een member.created-event");
  }

  console.log("\n2. Bestaande klant op variant-spelling: vinden, NIET aanmaken");
  {
    const h = makeHarness();
    const eerste = await findOrCreateCustomerCore(h.deps, VALID);
    const tweede = await findOrCreateCustomerCore(h.deps, {
      email: "  Jan@VOORBEELD.nl ",
      emailRepeat: "jan@voorbeeld.NL",
      firstName: "Jan",
      lastName: "Jansen",
    });
    assert(tweede.ok && !tweede.created, "created=false bij bestaand adres");
    assert(
      eerste.ok && tweede.ok && tweede.profile.id === eerste.profile.id,
      "zelfde profiel-id als de eerste aanmaak",
    );
    assert(h.createCalls === 1, "createUser niet nogmaals aangeroepen");
    assert(h.eventsEmitted.length === 1, "geen tweede audit-event");
  }

  console.log("\n3. Dubbel-invoer-barriere: mismatch blokkeert VOOR er iets gebeurt");
  {
    const h = makeHarness();
    const res = await findOrCreateCustomerCore(h.deps, {
      ...VALID,
      emailRepeat: "jam@voorbeeld.nl", // karakter-typo
    });
    assert(!res.ok && res.reason === "email_mismatch", "reason=email_mismatch");
    assert(h.createCalls === 0, "createUser nooit aangeroepen");
    assert(h.profilesByEmail.size === 0, "geen profiel ontstaan");
  }

  console.log("\n4. Normalisatie telt als match: case/witruimte is geen mismatch");
  {
    const h = makeHarness();
    const res = await findOrCreateCustomerCore(h.deps, {
      ...VALID,
      email: " Jan@Voorbeeld.NL ",
      emailRepeat: "jan@voorbeeld.nl",
    });
    assert(res.ok === true, "genormaliseerd gelijke invoer passeert de barriere");
  }

  console.log("\n5. Validatie: lege naam en ongeldig adres");
  {
    const h = makeHarness();
    const naam = await findOrCreateCustomerCore(h.deps, {
      ...VALID,
      firstName: "  ",
    });
    assert(!naam.ok && naam.reason === "missing_name", "lege voornaam -> missing_name");
    const adres = await findOrCreateCustomerCore(h.deps, {
      ...VALID,
      email: "geen-adres",
      emailRepeat: "geen-adres",
    });
    assert(!adres.ok && adres.reason === "invalid_email", "geen @ -> invalid_email");
    assert(h.createCalls === 0, "createUser nooit aangeroepen");
  }

  console.log("\n6. KERN-DoD: race op gelijktijdige aanmaak levert EEN klant op");
  {
    const h = makeHarness();
    // Beide callers passeren de zoekfase voordat een van beide aanmaakt;
    // de uniciteit van de auth-laag beslist daarna wie wint.
    h.searchDelayMs = 20;
    const [a, b] = await Promise.all([
      findOrCreateCustomerCore(h.deps, VALID),
      findOrCreateCustomerCore(h.deps, VALID),
    ]);
    assert(a.ok && b.ok, "beide aanroepen slagen");
    assert(h.profilesByEmail.size === 1, "precies een klant ontstaan");
    assert(
      a.ok && b.ok && a.profile.id === b.profile.id,
      "beide callers krijgen hetzelfde profiel-id",
    );
    assert(
      a.ok && b.ok && a.created !== b.created,
      "een caller created=true, de ander created=false (re-search-pad)",
    );
    assert(h.createCalls === 2, "beide riepen createUser aan (een won, een kreeg duplicate)");
    assert(h.eventsEmitted.length === 1, "precies een audit-event");
  }

  console.log("\n7. Legacy edge: auth-user zonder profielrij geeft nette fout, geen crash");
  {
    const h = makeHarness();
    h.authOnlyEmails.add("legacy@voorbeeld.nl");
    const res = await findOrCreateCustomerCore(h.deps, {
      email: "legacy@voorbeeld.nl",
      emailRepeat: "legacy@voorbeeld.nl",
      firstName: "Legacy",
      lastName: "Gebruiker",
    });
    assert(!res.ok && res.reason === "profile_missing", "reason=profile_missing");
    assert(h.eventsEmitted.length === 0, "geen audit-event");
  }

  console.log("\n8. normalizeEmail zelf");
  {
    assert(normalizeEmail("  Jan@GMAIL.com ") === "jan@gmail.com", "trim + lowercase");
  }

  console.log(failures === 0 ? "\nALLE TESTS GESLAAGD" : `\n${failures} TEST(S) GEFAALD`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
