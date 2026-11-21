import { PROGRAMMA_INTAKE_DAYS, parseProgrammaIntake } from "@/lib/programma-intake/validate";
import type { ProgrammaIntakeInput } from "@/lib/programma-intake/validate";
import { sanitizeLandingPath } from "@/lib/attribution/params";
import { HP_SECTION_PATH } from "./slugs";

/**
 * Validatie van het kennismakingsformulier (POST /api/leads/hormoonprofiel).
 * Puur, zonder server-only of netwerk. De velden naam, e-mail en telefoon
 * volgen exact de regels van de 12 weken-intake (E.164, buitenlandse nummers
 * toegestaan); dit bestand hergebruikt die validatie in plaats van haar te
 * kopieren. Zie spec-hormoonprofiel.md.
 */

/** signup_path in tmc.programma_intakes, in beide modi gelijk. */
export const HP_SIGNUP_PATH = HP_SECTION_PATH;
/** preferred_day is not null in de tabel; het formulier kent geen dag. */
export const HP_PREFERRED_DAY = "geen voorkeur";
/** Minimale invultijd in milliseconden. */
export const MIN_FILL_MS = 3000;

export type HpVariant = "standalone" | "section";

export interface HpIntakeInput extends ProgrammaIntakeInput {
  variant: HpVariant;
}

export type HpIntakeParse =
  | { ok: true; value: HpIntakeInput }
  /** Honeypot gevuld of te snel ingevuld: stil weggooien, geen foutmelding. */
  | { ok: false; reason: "spam" }
  | { ok: false; reason: "missing" | "invalid"; field: string };

export function parseHormoonprofielIntake(raw: unknown): HpIntakeParse {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid", field: "body" };
  const data = raw as Record<string, unknown>;

  // Spam eerst: een bot krijgt geen informatie over de validatie.
  const honeypot = typeof data.website === "string" ? data.website.trim() : "";
  if (honeypot) return { ok: false, reason: "spam" };
  const elapsed = data.elapsedMs;
  if (typeof elapsed !== "number" || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
    return { ok: false, reason: "spam" };
  }

  const variant = data.variant;
  if (variant !== "standalone" && variant !== "section") {
    return { ok: false, reason: "invalid", field: "variant" };
  }

  // Het formulier kent geen voorkeursdag. De gedeelde validatie eist er een
  // uit de lijst; de echte waarde wordt hieronder vervangen.
  const shared = parseProgrammaIntake({
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    message: data.message,
    day: PROGRAMMA_INTAKE_DAYS[0],
    signupPath: HP_SIGNUP_PATH,
    submissionId: data.submissionId,
  });
  if (!shared.ok) return { ok: false, reason: shared.reason, field: shared.field };

  return {
    ok: true,
    value: { ...shared.value, day: HP_PREFERRED_DAY, signupPath: HP_SIGNUP_PATH, variant },
  };
}

/**
 * Het landingspad dat in de rij komt: de host en de modus waarop het
 * formulier is verstuurd, en (als er een advertentielanding is) die landing
 * als `lp`. Altijd een geldig landingspad (sanitizeLandingPath), anders de
 * kale sectie.
 */
export function buildLandingPath(
  host: string,
  variant: HpVariant,
  adLandingPath?: string | null,
): string {
  const safeHost = /^[a-z0-9.-]+(:\d+)?$/.test(host.toLowerCase()) ? host.toLowerCase() : "onbekend";
  let path = `${HP_SIGNUP_PATH}?host=${safeHost}&mode=${variant}`;
  if (adLandingPath) path += `&lp=${encodeURIComponent(adLandingPath)}`;
  return sanitizeLandingPath(path) ?? HP_SIGNUP_PATH;
}
