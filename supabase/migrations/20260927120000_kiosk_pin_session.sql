-- Kiosk: persoonlijke staf-PIN, apparaatkoppeling en pogingen per staflid
-- per apparaat (check-in-spoor PR 2, fase-2-checkin-model.md,
-- discovery-kiosk-checkin.md §G). Vervangt de gedeelde team-PIN in
-- booking_settings.admin_checkin_pin_hash, die via booking_settings_public_read
-- voor anon leesbaar was (bevinding PR 2), en de IP-teller
-- checkin_pin_attempts / register_checkin_pin_attempt (PR #130).
--
-- Alles service-role-only behalve set_staff_pin en clear_staff_pin, die de
-- admin via de user-client aanroept (is_admin() binnenin), zoals
-- set_admin_checkin_pin dat deed. De kiosk-sessie zelf (HMAC-cookie,
-- KIOSK_SESSION_SECRET) leeft in de app: src/lib/kiosk/session.ts.
--
-- Draaien met `supabase db push` na de merge; niet ervoor.

begin;

-- ---------------------------------------------------------------------------
-- 1. staff_pins: één gehashte PIN per staflid, met versie voor sessie-verval
-- ---------------------------------------------------------------------------

create table if not exists tmc.staff_pins (
  profile_id uuid primary key references tmc.profiles(id) on delete cascade,
  pin_hash text not null,
  pin_version integer not null default 1,
  is_active boolean not null default true,
  set_by uuid references tmc.profiles(id) on delete set null,
  set_at timestamptz not null default now()
);

comment on table tmc.staff_pins is
  'Persoonlijke 4-cijferige kiosk-PIN per staflid, bcrypt (pgcrypto). pin_version stijgt bij elke set of clear; een kiosk-sessie met een oudere versie is ongeldig. Alleen service_role leest; set/clear via de admin-RPCs.';

alter table tmc.staff_pins enable row level security;
revoke all on table tmc.staff_pins from public, anon, authenticated;
grant all on table tmc.staff_pins to service_role;

-- ---------------------------------------------------------------------------
-- 2. kiosk_devices: gekoppelde tablets. Echtheid zit in het getekende
--    cookie; geldigheid in revoked_at (elke gate-aanroep leest de rij).
-- ---------------------------------------------------------------------------

create table if not exists tmc.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  created_by uuid references tmc.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references tmc.profiles(id) on delete set null
);

comment on table tmc.kiosk_devices is
  'Gekoppelde kiosk-apparaten. Het apparaat-cookie bevat alleen dit id, getekend met KIOSK_SESSION_SECRET; intrekken zet revoked_at en werkt bij de eerstvolgende aanroep.';

alter table tmc.kiosk_devices enable row level security;
revoke all on table tmc.kiosk_devices from public, anon, authenticated;
grant all on table tmc.kiosk_devices to service_role;

-- ---------------------------------------------------------------------------
-- 3. kiosk_pin_attempts: foute pogingen per (staflid, apparaat)
-- ---------------------------------------------------------------------------

create table if not exists tmc.kiosk_pin_attempts (
  profile_id uuid not null references tmc.profiles(id) on delete cascade,
  device_id uuid not null references tmc.kiosk_devices(id) on delete cascade,
  fail_count integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_id, device_id)
);

alter table tmc.kiosk_pin_attempts enable row level security;
revoke all on table tmc.kiosk_pin_attempts from public, anon, authenticated;
grant all on table tmc.kiosk_pin_attempts to service_role;

-- ---------------------------------------------------------------------------
-- 4. Hulpfunctie: is dit profiel staf (zelfde regel als tmc.is_staff(),
--    maar voor een opgegeven profiel in plaats van auth.uid()).
-- ---------------------------------------------------------------------------

drop function if exists tmc.is_staff_profile(uuid);
create function tmc.is_staff_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'tmc', 'extensions'
as $$
  select exists (select 1 from tmc.profiles p where p.id = p_profile_id and p.role = 'admin')
      or exists (select 1 from tmc.trainers t where t.profile_id = p_profile_id and t.is_active);
