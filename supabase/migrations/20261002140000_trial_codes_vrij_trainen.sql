-- Proefcodes met scope vrij_trainen (spec-community-growth.md §1 "Proefcodes",
-- spec-vrij-trainen-slots.md; PR 2 van twee, na 20261002130000).
--
-- Een code met scope vrij_trainen geeft een bezoeker zonder account een gratis
-- uur vrij trainen: precies 60 minuten, starttijd op een kwartier, volledig
-- binnen de aanwezigheid van Marlon, en meetellend voor het maximum van
-- vrij_trainen_max_concurrent (5) tegelijk onder dezelfde FOR UPDATE-lock op de
-- class_sessions-rij van die dag als ledenboekingen. Geen Akiles, geen magic
-- link, geen pincode. Alleen via een code: een betaalde proefboeking op vrij
-- trainen blijft onmogelijk.
--
-- Ontwerpbesluiten:
-- - De boeking blijft een tmc.trial_bookings-rij, nu met slot_start_at en
--   slot_end_at (beide of geen, kwartier, precies 60 minuten).
-- - tmc.vrij_trainen_slot_peak blijft de enige telling en telt nu ook
--   trial_bookings (pending, paid, attended; is_test telt niet mee, zoals
--   session_occupancy). De boek-RPC (booking_gate), de trigger
--   bookings_enforce_vrij_trainen_slot en vrij_trainen_availability gebruiken
--   hem al en tellen de proefbezoeker dus automatisch mee.
-- - Aanwezigheid van Marlon staat in tmc.trainer_presence_windows (weekday in
--   de conventie van extract(dow) in Amsterdamse tijd, 0 = zondag). De RPC
--   (tmc.vrij_trainen_trainer_present), de trigger en de bezoekersbeschikbaar-
--   heid lezen dezelfde tabel; de frontend leest haar ook. Regel: elk kwartier
--   van het slot valt volledig in een venster van die weekdag.
-- - De trigger trial_bookings_reject_vrij_trainen (gedeelde functie met
--   guest_bookings) wordt vervangen door een eigen trial-guard: een proefboeking
--   op vrij trainen mag alleen via een code met scope vrij_trainen, gratis, met
--   een geldig slot. guest_bookings houdt reject_vrij_trainen_visitor.
-- - visitor_cancel_trial_booking rekent de annuleertermijn vanaf de slotstart
--   (coalesce(slot_start_at, sessiestart)). De andere annuleer-RPC's gebruiken
--   geen tijd en blijven ongewijzigd.
--
-- Terugwaarts compatibel: alleen nieuwe nullable kolommen en een nieuwe tabel;
-- redeem_trial_code houdt de eerste zes parameters en krijgt p_slot_start_at met
-- default null (de huidige productiecode roept hem met zes benoemde argumenten
-- aan); de oude signatuur verdwijnt. Live rechten voor de wijziging
-- (2026-09-30): redeem_trial_code en visitor_cancel_trial_booking postgres en
-- service_role; vrij_trainen_slot_peak, guard_vrij_trainen_session_bounds en
-- reject_vrij_trainen_visitor alleen postgres. Schema tmc only; public en
-- tvmuur onaangeroerd; 20260503 placeholder onaangeroerd. Draaien met
-- `supabase db push` na akkoord.

begin;

-- ---------------------------------------------------------------------------
-- 1. Functies en triggers die veranderen weg (grants eerst, dan drop)
-- ---------------------------------------------------------------------------

drop trigger trial_bookings_reject_vrij_trainen on tmc.trial_bookings;
drop trigger class_sessions_vrij_trainen_bounds on tmc.class_sessions;

revoke all on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean) from public, anon, authenticated, service_role;
drop function tmc.redeem_trial_code(text, uuid, text, text, text, boolean);

revoke all on function tmc.visitor_cancel_trial_booking(uuid) from public, anon, authenticated, service_role;
drop function tmc.visitor_cancel_trial_booking(uuid);

revoke all on function tmc.vrij_trainen_slot_peak(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated, service_role;
drop function tmc.vrij_trainen_slot_peak(uuid, timestamptz, timestamptz, uuid);

revoke all on function tmc.guard_vrij_trainen_session_bounds() from public, anon, authenticated, service_role;
drop function tmc.guard_vrij_trainen_session_bounds();

-- ---------------------------------------------------------------------------
-- 2. Aanwezigheid van Marlon (enige bron)
-- ---------------------------------------------------------------------------

create table tmc.trainer_presence_windows (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6),
  from_time time not null,
  to_time time not null,
  created_at timestamptz not null default now(),
  check (to_time > from_time),
  unique (weekday, from_time)
);

