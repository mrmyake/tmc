import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MailerLiteError,
  listAllSubscribers,
  listGroupSubscribers,
  listGroups,
  type MailerLiteSubscriberStatus,
} from "@/lib/mailerlite";
import {
  HIDDEN_STATUSES,
  type SignupSource,
  type SignupStatus,
} from "@/lib/email-signups/status";

/**
 * Leesquery voor /app/admin/aanmeldingen (spec-admin-email-signups.md):
 * een rij per uniek e-mailadres, samengesteld uit MailerLite (groepen en
 * de volledige subscriberlijst, gecachet) en Supabase (leden met
 * marketing opt-in). Service-role en MailerLite-key blijven server-side.
 */

export const EMAIL_SIGNUPS_TAG = "email-signups";
const CACHE_SECONDS = 300;
const NEW_WINDOW_DAYS = 30;

// De statussen zijn een op een die van MailerLite; de labels en het type
// staan in een client-veilige module.
type _AssertSameStatuses = SignupStatus extends MailerLiteSubscriberStatus
  ? MailerLiteSubscriberStatus extends SignupStatus
    ? true
    : never
  : never;
const _statusesMatch: _AssertSameStatuses = true;
void _statusesMatch;

/** Bronnen zonder MailerLite-groep. */
export const SOURCE_NO_GROUP = "no_group";
export const SOURCE_MEMBER_OPT_IN = "member_opt_in";

// COPY: confirm met Marlon
const SPECIAL_SOURCE_LABEL: Record<string, string> = {
  [SOURCE_NO_GROUP]: "Zonder groep",
  [SOURCE_MEMBER_OPT_IN]: "Lid, marketing opt-in",
};

// COPY: confirm met Marlon
// Op groepsnaam, niet op id: de ids verschillen per omgeving (env) en de
// namen zijn wat Marlon in MailerLite ziet. Een onbekende groep toont de
// eigen MailerLite-naam.
const GROUP_LABEL_BY_NAME: Record<string, string> = {
  "Early Member Interested": "Blijf op de hoogte / Early Member",
  Members: "Leden",
  "Yoga Wachtlijst": "Yoga-wachtlijst",
  Intake: "12-weken-programma intake",
  Contact: "Contactformulier",
  Proefles: "Proefles terugbellen",
  "PDF Lead": "Beweeg Beter gids (oude funnel)",
  Overstap: "Overstap",
  "Crowdfunding Backer": "Crowdfunding",
  "Mobility Check": "Mobility Check (oude funnel)",
  "Mobility Reset": "Mobility Reset (oude funnel)",
};

export function groupLabel(name: string): string {
  return GROUP_LABEL_BY_NAME[name] ?? name;
}

export interface EmailSignupRow {
  email: string;
  name: string | null;
  sourceKeys: string[];
  sourceLabels: string[];
  /** Vroegste aanmelddatum over alle bronnen; null als geen enkele bron een datum heeft. */
  signedUpAt: string | null;
  status: SignupStatus;
}

export interface EmailSignupsFilters {
  q: string;
  /** Bronsleutel of "all". */
  source: string;
  /** Status of "all". */
  status: SignupStatus | "all";
  showHidden: boolean;
}

export interface EmailSignupsKpis {
  active: number;
  newLast30Days: number;
  unsubscribed: number;
}

export interface EmailSignupsResult {
  rows: EmailSignupRow[];
  /** Alle bronnen die in de data voorkomen, voor het bronfilter. */
  sources: SignupSource[];
  kpis: EmailSignupsKpis;
  /** Totaal voor de filters, ter vergelijking met rows.length. */
  total: number;
  /** Moment van de MailerLite-snapshot; null als MailerLite faalde. */
  fetchedAt: string | null;
  /** Melding voor de pagina als MailerLite niet bereikbaar was. */
  mailerliteError: string | null;
}

// ---------------------------------------------------------------------------
// MailerLite-snapshot (gecachet)
// ---------------------------------------------------------------------------

interface SnapshotRow {
  email: string;
  name: string | null;
  sourceKeys: string[];
  signedUpAt: string | null;
  status: SignupStatus;
}

