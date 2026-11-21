// Laadt de productiecode onder tsx (zie scripts/legacy-domains/load.mts).
import * as redirectsNs from "../../src/lib/hormoonprofiel/redirects";
import * as slugsNs from "../../src/lib/hormoonprofiel/slugs";
import * as handleNs from "../../src/lib/legacy-domains/handle";

function unwrap<T>(ns: unknown): T {
  const m = ns as Record<string, unknown>;
  return ((m["module.exports"] ?? m.default ?? m) as unknown) as T;
}

export const { decideHormoonprofielRequest, decideTmcSection } =
  unwrap<typeof import("../../src/lib/hormoonprofiel/redirects")>(redirectsNs);
export const { HP_PATHS, HP_PAGE_KEYS, sectionPath } =
  unwrap<typeof import("../../src/lib/hormoonprofiel/slugs")>(slugsNs);
export const { handleLegacyDomain } =
  unwrap<typeof import("../../src/lib/legacy-domains/handle")>(handleNs);
