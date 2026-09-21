-- 20260921100200_anonymise_profile.sql
--
-- feat/account-deletion-schema (spec-ios-app.md workstream D.2; PR 1 uit de
-- discovery-accountverwijdering van 2026-09-21).
--
-- tmc.anonymise_profile(p_profile_id): de profielstap van de
-- verwijderflow. Sjabloon is tmc.admin_correct_customer_email
-- (20260727000000_change_requests_and_email_correction.sql), de enige
-- bestaande functie die dezelfde drie stores in een transactie raakt:
-- tmc.profiles, auth.users en auth.identities.identity_data.
--
-- UITZONDERING OP "SCHEMA TMC ONLY": deze functie schrijft bewust in het
-- auth-schema. Anders blijft het echte e-mailadres in auth.users en in
-- auth.identities.identity_data staan (identities.email is GENERATED uit
-- identity_data) en kan het lid met een OTP naar dat adres gewoon weer
-- inloggen. De rechten daarvoor heeft de eigenaar (postgres) al: dezelfde
-- als admin_correct_customer_email gebruikt, plus delete op auth.sessions
-- en auth.one_time_tokens (live gecontroleerd met has_table_privilege).
--
-- Wat de functie doet:
--   profiles: naam, e-mail (placeholder, want NOT NULL zonder unique),
--   telefoon (NULL, want UNIQUE met E.164-check), geboortedatum,
--   noodcontact, gezondheidsintake, avatar-url, adres, bedrijf en btw,
--   acquisitievelden, marketing-opt-in en mollie_customer_id. member_code,
--   role, age_category, locale, is_test en created_at blijven staan:
--   member_code is het pseudoniem waarmee orders, facturen en
--   account_deletions herleidbaar blijven voor de administratie.
--   auth.users: e-mail naar dezelfde placeholder, telefoon en
--   raw_user_meta_data (bevat voor- en achternaam) leeg, banned_until ver
--   in de toekomst zodat een geanonimiseerd account niet meer kan inloggen.
--   auth.identities: identity_data vervangen door sub plus placeholder.
--   auth.sessions, auth.refresh_tokens, auth.one_time_tokens: verwijderd.
--
-- Wat de functie NIET doet: bookings, memberships, orders, invoices,
-- payments en events blijven staan (bewaarplicht; pseudoniem via id en
-- member_code). Storage-objecten (avatar, medische bijlage), Mollie,
-- Akiles en MailerLite zijn externe stappen van de orchestratie in PR 2.
--
-- Idempotent: het placeholder-adres is deterministisch
-- ('deleted-<id>@anon.invalid'); staat het al in profiles, dan is de
-- functie klaar zonder tweede effect (geen update, geen event).
--
-- Veiligheidspoorten (return ok=false, reason='blocked', blockers=[...]):
--   open_order            orders.status in draft, pending, paid
--   access_not_revoked    access_credentials met Akiles-member en nog een
--                         PIN of een einddatum in de toekomst of zonder
--                         einddatum
--   device_token_active   access_device_tokens met revoked_at null
--   active_membership     membership in pending, active, paused,
--                         cancellation_requested of payment_failed; een
--                         lopend abonnement factureert op NAW uit profiles
--   draft_invoice         een concept dat bij finaliseren de placeholder
--                         zou overnemen en dan faalt op incomplete_bill_to
--   staff_role            role is trainer of admin; PR 2 zet de rol eerst
--                         op member (patroon PR #174), anders zou een
--                         actieve staf-account per ongeluk dichtgaan
-- De eerste twee zijn de poorten uit de opdracht; de andere vier zijn van
-- dezelfde soort (fout is onomkeerbaar of kost geld) en staan hier expliciet
-- zodat ze in de PR-review weggestreept kunnen worden.
--
-- ACL: uitsluitend service_role. De functie is de laatste stap van een
-- keten met externe bijwerkingen; een admin roept hem nooit los aan.
--
-- Replay: geen afhankelijkheid van app-data.

begin;

drop function if exists tmc.anonymise_profile(uuid);

create function tmc.anonymise_profile(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_profile tmc.profiles%rowtype;
  v_user auth.users%rowtype;
  v_has_user boolean := false;
  v_placeholder text;
  v_blockers text[] := '{}';
begin
  v_placeholder := 'deleted-' || p_profile_id::text || '@anon.invalid';

  select p.* into v_profile from tmc.profiles p where p.id = p_profile_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  -- Idempotent: tweede aanroep is klaar zonder tweede effect.
  if v_profile.email = v_placeholder then
    return jsonb_build_object('ok', true, 'already_anonymised', true,
      'member_code', v_profile.member_code);
  end if;

  -- Veiligheidspoorten. Alle blockers verzamelen, zodat de caller in een
  -- keer ziet wat er nog open staat.
  if v_profile.role <> 'member' then
    v_blockers := v_blockers || 'staff_role';
  end if;

  if exists (
    select 1 from tmc.orders o
    where o.profile_id = p_profile_id and o.status in ('draft', 'pending', 'paid')
  ) then
    v_blockers := v_blockers || 'open_order';
  end if;

  if exists (
    select 1 from tmc.access_credentials c
    where c.profile_id = p_profile_id
      and c.akiles_member_id is not null
      and (c.akiles_pin_id is not null
           or c.access_ends_at is null
           or c.access_ends_at > now())
  ) then
    v_blockers := v_blockers || 'access_not_revoked';
  end if;

  if exists (
    select 1 from tmc.access_device_tokens t
    where t.profile_id = p_profile_id and t.revoked_at is null
  ) then
    v_blockers := v_blockers || 'device_token_active';
  end if;

  if exists (
    select 1 from tmc.memberships m
    where m.profile_id = p_profile_id
      and m.status in ('pending', 'active', 'paused', 'cancellation_requested', 'payment_failed')
  ) then
    v_blockers := v_blockers || 'active_membership';
  end if;

  if exists (
    select 1 from tmc.invoices i
    where i.profile_id = p_profile_id and i.status = 'draft'
  ) then
    v_blockers := v_blockers || 'draft_invoice';
  end if;

  if coalesce(array_length(v_blockers, 1), 0) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'blocked',
      'blockers', to_jsonb(v_blockers));
  end if;

  -- Auth-rij. Kan ontbreken (profiel zonder auth-user komt niet uit de app,
  -- maar wel uit een half mislukte eerdere opruiming); dan alleen profiles.
  select u.* into v_user from auth.users u where u.id = p_profile_id for update;
  v_has_user := found;
  if v_has_user and v_user.is_sso_user then
    return jsonb_build_object('ok', false, 'reason', 'sso_user');
  end if;

  -- 1. profiles: alles wat een persoon identificeert of over hem gaat.
  update tmc.profiles
  set first_name = 'Verwijderd',
      last_name = 'lid',
      email = v_placeholder,
      phone = null,
      date_of_birth = null,
      emergency_contact_name = null,
      emergency_contact_phone = null,
      health_intake_completed_at = null,
      health_notes = null,
      avatar_url = null,
      marketing_opt_in = false,
      street_address = null,
      postal_code = null,
      city = null,
      company_name = null,
      vat_number = null,
      acquisition_source = null,
      acquisition_medium = null,
      acquisition_campaign = null,
      acquisition_content = null,
      signup_path = null,
      first_touch_at = null,
      mollie_customer_id = null,
      updated_at = now()
  where id = p_profile_id;

  if v_has_user then
    -- 2. auth.users: zelfde placeholder (unique via users_email_partial_key,
    --    per id verschillend), metadata met naam en telefoon leeg, en een
    --    ban zodat een OTP-login op het placeholder-adres niets oplevert.
    update auth.users
    set email = v_placeholder,
        phone = null,
        raw_user_meta_data = '{}'::jsonb,
        email_change = '',
        phone_change = '',
        banned_until = now() + interval '100 years',
        updated_at = now()
    where id = p_profile_id;

    -- 3. auth.identities: identities.email is GENERATED uit identity_data,
    --    dus alleen identity_data. Volledig vervangen, niet mergen: de oude
    --    waarde bevat het echte adres en eventuele naamvelden.
    update auth.identities
    set identity_data = jsonb_build_object(
          'sub', p_profile_id::text,
          'email', v_placeholder,
          'email_verified', false,
          'phone_verified', false
        ),
        updated_at = now()
    where user_id = p_profile_id;

    -- 4. Lopende sessies en eenmalige tokens weg.
    delete from auth.sessions where user_id = p_profile_id;
    delete from auth.refresh_tokens where user_id = p_profile_id::text;
    delete from auth.one_time_tokens where user_id = p_profile_id;
  end if;

  -- Spoor zonder persoonsgegevens (events is append-only).
  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'member.anonymised',
    case when auth.uid() is null then 'system' else 'admin' end,
    auth.uid(),
    'profile',
    p_profile_id,
    jsonb_build_object(
      'member_code', v_profile.member_code,
      'had_auth_user', v_has_user
    )
  );

  return jsonb_build_object('ok', true, 'anonymised', true,
    'member_code', v_profile.member_code, 'had_auth_user', v_has_user);