comment on table tmc.trainer_presence_windows is
  'Wanneer Marlon in de studio is, per weekdag (0 = zondag, zoals extract(dow) in Amsterdamse tijd). Enige bron voor het vrij-trainen-uur van proefcodes en voor de weergave op de site en in het rooster. Vensters per weekdag horen niet te overlappen. Lezen en schrijven via service_role; geen grants voor anon en authenticated.';

insert into tmc.trainer_presence_windows (weekday, from_time, to_time)
select d, w.f::time, w.t::time
from generate_series(1, 5) as d
cross join (values ('07:00', '12:00'), ('17:00', '21:00')) as w(f, t)
on conflict (weekday, from_time) do nothing;

revoke all on table tmc.trainer_presence_windows from public, anon, authenticated;
grant all on table tmc.trainer_presence_windows to service_role;
alter table tmc.trainer_presence_windows enable row level security;
create policy trainer_presence_windows_admin_all on tmc.trainer_presence_windows
  for all using (tmc.is_admin()) with check (tmc.is_admin());

-- Valt elk kwartier van [p_start, p_end) volledig binnen een venster van die
-- weekdag (Amsterdamse tijd)? Intern: geen grants, alleen voor andere
-- tmc-functies. Kwartieren die over middernacht lopen tellen nooit mee.
create function tmc.vrij_trainen_trainer_present(p_start timestamptz, p_end timestamptz)
returns boolean
language sql
stable
set search_path to 'tmc', 'extensions'
as $function$
  select not exists (
    select 1
    from generate_series(p_start, p_end - interval '15 minutes', interval '15 minutes') as q(qs)
    where not exists (
      select 1
      from tmc.trainer_presence_windows w
      where w.weekday = extract(dow from (q.qs at time zone 'Europe/Amsterdam'))::int
        and (q.qs at time zone 'Europe/Amsterdam')::time >= w.from_time
        and ((q.qs + interval '15 minutes') at time zone 'Europe/Amsterdam')::time <= w.to_time
        and ((q.qs + interval '15 minutes') at time zone 'Europe/Amsterdam')::date
            = (q.qs at time zone 'Europe/Amsterdam')::date
    )
  )
$function$;

