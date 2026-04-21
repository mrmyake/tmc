import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // Next 16's react-hooks ruleset treats any setState inside useEffect as
      // an error. The existing codebase uses legitimate patterns (closing the
      // mobile menu on route change, hydrating consent state from localStorage,
      // reading scrollY on mount). Downgrade to warning so lint stays useful
      // without blocking on patterns that aren't actually broken.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "types/supabase.ts",
  ]),
]);
