import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { postLoginTarget } from "@/lib/auth/role-landing";

/**
 * Server-side afhandeling van een e-maillink met token_hash. Gebouwd voor
 * de trainer-invite (fix/trainer-invite-landing): inviteUserByEmail kent
 * geen PKCE, dus /auth/callback kan die link niet verwerken, en de
 * standaard {{ .ConfirmationURL }} zet de sessie in het URL-fragment
 * (implicit flow) op de Site URL, zonder rolbepaling. Met deze route zet
 * de Supabase-template "Invite user" de link op
 *
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
 *
 * De token gaat als query naar de server, verifyOtp zet de sessie in de
 * cookies via de SSR-client, en de landing komt uit de gedeelde helper
 * (trainer: /app/trainer/agenda). Geen tokens in de browser-URL.
 *
 * Alleen `invite` en `magiclink` worden geaccepteerd; beide leveren een
 * gewone sessie op zonder vervolgstap. `recovery` en `email_change` horen
 * hier bewust niet: die vragen een eigen vervolgscherm en dat bestaat niet
 * (wachtwoorden worden niet gebruikt, e-mailwijziging loopt via het
 * profiel).
 */
const ALLOWED_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>([
  "invite",
  "magiclink",
]);

function isAllowedType(value: string | null): value is EmailOtpType {
  return value !== null && ALLOWED_TYPES.has(value as EmailOtpType);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const nextParam = searchParams.get("next");

  if (!tokenHash || !isAllowedType(type)) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error || !data.user) {
    console.error("[auth/confirm] verifyOtp failed:", type, error);
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const target = await postLoginTarget(supabase, data.user.id, nextParam);
  return NextResponse.redirect(`${origin}${target}`);
}
