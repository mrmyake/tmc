-- Gat 3 uit de product-RPC-discovery: alle mutaties op
-- memberships.credits_remaining door één SECURITY DEFINER RPC onder row
-- lock, met een audit-event per mutatie in dezelfde transactie.
--
-- Aanleiding (discovery 2026-07-10, live geverifieerd): vier directe
-- TS-schrijvers via de service-role client zonder lock:
--   1. check-in debit (src/lib/check-in/actions.ts, decrementCredit)
--   2. admin saldo-delta (src/lib/admin/member-actions.ts, addCredits,
--      met een stille Math.max(0,..)-clamp i.p.v. een weigering)
--   3. admin refund per boeking (src/lib/admin/attendance-actions.ts,
--      refundCredit, met een niet-atomaire dubbel-refund-guard)
--   4. cascade-refund bij sessie-annulering (src/lib/admin/
--      session-actions.ts, adminCancelSession)
-- Plus: undoCheckIn verwijderde een credit-check-in ZONDER de credit
-- terug te boeken. De call-sites worden in dezelfde PR herbedraad.
--
-- Vorm (akkoord Ilja 2026-07-10, twee bijstellingen verwerkt):
-- - Eén relatieve functie, geen set-variant: de admin-flow is een
--   delta-operatie, dus alle call-sites passen op adjust.
-- - Service-role only (patroon activate_order): de kiosk-check-in heeft
--   geen auth.uid(), dus is_admin()/auth-checks in de functie kunnen de
--   flows niet bedienen; de TS-laag houdt requireAdmin/requireStaff als
--   eerste poort en de actor komt als parameter mee.
-- - Debit vereist status='active'. GEEN credits_expires_at-check hier:
--   expiry-afdwinging wordt een aparte PR over alle debit-paden
--   (bijstelling 1).
-- - Geen stille clamp: onvoldoende saldo weigert met insufficient_credits.
-- - Geen bovengrens op credits_total: een admin-bonus boven het pakket
--   is legitiem.
-- - p_booking_id maakt refund plus bookings.credits_used=0 atomair in
--   dezelfde transactie; een tweede poging krijgt already_refunded.
-- - credits.adjusted-event (bestaand type, bestaande payload-vorm) in
--   dezelfde transactie.
-- - Check-constraint credits_remaining >= 0 als vangnet (0 bestaande
--   credit-rijen, live geverifieerd, dus geen data-risico).
--
-- Early Member raakt dit nergens. Schema tmc only; public en tvmuur
-- onaangeroerd; 20260503 placeholder onaangeroerd.

begin;

alter table tmc.memberships add constraint memberships_credits_remaining_nonnegative
  check (credits_remaining is null or credits_remaining >= 0);

create or replace function tmc.adjust_membership_credits(
  p_membership_id uuid,
  p_delta integer,
  p_reason text,
  p_source text,
  p_actor_type text,
  p_actor_id uuid default null,
  p_booking_id uuid default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_membership tmc.memberships%rowtype;
  v_booking tmc.bookings%rowtype;
  v_previous integer;
  v_new integer;
begin
  -- Service-role only, zelfde guard als tmc.activate_order: de TS-laag
  -- (requireAdmin/requireStaff/kiosk-PIN) is de autorisatiepoort, deze
  -- functie is nooit direct door een client aanroepbaar.
  if auth.uid() is not null then
    raise exception 'adjust_membership_credits is service-role only.' using errcode = '42501';
  end if;

  if p_delta is null or p_delta = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_delta');
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_reason');
  end if;
  if p_source is null or p_source not in ('check_in', 'refund', 'manual', 'session_cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_source');
  end if;
  -- Zelfde set als de events_actor_type_check-constraint; expliciet
  -- valideren geeft een nette reason i.p.v. een constraint-fout diep in
  -- de event-insert.
  if p_actor_type is null or p_actor_type not in ('member', 'admin', 'trainer', 'system', 'tablet', 'visitor') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_actor_type');
  end if;
  -- p_booking_id hoort alleen bij een refund: het koppelt de teruggave
  -- aan de boeking waarvan de credits terugkomen.
  if p_booking_id is not null and p_delta <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_booking_refund');
  end if;

  -- Lock op de membership-rij: check en mutatie zijn atomair, zelfde
  -- patroon als book_pt_credits.
  select * into v_membership
  from tmc.memberships
  where id = p_membership_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_membership.plan_type not in ('ten_ride_card', 'pt_package') then
    return jsonb_build_object('ok', false, 'reason', 'not_a_credit_plan');
  end if;

  -- Debit alleen op een actief pakket; een refund mag ook op een
  -- inmiddels opgezegde of verlopen rij landen (bv. sessie-annulering
  -- na een opzegging).
  if p_delta < 0 and v_membership.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'membership_not_active');
  end if;

  -- Booking-gekoppelde refund: lock de boeking mee en maak de
  -- dubbel-refund onmogelijk binnen dezelfde transactie.
  if p_booking_id is not null then
    select * into v_booking
    from tmc.bookings
    where id = p_booking_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
    end if;
    if coalesce(v_booking.credits_used, 0) = 0 then
      return jsonb_build_object('ok', false, 'reason', 'already_refunded');
    end if;
    if v_booking.membership_id is distinct from p_membership_id then
      return jsonb_build_object('ok', false, 'reason', 'booking_membership_mismatch');
    end if;
    if p_delta <> v_booking.credits_used then
      return jsonb_build_object('ok', false, 'reason', 'delta_mismatch');
    end if;

    update tmc.bookings
    set credits_used = 0
    where id = p_booking_id;
  end if;

  v_previous := coalesce(v_membership.credits_remaining, 0);
  v_new := v_previous + p_delta;
  if v_new < 0 then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_credits', 'previous_balance', v_previous);
  end if;

  update tmc.memberships
  set credits_remaining = v_new
  where id = p_membership_id;

  -- Audit-event in dezelfde transactie: geen saldo-mutatie zonder spoor,
  -- geen spoor zonder mutatie. Zelfde type en payload-vorm als de
  -- bestaande credits.adjusted-events uit de TS-laag.
  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'credits.adjusted',
    p_actor_type,
    p_actor_id,
    'membership',
    p_membership_id,
    jsonb_build_object(
      'profile_id', v_membership.profile_id,
      'membership_id', p_membership_id,
      'delta', p_delta,
      'previous_balance', v_previous,
      'new_balance', v_new,
      'source', p_source,
      'reason', trim(p_reason),
      'booking_id', p_booking_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'previous_balance', v_previous,
    'new_balance', v_new
  );
