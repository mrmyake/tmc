import { isLegacyMode, type LegacyDomain, type LegacyMode } from "./types";

/** Naam van het Global Config-item met de modus per domein. */
export const LEGACY_DOMAINS_ITEM = "legacy_domains";

/** Maximale wachttijd op Global Config voordat de standaardmodus geldt. */
export const READ_TIMEOUT_MS = 2000;

/** Gooit als er geen connection string is gekoppeld. */
export class NoConnectionError extends Error {
  constructor() {
    super("GLOBAL_CONFIG/EDGE_CONFIG ontbreekt");
    this.name = "NoConnectionError";
  }
}

/** Leest het ruwe item `legacy_domains`. Injecteerbaar voor tests. */
export type ModeSource = () => Promise<unknown>;

/** Standaardbron: @vercel/global-config (leest GLOBAL_CONFIG, dan EDGE_CONFIG). */
export const globalConfigSource: ModeSource = async () => {
  if (!process.env.GLOBAL_CONFIG && !process.env.EDGE_CONFIG) {
    throw new NoConnectionError();
  }
  const { get } = await import("@vercel/global-config");
  return get(LEGACY_DOMAINS_ITEM);
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout na ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * De modus voor een domein. Bij een ontbrekende connection string, leesfout,
 * ontbrekend item of ongeldige waarde: de standaardmodus uit code en een
 * enkele console.warn.
 */
export async function resolveMode(
  domain: LegacyDomain,
  source: ModeSource = globalConfigSource,
  timeoutMs: number = READ_TIMEOUT_MS,
): Promise<LegacyMode> {
  const fallback = (reason: string): LegacyMode => {
    console.warn(
      `[legacy-domains] ${domain.domain}: ${reason}; standaardmodus ${domain.defaultMode}`,
    );
    return domain.defaultMode;
  };

  let raw: unknown;
  try {
    raw = await withTimeout(source(), timeoutMs);
  } catch (error) {
    if (error instanceof NoConnectionError) {
      return fallback("geen Global Config gekoppeld");
    }
    const message = error instanceof Error ? error.message : String(error);
    return fallback(`leesfout (${message})`);
  }

  if (raw === undefined || raw === null) {
    return fallback(`item ${LEGACY_DOMAINS_ITEM} ontbreekt`);
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return fallback(`item ${LEGACY_DOMAINS_ITEM} is geen object`);
  }

  const value = (raw as Record<string, unknown>)[domain.domain];
  if (value === undefined) return fallback("geen waarde voor dit domein");
  if (!isLegacyMode(value)) return fallback("ongeldige waarde");
  return value;
}
