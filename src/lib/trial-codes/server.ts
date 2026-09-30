import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";

/**
 * Cookie tussen de codestap en het boeken (spec-community-growth.md §1
 * "Proefcodes"). Het cookie is httpOnly, secure (productie), sameSite=lax,
 * 30 minuten geldig en bewijst alleen dat deze browser recent een geldige
 * code heeft ingevoerd: het slaat de betaling nooit over. Dat beslist bij
 * het boeken uitsluitend tmc.redeem_trial_code onder de rijlocks.
 *
 * Het cookie bevat de genormaliseerde code plus een verlooptijd en een
 * HMAC-handtekening (sleutel: de service-role-sleutel, alleen server-side).
 * Zonder handtekening kan een bezoeker zelf een cookie met een gegokte code
 * zetten en de pagina als orakel gebruiken zonder dat de IP-teller meetelt.
 */

export const TRIAL_CODE_COOKIE = "tmc_trial_code";
const TTL_SECONDS = 30 * 60;

function secret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

function sign(code: string, expiresAt: number): string {
  return createHmac("sha256", secret()).update(`${code}.${expiresAt}`).digest("base64url");
}

export async function setTrialCodeCookie(code: string): Promise<boolean> {
  if (!secret()) return false;
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const store = await cookies();
  store.set(TRIAL_CODE_COOKIE, `${code}.${expiresAt}.${sign(code, expiresAt)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
  return true;
}

/** De code uit een echt, niet-verlopen cookie, anders null. */
export async function readTrialCodeCookie(): Promise<string | null> {
  if (!secret()) return null;
  const store = await cookies();
  const raw = store.get(TRIAL_CODE_COOKIE)?.value;
  if (!raw) return null;
  const [code, exp, sig] = raw.split(".");
  const expiresAt = Number(exp);
  if (!code || !sig || !Number.isFinite(expiresAt)) return null;
  if (expiresAt <= Math.floor(Date.now() / 1000)) return null;
  const expected = Buffer.from(sign(code, expiresAt));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return code;
}

export async function clearTrialCodeCookie(): Promise<void> {
  const store = await cookies();
  store.delete(TRIAL_CODE_COOKIE);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}