end;
$function$;

-- Nooit direct client-aanroepbaar: alleen de service-role (en postgres)
-- mag executen, zelfde houding als activate_order.
revoke execute on function tmc.adjust_membership_credits(uuid, integer, text, text, text, uuid, uuid) from public;
revoke execute on function tmc.adjust_membership_credits(uuid, integer, text, text, text, uuid, uuid) from anon;
revoke execute on function tmc.adjust_membership_credits(uuid, integer, text, text, text, uuid, uuid) from authenticated;
grant execute on function tmc.adjust_membership_credits(uuid, integer, text, text, text, uuid, uuid) to service_role;

-- Self-verifying. Functionele paden die geen membership-rij nodig hebben
-- (greenfield: er bestaan nog geen credit-rijen) plus structurele checks.
do $$
declare
  v_result jsonb;
  v_grants text;
begin
  -- Onbekende membership geeft not_found, niet een exception.
  v_result := tmc.adjust_membership_credits(gen_random_uuid(), -1, 'migratietest', 'check_in', 'system');
  if (v_result->>'ok')::boolean or v_result->>'reason' is distinct from 'not_found' then
    raise exception 'not_found-pad faalt: %', v_result;
  end if;

  -- Argument-validatie.
  v_result := tmc.adjust_membership_credits(gen_random_uuid(), 0, 'x', 'manual', 'admin');
  if v_result->>'reason' is distinct from 'invalid_delta' then
    raise exception 'invalid_delta-pad faalt: %', v_result;
  end if;
  v_result := tmc.adjust_membership_credits(gen_random_uuid(), 1, ' ', 'manual', 'admin');
  if v_result->>'reason' is distinct from 'invalid_reason' then
    raise exception 'invalid_reason-pad faalt: %', v_result;
  end if;
  v_result := tmc.adjust_membership_credits(gen_random_uuid(), 1, 'x', 'onzin', 'admin');
  if v_result->>'reason' is distinct from 'invalid_source' then
    raise exception 'invalid_source-pad faalt: %', v_result;
  end if;
  v_result := tmc.adjust_membership_credits(gen_random_uuid(), -1, 'x', 'check_in', 'system', null, gen_random_uuid());
  if v_result->>'reason' is distinct from 'invalid_booking_refund' then
    raise exception 'invalid_booking_refund-pad faalt: %', v_result;
  end if;

  -- Constraint bestaat.
  if not exists (
    select 1 from pg_constraint
    where conname = 'memberships_credits_remaining_nonnegative'
      and conrelid = 'tmc.memberships'::regclass
  ) then
    raise exception 'credits_remaining >= 0-constraint ontbreekt';
  end if;

  -- Geen execute voor authenticated of anon.
  select string_agg(grantee::text, ',') into v_grants
  from information_schema.routine_privileges
  where specific_schema = 'tmc' and routine_name = 'adjust_membership_credits'
    and grantee in ('authenticated', 'anon', 'PUBLIC');
  if v_grants is not null then
    raise exception 'adjust_membership_credits heeft onbedoelde grants: %', v_grants;
  end if;
end $$;

commit;
