/**
 * Timeouts op alle uitgaande clients (3a-bis, webhook-betrouwbaarheid).
 *
 * Tot deze wijziging hadden MailerSend, de Akiles-fetch, de Mollie-client
 * en supabase-js geen timeout: één hangende dienst maakte op eigen kracht
 * Mollie's vijftien seconden vol, en met after() op de webhook zou hij de
 * maxDuration volmaken. Elke waarde hieronder is gekozen op de gemeten
 * latentie uit PR #194 (curl, vijf runs, vanaf de EU) met ruime marge:
 *
 *  - Supabase REST: 0,15 tot 0,27 s per call, zware RPC's tot ongeveer 1 s
 *    en gepagineerde cron-selects tot 2 s. 8 s is vier keer de zwaarste
 *    normale call.
 *  - Mollie API: 0,09 tot 0,12 s netwerk; payments.create en
 *    customerSubscriptions.create doen aan Mollie-kant bankwerk en zitten
 *    in de praktijk onder 2 s. 8 s.
 *  - MailerSend: 0,12 tot 0,17 s netwerk, plus acceptatie en het renderen
 *    van de mail aan onze kant. 10 s; de mail staat sinds 3a-bis achter de
 *    respons en drukt dus niet meer op Mollie's venster.
 *  - Akiles: 0,09 tot 0,40 s per call, maar de sync doet er tot twaalf op
 *    rij. 4 s per call houdt een volledig dode Akiles op maximaal 48 s,
 *    binnen de maxDuration van 60 s van de webhook; Akiles is de laatste
 *    stap in de naloop, dus alles ervoor is dan al gebeurd.
 *  - ntfy (5 s) en GA4 (5 s) hadden al een timeout, zie ntfy.ts en
 *    ga-purchase.ts; die staan hier ter volledigheid.
 *
 * Contract, zelfde als de ntfy-timeout uit PR #193: een timeout wordt een
 * gewone fout van die dienst, die op precies dezelfde plek gevangen wordt
 * als elke andere fout van die dienst. Nooit een nieuwe throw richting een
 * caller die dat niet verwacht. Hoe dat per client werkt staat bij de
 * client zelf (supabase/admin.ts en server.ts, mollie.ts, email.ts,
 * akiles.ts).
 *
 * Supabase, twee dingen om te weten (3a-bis, geverifieerd tegen live):
 *
 *  1. Een client-side abort annuleert de query niet aan de databasekant.
 *     Postgres werkt door tot zijn eigen statement_timeout, en die is voor
 *     al het PostgREST-verkeer 8 s: de rol `authenticator` heeft
 *     `statement_timeout=8s` (pg_roles.rolconfig) en `service_role` heeft
 *     geen eigen waarde en erft die (Supabase-docs "Timeouts", role level).
 *     Beide grenzen zijn dus 8 s, maar de client telt vanaf het verzoek
 *     (inclusief netwerk) en de server vanaf de start van het statement.
 *     Een statement dat 7,8 tot 8,0 s rekent kan client-side afgebroken
 *     zijn en server-side alsnog committen. Voor het betaalpad is dat
 *     ongevaarlijk: activate_order is idempotent onder een rijlock, de
 *     webhook antwoordt 500 en de retry ziet already_activated. Voor
 *     refresh_admin_kpis betekent het dat een "mislukte" refresh geslaagd
 *     kan zijn; het gevolg is alleen een 500 in de cron-log, geen verkeerde
 *     vervolgactie (er hangt niets aan het resultaat).
 *  2. Er is vandaag geen enkele Supabase-call die legitiem boven 8 s komt.
 *     pg_stat_statements sinds 2026-04-06: het zwaarste PostgREST-statement
 *     is refresh_admin_kpis met een maximum van 34 ms (42 aanroepen);
 *     process_due_membership_pauses 20 ms; niets anders boven 40 ms. De
 *     crons doen per rij losse, korte calls, geen enkele lange. Een
 *     per-call override is daarom niet aangebracht. Wordt hij ooit nodig,
 *     dan is het patroon `.abortSignal(AbortSignal.timeout(ms))` op die
 *     ene query (fetchWithTimeout respecteert een eigen signal), EN een
 *     `set statement_timeout` op functieniveau voor die RPC, want zonder
 *     dat tweede kapt de server hem op 8 s af hoe ruim de client ook is.
 */
export const SUPABASE_TIMEOUT_MS = 8_000;
export const MOLLIE_TIMEOUT_MS = 8_000;
export const MAILERSEND_TIMEOUT_MS = 10_000;
export const AKILES_TIMEOUT_MS = 4_000;
export const NTFY_TIMEOUT_MS = 5_000;
export const GA4_TIMEOUT_MS = 5_000;

/**
 * Fout die withTimeout() oplevert. `code` is bewust "ETIMEDOUT": de
 * classificatie in activation-failure.ts ziet een string-code die geen
 * SQLSTATE en geen PGRST-code is als transiënt, precies wat een timeout
 * hoort te zijn.
 */
export class OutboundTimeoutError extends Error {
  readonly code = "ETIMEDOUT";
  readonly timeoutMs: number;
  readonly label: string;

  constructor(label: string, timeoutMs: number) {
    super(`${label}: geen antwoord binnen ${timeoutMs} ms`);
    this.name = "OutboundTimeoutError";
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Race tegen een timer. Wint de timer, dan rejected de promise met een
 * OutboundTimeoutError; het onderliggende verzoek loopt door (er is niets
 * om af te breken) maar het antwoord wordt genegeerd. Voor clients die zelf
 * geen AbortSignal accepteren (Mollie via node-fetch, MailerSend via
 * gaxios). De timer wordt altijd opgeruimd.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OutboundTimeoutError(label, timeoutMs)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * fetch met een AbortSignal.timeout per verzoek, tenzij de aanroeper zelf
 * al een signal meegeeft (supabase-js .abortSignal()). Voor supabase-js:
 * een afgebroken verzoek komt daar terug als { error } met een lege code
 * (PostgrestBuilder), dus als transiënte fout, nooit als throw.
 */
export function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    });
}
