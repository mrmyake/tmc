-- First-party attributie van proefles-leads (spec-marketing-attribution.md).
--
-- Een rij per geslaagde proefboeking of terugbelaanvraag die met
-- advertentie- of campagneparameters in de URL is binnengekomen: Google Ads
-- (gclid, gbraid, wbraid), Meta (fbclid) en de vijf utm-velden, plus het pad
-- met querystring van de eerste /proefles-pagina (landing_path) en de keuze
-- voor analytische cookies uit de cookiebanner op het moment van inzenden
-- (analytics_consent). Dat is uitdrukkelijk geen advertentietoestemming: een
-- upload naar Google Ads of Meta mag pas als de banner een advertentiecategorie
-- heeft en er een aparte kolom ad_consent bestaat; analytics_consent is nooit
-- een bron voor ad_user_data of ad_personalization.
--
-- Ontwerpbesluiten:
-- - Geen tags, pixels, cookies of web storage: de app leest de parameters
--   alleen uit de URL, draagt ze mee in interne links en redirects binnen
--   /proefles/* en schrijft ze server-side via service_role zodra de boeking of
--   aanvraag geslaagd is. Een mislukte attributie-insert laat een boeking of
--   aanvraag nooit falen (de app logt en gaat door).
-- - source_type plus source_id verwijst naar tmc.trial_bookings of
--   tmc.trial_requests; bewust geen foreign key (twee brontabellen). Uniek per
--   bron, zodat een dubbele aanroep nooit twee rijen oplevert (de app schrijft
--   met on conflict do nothing).
-- - Alleen een rij als er minstens een advertentie- of campagneparameter is
--   (check-constraint als backstop voor de app-regel).
-- - landing_path begint met / (de app weert protocol en host); een ongeldige
--   waarde wordt door de app weggelaten, niet geweigerd.
-- - E-mail lowercase, de brug naar tmc.profiles.email voor latere analyse.
-- - Grants uitsluitend service_role; RLS met een is_admin()-leespolicy als
--   tweede slot (patroon trial_requests). Geen nieuwe functies, dus de event
--   trigger tmc_new_function_default_privileges speelt geen rol.
--
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 placeholder
-- onaangeroerd. Geen afhankelijkheid van app-data. Draaien met
-- `supabase db push` na merge van de PR.

create table tmc.lead_attributions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_type text not null
    check (source_type in ('trial_booking', 'trial_request')),
  source_id uuid not null,
  email text not null
    check (email = lower(email) and char_length(email) <= 254),
  gclid text check (char_length(gclid) <= 512),
  gbraid text check (char_length(gbraid) <= 512),
  wbraid text check (char_length(wbraid) <= 512),
  fbclid text check (char_length(fbclid) <= 512),
  utm_source text check (char_length(utm_source) <= 512),
  utm_medium text check (char_length(utm_medium) <= 512),
  utm_campaign text check (char_length(utm_campaign) <= 512),
  utm_term text check (char_length(utm_term) <= 512),
  utm_content text check (char_length(utm_content) <= 512),
  landing_path text
    check (landing_path like '/%' and char_length(landing_path) <= 2048),
  analytics_consent text not null default 'unknown'
    check (analytics_consent in ('granted', 'denied', 'unknown')),
  constraint lead_attributions_any_param_check check (
    coalesce(
      gclid, gbraid, wbraid, fbclid,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content
    ) is not null
  )
);

comment on table tmc.lead_attributions is
  'First-party attributie per proefles-lead (trial_booking of trial_request): klik-ID''s van Google Ads en Meta, utm-velden, landingspad en de cookiebannerkeuze bij inzending. Alleen gevuld als er minstens een parameter was. Schrijven uitsluitend via service_role na een geslaagde boeking of aanvraag; nooit blokkerend. Zie spec-marketing-attribution.md.';
comment on column tmc.lead_attributions.source_type is
  'trial_booking (tmc.trial_bookings, alle drie de boekingspaden) of trial_request (tmc.trial_requests, het terugbelformulier). Geen FK: twee brontabellen.';
comment on column tmc.lead_attributions.source_id is
  'Id van de rij in de brontabel. Uniek samen met source_type.';
comment on column tmc.lead_attributions.email is
  'E-mailadres van de lead, lowercase; de brug naar tmc.profiles.email bij een latere analyse.';
comment on column tmc.lead_attributions.landing_path is
  'Pad plus querystring van de eerste /proefles-pagina in dit bezoek, zoals de app het via de parameter lp heeft meegedragen (begint met /, max 2048). Null als de parameter ontbrak of ongeldig was.';
comment on column tmc.lead_attributions.analytics_consent is
  'Keuze voor analytische cookies uit de cookiebanner op het moment van inzenden: granted, denied of unknown (geen keuze). Geen advertentietoestemming en nooit een bron voor ad_user_data of ad_personalization; een upload naar Google Ads of Meta vraagt een advertentiecategorie in de banner en een aparte kolom ad_consent.';

create unique index lead_attributions_source_uidx
  on tmc.lead_attributions (source_type, source_id);

create index lead_attributions_email_idx
  on tmc.lead_attributions (lower(email));

create index lead_attributions_created_at_idx
  on tmc.lead_attributions (created_at desc);

-- Zelfde grant-model als trial_requests: uitsluitend service_role, plus RLS
-- met een admin-leespolicy als tweede laag. Geen insert-policy: de app
-- schrijft met de service-role client.
revoke all on table tmc.lead_attributions from public, anon, authenticated;
grant all on table tmc.lead_attributions to service_role;

alter table tmc.lead_attributions enable row level security;

create policy lead_attributions_admin_select on tmc.lead_attributions
  for select using (tmc.is_admin());

-- Zelfcontrole: geen enkele grant voor anon, authenticated of PUBLIC.
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'tmc' and table_name = 'lead_attributions'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'lead_attributions: onverwachte grant voor anon/authenticated/PUBLIC';
  end if;
end $$;
