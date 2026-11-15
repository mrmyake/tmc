-- Intake-aanvragen voor het 12 weken programma (/12-weken-programma/intake):
-- een rij per inzending, zodat Marlon zonder MailerLite ziet wie zich heeft
-- aangemeld en leads kan afvinken. Voorheen ging de aanvraag alleen naar
-- MailerLite en ntfy; er was geen brontabel en geen mail.
--
-- Schrijven uitsluitend via service_role (de route
-- /api/leads/programma-intake); de admin-cockpit leest en bewerkt ook via
-- service_role. De is_admin()-policies zijn een tweede slot, zoals bij
-- trial_requests. Geen insert-policy. Geen nieuwe functies (de bestaande
-- trigger-functie tmc.touch_updated_at wordt hergebruikt), dus README-regel 7
-- (expliciete function-grants) is hier niet van toepassing.
--
-- idempotency_key: de client stuurt per pagina-load een submissionId mee; een
-- dubbele inzending (dubbelklik, retry) botst op de unieke index en levert
-- geen tweede rij op.
--
-- lead_attributions.source_id wordt vanaf nu het id van een
-- programma_intakes-rij (geen FK, zoals bij de andere brontabellen). Alleen
-- de kolomcomment verandert; oude rijen met een willekeurige uuid bestaan
-- niet (er is er nooit een geschreven).
--
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 placeholder
-- onaangeroerd. Draaien met `supabase db push` na merge van de PR.

create table tmc.programma_intakes (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  preferred_day text not null,
  message text,
  signup_path text,
  gclid text,
  gbraid text,
  wbraid text,
  fbclid text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  landing_path text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'booked', 'lost')),
  notes text,
  contacted_at timestamptz,
  is_test boolean not null default false,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table tmc.programma_intakes is
  'Intake-aanvragen van /12-weken-programma/intake. Schrijven uitsluitend via service_role vanuit /api/leads/programma-intake; status, notes en contacted_at door admins in de cockpit (/app/admin/intakes).';
comment on column tmc.programma_intakes.phone is
  'E.164 (genormaliseerd met parsePhone); buitenlandse nummers toegestaan.';
comment on column tmc.programma_intakes.preferred_day is
  'Zoals het formulier het stuurt (maandag t/m zaterdag); bewust zonder constraint, een onverwachte waarde mag de aanvraag niet laten falen.';
comment on column tmc.programma_intakes.signup_path is
  'window.location.pathname van het formulier.';
comment on column tmc.programma_intakes.landing_path is
  'Landingspad uit de attributie (pad plus querystring van de eerste advertentielanding), alleen met minstens een advertentie- of campagneparameter.';
comment on column tmc.programma_intakes.contacted_at is
  'Tijdstip van de eerste overgang weg van status new; wordt door de admin-actie gezet en niet teruggezet.';
comment on column tmc.programma_intakes.is_test is
  'Testaanvraag; de admin-lijst verbergt die standaard. Wordt handmatig gezet, er is geen automatische herkenning op e-mailadres.';
comment on column tmc.programma_intakes.idempotency_key is
  'submissionId van de client (een uuid per pagina-load). Uniek; een dubbele inzending geeft geen tweede rij. Null voor handmatig toegevoegde rijen.';
comment on column tmc.programma_intakes.notes is
  'Interne notitie van de admin, niet zichtbaar voor de bezoeker.';

-- Bewust geen partiele index: een gewone unieke index laat meerdere NULL's toe
-- (rijen zonder sleutel) en is bruikbaar als ON CONFLICT-doel.
create unique index programma_intakes_idempotency_key_uidx
  on tmc.programma_intakes (idempotency_key);

create index programma_intakes_created_at_idx
  on tmc.programma_intakes (created_at desc);

create trigger programma_intakes_touch_updated_at
  before update on tmc.programma_intakes
  for each row execute function tmc.touch_updated_at();

-- Zelfde grant-model als trial_requests: uitsluitend service_role, plus RLS
-- met admin-policies als tweede laag. Geen insert-policy: de route schrijft
-- met de service-role client.
revoke all on table tmc.programma_intakes from public, anon, authenticated;
grant all on table tmc.programma_intakes to service_role;

alter table tmc.programma_intakes enable row level security;

create policy programma_intakes_admin_select on tmc.programma_intakes
  for select using (tmc.is_admin());

create policy programma_intakes_admin_update on tmc.programma_intakes
  for update using (tmc.is_admin()) with check (tmc.is_admin());

comment on column tmc.lead_attributions.source_type is
  'trial_booking (tmc.trial_bookings, alle drie de boekingspaden), trial_request (tmc.trial_requests, het terugbelformulier) of programma_intake (tmc.programma_intakes, intake 12 weken programma). source_id is het id van de bronrij. Geen FK.';

-- Zelfcontrole: geen enkele grant voor anon, authenticated of PUBLIC.
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'tmc' and table_name = 'programma_intakes'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'programma_intakes: onverwachte grant voor anon/authenticated/PUBLIC';
  end if;
end $$;
