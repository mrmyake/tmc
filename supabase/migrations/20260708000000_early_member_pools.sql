-- Early Member: twee onafhankelijke pools van 40 plekken (groepslessen / all_access)
-- met atomaire slot-reservering bij checkout en claim bij bevestigde betaling.
--
-- Mechaniek:
--   * reserve_early_member_slot() lockt de pool-rij (FOR UPDATE), telt bezet
--     (claimed + niet-verlopen reserved) en reserveert onder de cap. Idempotent
--     per profiel-per-pool.
--   * claim_early_member_slot() flipt reserved -> claimed vanuit de Mollie-webhook
--     (service_role, PR 2). Superseedt een eventuele nieuwere hold van hetzelfde
--     profiel zodat de unique index nooit botst.
--   * cancel_early_member_reservation() geeft een plek terug na refund/chargeback
--     of een gesuperseedde checkout (service_role, tooling in latere PR).
--   * De release-cron (/api/cron/release-early-member-holds) zet verlopen holds op
--     'expired' — puur boekhouding: de telling negeert verlopen holds sowieso via
--     expires_at, dus correctheid hangt nooit af van cron-timing.
--   * get_early_member_availability() voedt de publieke "nog X van 40"-teller
--     zonder de reserveringstabel publiek te maken.
--
-- Alle schrijf-RPC's zijn service_role-only: reserveren gebeurt uitsluitend via de
-- checkout server action (PR 2), nooit rechtstreeks vanuit de client. Dit voorkomt
-- dat ingelogde accounts zonder betaalintentie de pools kunnen kampeer-blokkeren.

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
    "profile_id" uuid,
    "status" text DEFAULT 'reserved' NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "claimed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "mollie_payment_id" text,
    "membership_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "early_member_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "early_member_reservations_status_check"
        CHECK ("status" IN ('reserved', 'claimed', 'expired', 'cancelled')),
    CONSTRAINT "early_member_reservations_pool_fkey"
        FOREIGN KEY ("pool") REFERENCES "tmc"."early_member_pools"("pool"),
    -- SET NULL i.p.v. CASCADE: een hard-delete van een lid mag een geclaimde
    -- (betaalde) plek nooit stilletjes heropenen of het betaalspoor
    -- (mollie_payment_id) wissen — zelfde keuze als tmc.payments.
    CONSTRAINT "early_member_reservations_profile_id_fkey"
        FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE SET NULL,
    CONSTRAINT "early_member_reservations_membership_id_fkey"
        FOREIGN KEY ("membership_id") REFERENCES "tmc"."memberships"("id") ON DELETE SET NULL
);

ALTER TABLE "tmc"."early_member_reservations" OWNER TO "postgres";

COMMENT ON TABLE "tmc"."early_member_reservations" IS
  'Early Member slot-holds. Bezet = claimed + reserved met expires_at in de toekomst; verlopen holds tellen nooit mee, ook vóór de release-cron ze op expired zet.';

COMMENT ON COLUMN "tmc"."early_member_reservations"."status" IS
  'Lees status nooit los van expires_at: een rij kan tot de volgende cron-run op reserved staan terwijl de hold al verlopen is. Actief = claimed OR (reserved AND expires_at > now()).';

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
DROP POLICY IF EXISTS "early_member_pools_admin_read" ON "tmc"."early_member_pools";
CREATE POLICY "early_member_pools_admin_read" ON "tmc"."early_member_pools"
    FOR SELECT USING ("tmc"."is_admin"());

-- Reserveringen: leden zien alleen hun eigen rij; admin alles.
-- Schrijven gaat uitsluitend via de RPC's en service_role.
DROP POLICY IF EXISTS "early_member_reservations_self_read" ON "tmc"."early_member_reservations";
CREATE POLICY "early_member_reservations_self_read" ON "tmc"."early_member_reservations"
    FOR SELECT USING ("profile_id" = "auth"."uid"());

DROP POLICY IF EXISTS "early_member_reservations_admin_read" ON "tmc"."early_member_reservations";
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
  if p_profile_id is null then
    raise exception 'p_profile_id is verplicht.' using errcode = '22004';
  end if;

  -- Defense-in-depth: de functie is service_role-only, maar mocht de grant ooit
  -- verruimd worden dan kan een ingelogde caller alleen voor zichzelf reserveren.
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

  -- Idempotentie vóór de sluitdatum-check: wie al een geldige hold (of claim)
  -- heeft, houdt die ook net na closes_at — anders blokkeert een page-refresh
  -- op de sluitingsavond de checkout die de hold juist moest garanderen.
  select * into v_existing
  from tmc.early_member_reservations
  where pool = p_pool
    and profile_id = p_profile_id
    and (status = 'claimed' or (status = 'reserved' and expires_at > now()))
  limit 1;

  if found then
    if v_existing.status = 'claimed' then
      -- Al betaald: expliciet weigeren zodat de checkout-laag (PR 2) nooit per
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
  'Reserveert atomair een Early Member-plek: lockt de pool-rij, telt bezet (claimed + niet-verlopen reserved) en reserveert onder de cap en vóór closes_at. Idempotent per profiel-per-pool; een al geclaimde plek geeft already_claimed terug. Service_role-only: alleen aanroepbaar vanuit de checkout server action, zodat accounts zonder betaalintentie de pools niet kunnen blokkeren.';

