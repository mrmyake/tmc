// Guard: elk type dat sanity.config.ts in de desk structure noemt moet
// geregistreerd zijn in sanity/schemas/index.ts. Anders crasht de embedded
// Studio op /studio met 'Schema type with name "X" not found'.
//
// Statisch (regex), dus geen Sanity-runtime nodig. Draait als prebuild.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Type-namen die de structure noemt: documentTypeListItem("x"),
// documentTypeList("x") en .schemaType("x").
export function structureTypeNames(configSource) {
  const re =
    /(?:documentTypeListItem|documentTypeList|schemaType)\(\s*["'`]([^"'`]+)["'`]/g;
  return [...configSource.matchAll(re)].map((m) => m[1]);
}

// Geregistreerde type-namen: de identifiers in de schemaTypes-array,
// opgelost naar hun importbestand, waar we `name: "..."` uit lezen.
export function registeredTypeNames(indexSource, readFile) {
  const arr = indexSource.match(/schemaTypes\s*=\s*\[([\s\S]*?)\]/);
  if (!arr) throw new Error("schemaTypes-array niet gevonden in index.ts");
  const idents = arr[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return idents.map((id) => {
    const imp = indexSource.match(
      new RegExp(`import\\s+${id}\\s+from\\s+["']([^"']+)["']`)
    );
    if (!imp) throw new Error(`geen import gevonden voor ${id}`);
    const src = readFile(imp[1]);
    const name = src.match(/\bname:\s*["']([^"']+)["']/);
    if (!name) throw new Error(`geen name gevonden in ${imp[1]}`);
    return name[1];
  });
}

export function missingTypes(configSource, indexSource, readFile) {
  const registered = new Set(registeredTypeNames(indexSource, readFile));
  return [...new Set(structureTypeNames(configSource))].filter(
    (t) => !registered.has(t)
  );
}

export function checkRepo() {
  const configSource = readFileSync(resolve(root, "sanity.config.ts"), "utf8");
  const indexSource = readFileSync(
    resolve(root, "sanity/schemas/index.ts"),
    "utf8"
  );
  const readFile = (rel) =>
    readFileSync(resolve(root, "sanity/schemas", `${rel}.ts`), "utf8");
  return missingTypes(configSource, indexSource, readFile);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const missing = checkRepo();
  if (missing.length) {
    for (const t of missing) {
      console.error(
        `structure verwijst naar ${t}, niet geregistreerd in sanity/schemas/index.ts`
      );
    }
    process.exit(1);
  }
  console.log("sanity structure: alle types geregistreerd");
}
