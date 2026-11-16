-- Actiepagina's /actie/[slug] en bronmeting op de proefboeking
-- (spec-proefles-funnel.md, PR 2, besluiten B2, B3, B8 en B9).
--
-- Vier dingen in een migratie, omdat ze samen in een PR uitrollen:
--
-- 1. tmc.campaign_landings: een rij per actiepagina. De slug hangt aan een
--    proefcode (trial_code_id); de code zelf staat nergens in de site, alleen
--    deze koppeling kent hem. RLS aan zonder policies en alle rechten van
--    anon en authenticated ingetrokken: alleen de service role leest de
--    tabel, server-side.
--
-- 2. Foreign key van tmc.trial_bookings.action_page naar
--    campaign_landings(slug). De kolom bestaat sinds 20261116120000
--    (conversiemeting) en is nog door niets gevuld; de voorcontrole stopt de
--    migratie als dat toch zo is. Geen nieuwe kolom (B2).
--
-- 3. Seed van de vijf slugs, allemaal op dezelfde campagnecode (B3). De code
--    wordt opgezocht op naam. Hard falen als tmc.trial_codes rijen heeft maar
--    deze code ontbreekt; overslaan op een lege database, zodat de
--    shadow-replay van db diff blijft werken (README regel 6, B8). Andere
--    codes worden niet aangeraakt.
--
-- 4. tmc.redeem_trial_code krijgt een optionele parameter p_campaign_slug en
--    een pijler-whitelist op het les-pad (B9). Uitgangspunt is de live
--    definitie (pg_get_functiondef op 2026-11-16; prosrc byte-gelijk aan
--    20261026180000_trial_codes_shared_campaign.sql). Gewijzigd zijn alleen:
--    de drie nieuwe variabelen, de opzoeking van de slug na de codecheck, de
--    whitelist in plaats van de twee losse scope-checks, action_page in de
--    insert, in het event en in de return. Locks, volgorde, capaciteit,
--    een-per-persoon, het slot-pad en alle bestaande reasons zijn ongewijzigd.
--    Drop en create staan in dezelfde transactie als de rest van dit bestand
--    (de CLI voert een migratie als een transactie uit); de rechten worden
--    expliciet hersteld: alleen service_role, zoals live.
--
-- Uitrolvolgorde: eerst de app live, dan pas db push. De app roept de functie
-- aan met p_campaign_slug en valt terug op de oude signatuur zolang deze
-- migratie nog niet gepusht is (B10).

-- ---------------------------------------------------------------------------
-- 1. campaign_landings
-- ---------------------------------------------------------------------------

create table tmc.campaign_landings (
  -- Zelfde tekenbereik en lengte als de check op trial_bookings.action_page
  -- (^[a-z0-9-]{1,64}$), zodat elke slug daar ook past.
  slug text primary key
    check (slug ~ '^[a-z0-9-]+$' and length(slug) <= 64),
  trial_code_id uuid not null references tmc.trial_codes(id),
  source text not null
    check (source in ('google', 'meta', 'flyer', 'other')),
  -- null = alles (groepslessen en vrij trainen).
  pillar_filter text null
    check (pillar_filter in ('yoga_mobility', 'kettlebell', 'vrij_trainen')),
  active boolean not null default true,
  -- Laatste geldige kalenderdag (Europe/Amsterdam, inclusief); null = geen einde.
  valid_through date null,
  created_at timestamptz not null default now()
);

comment on table tmc.campaign_landings is
  'Actiepagina''s /actie/[slug] (spec-proefles-funnel.md): slug naar proefcode, bron en pijlerfilter. Alleen server-side lezen met de service role; de code staat nergens in de site.';
comment on column tmc.campaign_landings.pillar_filter is
  'Beperkt de roosterpreview en de boekingsstap tot een pijler; null = alles. Alleen weergave: tmc.redeem_trial_code beslist op de scope van de code.';

create index campaign_landings_trial_code_id_idx
  on tmc.campaign_landings (trial_code_id);

alter table tmc.campaign_landings enable row level security;

revoke all on table tmc.campaign_landings from public, anon, authenticated;
grant all on table tmc.campaign_landings to service_role;

