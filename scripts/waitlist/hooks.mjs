// Resolve-hooks voor de wachtlijst-integratiesuite, zelfde opzet als
// scripts/session-overrides/hooks.mjs (de stubs daar worden hergebruikt):
//   - "next/cache" (revalidatePath) wordt een no-op;
//   - "server-only" wordt een leeg module;
//   - "next/server" en "next/headers" krijgen hun .js-extensie;
//   - "@/lib/email" registreert elke mail in globalThis.__sentEmails;
//   - "@/lib/push" registreert elke push in globalThis.__sentPushes.
// De cron-route, de RPC's en de Supabase-client zijn de echte productiecode
// tegen de lokale database.
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const so = path.join(here, "..", "session-overrides");
const STUB_CACHE = pathToFileURL(path.join(so, "stub-next-cache.mjs")).href;
const STUB_EMAIL = pathToFileURL(path.join(so, "stub-email.mjs")).href;
const STUB_PUSH = pathToFileURL(path.join(here, "stub-push.mjs")).href;
const EMPTY_MODULE = pathToFileURL(path.join(here, "..", "empty-module.mjs")).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/cache") return { url: STUB_CACHE, shortCircuit: true };
    if (specifier === "server-only") return { url: EMPTY_MODULE, shortCircuit: true };
    if (specifier === "@/lib/email") return { url: STUB_EMAIL, shortCircuit: true };
    if (specifier === "@/lib/push") return { url: STUB_PUSH, shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "next/headers") return nextResolve("next/headers.js", context);
    return nextResolve(specifier, context);
  },
});
