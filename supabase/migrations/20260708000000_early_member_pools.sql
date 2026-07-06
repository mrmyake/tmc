-- Early Member: twee onafhankelijke pools van 40 plekken (groepslessen / all_access)
-- met atomaire slot-reservering bij checkout en claim bij bevestigde betaling.
--
-- Mechaniek:
--   * reserve_early_member_slot() lockt de pool-rij (FOR UPDATE), telt bezet
--     (claimed + niet-verlopen reserved) en reserveert onder de cap. Idempotent
--     per profiel-per-pool.
--   * claim_early_member_slot() flipt reserved -> claimed vanuit de Mollie-webhook
--     (service_role, PR 2).
--   * De release-cron (/api/cron/release-early-member-holds) zet verlopen holds op
--     'expired' — puur boekhouding: de telling negeert verlopen holds sowieso via
--     expires_at, dus correctheid hangt nooit af van cron-timing.
--   * get_early_member_availability() voedt de publieke "nog X van 40"-teller
--     zonder de reserveringstabel publiek te maken.

-- ---------------------------------------------------------------------------
-- Pool-configuratie
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "tmc"."early_member_pools" (
    "pool" text NOT NULL,
    "cap" integer DEFAULT 40 NOT NULL,
    "closes_at" timestamp with time zone NOT NULL,
    "hold_window_minutes" integer DEFAULT 45 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "early_member_pools_pkey" PRIMARY KEY ("pool"),
    CONSTRAINT "early_member_pools_pool_check" CHECK ("pool" IN ('groepslessen', 'all_access')),
    CONSTRAINT "early_member_pools_cap_check" CHECK ("cap" >= 0),
    CONSTRAINT "early_member_pools_hold_window_check" CHECK ("hold_window_minutes" > 0)
);

ALTER TABLE "tmc"."early_member_pools" OWNER TO "postgres";

COMMENT ON TABLE "tmc"."early_member_pools" IS
  'Config per Early Member-pool: cap (40), sluitdatum (eind september 2026) en hold-window. De pool-rij is tevens het lock-doel voor de atomaire reservering.';

-- Campagne loopt t/m september 2026 (Europe/Amsterdam).
INSERT INTO "tmc"."early_member_pools" ("pool", "cap", "closes_at", "hold_window_minutes")
VALUES
    ('groepslessen', 40, '2026-10-01T00:00:00+02:00', 45),
    ('all_access',   40, '2026-10-01T00:00:00+02:00', 45)
ON CONFLICT ("pool") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Reserveringen
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "tmc"."early_member_reservations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "pool" text NOT NULL,
    "profile_id" uuid NOT NULL,
    "status" text DEFAULT 'reserved' NOT NULL,
    "reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "claimed_at" timestamp with time zone,
    "mollie_payment_id" text,
    "membership_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "early_member_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "early_member_reservations_status_check"
        CHECK ("status" IN ('reserved', 'claimed', 'expired', 'cancelled')),
    CONSTRAINT "early_member_reservations_pool_fkey"
        FOREIGN KEY ("pool") REFERENCES "tmc"."early_member_pools"("pool"),
    CONSTRAINT "early_member_reservations_profile_id_fkey"
        FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE,
    CONSTRAINT "early_member_reservations_membership_id_fkey"
        FOREIGN KEY ("membership_id") REFERENCES "tmc"."memberships"("id") ON DELETE SET NULL
);

ALTER TABLE "tmc"."early_member_reservations" OWNER TO "postgres";

COMMENT ON TABLE "tmc"."early_member_reservations" IS
  'Early Member slot-holds. Bezet = claimed + reserved met expires_at in de toekomst; verlopen holds tellen nooit mee, ook vóór de release-cron ze op expired zet.';

-- Eén actieve reservering per profiel per pool (idempotentie-anker).
CREATE UNIQUE INDEX IF NOT EXISTS "early_member_reservations_active_profile_idx"
    ON "tmc"."early_member_reservations" ("pool", "profile_id")
    WHERE "status" IN ('reserved', 'claimed');

