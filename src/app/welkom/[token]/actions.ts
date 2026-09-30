"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { postLoginTarget } from "@/lib/auth/role-landing";
import {
  welcomeLoginCore,
  type WelcomeLoginDeps,
  type WelcomeLoginResult,
} from "@/lib/checkout/welcome-login-core";

/**
 * POST van de knop "Inloggen" op /welkom/[token] (scherm 8). Alleen deze
 * action verbruikt het inlogtoken; de GET van de pagina doet dat nooit,
 * zodat mailscanners de link niet opmaken. Na succes redirect naar de
 * landing per rol. Bij een mislukking rendert de pagina scherm 9 met het
 * bestaande OTP-formulier; het e-mailadres reist mee via de action-state,
 * nooit via de URL.
 */
export async function loginWithWelcomeToken(
  loginToken: string,
): Promise<Exclude<WelcomeLoginResult, { ok: true }>> {
  // Niet achter de vlag (zie page.tsx): het token zelf is de poort.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { ok: false, reason: "login_failed", email: null };

  const admin = createAdminClient();
  const h = await headers();
  const clientIp = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
  // Verifiëren op een bare service-key-client met het IP van de bezoeker,
  // zoals verifyLoginOtp: zo landt de verify niet in de gedeelde emmer van
  // het Vercel-IP. De sessie gaat daarna via de SSR-client naar de cookies.
  const authClient = createBareClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(clientIp ? { global: { headers: { "Sb-Forwarded-For": clientIp } } } : {}),
  });
  const ssr = await createClient();

  const deps: WelcomeLoginDeps = {
    consume: async (token) => {
      const { data, error } = await admin.rpc("consume_checkout_login_token", {
        p_login_token: token,
      });
      if (error) {
        console.error("[welkom] consume rpc", error.code);
        return { ok: false, reason: "not_found" };
      }
      const r = data as { ok?: boolean; reason?: string; profile_id?: string; email?: string | null } | null;
      if (!r?.ok || !r.profile_id) {
        const reason = r?.reason;
        return {
          ok: false,
          reason:
            reason === "used" || reason === "expired" || reason === "not_converted"
              ? reason
              : "not_found",
        };
      }
      return { ok: true, profileId: r.profile_id, email: r.email ?? null };
    },
    generateMagicLink: async (email) => {
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      if (error || !data.properties?.hashed_token) {
        console.error("[welkom] generateLink", error?.code ?? "no_hashed_token");
        return null;
      }
      return { tokenHash: data.properties.hashed_token, type: "magiclink" };
    },
    verify: async ({ tokenHash, type }) => {
      const { data, error } = await authClient.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error || !data.session) {
        console.error("[welkom] verifyOtp", error?.code ?? "no_session");
        return { ok: false };
      }
      return {
        ok: true,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        userId: data.session.user.id,
      };
    },
    setSession: async ({ accessToken, refreshToken }) => {
      const { error } = await ssr.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) console.error("[welkom] setSession", error.code);
      return !error;
    },
    landing: (userId) => postLoginTarget(ssr, userId, undefined),
  };

  const result = await welcomeLoginCore(deps, loginToken);
  if (result.ok) redirect(result.redirectTo);
  return result;
}