$$;
revoke all on function tmc.is_staff_profile(uuid) from public, anon, authenticated;
grant execute on function tmc.is_staff_profile(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. set_staff_pin / clear_staff_pin: alleen admin, via de user-client
-- ---------------------------------------------------------------------------

drop function if exists tmc.set_staff_pin(uuid, text);
create function tmc.set_staff_pin(p_profile_id uuid, p_pin text)
returns integer
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_version integer;
begin
  if not tmc.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN moet 4 cijfers zijn';
  end if;
  if not tmc.is_staff_profile(p_profile_id) then
    raise exception 'Geen staflid';
  end if;

  insert into tmc.staff_pins (profile_id, pin_hash, pin_version, is_active, set_by, set_at)
  values (
    p_profile_id,
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    1,
    true,
    auth.uid(),
    now()
  )
  on conflict (profile_id) do update
    set pin_hash = excluded.pin_hash,
        pin_version = tmc.staff_pins.pin_version + 1,
        is_active = true,
        set_by = excluded.set_by,
        set_at = now()
  returning pin_version into v_version;

  return v_version;
end;
$$;
revoke all on function tmc.set_staff_pin(uuid, text) from public, anon;
grant execute on function tmc.set_staff_pin(uuid, text) to authenticated, service_role;

drop function if exists tmc.clear_staff_pin(uuid);
create function tmc.clear_staff_pin(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
begin
  if not tmc.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  -- Versie omhoog zodat lopende sessies van dit staflid vervallen.
  update tmc.staff_pins
  set is_active = false,
      pin_version = pin_version + 1,
      set_by = auth.uid(),
      set_at = now()
  where profile_id = p_profile_id;
end;
$$;
revoke all on function tmc.clear_staff_pin(uuid) from public, anon;
grant execute on function tmc.clear_staff_pin(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. verify_staff_pin: alleen service_role. Nooit een onderscheid tussen
--    "geen PIN", "inactief" en "fout": alles is ok=false.
-- ---------------------------------------------------------------------------

drop function if exists tmc.verify_staff_pin(uuid, text);
create function tmc.verify_staff_pin(p_profile_id uuid, p_pin text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_row tmc.staff_pins%rowtype;
begin
  select * into v_row from tmc.staff_pins where profile_id = p_profile_id;
  if not found or not v_row.is_active or not tmc.is_staff_profile(p_profile_id) then
    return jsonb_build_object('ok', false);
  end if;
  if v_row.pin_hash = extensions.crypt(p_pin, v_row.pin_hash) then
    return jsonb_build_object('ok', true, 'pin_version', v_row.pin_version);
  end if;
  return jsonb_build_object('ok', false);
end;
$$;
revoke all on function tmc.verify_staff_pin(uuid, text) from public, anon, authenticated;
grant execute on function tmc.verify_staff_pin(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. register_kiosk_pin_attempt: teller per (staflid, apparaat), zelfde
--    row-lock-opzet als de oude IP-teller. Vijf fouten geeft vijftien
--    minuten blokkade; dertig minuten stilte of een verlopen blokkade geeft
--    een vers venster. Een goede PIN wist de rij (doet de app, service_role).
-- ---------------------------------------------------------------------------

drop function if exists tmc.register_kiosk_pin_attempt(uuid, uuid);
create function tmc.register_kiosk_pin_attempt(p_profile_id uuid, p_device_id uuid)
returns jsonb
language plpgsql
set search_path to 'tmc'
as $$
declare
  v_now timestamptz := now();
  v_row tmc.kiosk_pin_attempts%rowtype;
begin
  insert into tmc.kiosk_pin_attempts as a (profile_id, device_id)
  values (p_profile_id, p_device_id)
  on conflict (profile_id, device_id) do update set profile_id = excluded.profile_id
  returning * into v_row;

  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', ceil(extract(epoch from (v_row.locked_until - v_now)))::int
    );
  end if;

  if v_row.locked_until is not null
     or v_now - v_row.updated_at > interval '30 minutes' then
    v_row.fail_count := 0;
  end if;

  v_row.fail_count := v_row.fail_count + 1;

  update tmc.kiosk_pin_attempts
  set fail_count = v_row.fail_count,
      window_start = case when v_row.fail_count = 1 then v_now else window_start end,
      locked_until = case when v_row.fail_count >= 5 then v_now + interval '15 minutes' else null end,
      updated_at = v_now
  where profile_id = p_profile_id and device_id = p_device_id;

  return jsonb_build_object('allowed', true, 'fail_count', v_row.fail_count);
end;
$$;
revoke all on function tmc.register_kiosk_pin_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function tmc.register_kiosk_pin_attempt(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. De gedeelde team-PIN en de IP-teller weg, met hun grants.
-- ---------------------------------------------------------------------------

revoke all on function tmc.verify_admin_checkin_pin(text) from public, anon, authenticated, service_role;
drop function if exists tmc.verify_admin_checkin_pin(text);
revoke all on function tmc.set_admin_checkin_pin(text) from public, anon, authenticated, service_role;
drop function if exists tmc.set_admin_checkin_pin(text);
revoke all on function tmc.register_checkin_pin_attempt(text) from public, anon, authenticated, service_role;
drop function if exists tmc.register_checkin_pin_attempt(text);
drop table if exists tmc.checkin_pin_attempts;
alter table tmc.booking_settings drop column if exists admin_checkin_pin_hash;

commit;