-- Telling per pool + release-cron scan.
CREATE INDEX IF NOT EXISTS "early_member_reservations_pool_status_idx"
    ON "tmc"."early_member_reservations" ("pool", "status", "expires_at");

CREATE INDEX IF NOT EXISTS "early_member_reservations_mollie_idx"
    ON "tmc"."early_member_reservations" ("mollie_payment_id")
    WHERE "mollie_payment_id" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE "tmc"."early_member_pools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tmc"."early_member_reservations" ENABLE ROW LEVEL SECURITY;

-- Pools: alleen admin leest de config direct; de publieke teller loopt via
-- get_early_member_availability() (SECURITY DEFINER).
CREATE POLICY "early_member_pools_admin_read" ON "tmc"."early_member_pools"
    FOR SELECT USING ("tmc"."is_admin"());

-- Reserveringen: leden zien alleen hun eigen rij; admin alles.
-- Schrijven gaat uitsluitend via de RPC's en service_role.
CREATE POLICY "early_member_reservations_self_read" ON "tmc"."early_member_reservations"
    FOR SELECT USING ("profile_id" = "auth"."uid"());

CREATE POLICY "early_member_reservations_admin_read" ON "tmc"."early_member_reservations"
    FOR SELECT USING ("tmc"."is_admin"());

GRANT SELECT ON TABLE "tmc"."early_member_pools" TO "authenticated";
GRANT ALL ON TABLE "tmc"."early_member_pools" TO "service_role";

GRANT SELECT ON TABLE "tmc"."early_member_reservations" TO "authenticated";
GRANT ALL ON TABLE "tmc"."early_member_reservations" TO "service_role";

-- ---------------------------------------------------------------------------
-- RPC: reserveren bij checkout-start
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "tmc"."reserve_early_member_slot"(
    "p_pool" text,
    "p_profile_id" uuid
) RETURNS jsonb
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_pool tmc.early_member_pools%rowtype;
  v_existing tmc.early_member_reservations%rowtype;
  v_occupied integer;
  v_reservation tmc.early_member_reservations%rowtype;
begin
  -- Ingelogde gebruikers kunnen alleen voor zichzelf reserveren;
  -- service_role (auth.uid() is null) mag elk profiel doorgeven.
  if v_uid is not null and v_uid <> p_profile_id then
    raise exception 'Reservering kan alleen voor het eigen profiel.' using errcode = '42501';
  end if;

  -- Lock op de pool-rij serialiseert tellen + reserveren: nooit meer dan cap.
  select * into v_pool
  from tmc.early_member_pools
  where pool = p_pool
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'pool_not_found');
  end if;

  if now() >= v_pool.closes_at then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  -- Idempotent: bestaande actieve reservering (of claim) teruggeven.
  select * into v_existing
  from tmc.early_member_reservations
  where pool = p_pool
    and profile_id = p_profile_id
    and (status = 'claimed' or (status = 'reserved' and expires_at > now()))
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'reservation_id', v_existing.id,
      'status', v_existing.status,
      'expires_at', v_existing.expires_at,
      'existing', true
    );
  end if;

  -- Verlopen hold van dit profiel opruimen zodat de unique index niet botst.
  update tmc.early_member_reservations
     set status = 'expired'
   where pool = p_pool
     and profile_id = p_profile_id
     and status = 'reserved'
     and expires_at <= now();

  -- Bezet = claimed + niet-verlopen reserved. Verlopen holds tellen niet mee,
  -- ook als de release-cron ze nog niet op expired heeft gezet.
  select count(*) into v_occupied
  from tmc.early_member_reservations
  where pool = p_pool
    and (status = 'claimed' or (status = 'reserved' and expires_at > now()));

  if v_occupied >= v_pool.cap then
    return jsonb_build_object('ok', false, 'reason', 'pool_full');
  end if;

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
$$;

ALTER FUNCTION "tmc"."reserve_early_member_slot"(text, uuid) OWNER TO "postgres";

