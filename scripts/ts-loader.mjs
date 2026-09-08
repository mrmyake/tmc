// Registreert de resolve-hooks voor de node:test-suites in scripts/access/.
// Gebruik: node --import ./scripts/ts-loader.mjs --test scripts/access/*.test.mts
import { registerHooks } from "node:module";
import { resolve } from "./ts-resolve-hooks.mjs";

registerHooks({ resolve });
