-- Lessen automatisch afsluiten (fase-2-checkin-model.md, check-in-spoor
-- PR 4, cron close-sessions). Model: geboekt is aanwezig, tenzij de trainer
-- iemand als no-show markeert. Het no-show-besluit van 2026-09-26 (niet
-- ingecheckt wordt no-show) is daarmee omgedraaid.
--
-- Inhoud:
--   1. class_sessions.closed_at: idempotentiemarkering van de cron. Bewust
--      een eigen kolom en niet status 'completed': zestien codepaden en
--      v_session_availability filteren op status 'scheduled', een
--      statuswissel zou afgesloten lessen uit rooster, bezetting en
--      historie laten verdwijnen.
--   2. check_ins.check_in_method: 'auto_close' erbij, zodat een automatische
--      aanwezigheid niet als handmatige actie (admin_web) leest.
--   3. Asserties.
--
-- Geen functies, geen views. Schema uitsluitend tmc. De cron herkent het
-- ontbreken van closed_at (42703) en schrijft dan niets, dus deploy voor
-- push is veilig.

-- ---------------------------------------------------------------------------
-- 1. Afsluitmarkering
-- ---------------------------------------------------------------------------

alter table tmc.class_sessions
  add column closed_at timestamptz;

comment on column tmc.class_sessions.closed_at is
  'Gezet door de cron close-sessions (fase-2-checkin-model.md PR 4) zodra de les 30 minuten voorbij is en alle open boekingen, gasten en proeflessen als aanwezig zijn gemarkeerd. Null = nog niet afgesloten. Alleen service_role schrijft; authenticated heeft geen kolomrecht.';

-- ---------------------------------------------------------------------------
-- 2. check_in_method: auto_close
-- ---------------------------------------------------------------------------
-- Live (pg_get_constraintdef, 2026-10-22):
--   CHECK ((check_in_method = ANY (ARRAY['self_tablet', 'admin_tablet', 'admin_web'])))
-- self_tablet blijft toegestaan (geen codepad schrijft het meer, PR #185 en
-- #214 lieten de constraint bewust staan); auto_close komt erbij.

alter table tmc.check_ins
  drop constraint check_ins_check_in_method_check;

alter table tmc.check_ins
  add constraint check_ins_check_in_method_check
  check (check_in_method = any (array['self_tablet', 'admin_tablet', 'admin_web', 'auto_close']));

-- ---------------------------------------------------------------------------
-- 3. Asserties
-- ---------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_count int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'tmc' and table_name = 'class_sessions'
      and column_name = 'closed_at' and data_type = 'timestamp with time zone'
      and is_nullable = 'YES' and column_default is null
  ) then
    raise exception 'class_sessions.closed_at ontbreekt of heeft de verkeerde vorm';
  end if;

  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'tmc.check_ins'::regclass and conname = 'check_ins_check_in_method_check';
  if v_def is null or v_def not like '%auto_close%' or v_def not like '%admin_web%' then
    raise exception 'check_ins_check_in_method_check staat niet zoals bedoeld: %', v_def;
  end if;

  -- authenticated leest class_sessions per kolom (PR #219); closed_at hoort
  -- daar niet bij, de deelnemerslijst leest via service_role.
  select count(*) into v_count
  from information_schema.column_privileges
  where table_schema = 'tmc' and table_name = 'class_sessions'
    and column_name = 'closed_at' and grantee in ('anon', 'authenticated');
  if v_count <> 0 then
    raise exception 'anon of authenticated heeft een kolomrecht op class_sessions.closed_at';
  end if;
end;
$$;
