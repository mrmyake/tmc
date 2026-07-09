-- WS-1 Phase 3: repoint tmc.book_pt_pending_payment onto tmc.catalogue.
--
-- PT confirmed flat during WS-1 discovery: exactly one PT-available
-- trainer (premium tier), zero pt_sessions and zero pt_bookings ever
-- created. The premium/standard/intake tiers and the live
-- shown-9500-charged-8000 bug (standard tier) never sold anything --
-- dead, not a revenue leak. Per spec-membership-flow.md amendment
-- ("PT is flat"), this migration folds the correction in here rather
-- than shipping a separate hotfix: the RPC now reads the flat price from
-- tmc.catalogue (slug=pt_single) instead of its hardcoded CASE.
--
-- CREATE OR REPLACE preserves the existing EXECUTE grants (authenticated
-- only; anon and service_role have never had it) and the function's
-- identity, so no GRANT statements are needed here.

CREATE OR REPLACE FUNCTION tmc.book_pt_pending_payment(p_pt_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmc', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_session record;
  v_has_used_intake boolean;
  v_price_cents int;
  v_existing record;
  v_booking_id uuid;
  v_reused boolean := false;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select ps.id, ps.status, ps.start_at, ps.format,
         t.display_name as trainer_name
  into v_session
  from tmc.pt_sessions ps
  join tmc.trainers t on t.id = ps.trainer_id
  where ps.id = p_pt_session_id;

  if v_session.id is null or v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_unavailable');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  -- Bestaans-check op het profiel: has_used_pt_intake_discount is NOT NULL
  -- DEFAULT false, dus alleen "geen rij gevonden" geeft hier NULL terug.
  -- De intake-korting zelf wordt niet meer toegepast (PT is flat).
  select has_used_pt_intake_discount into v_has_used_intake
  from tmc.profiles where id = v_uid;
  if v_has_used_intake is null then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  -- PT is flat: één catalogusprijs, geen premium/standard/intake-tiers.
  select price_cents into v_price_cents
  from tmc.catalogue
  where slug = 'pt_single' and kind = 'product';

  if v_price_cents is null then
    raise exception 'PT-prijs ontbreekt in tmc.catalogue (slug=pt_single).' using errcode = 'P0001';
  end if;

  -- Idempotentie: bestaande rij voor (profile, sessie) hergebruiken zodat
  -- Mollie-metadata naar hetzelfde booking-id blijft wijzen. Lock op de rij
  -- zodat twee gelijktijdige checkouts niet allebei inserten (edge-case 1;
  -- de unique constraint is het vangnet).
  select id, status into v_existing
  from tmc.pt_bookings
  where profile_id = v_uid and pt_session_id = p_pt_session_id
  for update;

  if v_existing.id is not null then
    if v_existing.status = 'booked' then
      return jsonb_build_object('ok', false, 'reason', 'already_booked');
    end if;
    -- Hergebruik (bv. eerder afgebroken betaling): prijs opnieuw server-side
    -- zetten zodat een oude rij nooit een oude prijs meesleept.
    update tmc.pt_bookings
    set price_paid_cents = v_price_cents,
        is_intake_discount = false
    where id = v_existing.id;
    v_booking_id := v_existing.id;
    v_reused := true;
  else
    begin
      insert into tmc.pt_bookings (
        profile_id, pt_session_id, price_paid_cents, is_intake_discount, status
      ) values (
        v_uid, p_pt_session_id, v_price_cents, false, 'booked'
      )
      returning id into v_booking_id;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'already_booked');
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'price_cents', v_price_cents,
    'is_intake_discount', false,
    'reused', v_reused,
    'trainer_name', v_session.trainer_name,
    'start_at', v_session.start_at
  );
end;
$function$;