interface MailerLiteSnapshot {
  fetchedAt: string;
  sources: SignupSource[];
  rows: SnapshotRow[];
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function composeName(fields: Record<string, string | null>): string | null {
  const first = (fields.name ?? "").trim();
  const last = (fields.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  return full ? full : null;
}

function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

/**
 * Alle groepen plus hun leden plus de volledige subscriberlijst, samengevoegd
 * per adres. Gooit MailerLiteError door; unstable_cache slaat een gegooide
 * fout niet op, dus de volgende aanvraag probeert het opnieuw.
 */
async function fetchMailerLiteSnapshot(): Promise<MailerLiteSnapshot> {
  const groups = await listGroups();
  const sources: SignupSource[] = groups.map((g) => ({ key: g.id, label: groupLabel(g.name) }));

  const byEmail = new Map<string, SnapshotRow>();
  const upsert = (
    email: string,
    name: string | null,
    status: SignupStatus,
    signedUpAt: string | null,
    sourceKey: string | null,
  ) => {
    const key = normalizeEmail(email);
    if (!key) return;
    const existing = byEmail.get(key);
    if (!existing) {
      byEmail.set(key, {
        email: key,
        name,
        sourceKeys: sourceKey ? [sourceKey] : [],
        signedUpAt,
        status,
      });
      return;
    }
    if (!existing.name && name) existing.name = name;
    existing.signedUpAt = earliest(existing.signedUpAt, signedUpAt);
    if (sourceKey && !existing.sourceKeys.includes(sourceKey)) existing.sourceKeys.push(sourceKey);
    // De status van de subscriber is per adres gelijk in alle groepen; de
    // volledige lijst is leidend en komt als laatste binnen.
    existing.status = status;
  };

  for (const g of groups) {
    const hasAny = Object.values(g.counts).some((n) => n > 0);
    if (!hasAny) continue;
    const members = await listGroupSubscribers(g.id, g.counts);
    for (const s of members) {
      upsert(s.email, composeName(s.fields), s.status, s.subscribedAt ?? s.createdAt, g.id);
    }
  }

  const all = await listAllSubscribers();
  for (const s of all) {
    upsert(s.email, composeName(s.fields), s.status, s.subscribedAt ?? s.createdAt, null);
  }
  for (const row of byEmail.values()) {
    if (row.sourceKeys.length === 0) row.sourceKeys.push(SOURCE_NO_GROUP);
  }
  if ([...byEmail.values()].some((r) => r.sourceKeys.includes(SOURCE_NO_GROUP))) {
    sources.push({ key: SOURCE_NO_GROUP, label: SPECIAL_SOURCE_LABEL[SOURCE_NO_GROUP] });
  }

  return {
    fetchedAt: new Date().toISOString(),
    sources,
    rows: [...byEmail.values()],
  };
}

// unstable_cache serialiseert via JSON; het resultaat is bewust plat
// (geen Map). Een gegooide fout wordt niet gecachet.
const getCachedMailerLiteSnapshot = unstable_cache(
  fetchMailerLiteSnapshot,
  ["email-signups-mailerlite"],
  { revalidate: CACHE_SECONDS, tags: [EMAIL_SIGNUPS_TAG] },
);

// ---------------------------------------------------------------------------
// Supabase: leden met marketing opt-in
// ---------------------------------------------------------------------------

interface MemberOptIn {
  email: string;
  name: string | null;
  signedUpAt: string | null;
}

async function fetchMemberOptIns(): Promise<MemberOptIn[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("email, first_name, last_name, first_touch_at, created_at, is_test")
    .eq("marketing_opt_in", true);
  if (error) {
    console.error("[email-signups-query] profiles failed", error);
    return [];
  }
  return ((data ?? []) as Array<{
    email: string;
    first_name: string | null;
    last_name: string | null;
    first_touch_at: string | null;
    created_at: string | null;
    is_test: boolean | null;
  }>)
    .filter((p) => p.is_test !== true)
    .map((p) => ({
      email: p.email,
      name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || null,
      signedUpAt: p.first_touch_at ?? p.created_at ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Samenvoegen, KPI's, filters
// ---------------------------------------------------------------------------

function matchesSearch(row: EmailSignupRow, term: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase();
  return row.email.includes(t) || (row.name ?? "").toLowerCase().includes(t);
}

export async function getEmailSignups(
  filters: EmailSignupsFilters,
  now: Date = new Date(),
): Promise<EmailSignupsResult> {
  let snapshot: MailerLiteSnapshot | null = null;
  let mailerliteError: string | null = null;
  try {
    snapshot = await getCachedMailerLiteSnapshot();
  } catch (e) {
    mailerliteError =
      e instanceof MailerLiteError
        ? e.message
        : // COPY: confirm met Marlon
          "MailerLite gaf een onverwachte fout.";
    console.error("[email-signups-query] mailerlite snapshot failed", e);
  }

  const byEmail = new Map<string, EmailSignupRow>();
  for (const r of snapshot?.rows ?? []) {
    byEmail.set(r.email, {
      email: r.email,
      name: r.name,
      sourceKeys: [...r.sourceKeys],
      sourceLabels: [],
      signedUpAt: r.signedUpAt,
      status: r.status,
    });
  }

  const members = await fetchMemberOptIns();
  for (const m of members) {
    const key = normalizeEmail(m.email);
    if (!key) continue;
    const existing = byEmail.get(key);
    if (existing) {
      if (!existing.sourceKeys.includes(SOURCE_MEMBER_OPT_IN)) {
        existing.sourceKeys.push(SOURCE_MEMBER_OPT_IN);
      }
      if (!existing.name && m.name) existing.name = m.name;
      existing.signedUpAt = earliest(existing.signedUpAt, m.signedUpAt);
    } else {
      byEmail.set(key, {
        email: key,
        name: m.name,
        sourceKeys: [SOURCE_MEMBER_OPT_IN],
        sourceLabels: [],
        signedUpAt: m.signedUpAt,
        status: "active",
      });
    }
  }

  const labelByKey = new Map<string, string>();
  for (const s of snapshot?.sources ?? []) labelByKey.set(s.key, s.label);
  for (const [k, v] of Object.entries(SPECIAL_SOURCE_LABEL)) labelByKey.set(k, v);

  const allRows = [...byEmail.values()];
  for (const row of allRows) {
    row.sourceLabels = row.sourceKeys.map((k) => labelByKey.get(k) ?? k);
  }

  const sources: SignupSource[] = [...(snapshot?.sources ?? [])];
  if (members.length > 0 && !sources.some((s) => s.key === SOURCE_MEMBER_OPT_IN)) {
    sources.push({ key: SOURCE_MEMBER_OPT_IN, label: SPECIAL_SOURCE_LABEL[SOURCE_MEMBER_OPT_IN] });
  }

  const windowStart = now.getTime() - NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const kpis: EmailSignupsKpis = { active: 0, newLast30Days: 0, unsubscribed: 0 };
  for (const row of allRows) {
    if (row.status === "active") {
      kpis.active += 1;
      if (row.signedUpAt && new Date(row.signedUpAt).getTime() >= windowStart) {
        kpis.newLast30Days += 1;
      }
    }
    if (row.status === "unsubscribed") kpis.unsubscribed += 1;
  }

  const term = filters.q.trim();
  const rows = allRows
    .filter((row) => {
      if (!filters.showHidden && filters.status === "all" && HIDDEN_STATUSES.includes(row.status)) {
        return false;
      }
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.source !== "all" && !row.sourceKeys.includes(filters.source)) return false;
      return matchesSearch(row, term);
    })
    .sort((a, b) => {
      const ta = a.signedUpAt ? new Date(a.signedUpAt).getTime() : -Infinity;
      const tb = b.signedUpAt ? new Date(b.signedUpAt).getTime() : -Infinity;
      if (tb !== ta) return tb - ta;
      return a.email.localeCompare(b.email);
    });

  return {
    rows,
    sources,
    kpis,
    total: allRows.length,
    fetchedAt: snapshot?.fetchedAt ?? null,
    mailerliteError,
  };
}
