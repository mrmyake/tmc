import "server-only";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { isUsable, type UsableRow } from "@/lib/trial-codes/lookup";
import { isTrialCodeScope, type TrialCodeScope } from "@/lib/trial-codes/scope";
import { readActieCookie } from "./cookie";
import { isActiePillarFilter, isActieSlug, type ActiePillarFilter } from "./core";

/**
 * Slug naar actiepagina en code (spec-proefles-funnel.md). Alleen server-side,
 * met de service role: tmc.campaign_landings heeft RLS zonder policies.
 *
 * LET OP: `code` in het resultaat is de proefcode zelf. Die mag deze module
 * alleen verlaten richting tmc.redeem_trial_code (de boekingsactie). Nooit
 * als prop naar een client-component, nooit in een URL, cookie, header of
 * log. Pagina's gebruiken slug, source, pillarFilter en codeScope.
 */
export interface CampaignLanding {
  slug: string;
  source: string;
  pillarFilter: ActiePillarFilter | null;
  /** Scope van de gekoppelde code, voor de weergave van de boekingsstap. */
  codeScope: TrialCodeScope;
  /** De proefcode. Alleen voor de RPC; zie de waarschuwing hierboven. */
  code: string;
}

type LandingRow = {
  slug: string;
  source: string;
  pillar_filter: string | null;
  active: boolean;
  valid_through: string | null;
  trial_code: (UsableRow & { code: string }) | (UsableRow & { code: string })[] | null;
};

/** Vandaag als YYYY-MM-DD in Europe/Amsterdam; dezelfde kalenderdag als de RPC gebruikt. */
function amsterdamToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

/**
 * De actiepagina bij een slug, alleen als alles nu klopt: de slug bestaat, is
 * actief en niet verlopen, en de gekoppelde code is bruikbaar (niet
 * ingetrokken, niet op, niet verlopen; dezelfde voorwaarden als
 * tmc.redeem_trial_code). Anders null: de aanroeper stuurt door naar
 * /proefles. Een momentopname voor de weergave; de RPC beslist opnieuw.
 *
 * Ook null zolang de migratie nog niet gepusht is (de tabel bestaat dan niet):
 * de actiepagina's sturen tot die tijd gewoon door naar /proefles.
 */
export async function lookupCampaignLanding(slug: string): Promise<CampaignLanding | null> {
  if (!isActieSlug(slug) || !isAdminConfigured()) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campaign_landings")
    .select(
      "slug, source, pillar_filter, active, valid_through, trial_code:trial_codes(code, revoked_at, max_uses, uses_count, scope, valid_through)",
    )
    .eq("slug", slug)
    .maybeSingle<LandingRow>();
  if (error) {
    console.error("[actie/lookup] query failed", error.code, error.message);
    return null;
  }
  if (!data || !data.active) return null;
  if (data.valid_through !== null && data.valid_through < amsterdamToday()) return null;

  const code = Array.isArray(data.trial_code) ? (data.trial_code[0] ?? null) : data.trial_code;
  if (!isUsable(code) || !isTrialCodeScope(code.scope) || !code.code) return null;

  return {
    slug: data.slug,
    source: data.source,
    pillarFilter: isActiePillarFilter(data.pillar_filter) ? data.pillar_filter : null,
    codeScope: code.scope,
    code: code.code,
  };
}

/**
 * De actiepagina van deze bezoeker: de slug uit het ondertekende cookie
 * tmc_actie, bij elk gebruik opnieuw opgezocht en gevalideerd. Null zonder
 * (geldig) cookie of als de slug of de code intussen niet meer bruikbaar is.
 */
export async function readActieLanding(): Promise<CampaignLanding | null> {
  const slug = await readActieCookie();
  return slug ? lookupCampaignLanding(slug) : null;
}
