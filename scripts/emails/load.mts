// De mailmodules in src/ hebben geen "type": "module", dus tsx levert ze als
// CJS: de named exports zitten dan onder `default`. Deze helper geeft ze
// ongeacht de interop terug.
type Lint = typeof import("../../src/emails/lint.ts");
type Registry = typeof import("../../src/emails/registry.ts");

function unwrap<T extends object>(mod: T & { default?: T }, key: string): T {
  return key in mod ? mod : (mod.default as T);
}

export async function loadLint(): Promise<Lint> {
  return unwrap(await import("../../src/emails/lint.ts"), "lintHtml");
}

export async function loadRegistry(): Promise<Registry> {
  return unwrap(await import("../../src/emails/registry.ts"), "emailRegistry");
}
