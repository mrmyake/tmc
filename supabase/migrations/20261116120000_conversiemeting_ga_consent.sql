-- Conversiemeting (spec-conversiemeting.md): opslag voor de server-side
-- GA4-events trial_booked en purchase (Measurement Protocol).
--
-- tmc.trial_bookings krijgt de GA4 client_id en session_id van de sessie
-- waarin de proefles geboekt is, de advertentiekeuze uit de cookiebanner op
-- dat moment (ad_consent) en een optionele action_page. tmc.orders krijgt
-- alleen ad_consent; ga_client_id en ga_session_id staan daar al sinds
-- 20260816000000.
--
-- De app schrijft al deze kolommen met losse service-role-updates NA de
-- insert of RPC, nooit in de insert of RPC zelf, en leest ad_consent met een
-- eigen select. Daardoor werkt de code ook voordat deze migratie gepusht is:
-- een mislukte update of select wordt alleen gelogd. Geen wijziging aan
-- redeem_trial_code, book_opening_trial, create_order of prijzen; geen
-- functies, geen policies.
--
-- Grants en RLS volgen het bestaande patroon van ga_client_id op tmc.orders
-- (20260816000000): niets extra. tmc.orders heeft SELECT op tabelniveau voor
-- authenticated achter orders_self_read en orders_admin_all, dus een lid kan
-- zijn eigen ad_consent lezen, net als zijn eigen ga_client_id.
-- tmc.trial_bookings is uitsluitend service_role; de zelfcontrole onderaan
-- bewaakt dat.

alter table tmc.trial_bookings
  add column if not exists ga_client_id text,
  add column if not exists ga_session_id text,
  add column if not exists ad_consent text not null default 'unknown',
  add column if not exists action_page text;

alter table tmc.orders
  add column if not exists ad_consent text not null default 'unknown';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'trial_bookings_ad_consent_check'
      and conrelid = 'tmc.trial_bookings'::regclass
  ) then
    alter table tmc.trial_bookings
      add constraint trial_bookings_ad_consent_check
      check (ad_consent in ('granted', 'denied', 'unknown'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'trial_bookings_action_page_check'
      and conrelid = 'tmc.trial_bookings'::regclass
  ) then
    alter table tmc.trial_bookings
      add constraint trial_bookings_action_page_check
      check (action_page is null or action_page ~ '^[a-z0-9-]{1,64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_ad_consent_check'
      and conrelid = 'tmc.orders'::regclass
  ) then
    alter table tmc.orders
      add constraint orders_ad_consent_check
      check (ad_consent in ('granted', 'denied', 'unknown'));
  end if;
end
$$;

comment on column tmc.trial_bookings.ga_client_id is
  'GA4 client_id van de sessie waarin de proefles geboekt is (gtag get of _ga-cookie). NULL zonder analytische toestemming. Gezet met een losse update na de insert of RPC; gelezen door sendTrialBookedToGa4.';

comment on column tmc.trial_bookings.ga_session_id is
  'GA4 session_id behorend bij ga_client_id; gaat als eventparameter mee op het Measurement Protocol-event trial_booked.';

comment on column tmc.trial_bookings.ad_consent is
  'Advertentiekeuze uit de cookiebanner op het moment van boeken: granted, denied of unknown (geen keuze, of een keuze in het oude formaat). Bepaalt ad_user_data op trial_booked; unknown telt als denied. Geen analytische toestemming: die staat in lead_attributions.analytics_consent.';

comment on column tmc.trial_bookings.action_page is
  'Slug van de actiepagina uit de proefles-funnel (/actie/[slug]). NULL zolang er geen actiepagina was. Nog door geen enkele code gevuld: de funnel-PR draagt de slug server-side tot aan de boeking en schrijft hem hier.';

comment on column tmc.orders.ad_consent is
  'Advertentiekeuze uit de cookiebanner op het moment van de checkout op de publieke site: granted, denied of unknown. Bepaalt ad_user_data op het Measurement Protocol-event purchase; unknown telt als denied. Gezet met een eigen losse update na create_order().';

-- Zelfcontrole: tmc.trial_bookings blijft uitsluitend service_role.
do $$
begin
  if has_table_privilege('anon', 'tmc.trial_bookings', 'select')
     or has_table_privilege('authenticated', 'tmc.trial_bookings', 'select')
     or has_any_column_privilege('anon', 'tmc.trial_bookings', 'select, insert, update')
     or has_any_column_privilege('authenticated', 'tmc.trial_bookings', 'select, insert, update')
     or has_any_column_privilege('anon', 'tmc.orders', 'select, insert, update') then
    raise exception 'conversiemeting: onverwachte rechten voor anon of authenticated';
  end if;
end
$$;