REVOKE ALL ON FUNCTION "tmc"."reserve_early_member_slot"(text, uuid) FROM PUBLIC;
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
  v_was_expired boolean;
begin
  select * into v_reservation
  from tmc.early_member_reservations
  where id = p_reservation_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Zelfde lock-volgorde als reserve (eerst pool, dan reserveringen) zodat
  -- claim en reserve elkaar nooit kunnen deadlocken.
  perform 1 from tmc.early_member_pools where pool = v_reservation.pool for update;

  select * into v_reservation
  from tmc.early_member_reservations
  where id = p_reservation_id
  for update;

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

  v_was_expired := v_reservation.status = 'expired';

  if v_reservation.profile_id is not null then
    -- Heeft dit profiel al een ándere geclaimde plek in deze pool, dan is dit
    -- een dubbele betaling: niet claimen, de webhook-laag moet refunden/alarmeren.
    if exists (
      select 1 from tmc.early_member_reservations
      where pool = v_reservation.pool
        and profile_id = v_reservation.profile_id
        and status = 'claimed'
        and id <> p_reservation_id
    ) then
      return jsonb_build_object('ok', false, 'reason', 'profile_already_claimed');
    end if;

    -- Een nieuwere hold van hetzelfde profiel (gestart nadat deze verliep)
    -- superseden, anders botst de flip naar claimed op de unique index.
    update tmc.early_member_reservations
       set status = 'cancelled',
           cancelled_at = now()
     where pool = v_reservation.pool
       and profile_id = v_reservation.profile_id
       and status = 'reserved'
       and id <> p_reservation_id;
  end if;

  -- 'reserved' én 'expired' zijn claimbaar: een afgeronde betaling wint van de
  -- hold-deadline. In het zeldzame geval dat de pool intussen weer volliep kan
  -- de telling daardoor één boven de cap uitkomen — de klant kreeg de deal
  -- beloofd bij checkout-start, dus die honoreren we. was_expired in het
  -- resultaat laat de webhook-laag dat geval loggen/alarmeren.
  update tmc.early_member_reservations
     set status = 'claimed',
         claimed_at = now(),
         membership_id = p_membership_id,
         mollie_payment_id = coalesce(p_mollie_payment_id, mollie_payment_id)
   where id = p_reservation_id;

  return jsonb_build_object(
    'ok', true,
    'reservation_id', p_reservation_id,
    'already_claimed', false,
    'was_expired', v_was_expired
  );
end;
$$;

ALTER FUNCTION "tmc"."claim_early_member_slot"(uuid, uuid, text) OWNER TO "postgres";

COMMENT ON FUNCTION "tmc"."claim_early_member_slot"(uuid, uuid, text) IS
  'Flipt een Early Member-reservering naar claimed bij bevestigde Mollie-betaling en koppelt de membership. Idempotent bij webhook-retries; expired-maar-betaald wordt gehonoreerd (was_expired in resultaat); een nieuwere hold van hetzelfde profiel wordt gesuperseed. Alleen service_role.';

REVOKE ALL ON FUNCTION "tmc"."claim_early_member_slot"(uuid, uuid, text) FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."claim_early_member_slot"(uuid, uuid, text) TO "service_role";

-- ---------------------------------------------------------------------------
-- RPC: plek teruggeven (refund/chargeback of handmatige vrijgave)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "tmc"."cancel_early_member_reservation"(
    "p_reservation_id" uuid
) RETURNS jsonb
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  v_reservation tmc.early_member_reservations%rowtype;
begin
  select * into v_reservation
  from tmc.early_member_reservations
  where id = p_reservation_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Zelfde lock-volgorde als reserve/claim.
  perform 1 from tmc.early_member_pools where pool = v_reservation.pool for update;

  select * into v_reservation
  from tmc.early_member_reservations
  where id = p_reservation_id
  for update;

  if v_reservation.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'reservation_id', v_reservation.id, 'already_cancelled', true);
  end if;

  update tmc.early_member_reservations
     set status = 'cancelled',
         cancelled_at = now()
   where id = p_reservation_id;

  return jsonb_build_object(
    'ok', true,
    'reservation_id', p_reservation_id,
    'already_cancelled', false,
    'previous_status', v_reservation.status
  );
end;
$$;

ALTER FUNCTION "tmc"."cancel_early_member_reservation"(uuid) OWNER TO "postgres";

COMMENT ON FUNCTION "tmc"."cancel_early_member_reservation"(uuid) IS
  'Geeft een Early Member-plek terug: zet de reservering op cancelled (bijv. na refund/chargeback), waarna de plek weer meetelt als vrij en het profiel opnieuw kan reserveren. Idempotent. Alleen service_role.';

REVOKE ALL ON FUNCTION "tmc"."cancel_early_member_reservation"(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."cancel_early_member_reservation"(uuid) TO "service_role";

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
