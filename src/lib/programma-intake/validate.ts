import { parsePhone } from "@/lib/phone-parse";

/**
 * Server-side validatie van de intake-inzending (/api/leads/programma-intake).
 * Puur: geen server-only, geen netwerk, zodat de route en de tests dezelfde
 * regels delen. Het formulier eist al dat firstName, lastName, email, phone en
 * day gevuld zijn; hier wordt dat afgedwongen en worden de waarden
 * genormaliseerd (telefoon naar E.164, buitenlandse nummers toegestaan).
 */

export const PROGRAMMA_INTAKE_DAYS = [
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
] as const;

export const MAX_LENGTH = {
  firstName: 80,
  lastName: 80,
  email: 254,
  phone: 40,
  message: 2000,
  signupPath: 512,
} as const;

// Zelfde eenvoudige formaatcheck als /api/proefles: iets@iets.iets, geen whitespace.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProgrammaIntakeInput {
  firstName: string;
  lastName: string;
  email: string;
  /** E.164. */
  phone: string;
  day: string;
  message: string | null;
  signupPath: string | null;
  /** uuid van de client, of null; de route valt dan terug op een eigen uuid. */
  submissionId: string | null;
}

export type ProgrammaIntakeParse =
  | { ok: true; value: ProgrammaIntakeInput }
  | { ok: false; field: string; reason: "missing" | "invalid" };

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseProgrammaIntake(raw: unknown): ProgrammaIntakeParse {
  if (!raw || typeof raw !== "object") return { ok: false, field: "body", reason: "invalid" };
  const data = raw as Record<string, unknown>;

  const required = (key: "firstName" | "lastName" | "email" | "phone" | "day") => {
    const value = text(data[key]);
    return value;
  };

  const firstName = required("firstName");
  if (!firstName) return { ok: false, field: "firstName", reason: "missing" };
  if (firstName.length > MAX_LENGTH.firstName) return { ok: false, field: "firstName", reason: "invalid" };

  const lastName = required("lastName");
  if (!lastName) return { ok: false, field: "lastName", reason: "missing" };
  if (lastName.length > MAX_LENGTH.lastName) return { ok: false, field: "lastName", reason: "invalid" };

  const emailRaw = required("email");
  if (!emailRaw) return { ok: false, field: "email", reason: "missing" };
  const email = emailRaw.toLowerCase();
  if (email.length > MAX_LENGTH.email || !EMAIL_RE.test(email)) {
    return { ok: false, field: "email", reason: "invalid" };
  }

  const phoneRaw = required("phone");
  if (!phoneRaw) return { ok: false, field: "phone", reason: "missing" };
  if (phoneRaw.length > MAX_LENGTH.phone) return { ok: false, field: "phone", reason: "invalid" };
  const phone = parsePhone(phoneRaw);
  if (!phone.ok) return { ok: false, field: "phone", reason: "invalid" };

  const dayRaw = required("day");
  if (!dayRaw) return { ok: false, field: "day", reason: "missing" };
  const day = dayRaw.toLowerCase();
  if (!(PROGRAMMA_INTAKE_DAYS as readonly string[]).includes(day)) {
    return { ok: false, field: "day", reason: "invalid" };
  }

  const message = text(data.message);
  if (message && message.length > MAX_LENGTH.message) {
    return { ok: false, field: "message", reason: "invalid" };
  }

  // signupPath is metadata, geen invoer waar de aanvraag aan hangt: een
  // ongeldige waarde valt weg in plaats van te weigeren.
  const signup = text(data.signupPath);
  const signupPath =
    signup && signup.length <= MAX_LENGTH.signupPath && signup.startsWith("/") && !/\s/.test(signup)
      ? signup
      : null;

  const submission = text(data.submissionId);
  const submissionId = submission && UUID_RE.test(submission) ? submission.toLowerCase() : null;

  return {
    ok: true,
    value: {
      firstName,
      lastName,
      email,
      phone: phone.e164,
      day,
      message,
      signupPath,
      submissionId,
    },
  };
}
