#!/usr/bin/env node
/**
 * Bundelt export-entry.tsx met esbuild (next/link gealiased naar een
 * eenvoudige <a>-shim, want de echte next/link vereist App Router-context
 * die buiten de Next-runtime niet bestaat) en voert het resultaat uit.
 * Schrijft de twee design-preview HTML-bestanden + de gedeelde CSS naar
 * public/preview/. Bouwtijd-only script, niet onderdeel van de app-runtime.
 *
 * Run: node scripts/design-preview/build-and-run.mjs
 * Vereist een voorafgaande `npm run build` (voor de gecompileerde
 * Tailwind-CSS-chunk die dit script hergebruikt — zie
 * COMPILED_CSS_SOURCE in export-entry.tsx).
 */
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const require = createRequire(import.meta.url);

// Binnen de repo (niet os.tmpdir()) zodat Node's module-resolutie voor
// react/react-dom (external, dus require()'d at runtime) de project-
// node_modules vindt. Verwijderd na gebruik.
const tmpOut = path.join(__dirname, `.tmp-build-${Date.now()}.cjs`);

async function main() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, "export-entry.tsx")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    jsx: "automatic",
    tsconfig: path.join(repoRoot, "tsconfig.json"),
    alias: {
      "next/link": path.join(__dirname, "next-link-shim.tsx"),
    },
    external: ["react", "react-dom", "react-dom/server"],
    outfile: tmpOut,
    logLevel: "warning",
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(tmpOut);
  } finally {
    fs.rmSync(tmpOut, { force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