end;
$$;

comment on function tmc.anonymise_profile(uuid) is
  'Profielstap van de accountverwijdering: anonimiseert profiles, auth.users en auth.identities in een transactie, trekt sessies in. Idempotent. Weigert bij open order, niet-ingetrokken toegang, actief device-token, lopend abonnement, conceptfactuur of staf-rol. Alleen service_role.';

revoke all on function tmc.anonymise_profile(uuid) from public, anon, authenticated;
grant execute on function tmc.anonymise_profile(uuid) to service_role;

-- ===========================================================================
-- Zelfcontrole (geen app-data nodig)
-- ===========================================================================

do $$
declare
  v_oid oid;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tmc' and p.proname = 'anonymise_profile'
    and pg_get_function_identity_arguments(p.oid) = 'p_profile_id uuid';
  if v_oid is null then
    raise exception 'anonymise_profile: functie ontbreekt';
  end if;

  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'anonymise_profile: hoort SECURITY DEFINER te zijn';
  end if;

  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'anonymise_profile: anon of authenticated mag deze functie niet aanroepen';
  end if;

  if not has_function_privilege('service_role', v_oid, 'execute') then
    raise exception 'anonymise_profile: service_role mist execute';
  end if;

  -- Onbekend profiel: nette weigering, geen exception.
  if (tmc.anonymise_profile(gen_random_uuid())->>'reason') is distinct from 'profile_not_found' then
    raise exception 'anonymise_profile: verwacht profile_not_found voor een onbekend id';
  end if;
end $$;

commit;
