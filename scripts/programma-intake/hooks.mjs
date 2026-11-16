// Resolve-hooks voor scripts/programma-intake/route.test.mts, bovenop de
// tsx-loader (nodig voor de .tsx-mailtemplate):
//   - "server-only" wordt een leeg module (buiten React throwt het pakket);
//   - "next/server" krijgt zijn .js-extensie;
//   - "libphonenumber-js/min" wijst naar de ESM-build: onder tsx faalt de
//     CJS-build op require('../metadata.min.json') (undefined), ook in de
//     main-checkout; Next bundelt het gewoon, dus dit is alleen een testhaak.
// De echte e-mailhelper, MailerSend-SDK en Supabase-client draaien onveranderd;
// alleen globalThis.fetch is in de test vervangen.
import { registerHooks } from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const EMPTY_MODULE = pathToFileURL(path.join(here, "..", "empty-module.mjs")).href;
const require_ = createRequire(path.join(here, "..", "..", "package.json"));
const PHONE_ESM = pathToFileURL(
  path.join(path.dirname(require_.resolve("libphonenumber-js/package.json")), "min", "index.js"),
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: EMPTY_MODULE, shortCircuit: true };
    if (specifier === "libphonenumber-js/min") return { url: PHONE_ESM, shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});
