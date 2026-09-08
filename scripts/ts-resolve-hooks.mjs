// Module-resolve-hooks zodat Node (met ingebouwde type-stripping) de
// productiecode onder src/ rechtstreeks kan laden:
//   - "@/x" wordt "<repo>/src/x" (het tsconfig-pad-alias);
//   - relatieve imports zonder extensie krijgen .ts/.tsx/index.ts erbij;
//   - "server-only" wordt een leeg module (buiten React throwt het pakket).
// Er wordt niets getranspileerd; alleen de specifier wordt herschreven.
// Synchroon (module.registerHooks), zodat ook require-paden meedoen.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(here, "../src");
const EMPTY_MODULE = pathToFileURL(path.join(here, "empty-module.mjs")).href;
const CANDIDATE_EXTENSIONS = [".ts", ".tsx", ".mts", "/index.ts"];

function withExtension(absolutePath) {
  if (path.extname(absolutePath) && existsSync(absolutePath)) return absolutePath;
  for (const ext of CANDIDATE_EXTENSIONS) {
    const candidate = absolutePath + ext;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: EMPTY_MODULE, shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    const resolved = withExtension(path.join(SRC_DIR, specifier.slice(2)));
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    const resolved = withExtension(base);
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
  }

  return nextResolve(specifier, context);
}
