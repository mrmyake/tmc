-- Bug A vervolg (na 20260702110000_fix_signup_phone_fallback.sql): het
-- verzonnen fallback-nummer werkte, maar is zelf een workaround met een
-- eigen restrisico — profiles.phone heeft een UNIQUE-constraint, dus de
-- hash-gebaseerde fallback kan in theorie een echte collision geven die
-- de signup alsnog laat crashen, en een lid ziet nooit dat "zijn" nummer
-- verzonnen is totdat hij zijn profiel bewerkt.
--
-- Deze migratie maakt phone nullable en verwijdert de fallback-generatie
-- volledig uit tmc.handle_new_auth_user. Telefoon wordt in plaats daarvan
-- verplicht bij het eerste moment dat het echt nodig is (boeken/checkout),
-- afgedwongen in de server actions, niet in de trigger. De CHECK-constraint
-- profiles_phone_e164_nl blijft ongewijzigd staan: een CHECK evalueert naar
-- onbekend (niet: geschonden) zodra de kolomwaarde NULL is, dus een lege
-- phone-kolom voldoet automatisch.

alter table tmc.profiles alter column phone drop not null;

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
    new.raw_user_meta_data->>'phone',
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
  'Trigger op auth.users insert. Genereert member_code. Phone blijft leeg (nullable) als de auth-metadata er geen bevat, i.p.v. het eerder verzonnen fallback-nummer (fix 2026-07-03, zie profiles_phone_nullable migratie) — telefoon wordt nu verplicht bij eerste boeking/checkout, niet bij signup.';
