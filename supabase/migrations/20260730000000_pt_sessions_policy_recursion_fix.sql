-- Fix op 20260729 (PT-agenda PR A), gevonden bij de live verificatie:
-- de policy pt_sessions_member_booked_read verwees naar pt_bookings, en
-- pt_bookings_trainer_read verwijst naar pt_sessions. Postgres evalueert
-- RLS wederzijds en meldt "infinite recursion detected in policy" op elke
-- niet-admin SELECT op pt_sessions of pt_bookings.
--
-- De cyclus wordt gebroken met een SECURITY DEFINER-helper: die leest
-- pt_bookings als owner (zonder RLS) en de policy roept alleen nog de
-- helper aan. Semantiek ongewijzigd: een lid ziet uitsluitend sessies
-- waar een eigen boeking aan hangt.

begin;

create or replace function tmc.has_own_pt_booking(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
  select exists (
    select 1 from tmc.pt_bookings b
    where b.pt_session_id = p_session_id and b.profile_id = auth.uid()
  );
$function$;

-- Policy-evaluatie draait als de query-rol, dus authenticated heeft
-- execute nodig; anon niet.
revoke execute on function tmc.has_own_pt_booking(uuid) from public;
grant execute on function tmc.has_own_pt_booking(uuid) to authenticated, service_role;

drop policy pt_sessions_member_booked_read on tmc.pt_sessions;
create policy pt_sessions_member_booked_read on tmc.pt_sessions
  for select using (tmc.has_own_pt_booking(id));

commit;
