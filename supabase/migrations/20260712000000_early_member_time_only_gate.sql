-- Early Member: beschikbaarheid wordt puur tijdsgebaseerd.
--
-- Businessbeslissing: de harde cap van 40 plekken per pool mag een aanmelding
-- niet langer blokkeren. De enige poort is voortaan: is het nu vóór closes_at.
--
-- Twee wijzigingen, beide zonder signature-verandering (CREATE OR REPLACE,
-- bestaande GRANTs blijven intact):
--
-- 1. get_early_member_availability(): is_open wordt now() < closes_at.
--    De kolommen cap/occupied/remaining blijven in de return shape staan
--    (frontend leest ze mogelijk nog), maar tellen niet meer mee voor is_open.
--
-- 2. reserve_early_member_slot(): de pool_full-afwijzing (bezettingstelling
--    tegen de cap) vervalt. De 'closed'-afwijzing (closes_at verstreken) blijft
--    de enige echte poort. already_claimed en pool_not_found blijven ongewijzigd,
--    net als de idempotentie, de hold-expiry en de pool-row lock die reserve,
--    claim en cancel in dezelfde volgorde nemen (deadlock-preventie).
--
-- Het hold/expiry/release-mechanisme (reservations, expires_at, release-cron)
-- blijft bewust staan: het is nu vestigiaal als schaarste-bescherming, maar
-- nog steeds nuttig als race-vrij aanmeldpad. Opruimen is een aparte beslissing.

create or replace function tmc.get_early_member_availability()
 returns table(pool text, cap integer, occupied bigint, remaining bigint, closes_at timestamp with time zone, is_open boolean)
 language sql
 stable security definer
 set search_path to 'tmc', 'extensions'
as $function$
  select p.pool,
         p.cap,
         count(r.id) as occupied,
         greatest(p.cap - count(r.id), 0) as remaining,
         p.closes_at,
         (now() < p.closes_at) as is_open
  from tmc.early_member_pools p
  left join tmc.early_member_reservations r
    on r.pool = p.pool
   and (r.status = 'claimed' or (r.status = 'reserved' and r.expires_at > now()))
  group by p.pool, p.cap, p.closes_at;
$function$;

create or replace function tmc.reserve_early_member_slot(p_pool text, p_profile_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_pool tmc.early_member_pools%rowtype;
  v_existing tmc.early_member_reservations%rowtype;
  v_reservation tmc.early_member_reservations%rowtype;
begin
  if p_profile_id is null then
    raise exception 'p_profile_id is verplicht.' using errcode = '22004';
  end if;

  -- Defense-in-depth: de functie is service_role-only, maar mocht de grant ooit
  -- verruimd worden dan kan een ingelogde caller alleen voor zichzelf reserveren.
  if v_uid is not null and v_uid <> p_profile_id then
    raise exception 'Reservering kan alleen voor het eigen profiel.' using errcode = '42501';
  end if;

  -- Lock op de pool-rij serialiseert reserveringen per pool. Er is geen cap
  -- meer, maar de lock blijft: zelfde lock-volgorde als claim/cancel (eerst
  -- pool, dan reserveringen) voorkomt deadlocks, en de idempotentie-check
  -- hieronder blijft race-vrij.
  select * into v_pool
  from tmc.early_member_pools
  where pool = p_pool
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'pool_not_found');
  end if;

  -- Idempotentie vóór de sluitdatum-check: wie al een geldige hold (of claim)
  -- heeft, houdt die ook net na closes_at. Anders blokkeert een page-refresh
  -- op de sluitingsavond de checkout die de hold juist moest garanderen.
  select * into v_existing
  from tmc.early_member_reservations
  where pool = p_pool
    and profile_id = p_profile_id
    and (status = 'claimed' or (status = 'reserved' and expires_at > now()))
  limit 1;

  if found then
    if v_existing.status = 'claimed' then
      -- Al betaald: expliciet weigeren zodat de checkout-laag nooit per
      -- ongeluk een tweede Mollie-betaling start voor een al gekochte plek.
      return jsonb_build_object(
        'ok', false,
        'reason', 'already_claimed',
        'reservation_id', v_existing.id
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'reservation_id', v_existing.id,
      'status', v_existing.status,
      'expires_at', v_existing.expires_at,
      'existing', true
    );
  end if;

  if now() >= v_pool.closes_at then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  -- Verlopen hold van dit profiel opruimen zodat de unique index niet botst.
  update tmc.early_member_reservations
     set status = 'expired'
   where pool = p_pool
     and profile_id = p_profile_id
     and status = 'reserved'
     and expires_at <= now();

  insert into tmc.early_member_reservations (pool, profile_id, expires_at)
  values (p_pool, p_profile_id, now() + make_interval(mins => v_pool.hold_window_minutes))
  returning * into v_reservation;

  return jsonb_build_object(
    'ok', true,
    'reservation_id', v_reservation.id,
    'status', v_reservation.status,
    'expires_at', v_reservation.expires_at,
    'existing', false
  );
end;
$function$;
