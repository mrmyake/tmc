-- Brute-force-bescherming op de tablet-PIN (unlockAdminMode, security-fix).
--
-- 1. tmc.checkin_pin_attempts + tmc.register_checkin_pin_attempt(text):
--    pogingenteller per IP met vlak beleid: tien pogingen binnen het venster,
--    daarna vijftien minuten lockout. Het venster reset na dertig minuten
--    rust; een goede PIN verwijdert de rij (app-laag, admin-lock.ts).
--    De increment gebeurt atomair in deze RPC zodat parallelle requests de
--    teller niet kunnen omzeilen. Alleen service_role mag tabel en RPC aan.
-- 2. REVOKE op tmc.verify_admin_checkin_pin: SECURITY DEFINER zonder eigen
--    gate, en de enige legitieme aanroeper is de service-role-client in
--    src/lib/check-in/admin-lock.ts. anon/authenticated (en PUBLIC, de
--    Postgres-default op functies) hebben er niets te zoeken.

create table if not exists tmc.checkin_pin_attempts (
  ip text primary key,
  fail_count integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

comment on table tmc.checkin_pin_attempts is
  'Pogingenteller voor de tablet-admin-PIN, per client-IP. Schrijven uitsluitend via service-role (register_checkin_pin_attempt); rij wordt verwijderd bij een geslaagde unlock. Geen policies: RLS aan als slot voor niet-service-rollen.';

alter table tmc.checkin_pin_attempts enable row level security;

revoke all on table tmc.checkin_pin_attempts from public, anon, authenticated;
grant all on table tmc.checkin_pin_attempts to service_role;

create or replace function tmc.register_checkin_pin_attempt(p_ip text)
returns jsonb
language plpgsql
set search_path to 'tmc'
as $$
declare
  v_now timestamptz := now();
  v_row tmc.checkin_pin_attempts%rowtype;
begin
  -- Upsert met no-op update: zorgt dat de rij bestaat en pakt de row-lock,
  -- zodat de rest van de functie race-vrij is tegen parallelle pogingen.
  insert into tmc.checkin_pin_attempts as a (ip)
  values (p_ip)
  on conflict (ip) do update set ip = excluded.ip
  returning * into v_row;

  -- Actieve lockout: weigeren, de aanroeper slaat de bcrypt-verify over.
  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds',
        ceil(extract(epoch from (v_row.locked_until - v_now)))::int
    );
  end if;

  -- Verlopen lockout of dertig minuten zonder pogingen: vers venster.
  if v_row.locked_until is not null
     or v_now - v_row.updated_at > interval '30 minutes' then
    v_row.fail_count := 0;
  end if;

  v_row.fail_count := v_row.fail_count + 1;

  update tmc.checkin_pin_attempts
  set fail_count = v_row.fail_count,
      window_start = case when v_row.fail_count = 1 then v_now
                          else window_start end,
      locked_until = case when v_row.fail_count >= 10
                          then v_now + interval '15 minutes'
                          else null end,
      updated_at = v_now
  where ip = p_ip;

  return jsonb_build_object('allowed', true, 'fail_count', v_row.fail_count);
end;
$$;

comment on function tmc.register_checkin_pin_attempt(text) is
  'Registreert atomair een PIN-poging voor een IP en zegt of die door mag. Vlak beleid: 10 pogingen per venster, daarna 15 min lockout; reset na 30 min rust. Aanroepen vóór de PIN-verify; bij een goede PIN verwijdert de app-laag de rij.';

revoke all on function tmc.register_checkin_pin_attempt(text) from public, anon, authenticated;
grant execute on function tmc.register_checkin_pin_attempt(text) to service_role;

-- 2. verify_admin_checkin_pin dichtzetten voor alles behalve service_role.
revoke execute on function tmc.verify_admin_checkin_pin(text) from public, anon, authenticated;
