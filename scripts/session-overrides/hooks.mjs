// Extra resolve-hooks voor de session-overrides-suite, bovenop
// scripts/ts-loader.mjs. De serie-acties zijn server actions; buiten Next
// vervangen of repareren we vijf afhankelijkheden:
//   - "next/cache" (revalidatePath werkt alleen binnen een request) wordt een
//     no-op;
//   - "./require-admin" (leest cookies) geeft de admin uit TEST_ADMIN_ID terug;
//   - "next/server" en "next/headers" krijgen hun .js-extensie;
//   - "server-only" wordt een leeg module, ook onder de tsx-loader;
//   - "@/lib/email" wordt een stub die elke mail registreert in
//     globalThis.__sentEmails (verstuurt niets).
// Al het andere, inclusief de materialisatie, emitEvent en de Supabase-client,
// is de echte productiecode tegen de lokale database.
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const STUB_CACHE = pathToFileURL(path.join(here, "stub-next-cache.mjs")).href;
const STUB_ADMIN = pathToFileURL(path.join(here, "stub-require-admin.mjs")).href;
const STUB_EMAIL = pathToFileURL(path.join(here, "stub-email.mjs")).href;
const EMPTY_MODULE = pathToFileURL(path.join(here, "..", "empty-module.mjs")).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/cache") return { url: STUB_CACHE, shortCircuit: true };
    // Ook onder de tsx-loader (nodig voor de .tsx-mailtemplates): buiten React
    // throwt het echte pakket.
    if (specifier === "server-only") return { url: EMPTY_MODULE, shortCircuit: true };
    if (specifier === "@/lib/email") return { url: STUB_EMAIL, shortCircuit: true };
    // next/server heeft geen exports-map; Node wil de extensie.
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "next/headers") return nextResolve("next/headers.js", context);
    if (specifier === "./require-admin" && context.parentURL?.includes("/src/lib/admin/")) {
      return { url: STUB_ADMIN, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
