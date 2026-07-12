-- Lifecycle fase 2C: undo van een GEPLANDE opzegging (klantbeheer-workstream,
-- vervolg op fase 2A admin-stop in 20260726 en het lid-opzegpad in de
-- baseline).
--
-- Beleid (Ilja, beslispunt 2026-07-12, optie A):
-- - Undo is ALLEEN toegestaan voor een veilig terugdraaibare opzegging:
--   een lid-opzegging vanuit 'active' waarvan de cron nog niet
--   geeffectueerd heeft. Alleen dan is de opzegging een pure drie-velden-
--   mutatie (status, cancellation_requested_at, cancellation_effective_date)
--   zonder neveneffecten: geen Mollie-cancel, geen geannuleerde boekingen,
--   geen gesloten pauzevensters, lock-in intact (de
--   memberships_expire_lock_in trigger vuurt pas op de flip naar
--   'cancelled').
-- - Een admin-geplande stop is NIET terugdraaibaar: de TS-laag
--   (cancelMembershipCore, Mollie-eerst) heeft de Mollie-subscription op
--   het plan-moment al geannuleerd, boekingen vanaf de ingangsdatum zijn
--   vervallen en een open pauzevenster is gesloten. Consistent met
--   "hard-stop is terminaal" weigert undo die met 'not_safely_undoable'.
-- - De detectie is LOKAAL en DETERMINISTISCH (geen live Mollie-lookup, geen
--   fail-open): twee provenance-kolommen die de opzeg-RPC's zelf zetten.
--   NULL (legacy rijen van voor deze migratie) telt als niet-terugdraaibaar.
--
-- Provenance-kolommen:
-- - cancellation_source: 'member' (lid-opzegpad) of 'admin' (admin-stop).
--   Het admin-pad zet 'admin' OOK in de already_scheduled-tak die verder
--   niets muteert: de TS-laag heeft Mollie dan al gecanceld, dus een
--   lid-opzegging die een admin probeerde te vervroegen mag daarna niet
--   meer als terugdraaibaar gelden.
-- - cancellation_prior_status: de status van voor de opzegging. Het
--   lid-pad staat opzeggen ook toe vanuit 'paused' en 'payment_failed';
--   undo herstelt uitsluitend naar 'active' en weigert dus alles waarvan
--   de prior status niet 'active' was (fail-dicht, geen staat-corruptie).
--
-- Cron-race-guard: undo weigert zodra cancellation_effective_date <=
-- current_date ('effectuation_due'). De process-cancellations cron pakt
-- uitsluitend rijen met effective_date <= vandaag; undo pakt uitsluitend
-- rijen met effective_date > vandaag. De selecties zijn disjunct, dus er
-- is geen venster waarin de cron de Mollie-subscription al gecanceld kan
-- hebben terwijl undo de rij nog als terugdraaibaar ziet.

-- 1. Provenance-kolommen. Nullable: NULL betekent "herkomst onbekend" en
--    wordt door undo fail-dicht geweigerd.
alter table tmc.memberships
  add column cancellation_source text
    check (cancellation_source in ('member', 'admin')),
  add column cancellation_prior_status text;

comment on column tmc.memberships.cancellation_source is
  'Herkomst van de open opzegging: member (lid-opzegpad, geen neveneffecten) of admin (admin-stop, Mollie al gecanceld). NULL = legacy/onbekend, niet terugdraaibaar.';
comment on column tmc.memberships.cancellation_prior_status is
  'Status van voor de opzegging; undo herstelt alleen prior status active.';

-- 2. Lid-opzegpad: zet de provenance-markers. Verder identiek aan de live
--    definitie (geverifieerd via pg_get_functiondef op 2026-07-12).
create or replace function tmc.request_membership_cancellation(p_membership_id uuid)
returns table(
  id uuid,
  status text,
  cancellation_requested_at timestamp with time zone,
  cancellation_effective_date date
)
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_status text;
  v_commit_end_date date;
  v_effective_date date;
begin
  select m.status, m.commit_end_date
    into v_status, v_commit_end_date
  from tmc.memberships m
  where m.id = p_membership_id
    and m.profile_id = auth.uid();

  if v_status is null then
    raise exception 'Abonnement niet gevonden.' using errcode = '42501';
  end if;

  if v_status = 'cancellation_requested' then
    raise exception 'Je opzegverzoek staat al open.';
  end if;

  if v_status not in ('active', 'paused', 'payment_failed') then
    raise exception 'Dit abonnement kan niet worden opgezegd.';
  end if;

  v_effective_date := greatest(v_commit_end_date, current_date + 28);

  return query
  update tmc.memberships m
  set status = 'cancellation_requested',
      cancellation_requested_at = now(),
      cancellation_effective_date = v_effective_date,
      -- Provenance voor admin_undo_cancellation: een lid-opzegging is een
      -- pure drie-velden-mutatie en daarmee (vanuit 'active') veilig
      -- terugdraaibaar zolang de cron niet geeffectueerd heeft.
      cancellation_source = 'member',
      cancellation_prior_status = v_status
  where m.id = p_membership_id
    and m.profile_id = auth.uid()
  returning m.id, m.status, m.cancellation_requested_at, m.cancellation_effective_date;
