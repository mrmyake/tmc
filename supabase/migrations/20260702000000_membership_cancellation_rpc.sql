-- Audit-fix #1 — memberships self-service opzegging via RPC i.p.v. brede
-- UPDATE-policy.
--
-- Probleem: tmc.memberships heeft alleen memberships_self_read (SELECT) en
-- memberships_admin_all — geen self-UPDATE. requestMembershipCancellation()
-- in src/lib/member/membership-actions.ts deed een kale .update() met de
-- user-scoped client; RLS matchte geen policy, dus de update raakte 0 rijen
-- zonder dat Supabase-js een error teruggaf. Leden kregen de melding
-- "Je opzegverzoek staat" terwijl de rij nooit veranderde, en de
-- process-cancellations-cron (die op status='cancellation_requested'
-- selecteert) zag het lid nooit — incasso liep door na een "geslaagde"
-- opzegging.
--
-- Fix: geen brede self-UPDATE-policy — memberships heeft prijs-, lock-in-
-- en mollie-kolommen die een lid nooit zelf mag wijzigen — maar een smalle
-- SECURITY DEFINER RPC die alleen de opzeg-transitie doet. Zelfde patroon
-- als tmc.set_admin_checkin_pin / tmc.get_admin_kpis: de functie valideert
-- autorisatie zelf en raise't een echte exception bij een ongeldige aanroep
-- i.p.v. stil niets te doen.
--
-- LET OP (schema-drift, audit #4): geschreven tegen de LIVE kolommen/
-- constraints van tmc.memberships (gelezen via de Supabase MCP:
-- information_schema.columns, pg_constraint, pg_policies), niet tegen de
-- historische public.*-migratiebestanden — die lopen achter op de live DB.
--
-- LET OP (grants): dit schema heeft een brede default GRANT EXECUTE naar
-- anon/authenticated op nieuwe functies. De revoke/grant hieronder zijn dus
-- verplicht — zonder de expliciete revoke staat de RPC alsnog open voor
-- anon, zoals al het geval is voor tmc.increment_cf_stats/
-- increment_cf_tier_slot (zie AUDIT-SECURITY.md §3, aparte ronde).

create or replace function tmc.request_membership_cancellation(p_membership_id uuid)
returns table (
  id uuid,
  status text,
  cancellation_requested_at timestamptz,
  cancellation_effective_date date
)
language plpgsql
security definer
set search_path = tmc, extensions
as $function$
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

  -- Geen match = niet gevonden óf niet van deze user. Zelfde vage melding
  -- voor beide gevallen (geen bestaan van andermans abonnement lekken) —
  -- net als de oude .maybeSingle()-check in membership-actions.ts.
  if v_status is null then
    raise exception 'Abonnement niet gevonden.' using errcode = '42501';
  end if;

  if v_status = 'cancellation_requested' then
    raise exception 'Je opzegverzoek staat al open.';
  end if;

  if v_status not in ('active', 'paused', 'payment_failed') then
    raise exception 'Dit abonnement kan niet worden opgezegd.';
  end if;

  -- Effective date: max van commit_end_date en vandaag + 28 dagen
  -- (4 weken opzegtermijn) — zelfde regel als de oude
  -- todayPlus(28)/maxDate() helpers in membership-actions.ts.
  v_effective_date := greatest(v_commit_end_date, current_date + 28);

  return query
  update tmc.memberships m
  set status = 'cancellation_requested',
      cancellation_requested_at = now(),
      cancellation_effective_date = v_effective_date
  where m.id = p_membership_id
    and m.profile_id = auth.uid()
  returning m.id, m.status, m.cancellation_requested_at, m.cancellation_effective_date;
end;
$function$;

comment on function tmc.request_membership_cancellation(uuid) is
  'Self-service opzegging voor leden (audit-fix #1). SECURITY DEFINER: valideert profile_id = auth.uid() en de toegestane status-overgang (active/paused/payment_failed -> cancellation_requested) zelf; raakt alleen status/cancellation_requested_at/cancellation_effective_date, nooit prijs-, lock-in- of mollie-kolommen. Raise een exception bij ongeldige aanroep i.p.v. stil 0 rijen te raken.';

-- Expliciete grants — dit schema grant't EXECUTE op nieuwe functies default
-- breed, dus zonder deze revoke blijft de RPC ook voor anon open.
revoke all on function tmc.request_membership_cancellation(uuid) from public;
revoke all on function tmc.request_membership_cancellation(uuid) from anon;
grant execute on function tmc.request_membership_cancellation(uuid) to authenticated;
