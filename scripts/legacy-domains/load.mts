// Laadt de productiecode onder tsx. Statische named imports uit .ts-bestanden
// worden onder tsx als CommonJS geladen en zijn dan niet vindbaar; de
// namespace heeft de exports onder "module.exports" of "default".
import * as handleNs from "../../src/lib/legacy-domains/handle";
import * as modeNs from "../../src/lib/legacy-domains/mode";
import * as registryNs from "../../src/lib/legacy-domains/registry";
import * as proxyNs from "../../src/proxy";

function unwrap<T>(ns: unknown): T {
  const m = ns as Record<string, unknown>;
  return ((m["module.exports"] ?? m.default ?? m) as unknown) as T;
}

export const { handleLegacyDomain } = unwrap<typeof import("../../src/lib/legacy-domains/handle")>(handleNs);
export const { resolveMode } = unwrap<typeof import("../../src/lib/legacy-domains/mode")>(modeNs);
export const { LEGACY_DOMAINS } = unwrap<typeof import("../../src/lib/legacy-domains/registry")>(registryNs);
export const { proxy, config } = unwrap<typeof import("../../src/proxy")>(proxyNs);