-- ---------------------------------------------------------------------------
-- 2. action_page verwijst naar een bestaande actiepagina
-- ---------------------------------------------------------------------------

do $$
declare
  v_filled int;
begin
  select count(*) into v_filled
  from tmc.trial_bookings
  where action_page is not null;
  if v_filled > 0 then
    raise exception
      'trial_bookings.action_page is al gevuld (% rijen); controleer die waarden voordat de foreign key erop komt',
      v_filled;
  end if;
end;
$$;

alter table tmc.trial_bookings
  add constraint trial_bookings_action_page_fkey
  foreign key (action_page) references tmc.campaign_landings(slug)
  on update cascade;

comment on column tmc.trial_bookings.action_page is
  'Slug van de actiepagina waarlangs deze proefboeking binnenkwam (tmc.campaign_landings.slug), gevalideerd en geschreven door tmc.redeem_trial_code. Null bij een organische boeking. Gaat als action_page mee in het GA4-event trial_booked.';

-- ---------------------------------------------------------------------------
-- 3. Seed: vijf slugs op de campagnecode
-- ---------------------------------------------------------------------------

do $$
declare
  v_code constant text := 'MOVENOW';
  v_code_id uuid;
begin
  select id into v_code_id from tmc.trial_codes where code = v_code;

  if v_code_id is null then
    if exists (select 1 from tmc.trial_codes) then
      raise exception
        'campaign_landings seed: proefcode % ontbreekt in tmc.trial_codes', v_code;
    end if;
    -- Lege database (shadow-replay): codes worden in de admin aangemaakt en
    -- bestaan hier niet. Geen seed, geen fout.
    raise notice 'campaign_landings seed overgeslagen: tmc.trial_codes is leeg';
    return;
  end if;

  insert into tmc.campaign_landings (slug, trial_code_id, source, pillar_filter)
  values
    ('google-kettlebell', v_code_id, 'google', 'kettlebell'),
    ('google-yoga',       v_code_id, 'google', 'yoga_mobility'),
    ('google-merk',       v_code_id, 'google', null),
    ('meta-ig',           v_code_id, 'meta',   null),
    ('flyer-weekblad',    v_code_id, 'flyer',  null)
  on conflict (slug) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. redeem_trial_code: p_campaign_slug en de pijler-whitelist
-- ---------------------------------------------------------------------------

revoke all on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz) from public, anon, authenticated, service_role;
drop function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz);

