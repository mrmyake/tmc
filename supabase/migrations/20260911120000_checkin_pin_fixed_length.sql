-- Tablet-admin-PIN vast op 6 cijfers (was 4-6), zodat /checkin de PIN
-- automatisch kan versturen zodra het volledige aantal cijfers is
-- ingevoerd (auto-submit, geen bevestigknop meer). Zonder vaste lengte
-- kan de kiosk nooit weten wanneer een PIN compleet is. Zie
-- src/lib/check-in/constants.ts (CHECKIN_PIN_LENGTH) voor de
-- app-laag-tegenhanger; wijzig ze samen.

create or replace function tmc.set_admin_checkin_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
begin
  if not tmc.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN moet 6 cijfers zijn';
  end if;
  update tmc.booking_settings
  set admin_checkin_pin_hash = extensions.crypt(
    p_pin,
    extensions.gen_salt('bf')
  )
  where id = 'singleton';
end;
$$;
