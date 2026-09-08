-- 20260910000000_revoke_fixture_staff_access.sql
--
-- fix/akiles-revoke-fixture-staff (discovery 2026-09-08, akkoord op de
-- bouwopdracht). Vier fixture-stafprofielen hebben op dit moment een
-- werkende PIN op de fysieke deur: desired-state.ts geeft elk profiel met
-- rol trainer of admin de groep staff, ook zonder membership. Het zijn
-- testaccounts die nooit inloggen; hun toegang moet dicht.
--
-- Waarom rolwijziging en geen directe intrekking bij Akiles: de
-- nachtelijke cron (/api/cron/sync-akiles-access, 02:15 UTC) neemt elk
-- profiel met rol trainer of admin als kandidaat, en needsAkilesUpdate
-- geeft true zodra akiles_pin_id null is. Een direct verwijderde PIN wordt
-- dus de volgende nacht opnieuw aangemaakt. Met rol member en zonder
-- dekkende membership-rij (live geverifieerd: nul rijen in tmc.memberships
-- voor alle vier) zegt resolveDesiredAccess "no_covering_membership" en
-- trekt de bestaande sync de toegang zelf in: ends_at in het verleden, PIN
-- weg, access.revoked-event. Deze migratie raakt Akiles niet aan; de
-- intrekking gebeurt bij de eerstvolgende sync-run (handmatig via de cron
-- met de CRON_SECRET-header, of vanzelf de volgende nacht).
--
-- Wat deze migratie doet, per profiel en alleen als id EN e-mail matchen:
--   1. profiles.role naar 'member'.
--   2. profiles.is_test naar true voor de drie @trainers.test-profielen
--      (ilja@gamundo.com staat al op true en wordt niet aangeraakt op die
--      kolom).
--   3. Een rij in tmc.admin_audit_log (admin me@ilja.com, action
--      access_revoked_fixture_staff, details met e-mail en oude rol),
--      uitsluitend voor rijen die daadwerkelijk gewijzigd zijn.
--
-- Bewust NIET aangeraakt: me@ilja.com en marlon@ptloosdrecht.nl (houden
-- staff-toegang), de trainers-rijen, class_sessions en schedule_templates
-- van Remi en Fenna (het rooster blijft volledig intact; de roosternaam
-- komt uit trainers.display_name, niet uit profiles.role),
-- tmc.access_credentials (de sync werkt die bij), en src/lib/access/**.
--
-- Replay-veilig (README punt 6): dit zijn applicatierijen die bij de
-- opruiming van eind september verdwijnen. Per profiel: ontbreekt de rij
-- (id en e-mail matchen niet), of staat de rol al op member, dan een
-- raise notice en verder. Geen assertie op een totaalaantal, ook niet op
-- "minstens een". Ontbreekt het auditprofiel me@ilja.com, dan worden de
-- auditregels overgeslagen met een notice. Op een lege shadow-database
-- (db diff) logt de migratie vier notices en slaagt hij.

begin;

do $$
declare
  -- Auditprofiel: admin_audit_log.admin_id is NOT NULL met een FK naar
  -- tmc.profiles(id), dus zonder dit profiel geen auditregels.
  c_audit_admin_id constant uuid := 'c2c398d5-f6d0-4e67-8a6a-b235b50853f9';
  c_audit_admin_email constant text := 'me@ilja.com';
  v_audit_possible boolean;
  v_old_role text;
  v_old_is_test boolean;
  r record;
begin
  select exists (
    select 1 from tmc.profiles
    where id = c_audit_admin_id and email = c_audit_admin_email
  ) into v_audit_possible;

  if not v_audit_possible then
    raise notice 'revoke_fixture_staff_access: auditprofiel % ontbreekt, auditregels worden overgeslagen',
      c_audit_admin_email;
  end if;

  for r in
    select *
    from (values
      ('1008bdaa-8881-42fa-9986-9180a8bbef8e'::uuid, 'fenna@trainers.test',  true),
      ('fc676dd0-19a8-44c6-9373-0b875310a028'::uuid, 'remi@trainers.test',   true),
      ('c5ebbac3-2cce-4b52-8055-2817904ed0d5'::uuid, 'marlon@trainers.test', true),
      ('20cdeaf4-6d58-4c3a-befc-4ae2a4d75f2e'::uuid, 'ilja@gamundo.com',     false)
    ) as t(id, email, set_is_test)
  loop
    -- Identiteit is id EN e-mail samen; een van beide alleen is nooit genoeg.
    select p.role, p.is_test
      into v_old_role, v_old_is_test
    from tmc.profiles p
    where p.id = r.id and p.email = r.email;

    if v_old_role is null then
      raise notice 'revoke_fixture_staff_access: profiel % (%) niet aanwezig op id en e-mail, overgeslagen',
        r.email, r.id;
      continue;
    end if;

    if v_old_role = 'member' then
      raise notice 'revoke_fixture_staff_access: profiel % staat al op member, overgeslagen',
        r.email;
      continue;
    end if;

    update tmc.profiles p
    set role = 'member',
        is_test = case when r.set_is_test then true else p.is_test end
    where p.id = r.id and p.email = r.email;

    if v_audit_possible then
      insert into tmc.admin_audit_log (admin_id, action, target_type, target_id, details)
      values (
        c_audit_admin_id,
        'access_revoked_fixture_staff',
        'profile',
        r.id,
        jsonb_build_object(
          'email', r.email,
          'old_role', v_old_role,
          'new_role', 'member',
          'old_is_test', v_old_is_test,
          'is_test_set', r.set_is_test,
          'reason', 'fixture staff profile, door access must close; nightly sync revokes on no_covering_membership',
          'migration', '20260910000000_revoke_fixture_staff_access'
        )
      );
    end if;

    raise notice 'revoke_fixture_staff_access: profiel % van % naar member gezet (is_test %)',
      r.email, v_old_role, case when r.set_is_test then 'true' else 'ongewijzigd' end;
  end loop;
end $$;

commit;
