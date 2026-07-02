-- Fix: handle_new_auth_user's fallback-telefoonnummer voldeed niet aan
-- profiles_phone_e164_nl, dus elke signup zonder telefoon in de
-- auth-metadata crashte op profiel-aanmaak.
--
-- SCHEMA-DRIFT (audit #4, opnieuw bevestigd): de live tmc.handle_new_auth_user
-- wijkt substantieel af van de public.handle_new_auth_user in
-- supabase/migrations/20260421000000_tmc_member_system.sql:1052-1062 e.v.
-- (regel 116-137 van dat bestand). Het repo-bestand insert alleen
-- id/email/first_name/last_name in public.profiles. De live functie
-- (schema tmc) insert daarnaast ook phone (met fallback-generatie),
-- member_code (met collision-retry-loop), en de vijf acquisition-/
-- signup_path-/first_touch_at-kolommen — geen van die toevoegingen staat
-- in enige migratie in de repo. Deze fix is dus geschreven tegen de LIVE
-- functie-body (opgehaald via pg_get_functiondef), niet tegen het
-- repo-bestand — net als 20260702000000_membership_cancellation_rpc.sql
-- en 20260702100000_booking_write_rpcs.sql al aangeven.
--
-- Bug: het fallback-nummer werd gebouwd als
--   '+3160' || lpad((abs(hashtext(new.id::text)) % 100000000)::text, 8, '0')
-- oftewel '+31' + '60' + 8 cijfers = 10 cijfers ná de landcode. De
-- check-constraint profiles_phone_e164_nl eist '^\+31[0-9]{9}$' — precies
-- 9 cijfers. Elke signup zonder telefoon in de metadata (bevestigd
-- bereikbaar: het magic-link-formulier op /login voor een nieuw e-mailadres
-- — signInWithOtp met shouldCreateUser default true — en
-- inviteTrainer()/inviteUserByEmail() in trainer-actions.ts sturen beide
-- geen phone mee) raakte hierdoor een 23514 constraint-violation en de
-- signup crashte op profiel-aanmaak.
--
-- Fix (kleinst mogelijke veilige aanpassing, scope beperkt tot dit
-- fallback-nummer): '+3160' -> '+316', zodat het resultaat '+31' + '6' +
-- 8 cijfers = 9 cijfers wordt — een geldig (niet-bestaand, maar
-- constraint-conform) NL-mobiel-vormig nummer. De rest van de functie
-- (member_code-generatie, acquisition-kolommen) blijft ongewijzigd.
--
-- Advies (niet geïmplementeerd zonder akkoord): een verzonnen
-- telefoonnummer bij ontbrekende metadata is een workaround, geen
-- oplossing — profiles.phone heeft een UNIQUE-constraint, dus dit pad kan
-- in theorie (kleine kans, hashtext-gebaseerd) een echte collision geven
-- die de signup alsnog laat crashen, en het lid ziet nooit dat "zijn"
-- nummer verzonnen is totdat hij zijn profiel bewerkt. Overweeg phone
-- nullable te maken en een "profiel incompleet"-status/redirect-naar-
-- profielpagina te triggeren i.p.v. hier een nummer te verzinnen.

create or replace function tmc.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_code text;
  v_attempts integer := 0;
begin
  loop
    v_code := lpad((floor(random() * 1000000))::text, 6, '0');
    exit when not exists (
      select 1 from tmc.profiles where member_code = v_code
    );
    v_attempts := v_attempts + 1;
    if v_attempts > 50 then
      raise exception 'member_code collision storm';
    end if;
  end loop;

  insert into tmc.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    member_code,
    acquisition_source,
    acquisition_medium,
    acquisition_campaign,
    acquisition_content,
    signup_path,
    first_touch_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '+316' || lpad(
      (abs(hashtext(new.id::text)) % 100000000)::text,
      8,
      '0'
    )),
    v_code,
    new.raw_user_meta_data->>'acquisition_source',
    new.raw_user_meta_data->>'acquisition_medium',
    new.raw_user_meta_data->>'acquisition_campaign',
    new.raw_user_meta_data->>'acquisition_content',
    new.raw_user_meta_data->>'signup_path',
    nullif(new.raw_user_meta_data->>'first_touch_at', '')::timestamptz
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

comment on function tmc.handle_new_auth_user() is
  'Trigger op auth.users insert. Genereert member_code + fallback-telefoonnummer wanneer de auth-metadata geen phone bevat. Fix 2026-07-02: fallback-nummer was +3160+8 cijfers (10 cijfers na landcode, schond profiles_phone_e164_nl); nu +316+8 cijfers (9 cijfers, constraint-conform).';
