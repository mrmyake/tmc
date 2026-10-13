-- Verhuur van yogamatjes en handdoeken verdwijnt uit de app. Studioregel:
-- er wordt niets verhuurd; yogamatjes liggen gratis klaar, een handdoek
-- neemt het lid zelf mee. Deze migratie haalt de twee huurvlaggen uit
-- tmc.bookings en de twee parameters uit tmc.book_class_session.
-- Alleen schema tmc.
--
-- Discovery (2026-10-13, live catalogi): book_class_session is de enige
-- functie die de kolommen noemt; geen view, matview, trigger of policy
-- hangt eraan (vw_admin_kpis en get_admin_kpis blijven ongemoeid); nul
-- bookings hebben een huurvlag. De live body van book_class_session was
-- byte-gelijk aan 20261002120000_waitlist_reservations.sql; de functie
-- hieronder is die body minus de rental-regels, verder ongewijzigd.
--
-- Volgorde bij uitrol: eerst de app-code live (die stuurt p_rental_* niet
-- meer mee en werkt tegen beide signaturen), daarna deze push. Andersom
-- zou de oude aanroep met p_rental_mat geen functie meer vinden.

begin;

-- 1. Oude signatuur weg. Drop in plaats van replace: de parameterlijst
-- verandert, dus replace zou een tweede overload maken.
drop function tmc.book_class_session(uuid, boolean, boolean, timestamptz, integer);

-- 2. Nieuwe signatuur, zelfde body zonder rentals. SECURITY DEFINER en
-- search_path exact als live.
create function tmc.book_class_session(
  p_session_id uuid,
  p_slot_start_at timestamptz default null,
  p_slot_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  g record;
  v_session tmc.class_sessions%rowtype;
  v_covering tmc.memberships%rowtype;
  v_booking_id uuid;
  v_waitlist_confirmed int := 0;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select * into g
  from tmc.booking_gate(v_uid, p_session_id, p_slot_start_at, p_slot_minutes, false);

  if g.o_reason is not null then
    if g.o_reason = 'capacity_full' then
      return jsonb_build_object(
        'ok', false, 'reason', 'capacity_full',
        'can_join_waitlist', g.o_can_join_waitlist);
    end if;
    return jsonb_build_object('ok', false, 'reason', g.o_reason);
  end if;

  v_session := g.o_session;
  v_covering := g.o_covering;

  begin
    insert into tmc.bookings (
      profile_id, session_id, session_date, pillar, iso_week, iso_year,
      membership_id, credits_used, status,
      slot_start_at, slot_end_at
    ) values (
      v_uid, p_session_id, g.o_session_date, v_session.pillar, g.o_iso_week, g.o_iso_year,
      v_covering.id, g.o_credits_used, 'booked',
      g.o_slot_start, g.o_slot_end
    )
    returning id into v_booking_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'already_booked');
    when raise_exception then
      -- Slot-backstop (bookings_enforce_vrij_trainen_slot). Onder de
      -- sessie-lock hierboven niet bereikbaar, maar een weigering blijft
      -- een nette reason in plaats van een exception.
      if sqlerrm in ('slot_full', 'slot_blocked') then
        return jsonb_build_object('ok', false, 'reason', sqlerrm);
      end if;
      raise;
  end;

  if g.o_credits_used > 0 then
    -- Rij is in booking_gate gelockt; de guard houdt credits >= 0.
    update tmc.memberships
    set credits_remaining = credits_remaining - g.o_credits_used
    where id = v_covering.id
      and coalesce(credits_remaining, 0) >= g.o_credits_used;
    if not found then
      raise exception 'Geen credits meer beschikbaar.' using errcode = 'P0001';
    end if;
  end if;

  -- Waitlist-resolutie (20260814): een geslaagde boeking lost de eigen
  -- open wachtlijst-entry voor deze sessie op, in dezelfde transactie als
  -- de insert. Ook een gepromoveerde entry: dat is het bevestigen.
  update tmc.waitlist_entries
  set confirmed_at = now()
  where session_id = p_session_id
    and profile_id = v_uid
    and confirmed_at is null
    and expired_at is null;
  get diagnostics v_waitlist_confirmed = row_count;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'membership_id', v_covering.id,
    'credits_used', g.o_credits_used,
    'pillar', v_session.pillar,
    'session_date', g.o_session_date,
    'slot_start_at', g.o_slot_start,
    'slot_end_at', g.o_slot_end,
    'waitlist_confirmed', v_waitlist_confirmed > 0
  );
end;
$function$;

alter function tmc.book_class_session(uuid, timestamptz, integer) owner to postgres;

comment on function tmc.book_class_session(uuid, timestamptz, integer) is
  'Groepsles boeken. SECURITY DEFINER: alle checks via tmc.booking_gate onder een for update-lock op sessie en membership; insert, credit-aftrek en wachtlijstbevestiging in dezelfde transactie. Retourneert jsonb {ok, reason?, booking_id?, can_join_waitlist?}. Verhuurparameters verwijderd in 20261013130000.';

-- 3. Rechten exact als de live ACL (postgres + authenticated). De event
-- trigger tmc_new_function_default_privileges trekt PUBLIC en anon al in;
-- de revoke staat er als extra zekerheid.
revoke execute on function tmc.book_class_session(uuid, timestamptz, integer) from public, anon, service_role;
grant execute on function tmc.book_class_session(uuid, timestamptz, integer) to authenticated;

-- 4. Kolommen en partial index weg. Nul rijen hadden een huurvlag.
drop index tmc.bookings_rental_idx;
alter table tmc.bookings
  drop column rental_mat,
  drop column rental_towel;

-- 5. Zelfcontrole: precies een overload, juiste rechten, kolommen weg.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tmc' and p.proname = 'book_class_session';
  if v_count <> 1 then
    raise exception 'remove_rental_mat_towel: % overloads van book_class_session, verwacht 1', v_count;
  end if;

  if not (select prosecdef from pg_proc where oid = 'tmc.book_class_session(uuid, timestamptz, integer)'::regprocedure) then
    raise exception 'remove_rental_mat_towel: book_class_session is geen SECURITY DEFINER meer';
  end if;

  if has_function_privilege('anon', 'tmc.book_class_session(uuid, timestamptz, integer)', 'EXECUTE')
     or has_function_privilege('service_role', 'tmc.book_class_session(uuid, timestamptz, integer)', 'EXECUTE') then
    raise exception 'remove_rental_mat_towel: anon of service_role heeft EXECUTE op book_class_session';
  end if;
  if not has_function_privilege('authenticated', 'tmc.book_class_session(uuid, timestamptz, integer)', 'EXECUTE') then
    raise exception 'remove_rental_mat_towel: authenticated mist EXECUTE op book_class_session';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'tmc' and table_name = 'bookings'
      and column_name in ('rental_mat', 'rental_towel')
  ) then
    raise exception 'remove_rental_mat_towel: rental-kolommen bestaan nog';
  end if;
end $$;

commit;

-- PostgREST moet de nieuwe signatuur zien voordat de app hem aanroept.
notify pgrst, 'reload schema';