COMMENT ON FUNCTION "tmc"."reserve_early_member_slot"(text, uuid) IS
  'Reserveert atomair een Early Member-plek: lockt de pool-rij, telt bezet (claimed + niet-verlopen reserved) en reserveert onder de cap en vóór closes_at. Idempotent per profiel-per-pool. Ingelogde callers alleen voor eigen profiel (42501); service_role vrij.';

REVOKE ALL ON FUNCTION "tmc"."reserve_early_member_slot"(text, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."reserve_early_member_slot"(text, uuid) TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."reserve_early_member_slot"(text, uuid) TO "service_role";

-- ---------------------------------------------------------------------------
-- RPC: claimen bij bevestigde betaling (Mollie-webhook, PR 2)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "tmc"."claim_early_member_slot"(
    "p_reservation_id" uuid,
    "p_membership_id" uuid,
    "p_mollie_payment_id" text DEFAULT NULL
) RETURNS jsonb
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  v_reservation tmc.early_member_reservations%rowtype;
begin
  select * into v_reservation
  from tmc.early_member_reservations
  where id = p_reservation_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Webhook-retries: een tweede claim op dezelfde rij is een no-op.
  if v_reservation.status = 'claimed' then
    return jsonb_build_object(
      'ok', true,
      'reservation_id', v_reservation.id,
      'already_claimed', true
    );
  end if;

  if v_reservation.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
  end if;

  -- 'reserved' én 'expired' zijn claimbaar: een afgeronde betaling wint van de
  -- hold-deadline. In het zeldzame geval dat de pool intussen weer volliep kan
  -- de telling daardoor één boven de cap uitkomen — de klant kreeg de deal
  -- beloofd bij checkout-start, dus die honoreren we.
  update tmc.early_member_reservations
     set status = 'claimed',
         claimed_at = now(),
         membership_id = p_membership_id,
         mollie_payment_id = coalesce(p_mollie_payment_id, mollie_payment_id)
   where id = p_reservation_id;

  return jsonb_build_object(
    'ok', true,
    'reservation_id', p_reservation_id,
    'already_claimed', false
  );
end;
$$;

ALTER FUNCTION "tmc"."claim_early_member_slot"(uuid, uuid, text) OWNER TO "postgres";

COMMENT ON FUNCTION "tmc"."claim_early_member_slot"(uuid, uuid, text) IS
  'Flipt een Early Member-reservering naar claimed bij bevestigde Mollie-betaling en koppelt de membership. Idempotent bij webhook-retries; expired-maar-betaald wordt gehonoreerd. Alleen service_role.';

REVOKE ALL ON FUNCTION "tmc"."claim_early_member_slot"(uuid, uuid, text) FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."claim_early_member_slot"(uuid, uuid, text) TO "service_role";

-- ---------------------------------------------------------------------------
-- Publieke teller
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "tmc"."get_early_member_availability"()
RETURNS TABLE (
    "pool" text,
    "cap" integer,
    "occupied" bigint,
    "remaining" bigint,
    "closes_at" timestamp with time zone,
    "is_open" boolean
)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
  select p.pool,
         p.cap,
         count(r.id) as occupied,
         greatest(p.cap - count(r.id), 0) as remaining,
         p.closes_at,
         (now() < p.closes_at and count(r.id) < p.cap) as is_open
  from tmc.early_member_pools p
  left join tmc.early_member_reservations r
    on r.pool = p.pool
   and (r.status = 'claimed' or (r.status = 'reserved' and r.expires_at > now()))
  group by p.pool, p.cap, p.closes_at;
$$;

ALTER FUNCTION "tmc"."get_early_member_availability"() OWNER TO "postgres";

COMMENT ON FUNCTION "tmc"."get_early_member_availability"() IS
  'Publieke "nog X van 40"-teller per Early Member-pool, afgeleid van dezelfde telling als de reserverings-RPC (claimed + niet-verlopen reserved). Het getal kan omhoog als een hold verloopt; dat is correct.';

REVOKE ALL ON FUNCTION "tmc"."get_early_member_availability"() FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."get_early_member_availability"() TO "anon";
GRANT ALL ON FUNCTION "tmc"."get_early_member_availability"() TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."get_early_member_availability"() TO "service_role";
