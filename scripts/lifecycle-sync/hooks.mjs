// Resolve-hooks voor de lifecycle-sync-suite: de productiecode van
// membership-lifecycle.ts, membership-actions.ts, process-cancellations en
// activation-chain.ts wordt echt geladen (via de ts-loader), maar elke
// externe rand (Akiles-sync, Supabase-clients, Mollie, ntfy, events,
// cron-auth, next/cache, mail-naloop, GA4) is een stub die zijn gedrag uit
// globalThis.__lifecycleTest leest en zijn aanroepen daar registreert.
// Zo test de suite precies de aanroeppunten, niet de randen.
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as tsResolve } from "../ts-resolve-hooks.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const stub = (name) => pathToFileURL(path.join(here, "stubs", name)).href;

const STUBS = {
  "@/lib/access/sync": stub("access-sync.mjs"),
  "@/lib/supabase/admin": stub("supabase-admin.mjs"),
  "@/lib/supabase/server": stub("supabase-server.mjs"),
  "@/lib/mollie": stub("mollie.mjs"),
  "@/lib/mollie-mode": stub("mollie-mode.mjs"),
  "@/lib/ntfy": stub("ntfy.mjs"),
  "@/lib/events/emit": stub("emit.mjs"),
  "@/lib/cron-auth": stub("cron-auth.mjs"),
  "@/lib/site-url": stub("site-url.mjs"),
  "@/lib/orders/order-confirmation": stub("order-confirmation.mjs"),
  "@/lib/orders/ga-purchase": stub("ga-purchase.mjs"),
  "next/cache": stub("next-cache.mjs"),
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return tsResolve(specifier, context, nextResolve);
  },
});