create function tmc.redeem_trial_code(
  p_code text,
  p_session_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_is_test boolean default false,
  p_slot_start_at timestamptz default null,
  p_campaign_slug text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_code_norm text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(coalesce(p_phone, ''));
  v_is_test boolean := coalesce(p_is_test, false);
  v_tc tmc.trial_codes%rowtype;
  v_session tmc.class_sessions%rowtype;
  v_trial_id uuid;
  v_cancel_token uuid;
  v_redemption_id uuid;
  v_prior_free int;
  v_slot_end timestamptz;
  v_max int;
  v_peak int;
  v_blocked boolean;
  -- Slot-pad (vrij trainen) of les-pad: hangt bij scope all af van de pillar.
  v_is_vrij boolean;
  -- Actiepagina (spec-proefles-funnel.md): de slug zoals de app hem
  -- meegeeft, en de gevalideerde waarde die in action_page komt (of null).
  v_slug text := nullif(trim(coalesce(p_campaign_slug, '')), '');
  v_action_page text;
  -- Pillars waarvoor deze scope een les mag boeken (pijler-whitelist).
  v_allowed text[];
begin
  if v_code_norm = '' or v_name = '' or v_email = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_fields');
  end if;
  -- Zelfde grenzen als book_opening_trial: de app normaliseert het nummer
  -- met libphonenumber naar E.164, dit is de server-side grens. Het nummer
  -- gaat zo de een-per-persoon-regel en phone_e164 in.
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  -- Lock de code-rij: serialiseert gelijktijdig inwisselen, zodat
  -- uses_count nooit boven max_uses uitkomt en de een-per-persoon-check
  -- per code race-vrij is.
  select * into v_tc
  from tmc.trial_codes
  where code = v_code_norm
  for update;

  -- Bestaat niet, ingetrokken, op en verlopen krijgen dezelfde reason: de
  -- bezoeker mag niet kunnen afleiden welke codes bestaan. De einddatum is
  -- een Amsterdamse kalenderdag, inclusief, en geldt voor het moment van
  -- inwisselen.
  if not found
     or v_tc.revoked_at is not null
     or (v_tc.max_uses is not null and v_tc.uses_count >= v_tc.max_uses)
     or (v_tc.valid_through is not null
         and (now() at time zone 'Europe/Amsterdam')::date > v_tc.valid_through) then
    return jsonb_build_object('ok', false, 'reason', 'code_invalid');
  end if;

  -- Actiepagina: de slug telt alleen als hij bestaat, actief is, niet
  -- verlopen is (Amsterdamse kalenderdag, inclusief) en bij precies deze
  -- code hoort. Anders blijft action_page null; de boeking gaat gewoon door.
  -- De slug bepaalt hier nooit of de les gratis is: dat doet alleen de code.
  if v_slug is not null then
    select cl.slug into v_action_page
    from tmc.campaign_landings cl
    where cl.slug = v_slug
      and cl.active
      and cl.trial_code_id = v_tc.id
      and (cl.valid_through is null
           or (now() at time zone 'Europe/Amsterdam')::date <= cl.valid_through);
  end if;

  -- Serialiseer per persoon (zelfde sleutels als book_opening_trial): eerst
  -- e-mail, dan telefoon. Na de code-lock en voor de sessie-lock.
  perform pg_advisory_xact_lock(hashtext('opening_trial_email'), hashtext(v_email));
  perform pg_advisory_xact_lock(hashtext('opening_trial_phone'), hashtext(v_phone));

  -- Alleen nieuwe klanten: een profiel (zelfde is_test-modus) met dit adres
  -- of nummer dat een abonnement (status ongelijk aan pending) of een
  -- betaalde order heeft, of een proefles van welke bron ook die nog niet
  -- geannuleerd is (gepland, gehad of niet komen opdagen). Op tijd
  -- geannuleerd telt niet.
  if v_tc.new_customers_only then
    if exists (
      select 1
      from tmc.profiles p
      where coalesce(p.is_test, false) = v_is_test
        and (lower(trim(coalesce(p.email, ''))) = v_email or p.phone = v_phone)
        and (
          exists (
            select 1 from tmc.memberships m
            where m.profile_id = p.id and m.status <> 'pending'
          )
          or exists (
            select 1 from tmc.orders o
            where o.profile_id = p.id and o.status in ('paid', 'activated')
          )
        )
    ) or exists (
      select 1
      from tmc.trial_bookings tb
      where tb.is_test = v_is_test
        and (
          lower(trim(tb.email)) = v_email
          or tb.phone_e164 = v_phone
          or trim(tb.phone) = v_phone
        )
        and tb.status <> 'cancelled'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'already_customer');
    end if;
  end if;

  -- Een per persoon per code: een openstaande inwisseling van deze code op
  -- dit adres of dit nummer. Los van is_test, net als de unique indexen die
  -- dit als backstop afdwingen.
  if v_tc.one_per_person and exists (
    select 1 from tmc.trial_code_redemptions r
    where r.code_id = v_tc.id
      and r.released_at is null
      and (r.email_normalized = v_email or r.phone_e164 = v_phone)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_used_code');
  end if;

  -- Lock de sessie-rij: pint status en capaciteit vast en serialiseert met
  -- elke ledenboeking op dezelfde vrij-trainen-dag (book_class_session,
  -- enforce_vrij_trainen_slot nemen dezelfde lock).
  select * into v_session
  from tmc.class_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_scheduled');
  end if;

  -- Scope vrij_trainen volgt altijd het slot-pad (en eist daarin een
  -- vrij-trainen-sessie); scope all volgt het slot-pad alleen op een
  -- vrij-trainen-sessie en anders exact het les-pad.
  v_is_vrij := v_tc.scope = 'vrij_trainen'
    or (v_tc.scope = 'all' and v_session.pillar = 'vrij_trainen');

  if v_is_vrij then
    -- Een vrij-trainen-code geldt alleen voor een vrij-trainen-sessie.
    if v_session.pillar <> 'vrij_trainen' then
      return jsonb_build_object('ok', false, 'reason', 'scope_mismatch');
    end if;
    if p_slot_start_at is null then
      return jsonb_build_object('ok', false, 'reason', 'slot_required');
    end if;
    -- Vaste duur van 60 minuten en start op een kwartier, server-side.
    if extract(epoch from p_slot_start_at)::bigint % 900 <> 0 then
      return jsonb_build_object('ok', false, 'reason', 'slot_invalid');
    end if;
    v_slot_end := p_slot_start_at + interval '60 minutes';
    if p_slot_start_at <= now() then
      return jsonb_build_object('ok', false, 'reason', 'slot_in_past');
    end if;
    if p_slot_start_at < v_session.start_at or v_slot_end > v_session.end_at then
      return jsonb_build_object('ok', false, 'reason', 'slot_outside_session');
    end if;
    -- Alleen binnen de aanwezigheid van Marlon (tmc.trainer_presence_windows).
    if not tmc.vrij_trainen_trainer_present(p_slot_start_at, v_slot_end) then
      return jsonb_build_object('ok', false, 'reason', 'outside_presence');
    end if;
  else
    if p_slot_start_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'slot_not_allowed');
    end if;
    if v_session.start_at <= now() then
      return jsonb_build_object('ok', false, 'reason', 'session_in_past');
    end if;
    -- Pijler-whitelist op het les-pad: per scope precies de pillars die
    -- pillarsForScope in src/lib/trial-codes/scope.ts teruggeeft. LET OP:
    -- deze lijst en die functie moeten gelijk blijven; wijzig ze samen. Een
    -- groepscode boekt nooit vrij trainen, en een pillar die hier niet staat
    -- (ook een toekomstige) is met geen enkele code als les te boeken.
    -- Personal training staat niet in class_sessions en is dus nooit
    -- boekbaar via een code. De lijst in de UI is alleen weergave.
    v_allowed := case v_tc.scope
      when 'yoga_mobility' then array['yoga_mobility']
      when 'kettlebell' then array['kettlebell']
      when 'group' then array['yoga_mobility', 'kettlebell', 'kids', 'senior']
      when 'all' then array['yoga_mobility', 'kettlebell', 'kids', 'senior']
      else array[]::text[]
    end;
    if not (v_session.pillar = any (v_allowed)) then
      return jsonb_build_object('ok', false, 'reason', 'scope_mismatch');
    end if;
  end if;

  -- Een e-mailadres kan per les (bij vrij trainen: per dagsessie, dus ook
  -- nooit twee overlappende slots) maar een keer geboekt staan, betaald of
  -- gratis. Aparte reason: dit mag de bezoeker wel te horen krijgen.
  if exists (
    select 1 from tmc.trial_bookings tb
    where tb.session_id = p_session_id
      and lower(trim(tb.email)) = v_email
      and tb.status in ('pending', 'paid', 'attended')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'email_already_booked');
  end if;

  if v_is_vrij then
    -- Blokkerende les en het maximum tegelijk, onder de sessielock, via de
    -- enige telling. Een testboeking telt niet mee en wordt er niet op
    -- geweigerd.
    select coalesce(bs.vrij_trainen_max_concurrent, 5) into v_max
    from tmc.booking_settings bs limit 1;
    v_max := coalesce(v_max, 5);

    select p.peak, p.blocked into v_peak, v_blocked
    from tmc.vrij_trainen_slot_peak(p_session_id, p_slot_start_at, v_slot_end) p;

    if v_blocked then
      return jsonb_build_object('ok', false, 'reason', 'slot_blocked');
    end if;
    if not v_is_test and v_peak >= v_max then
      return jsonb_build_object('ok', false, 'reason', 'slot_full');
    end if;
  elsif v_session.capacity is not null
     and tmc.session_occupancy(p_session_id) >= v_session.capacity then
    -- Capaciteit onder de sessie-lock via tmc.session_occupancy(): dezelfde
    -- som als v_session_availability en de andere schrijf-gates.
    return jsonb_build_object('ok', false, 'reason', 'capacity_full');
  end if;

  -- Gratis en direct definitief: status 'paid', prijs 0, geen Mollie.
  -- is_test is een snapshot van de deployment-modus, zoals bij een
  -- betaalde proefles (trialBookingMode()). phone en phone_e164 beide E.164.
  insert into tmc.trial_bookings (
    session_id, name, email, phone, phone_e164,
    price_paid_cents, mollie_payment_id, status, trial_code_id, is_test,
    slot_start_at, slot_end_at, source, action_page
  ) values (
    p_session_id, v_name, v_email, v_phone, v_phone,
    0, null, 'paid', v_tc.id, v_is_test,
    p_slot_start_at, v_slot_end, 'code', v_action_page
  )
  returning id, cancel_token into v_trial_id, v_cancel_token;

  insert into tmc.trial_code_redemptions (
    code_id, trial_booking_id, session_id, email_normalized, phone_e164, one_per_person
  )
  values (v_tc.id, v_trial_id, p_session_id, v_email, v_phone, v_tc.one_per_person)
  returning id into v_redemption_id;

  update tmc.trial_codes
  set uses_count = uses_count + 1
  where id = v_tc.id;

  -- Eerdere gratis proeflessen van dit adres, via welke code dan ook,
  -- inclusief geannuleerde (released_at gezet). Basis voor de
  -- misbruikmelding in de app-laag; de boeking gaat gewoon door.
  select count(*) into v_prior_free
  from tmc.trial_code_redemptions r
  where r.email_normalized = v_email
    and r.id <> v_redemption_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.redeemed', 'visitor', null, 'trial_code', v_tc.id,
    jsonb_build_object(
      'code_id', v_tc.id,
      'trial_booking_id', v_trial_id,
      'session_id', p_session_id,
      'pillar', v_session.pillar,
      'scope', v_tc.scope,
      'action_page', v_action_page,
      'slot_start_at', p_slot_start_at,
      'slot_end_at', v_slot_end,
      'uses_count', v_tc.uses_count + 1,
      'max_uses', v_tc.max_uses,
      'prior_free_count', v_prior_free
    )
  );

  return jsonb_build_object(
    'ok', true,
    'trial_booking_id', v_trial_id,
    'cancel_token', v_cancel_token,
    'code_id', v_tc.id,
    'code', v_tc.code,
    'session_id', p_session_id,
    'session_start_at', v_session.start_at,
    'slot_start_at', p_slot_start_at,
    'slot_end_at', v_slot_end,
    'prior_free_count', v_prior_free,
    'action_page', v_action_page
  );