revoke all on function tmc.vrij_trainen_trainer_present(timestamptz, timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Slotkolommen op trial_bookings
-- ---------------------------------------------------------------------------

alter table tmc.trial_bookings
  add column slot_start_at timestamptz,
  add column slot_end_at timestamptz;

alter table tmc.trial_bookings
  add constraint trial_bookings_slot_pair
    check ((slot_start_at is null) = (slot_end_at is null)),
  add constraint trial_bookings_slot_shape
    check (
      slot_start_at is null
      or (
        slot_end_at = slot_start_at + interval '60 minutes'
        and extract(epoch from slot_start_at)::bigint % 900 = 0
      )
    );

comment on column tmc.trial_bookings.slot_start_at is
  'Alleen bij een gratis proefuur vrij trainen via een code met scope vrij_trainen: start van het uur (op een kwartier). Null bij een gewone proefles.';
comment on column tmc.trial_bookings.slot_end_at is
  'Einde van het proefuur vrij trainen, altijd slot_start_at + 60 minuten.';

create index trial_bookings_vrij_slot_idx
  on tmc.trial_bookings (session_id, slot_start_at, slot_end_at)
  where slot_start_at is not null and status in ('pending', 'paid', 'attended') and not is_test;

-- ---------------------------------------------------------------------------
-- 4. vrij_trainen_slot_peak: de enige telling, nu met proefboekingen
-- ---------------------------------------------------------------------------

-- Per kwartier q in [p_start, p_end): aantal geboekte slots dat q raakt, van
-- leden (bookings, booked) en van proefbezoekers (trial_bookings pending, paid
-- of attended, zonder is_test). peak = het hoogste aantal; blocked = minstens
-- een kwartier overlapt met een geplande sessie met blocks_free_training.
-- p_exclude_booking_id laat de eigen rij (van welke tabel ook) buiten de
-- telling bij een UPDATE. Aanroepers moeten de sessierij gelockt hebben.
create function tmc.vrij_trainen_slot_peak(
  p_session_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_booking_id uuid default null
)
returns table (peak integer, blocked boolean)
language sql
stable
set search_path to 'tmc', 'extensions'
as $function$
  with q as (
    select gs as qs
    from generate_series(p_start, p_end - interval '15 minutes', interval '15 minutes') gs
  )
  select
    coalesce((
      select max(c.n)
      from q
      cross join lateral (
        select count(*)::integer as n
        from (
          select b.id
          from tmc.bookings b
          where b.session_id = p_session_id
            and b.status = 'booked'
            and b.slot_start_at <= q.qs
            and b.slot_end_at > q.qs
          union all
          select t.id
          from tmc.trial_bookings t
          where t.session_id = p_session_id
            and t.status in ('pending', 'paid', 'attended')
            and not t.is_test
            and t.slot_start_at <= q.qs
            and t.slot_end_at > q.qs
        ) u
        where p_exclude_booking_id is null or u.id <> p_exclude_booking_id
      ) c
    ), 0)::integer as peak,
    exists (
      select 1
      from q
      join tmc.class_sessions cs
        on cs.status = 'scheduled'
       and cs.blocks_free_training
       and cs.id <> p_session_id
       and cs.start_at < q.qs + interval '15 minutes'
       and cs.end_at > q.qs
    ) as blocked
$function$;

revoke all on function tmc.vrij_trainen_slot_peak(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Guard op trial_bookings (vervangt trial_bookings_reject_vrij_trainen)
-- ---------------------------------------------------------------------------

create function tmc.guard_trial_booking_vrij_trainen()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_pillar text;
  v_session record;
  v_max int;
  v_peak int;
  v_blocked boolean;
begin
  select pillar into v_pillar from tmc.class_sessions where id = new.session_id;

  -- Gewone proeflessen hebben nooit een slot.
  if v_pillar is distinct from 'vrij_trainen' then
    if new.slot_start_at is not null then
      raise exception 'slot_not_allowed' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Een geannuleerde rij (of een annulering) wordt niet meer gecontroleerd.
  if new.status = 'cancelled' then
    return new;
  end if;

  -- Alleen een gratis boeking via een code met scope vrij_trainen.
  if new.trial_code_id is null
     or new.price_paid_cents <> 0
     or new.mollie_payment_id is not null
     or not exists (
       select 1 from tmc.trial_codes c
       where c.id = new.trial_code_id and c.scope = 'vrij_trainen'
     ) then
    raise exception 'session_not_eligible' using errcode = 'P0001',
      hint = 'Vrij trainen is voor proefbezoekers alleen gratis te boeken met een proefcode met scope vrij trainen.';
  end if;

  if new.slot_start_at is null then
    raise exception 'slot_required' using errcode = 'P0001';
  end if;

  -- Een rij die van sessie en slot niet wisselt en al actief was, is al
  -- gecontroleerd (bv. paid naar attended).
  if tg_op = 'UPDATE'
     and old.status <> 'cancelled'
     and new.session_id is not distinct from old.session_id
     and new.slot_start_at is not distinct from old.slot_start_at
     and new.slot_end_at is not distinct from old.slot_end_at then
    return new;
  end if;

  -- Serialisatiepunt: dezelfde rij-lock als book_class_session,
  -- enforce_vrij_trainen_slot en redeem_trial_code.
  select id, start_at, end_at into v_session
  from tmc.class_sessions
  where id = new.session_id
  for update;

  if new.slot_start_at < v_session.start_at or new.slot_end_at > v_session.end_at then
    raise exception 'slot_outside_session' using errcode = 'P0001';
  end if;

  if not tmc.vrij_trainen_trainer_present(new.slot_start_at, new.slot_end_at) then
    raise exception 'outside_presence' using errcode = 'P0001',
      hint = 'Vrij trainen met een proefcode kan alleen als Marlon er is.';
  end if;

  select coalesce(bs.vrij_trainen_max_concurrent, 5) into v_max
  from tmc.booking_settings bs limit 1;
  v_max := coalesce(v_max, 5);

  select p.peak, p.blocked into v_peak, v_blocked
  from tmc.vrij_trainen_slot_peak(
    new.session_id, new.slot_start_at, new.slot_end_at,
    case when tg_op = 'UPDATE' then new.id end) p;

  if v_blocked then
    raise exception 'slot_blocked' using errcode = 'P0001';
  end if;
  -- Testboekingen tellen niet mee voor het maximum en worden er ook niet op
  -- geweigerd (consistent met session_occupancy).
  if not new.is_test and v_peak >= v_max then
    raise exception 'slot_full' using errcode = 'P0001',
      hint = 'Maximaal aantal tegelijk bereikt in minstens een kwartier van dit slot.';
  end if;

  return new;
end;
$function$;

revoke all on function tmc.guard_trial_booking_vrij_trainen() from public, anon, authenticated, service_role;

create trigger trial_bookings_guard_vrij_trainen
  before insert or update of session_id, status, slot_start_at, slot_end_at, trial_code_id, price_paid_cents
  on tmc.trial_bookings
  for each row execute function tmc.guard_trial_booking_vrij_trainen();

-- ---------------------------------------------------------------------------
-- 6. guard_vrij_trainen_session_bounds: ook proefslots tellen mee
-- ---------------------------------------------------------------------------

create function tmc.guard_vrij_trainen_session_bounds()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
begin
  if new.pillar is distinct from old.pillar
     and 'vrij_trainen' in (old.pillar, new.pillar)
     and exists (select 1 from tmc.sessions_with_participants(array[old.id])) then
    raise exception 'vrij_trainen_pillar_change_not_empty' using errcode = 'P0001',
      hint = 'De pillar kan niet van of naar vrij trainen wijzigen zolang de sessie deelnemers heeft.';
  end if;

  if old.pillar = 'vrij_trainen'
     and (new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at)
     and (
       exists (
         select 1 from tmc.bookings b
         where b.session_id = old.id
           and b.status = 'booked'
           and (b.slot_start_at < new.start_at or b.slot_end_at > new.end_at)
       )
       or exists (
         select 1 from tmc.trial_bookings t
         where t.session_id = old.id
           and t.status in ('pending', 'paid', 'attended')
           and (t.slot_start_at < new.start_at or t.slot_end_at > new.end_at)
       )
     ) then
    raise exception 'vrij_trainen_slots_outside_session' using errcode = 'P0001',
      hint = 'Er staan geboekte slots buiten de nieuwe tijden.';
  end if;
  return new;
end;
$function$;

revoke all on function tmc.guard_vrij_trainen_session_bounds() from public, anon, authenticated, service_role;

create trigger class_sessions_vrij_trainen_bounds
  before update of start_at, end_at, pillar on tmc.class_sessions
  for each row execute function tmc.guard_vrij_trainen_session_bounds();

-- ---------------------------------------------------------------------------
-- 7. redeem_trial_code (publiek via de service-role client), nu met slot
-- ---------------------------------------------------------------------------

create function tmc.redeem_trial_code(
  p_code text,
  p_session_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_is_test boolean default false,
  p_slot_start_at timestamptz default null
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
begin
  if v_code_norm = '' or v_name = '' or v_email = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_fields');
  end if;

  -- Lock de code-rij: serialiseert gelijktijdig inwisselen, zodat
  -- uses_count nooit boven max_uses uitkomt.
  select * into v_tc
  from tmc.trial_codes
  where code = v_code_norm
  for update;

  -- Bestaat niet, ingetrokken en op krijgen dezelfde reason: de bezoeker
  -- mag niet kunnen afleiden welke codes bestaan.
  if not found
     or v_tc.revoked_at is not null
     or (v_tc.max_uses is not null and v_tc.uses_count >= v_tc.max_uses) then
    return jsonb_build_object('ok', false, 'reason', 'code_invalid');
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

  if v_tc.scope = 'vrij_trainen' then
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
    -- Een groepscode boekt nooit vrij trainen; yoga_mobility en kettlebell
    -- gelden per pillar. group = elke les die als proefles boekbaar is (het
    -- v2-gedrag). De lijst in de UI is alleen weergave.
    if v_session.pillar = 'vrij_trainen' then
      return jsonb_build_object('ok', false, 'reason', 'scope_mismatch');
    end if;
    if v_tc.scope in ('yoga_mobility', 'kettlebell') and v_session.pillar <> v_tc.scope then
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

  if v_tc.scope = 'vrij_trainen' then
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
    if not coalesce(p_is_test, false) and v_peak >= v_max then
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
  -- betaalde proefles (trialBookingMode()).
  insert into tmc.trial_bookings (
    session_id, name, email, phone,
    price_paid_cents, mollie_payment_id, status, trial_code_id, is_test,
    slot_start_at, slot_end_at
  ) values (
    p_session_id, v_name, v_email, v_phone,
    0, null, 'paid', v_tc.id, coalesce(p_is_test, false),
    p_slot_start_at, v_slot_end
  )
  returning id, cancel_token into v_trial_id, v_cancel_token;

  insert into tmc.trial_code_redemptions (code_id, trial_booking_id, session_id, email_normalized)
  values (v_tc.id, v_trial_id, p_session_id, v_email)
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
    'prior_free_count', v_prior_free
  );
end;
$$;

-- Publiek betekent hier: via de service-role client in de TS-laag, achter
-- register_trial_code_attempt. Niet rechtstreeks door anon/authenticated.
revoke all on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 8. visitor_cancel_trial_booking: termijn vanaf de slotstart
-- ---------------------------------------------------------------------------

create function tmc.visitor_cancel_trial_booking(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_tb tmc.trial_bookings%rowtype;
  v_start_at timestamptz;
  v_rescheduled_at timestamptz;
  v_cancel_hours int;
  v_within_window boolean;
  v_free_after_reschedule boolean;
  v_res jsonb;
begin
  if p_token is null then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  select * into v_tb
  from tmc.trial_bookings
  where cancel_token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  -- Termijn: dezelfde bron, fallback en formule als cancel_class_booking
  -- voor leden.
  select coalesce(bs.cancellation_window_hours, 6)
  into v_cancel_hours
  from tmc.booking_settings bs
  limit 1;
  if not found then
    v_cancel_hours := 6;
  end if;

  select start_at, rescheduled_at into v_start_at, v_rescheduled_at
  from tmc.class_sessions where id = v_tb.session_id;
  if v_start_at is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  -- Een proefuur vrij trainen rekent vanaf de slotstart, niet vanaf de
  -- dagsessie (zoals leden: coalesce(slot_start_at, sessiestart)).
  v_start_at := coalesce(v_tb.slot_start_at, v_start_at);

  v_within_window := v_start_at - now() >= make_interval(hours => v_cancel_hours);

  -- Verschoven les (session-overrides): wie boekte voor de verschuiving mag
  -- tot de nieuwe starttijd kosteloos annuleren, zoals leden.
  v_free_after_reschedule := v_rescheduled_at is not null
    and v_tb.booked_at < v_rescheduled_at
    and now() < v_start_at;

  -- De kern lockt de boeking en weigert alles behalve 'paid' (pending en
  -- al geannuleerd blijven buiten zelfservice).
  v_res := tmc.cancel_trial_booking_core(
    v_tb.id,
    case
      when v_within_window then 'within_window'
      when v_free_after_reschedule then 'rescheduled'
      else 'late'
    end,
    'visitor',
    null,
    v_within_window or v_free_after_reschedule
  );

  return v_res || jsonb_build_object(
    'within_window', v_within_window or v_free_after_reschedule,
    'free_after_reschedule', v_free_after_reschedule and not v_within_window,
    'cancellation_window_hours', v_cancel_hours
  );
end;
$function$;

revoke all on function tmc.visitor_cancel_trial_booking(uuid) from public, anon, authenticated;
grant execute on function tmc.visitor_cancel_trial_booking(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Beschikbaarheid voor bezoekers zonder account
-- ---------------------------------------------------------------------------

-- Zoals vrij_trainen_availability voor leden (zelfde telling), maar zonder
-- auth-check, voor een datumbereik en alleen de kwartieren binnen de
-- aanwezigheid van Marlon. Alleen tellingen, geen persoonsgegevens. Alleen
-- service_role (de publieke codeflow roept hem server-side aan).
create function tmc.vrij_trainen_visitor_availability(p_from date, p_to date)
returns table (
  session_id uuid,
  quarter_start timestamptz,
  booked integer,
  available integer,
  blocked boolean
)
language plpgsql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_max int;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 then
    raise exception 'ongeldig datumbereik' using errcode = '22023';
  end if;

  select coalesce(bs.vrij_trainen_max_concurrent, 5) into v_max
  from tmc.booking_settings bs limit 1;
  v_max := coalesce(v_max, 5);

  return query
  select
    cs.id,
    q.qs,
    p.peak,
    case when p.blocked then 0 else greatest(v_max - p.peak, 0) end,
    p.blocked
  from tmc.class_sessions cs
  cross join lateral generate_series(
    cs.start_at, cs.end_at - interval '15 minutes', interval '15 minutes') as q(qs)
  cross join lateral tmc.vrij_trainen_slot_peak(
    cs.id, q.qs, q.qs + interval '15 minutes') p
  where cs.pillar = 'vrij_trainen'
    and cs.status = 'scheduled'
    and (cs.start_at at time zone 'Europe/Amsterdam')::date between p_from and p_to
    and tmc.vrij_trainen_trainer_present(q.qs, q.qs + interval '15 minutes')
  order by cs.start_at, q.qs;
end;
$function$;

revoke all on function tmc.vrij_trainen_visitor_availability(date, date) from public, anon, authenticated;
grant execute on function tmc.vrij_trainen_visitor_availability(date, date) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Zelfcontrole binnen een savepoint
--
-- Speelt de kern na zonder bestaande app-data te eisen: is er geen
-- class_types-, trainers- of profiles-rij (verse shadow-database), dan slaat de
-- controle zichzelf over met een notice (migrations/README.md, regel 6). De
-- testsessies liggen in 2027 (ver voorbij de gegenereerde dagen, vanwege de
-- unieke index class_sessions_vrij_trainen_one_per_day) en rond het einde van
-- de zomertijd op 2027-10-31. Na de laatste assert rolt ROLLBACK TO SAVEPOINT
-- alle testrijen terug, zonder DELETE, zodat de append-only trigger op
-- tmc.events ongemoeid blijft.
-- ---------------------------------------------------------------------------

savepoint trial_codes_vt_selftest;

do $$
declare
  v_ct uuid;
  v_tr uuid;
  v_pr uuid;
  v_fri uuid;
  v_mon uuid;
  v_sat uuid;
  v_yoga uuid;
  v_vt uuid;
  v_grp uuid;
  v_res jsonb;
  v_ts timestamptz;
  i int;
begin
  select id into v_ct from tmc.class_types limit 1;
  select id into v_tr from tmc.trainers limit 1;
  select id into v_pr from tmc.profiles limit 1;
  if v_ct is null or v_tr is null or v_pr is null then
    raise notice 'trial_codes_vrij_trainen: zelfcontrole overgeslagen, geen class_types/trainers/profiles-rij (lege database)';
    return;
  end if;

  -- Vrijdag 2027-10-29 (zomertijd, UTC+2), maandag 2027-11-01 (wintertijd,
  -- UTC+1) en zaterdag 2027-10-30: dagsessies 07:00 tot 21:00 lokaal.
  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'vrij_trainen', 'adult',
          timestamp '2027-10-29 07:00' at time zone 'Europe/Amsterdam',
          timestamp '2027-10-29 21:00' at time zone 'Europe/Amsterdam', null, 'scheduled')
  returning id into v_fri;
  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'vrij_trainen', 'adult',
          timestamp '2027-11-01 07:00' at time zone 'Europe/Amsterdam',
          timestamp '2027-11-01 21:00' at time zone 'Europe/Amsterdam', null, 'scheduled')
  returning id into v_mon;
  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'vrij_trainen', 'adult',
          timestamp '2027-10-30 08:00' at time zone 'Europe/Amsterdam',
          timestamp '2027-10-30 14:00' at time zone 'Europe/Amsterdam', null, 'scheduled')
  returning id into v_sat;
  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'yoga_mobility', 'adult', now() + interval '500 days', now() + interval '500 days 1 hour', null, 'scheduled')
  returning id into v_yoga;

  insert into tmc.trial_codes (code, label, max_uses, scope, created_by) values
    ('VTCONTROLE1', 'zelfcontrole vrij trainen', null, 'vrij_trainen', v_pr),
    ('VTCONTROLE2', 'zelfcontrole group', null, 'group', v_pr);

  -- Presence (DST): laatste starts 11:00 en 20:00, ook na de wisseling.
  foreach v_grp in array array[v_fri, v_mon] loop
    v_vt := v_grp;
    foreach v_ts in array array[
      (case when v_grp = v_fri then timestamp '2027-10-29 11:00' else timestamp '2027-11-01 11:00' end) at time zone 'Europe/Amsterdam',
      (case when v_grp = v_fri then timestamp '2027-10-29 20:00' else timestamp '2027-11-01 20:00' end) at time zone 'Europe/Amsterdam'] loop
      if not tmc.vrij_trainen_trainer_present(v_ts, v_ts + interval '60 minutes') then
        raise exception 'trial_codes_vrij_trainen: % hoort binnen de aanwezigheid te vallen', v_ts;
      end if;
    end loop;
    foreach v_ts in array array[
      (case when v_grp = v_fri then timestamp '2027-10-29 11:15' else timestamp '2027-11-01 11:15' end) at time zone 'Europe/Amsterdam',
      (case when v_grp = v_fri then timestamp '2027-10-29 12:00' else timestamp '2027-11-01 12:00' end) at time zone 'Europe/Amsterdam',
      (case when v_grp = v_fri then timestamp '2027-10-29 16:45' else timestamp '2027-11-01 16:45' end) at time zone 'Europe/Amsterdam',
      (case when v_grp = v_fri then timestamp '2027-10-29 20:15' else timestamp '2027-11-01 20:15' end) at time zone 'Europe/Amsterdam'] loop
      if tmc.vrij_trainen_trainer_present(v_ts, v_ts + interval '60 minutes') then
        raise exception 'trial_codes_vrij_trainen: % hoort buiten de aanwezigheid te vallen', v_ts;
      end if;
    end loop;
  end loop;

  -- Weekend: nooit aanwezig.
  v_ts := timestamp '2027-10-30 09:00' at time zone 'Europe/Amsterdam';
  if tmc.vrij_trainen_trainer_present(v_ts, v_ts + interval '60 minutes') then
    raise exception 'trial_codes_vrij_trainen: zaterdag hoort nooit aanwezig te zijn';
  end if;
  v_res := tmc.redeem_trial_code('VTCONTROLE1', v_sat, 'Vt Controle', 'vt0@test.invalid', '0600000000', true, v_ts);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'outside_presence' then
    raise exception 'trial_codes_vrij_trainen: zaterdag hoort outside_presence te geven: %', v_res;
  end if;

  -- Scope: vrij-trainen-code op een yogales en groepscode op vrij trainen.
  v_ts := timestamp '2027-10-29 18:00' at time zone 'Europe/Amsterdam';
  v_res := tmc.redeem_trial_code('VTCONTROLE1', v_yoga, 'Vt Controle', 'vt1@test.invalid', '0600000000', true);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'scope_mismatch' then
    raise exception 'trial_codes_vrij_trainen: vrij-trainen-code op yoga hoort scope_mismatch te geven: %', v_res;
  end if;
  v_res := tmc.redeem_trial_code('VTCONTROLE2', v_fri, 'Vt Controle', 'vt2@test.invalid', '0600000000', true, v_ts);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'slot_not_allowed' then
    raise exception 'trial_codes_vrij_trainen: groepscode met slot hoort slot_not_allowed te geven: %', v_res;
  end if;
  v_res := tmc.redeem_trial_code('VTCONTROLE2', v_fri, 'Vt Controle', 'vt2@test.invalid', '0600000000', true);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'scope_mismatch' then
    raise exception 'trial_codes_vrij_trainen: groepscode op vrij trainen hoort scope_mismatch te geven: %', v_res;
  end if;

  -- Slot: verplicht, kwartier, binnen presence.
  v_res := tmc.redeem_trial_code('VTCONTROLE1', v_fri, 'Vt Controle', 'vt3@test.invalid', '0600000000', true);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'slot_required' then
    raise exception 'trial_codes_vrij_trainen: zonder slot hoort slot_required te geven: %', v_res;
  end if;
  v_res := tmc.redeem_trial_code('VTCONTROLE1', v_fri, 'Vt Controle', 'vt3@test.invalid', '0600000000', true, v_ts + interval '7 minutes');
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'slot_invalid' then
    raise exception 'trial_codes_vrij_trainen: niet op een kwartier hoort slot_invalid te geven: %', v_res;
  end if;
  -- 11:15 loopt over het einde van het ochtendvenster (12:15), 20:15 voorbij
  -- het einde van de dagsessie (21:15): beide geweigerd.
  v_res := tmc.redeem_trial_code('VTCONTROLE1', v_fri, 'Vt Controle', 'vt3@test.invalid', '0600000000', true,
    timestamp '2027-10-29 11:15' at time zone 'Europe/Amsterdam');
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'outside_presence' then
    raise exception 'trial_codes_vrij_trainen: 11:15 hoort outside_presence te geven: %', v_res;
  end if;
  v_res := tmc.redeem_trial_code('VTCONTROLE1', v_fri, 'Vt Controle', 'vt3@test.invalid', '0600000000', true,
    timestamp '2027-10-29 20:15' at time zone 'Europe/Amsterdam');
  if (v_res->>'ok')::boolean or v_res->>'reason' not in ('outside_presence', 'slot_outside_session') then
    raise exception 'trial_codes_vrij_trainen: 20:15 hoort geweigerd te worden: %', v_res;
  end if;

  -- Maximum van 5: vijf niet-test boekingen, de zesde wordt geweigerd, een
  -- testboeking telt niet mee en wordt niet geweigerd.
  for i in 1..5 loop
    v_res := tmc.redeem_trial_code('VTCONTROLE1', v_fri, 'Vt Controle', 'vtmax' || i || '@test.invalid', '0600000000', false, v_ts);
    if not (v_res->>'ok')::boolean then
      raise exception 'trial_codes_vrij_trainen: boeking % van 5 hoort te slagen: %', i, v_res;
    end if;
    if (v_res->>'slot_end_at')::timestamptz <> v_ts + interval '60 minutes' then
      raise exception 'trial_codes_vrij_trainen: duur hoort exact 60 minuten te zijn';
    end if;
  end loop;
  v_res := tmc.redeem_trial_code('VTCONTROLE1', v_fri, 'Vt Controle', 'vtmax6@test.invalid', '0600000000', false, v_ts);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'slot_full' then
    raise exception 'trial_codes_vrij_trainen: zesde boeking hoort slot_full te geven: %', v_res;
  end if;
  v_res := tmc.redeem_trial_code('VTCONTROLE1', v_fri, 'Vt Controle', 'vttest@test.invalid', '0600000000', true, v_ts);
  if not (v_res->>'ok')::boolean then
    raise exception 'trial_codes_vrij_trainen: testboeking hoort niet op het maximum te stuiten: %', v_res;
  end if;
  -- Hetzelfde e-mailadres, een ander slot op dezelfde dag: geweigerd.
  v_res := tmc.redeem_trial_code('VTCONTROLE1', v_fri, 'Vt Controle', 'vtmax1@test.invalid', '0600000000', false,
    timestamp '2027-10-29 09:00' at time zone 'Europe/Amsterdam');
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'email_already_booked' then
    raise exception 'trial_codes_vrij_trainen: hetzelfde adres hoort email_already_booked te geven: %', v_res;
  end if;
  -- De proefbezoeker telt mee in de telling die de ledenbeschikbaarheid gebruikt.
  if (select p.peak from tmc.vrij_trainen_slot_peak(v_fri, v_ts, v_ts + interval '15 minutes') p) <> 5 then
    raise exception 'trial_codes_vrij_trainen: vrij_trainen_slot_peak hoort 5 proefbezoekers te tellen';
  end if;

  -- Een betaalde proefboeking op vrij trainen blijft onmogelijk (trigger).
  begin
    insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, is_test)
    values (v_mon, 'Betaald', 'vtbetaald@test.invalid', '0600000000', 1700, 'pending', true);
    raise exception 'trial_codes_vrij_trainen: betaalde proefboeking op vrij trainen hoort te falen';
  exception when raise_exception then
    if sqlerrm <> 'session_not_eligible' then
      raise;
    end if;
  end;
