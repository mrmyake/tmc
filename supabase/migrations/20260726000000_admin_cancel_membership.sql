-- Lifecycle-primitieven fase 2A: admin-stop (klantbeheer-workstream,
-- discovery in discovery-klantbeheer-lifecycle.md, fase 1 in 20260725).
--
-- Beleid (Ilja/Marlon, hardcoded in deze laag, niet in de UI):
-- - Admin-stop is terminaal. Default maakt de lopende BETAALDE cyclus af
--   (net als pauze): het lid houdt toegang tot het einde van de cyclus
--   waarvoor al geincasseerd is, daarna status 'cancelled'. De Mollie-
--   subscription is op het stop-moment al geannuleerd (TS-laag, Mollie-
--   eerst), dus er loopt vanaf de ingangsdatum geen incasso meer.
-- - p_hard_stop = true is de expliciet gemarkeerde coulance/geschil-tak:
--   stopt per direct, maakt de cyclus NIET af. Nooit de default.
-- - Geen nieuw effectueringspad: de default-modus zet dezelfde staat als
--   het lid-opzeggen (status 'cancellation_requested' plus
--   cancellation_effective_date) en rijdt op de BESTAANDE
--   process-cancellations cron voor de flip naar 'cancelled'. De cron
--   annuleert daar eerst de Mollie-subscription; die is dan al canceled,
--   wat cancelMollieSubscription idempotent als succes telt.
-- - Admin-gezag over de einddatum: op een open lid-opzegging (effective op
--   commitment-einde) mag de default-modus de datum alleen VERVROEGEN
--   (naar cyclus-einde), nooit verlaten.
-- - Credit-rijen (rittenkaart, PT/Duo, billing_cycle_weeks = 0) zijn niet
--   stopzetbaar via dit pad; saldo-correcties lopen via
--   adjust_membership_credits.
--
-- Parameternoot: p_effective_date is toegevoegd bovenop de afgesproken
-- signatuur, om dezelfde reden als bij admin_pause_membership: het einde
-- van de betaalde cyclus komt uit Mollie's nextPaymentDate en dat weet
-- alleen de TS-laag betrouwbaar; de DB gokt er niet naar.

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
        pause_planned_at = null,
        pause_effective_date = null,
        resume_blocked_reason = null
    where id = p_membership_id;
  else
    -- Gepland: exact de staat van het lid-opzegpad; de bestaande
    -- process-cancellations cron doet de flip op de ingangsdatum.
    update tmc.memberships
    set status = 'cancellation_requested',
        cancellation_requested_at = coalesce(cancellation_requested_at, now()),
        cancellation_effective_date = v_effective,
        pause_planned_at = null,
        pause_effective_date = null,
        resume_blocked_reason = null
    where id = p_membership_id;
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

-- ACL gespiegeld aan de fase 1-admin-RPC's (authenticated met interne
-- is_admin-gate plus service_role; nooit public/anon). De effectuering van
-- de geplande modus loopt via de bestaande process-cancellations cron en
-- heeft geen eigen grant nodig.
revoke all on function tmc.admin_cancel_membership(uuid, text, boolean, date) from public, anon;
grant execute on function tmc.admin_cancel_membership(uuid, text, boolean, date) to authenticated, service_role;