end;
$$;

-- 3. Admin-stop: zet de provenance-markers. Verder identiek aan de live
--    fase 2A-definitie (geverifieerd via pg_get_functiondef op 2026-07-12).
create or replace function tmc.admin_cancel_membership(
  p_membership_id uuid,
  p_reason text,
  p_hard_stop boolean default false,
  p_effective_date date default null
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_m tmc.memberships%rowtype;
  v_effective date;
  v_immediate boolean;
  v_cancelled_bookings integer := 0;
begin
  -- DB-gate; de aanroepende server action draait daarnaast requireAdmin()
  -- in TS (zelfde laagdeling als de fase 1-RPC's).
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  -- Zelfde rijlock als pauze/hervat: stoppen, pauzeren en de cron
  -- serialiseren op de membership-rij.
  select * into v_m from tmc.memberships where id = p_membership_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'membership_not_found');
  end if;

  -- Idempotent: dubbel stoppen muteert niet dubbel.
  if v_m.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'already_cancelled', true,
      'end_date', v_m.end_date);
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing_reason');
  end if;
  if coalesce(v_m.billing_cycle_weeks, 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable_plan');
  end if;
  if v_m.status not in ('active', 'paused', 'cancellation_requested', 'payment_failed') then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable',
      'status', v_m.status);
  end if;

  -- Ingangsdatum. Hard stop: vandaag, cyclus wordt niet afgemaakt.
  -- Default: het einde van de betaalde dekking; de TS-laag levert Mollie's
  -- nextPaymentDate aan, met de pauze-ingangsdatum als dekking-einde
  -- wanneer de subscription al door een pauze gestopt is. Ligt dat einde
  -- in het verleden (lopende pauze: er is niets betaalds meer over), dan
  -- is de stop per direct.
  if p_hard_stop then
    v_effective := current_date;
  else
    v_effective := greatest(current_date,
      coalesce(p_effective_date, v_m.pause_effective_date, current_date));
    -- Op een open opzegging alleen vervroegen, nooit verlaten.
    if v_m.status = 'cancellation_requested'
       and v_m.cancellation_effective_date is not null then
      if v_effective >= v_m.cancellation_effective_date then
        -- Geen datum-mutatie, maar de TS-laag (Mollie-eerst) heeft de
        -- subscription voor deze aanroep al gecanceld. Een eventuele
        -- lid-opzegging is daarmee niet langer veilig terugdraaibaar:
        -- markeer de herkomst als 'admin' zodat admin_undo_cancellation
        -- fail-dicht weigert.
        update tmc.memberships
        set cancellation_source = 'admin'
        where tmc.memberships.id = p_membership_id;
        return jsonb_build_object('ok', true, 'already_scheduled', true,
          'effective_date', v_m.cancellation_effective_date);
      end if;
    end if;
  end if;

  v_immediate := v_effective <= current_date;

  if v_immediate then
    -- Per direct: zelfde eindtoestand als de process-cancellations cron
    -- zet (status, end_date), zodat er een uniforme cancelled-vorm blijft.
    -- De memberships_expire_lock_in trigger dooft een actieve lock-in.
    update tmc.memberships
    set status = 'cancelled',
        end_date = current_date,
        cancellation_requested_at = coalesce(cancellation_requested_at, now()),
        cancellation_effective_date = v_effective,
        cancellation_source = 'admin',
        cancellation_prior_status = coalesce(cancellation_prior_status, v_m.status),
        pause_planned_at = null,
        pause_effective_date = null,
        resume_blocked_reason = null
    where tmc.memberships.id = p_membership_id;
  else
    -- Gepland: exact de staat van het lid-opzegpad; de bestaande
    -- process-cancellations cron doet de flip op de ingangsdatum. De
    -- herkomst wordt (ook bij het vervroegen van een lid-opzegging)
    -- 'admin': Mollie is op dit moment al gecanceld en boekingen vanaf de
    -- ingangsdatum vervallen hieronder, dus undo moet dit weigeren.
    update tmc.memberships
    set status = 'cancellation_requested',
        cancellation_requested_at = coalesce(cancellation_requested_at, now()),
        cancellation_effective_date = v_effective,
        cancellation_source = 'admin',
        cancellation_prior_status = coalesce(cancellation_prior_status, v_m.status),
        pause_planned_at = null,
        pause_effective_date = null,
        resume_blocked_reason = null
    where tmc.memberships.id = p_membership_id;
  end if;

  -- Een open pauzevenster sluit mee: stoppen vervangt de pauze.
  update tmc.membership_pauses
  set status = 'completed',
      end_date = greatest(start_date, current_date)
  where membership_id = p_membership_id
    and end_date is null
    and status in ('approved', 'active');

  -- Boekingen vanaf de ingangsdatum vervallen, membership-gescoped:
  -- PT/Duo-credits en rittenkaarten zijn eigen rijen en blijven bruikbaar.
  update tmc.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = 'membership_cancelled'
  where membership_id = p_membership_id
    and status in ('booked', 'waitlisted')
    and session_date >= v_effective;
  get diagnostics v_cancelled_bookings = row_count;

  if v_immediate then
    insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
    values (
      'membership.cancelled', 'admin', auth.uid(), 'membership', p_membership_id,
      jsonb_build_object(
        'profile_id', v_m.profile_id,
        'reason', trim(p_reason),
        'hard_stop', p_hard_stop,
        'effective_date', v_effective,
        'cancelled_bookings', v_cancelled_bookings
      )
    );
  else
    insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
    values (
      'membership.cancellation_requested', 'admin', auth.uid(), 'membership', p_membership_id,
      jsonb_build_object(
        'profile_id', v_m.profile_id,
        'reason', trim(p_reason),
        'effective_date', v_effective,
        'moved_earlier_from', v_m.cancellation_effective_date,
        'cancelled_bookings', v_cancelled_bookings
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'mode', case when v_immediate then 'immediate' else 'scheduled' end,
    'hard_stop', p_hard_stop,
    'effective_date', v_effective,
    'cancelled_bookings', v_cancelled_bookings
  );
end;
$$;

-- 4. De undo-RPC zelf.
create or replace function tmc.admin_undo_cancellation(p_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_m tmc.memberships%rowtype;
begin
  -- DB-gate; de aanroepende server action draait daarnaast requireAdmin()
  -- in TS (zelfde laagdeling als de andere admin-lifecycle-RPC's).
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  -- Zelfde rijlock als stop/pauze/hervat: serialiseert undo tegen een
  -- gelijktijdige admin-stop of pauze op dezelfde membership-rij.
  select * into v_m from tmc.memberships where id = p_membership_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'membership_not_found');
  end if;

  -- Idempotent: undo op een al-actief membership muteert niet.
  if v_m.status = 'active' then
    return jsonb_build_object('ok', true, 'already_active', true);
  end if;

  -- Terminaal blijft terminaal: een geeffectueerde of hard gestopte
  -- opzegging is niet terug te draaien (Mollie gecanceld, lock-in gedoofd,
  -- boekingen vervallen).
  if v_m.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'already_cancelled',
      'end_date', v_m.end_date);
  end if;

  if v_m.status <> 'cancellation_requested' then
    return jsonb_build_object('ok', false, 'reason', 'not_undoable_state',
      'status', v_m.status);
  end if;

  -- Fail-dicht op herkomst: alleen een lid-opzegging vanuit 'active' is een
  -- pure drie-velden-mutatie zonder neveneffecten. 'admin' betekent dat de
  -- Mollie-subscription al gecanceld is en boekingen/pauzes al geraakt
  -- zijn; NULL betekent onbekende herkomst (legacy). Beide geweigerd.
  if v_m.cancellation_source is distinct from 'member'
     or v_m.cancellation_prior_status is distinct from 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_safely_undoable',
      'cancellation_source', v_m.cancellation_source,
      'cancellation_prior_status', v_m.cancellation_prior_status);
  end if;

  -- Cron-race-guard: de process-cancellations cron pakt alleen rijen met
  -- effective_date <= vandaag en kan Mollie daar al gecanceld hebben
  -- voordat de status-flip landt. Disjuncte selectie: undo alleen op
  -- niet-due rijen.
  if v_m.cancellation_effective_date is null
     or v_m.cancellation_effective_date <= current_date then
    return jsonb_build_object('ok', false, 'reason', 'effectuation_due',
      'effective_date', v_m.cancellation_effective_date);
  end if;

  -- Pure inverse van het lid-opzegpad. Discovery 2026-07-12 bevestigde:
  -- lock-in is bij 'cancellation_requested' nog intact (de trigger vuurt
  -- pas op de flip naar 'cancelled') en deze transitie triggert zelf niets
  -- behalve touch_updated_at, dus er is verder niets te herstellen.
  update tmc.memberships
  set status = 'active',
      cancellation_requested_at = null,
      cancellation_effective_date = null,
      cancellation_source = null,
      cancellation_prior_status = null
  where tmc.memberships.id = p_membership_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'membership.cancellation_undone', 'admin', auth.uid(), 'membership', p_membership_id,
    jsonb_build_object(
      'profile_id', v_m.profile_id,
      'undone_effective_date', v_m.cancellation_effective_date,
      'cancellation_requested_at', v_m.cancellation_requested_at
    )
  );

  return jsonb_build_object(
    'ok', true,
    'restored_status', 'active',
    'undone_effective_date', v_m.cancellation_effective_date
  );
end;
$$;

-- ACL gespiegeld aan de andere admin-lifecycle-RPC's (authenticated met
-- interne is_admin-gate plus service_role; nooit public/anon). De ACL's van
-- de twee vervangen functies blijven bij create or replace behouden.
revoke all on function tmc.admin_undo_cancellation(uuid) from public, anon;
grant execute on function tmc.admin_undo_cancellation(uuid) to authenticated, service_role;