end $$;

rollback to savepoint trial_codes_vt_selftest;
release savepoint trial_codes_vt_selftest;

-- ---------------------------------------------------------------------------
-- 11. Grants en definities asserteren (buiten het savepoint)
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
  v_n int;
begin
  -- Precies een redeem_trial_code (7 argumenten, laatste twee met default).
  select count(*) into v_n
  from pg_proc p
  where p.pronamespace = 'tmc'::regnamespace and p.proname = 'redeem_trial_code';
  if v_n <> 1 then
    raise exception 'trial_codes_vrij_trainen: % overloads van redeem_trial_code, verwacht 1', v_n;
  end if;
  if (select pronargs from pg_proc where oid = 'tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz)'::regprocedure) <> 7
     or (select pronargdefaults from pg_proc where oid = 'tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz)'::regprocedure) <> 2 then
    raise exception 'trial_codes_vrij_trainen: redeem_trial_code hoort 7 argumenten met 2 defaults te hebben';
  end if;

  -- Een aanroep met zes benoemde argumenten (de huidige productiecode) werkt.
  if (tmc.redeem_trial_code(
        p_code => 'BESTAATNIET', p_session_id => '00000000-0000-0000-0000-000000000000'::uuid,
        p_name => 'x', p_email => 'x@test.invalid', p_phone => '1', p_is_test => true
      ) ->> 'reason') <> 'code_invalid' then
    raise exception 'trial_codes_vrij_trainen: aanroep met zes benoemde argumenten werkt niet';
  end if;

  -- Alleen service_role: redeem, visitor_cancel, visitor_availability.
  foreach v_fn in array array[
    'tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz)',
    'tmc.visitor_cancel_trial_booking(uuid)',
    'tmc.vrij_trainen_visitor_availability(date, date)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'trial_codes_vrij_trainen: % mag niet voor anon/authenticated', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'trial_codes_vrij_trainen: % moet voor service_role', v_fn;
    end if;
  end loop;

  -- Intern, zonder grants: slot_peak, present, beide guards.
  foreach v_fn in array array[
    'tmc.vrij_trainen_slot_peak(uuid, timestamptz, timestamptz, uuid)',
    'tmc.vrij_trainen_trainer_present(timestamptz, timestamptz)',
    'tmc.guard_trial_booking_vrij_trainen()',
    'tmc.guard_vrij_trainen_session_bounds()'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute')
       or has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'trial_codes_vrij_trainen: % mag alleen de eigenaar uitvoeren', v_fn;
    end if;
  end loop;

  -- SECURITY DEFINER met vaste search_path waar dat hoort.
  if exists (
    select 1 from pg_proc p
    where p.oid in (
      'tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz)'::regprocedure,
      'tmc.visitor_cancel_trial_booking(uuid)'::regprocedure,
      'tmc.vrij_trainen_visitor_availability(date, date)'::regprocedure,
      'tmc.guard_trial_booking_vrij_trainen()'::regprocedure,
      'tmc.guard_vrij_trainen_session_bounds()'::regprocedure
    )
    and (not p.prosecdef or p.proconfig is null)
  ) then
    raise exception 'trial_codes_vrij_trainen: functie zonder SECURITY DEFINER of vaste search_path';
  end if;

  -- Triggers.
  if exists (select 1 from pg_trigger where tgname = 'trial_bookings_reject_vrij_trainen') then
    raise exception 'trial_codes_vrij_trainen: oude trigger trial_bookings_reject_vrij_trainen bestaat nog';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trial_bookings_guard_vrij_trainen')
     or not exists (select 1 from pg_trigger where tgname = 'class_sessions_vrij_trainen_bounds')
     or not exists (select 1 from pg_trigger where tgname = 'guest_bookings_reject_vrij_trainen') then
    raise exception 'trial_codes_vrij_trainen: trigger ontbreekt';
  end if;

  -- Seed en rechten van de aanwezigheidstabel.
  if (select count(*) from tmc.trainer_presence_windows where weekday between 1 and 5) < 10 then
    raise exception 'trial_codes_vrij_trainen: seed van trainer_presence_windows ontbreekt';
  end if;
  if has_table_privilege('anon', 'tmc.trainer_presence_windows', 'select')
     or has_table_privilege('authenticated', 'tmc.trainer_presence_windows', 'select')
     or not has_table_privilege('service_role', 'tmc.trainer_presence_windows', 'select') then
    raise exception 'trial_codes_vrij_trainen: verkeerde rechten op trainer_presence_windows';
  end if;
end $$;

commit;