end;
$$;

revoke all on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz, text) from public, anon, authenticated;
grant execute on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz, text) to service_role;

comment on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz, text) is
  'Wisselt een proefcode in voor een gratis proefboeking (les of proefuur vrij trainen). p_campaign_slug: optionele slug van een actiepagina; alleen een actieve, niet verlopen slug die bij deze code hoort komt in trial_bookings.action_page. Alleen service_role.';

-- ---------------------------------------------------------------------------
-- 5. Zelfcontrole: precies een overload, SECURITY DEFINER, alleen service_role
-- ---------------------------------------------------------------------------

do $$
declare
  v_count int;
  v_oid oid;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tmc' and p.proname = 'redeem_trial_code';
  if v_count <> 1 then
    raise exception 'redeem_trial_code: verwacht 1 overload, gevonden %', v_count;
  end if;

  v_oid := 'tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz, text)'::regprocedure;

  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'redeem_trial_code is niet SECURITY DEFINER';
  end if;
  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'redeem_trial_code is uitvoerbaar voor anon of authenticated';
  end if;
  if not has_function_privilege('service_role', v_oid, 'execute') then
    raise exception 'redeem_trial_code is niet uitvoerbaar voor service_role';
  end if;

  if has_table_privilege('anon', 'tmc.campaign_landings', 'select')
     or has_table_privilege('authenticated', 'tmc.campaign_landings', 'select') then
    raise exception 'campaign_landings is leesbaar voor anon of authenticated';
  end if;
end;
$$;
