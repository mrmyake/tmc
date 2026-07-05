-- pgcrypto staat op Supabase in het `extensions` schema, niet in
-- `public`. De RPC's in 20260501000000 riepen gen_salt() en crypt()
-- zonder schema-prefix aan, wat faalt met
--   function gen_salt(unknown) does not exist (42883)
-- Fix: expliciet extensions.gen_salt() + extensions.crypt() gebruiken.
-- Recreate beide RPC's (CREATE OR REPLACE werkt).

create or replace function public.set_admin_checkin_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN moet 4-6 cijfers zijn';
  end if;
  update public.booking_settings
  set admin_checkin_pin_hash = extensions.crypt(
    p_pin,
    extensions.gen_salt('bf')
  )
  where id = 'singleton';
end;
$$;

create or replace function public.verify_admin_checkin_pin(p_pin text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  stored_hash text;
begin
  select admin_checkin_pin_hash into stored_hash
  from public.booking_settings where id = 'singleton';
  if stored_hash is null then
    return false;
  end if;
  return stored_hash = extensions.crypt(p_pin, stored_hash);
end;
$$;

grant execute on function public.set_admin_checkin_pin(text) to authenticated;
grant execute on function public.verify_admin_checkin_pin(text) to anon, authenticated;
