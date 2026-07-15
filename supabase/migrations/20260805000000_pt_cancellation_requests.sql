-- PT-agenda PR E2: annuleer-verzoeken van leden op PT-boekingen.
--
-- Sinds PR E ziet een lid zijn PT-sessies in /app/boekingen maar kan hij
-- niets muteren ("neem contact op met Marlon"). Dit is de vergrendelde
-- vervolgstap: het lid dient vanuit de afspraak een ANNULEER-VERZOEK in,
-- de trainer van de sessie krijgt een e-mail (TS-laag), het verzoek
-- verschijnt in het admin-dashboard naast de pauze-aanvragen, en staf
-- handelt het daar af. Een verzoek muteert NOOIT zelf de agenda: pas bij
-- goedkeuren loopt de annulering via het bestaande tmc.cancel_pt-pad
-- (PR J, 20260804), inclusief de expliciete restitutie-keuze en de
-- geauditeerde refund-kern (apply_credit_adjustment met de
-- credits_refunded_at dubbel-refund-guard). Hier bestaat dus geen tweede
-- annuleer- of refund-pad.
--
-- Patroon gespiegeld op membership_change_requests (20260727): schrijven
-- uitsluitend via de definer-RPC's, authenticated heeft alleen SELECT,
-- een partial-unique index dwingt maximaal een pending verzoek per
-- boeking af. De eigen-sessie-grens voor staf is de C4-join
-- (pt_bookings naar pt_sessions naar trainers op profile_id plus
-- is_active); een andere trainer ziet en resolvet niets (not_found),
-- zoals in cancel_pt.
--
-- Bewust GEEN tijdgrens op het indienen: een lid mag ook vlak voor de
-- sessie aanvragen. Het verzoek is een bericht "ik kan niet"; staf
-- beslist. Events en e-mail lopen via de TS-laag (emitEvent/sendEmail),
-- zoals bij alle pt_booking-events; de RPC's schrijven hier zelf niets
-- in tmc.events.
--
-- Live geverifieerd op 2026-07-15 (pg_get_functiondef): tmc.cancel_pt
-- (uuid, boolean) is byte-gelijk aan 20260804; tmc.is_staff() bestaat;
-- pt_bookings heeft credits_used_from en status
-- {pending, booked, cancelled, attended, no_show}.
--
-- Schema strak op tmc; public en tvmuur onaangeroerd; 20260503_gallery
-- onaangeroerd.

begin;

-- ============================================================
-- 1. De verzoek-tabel
-- ============================================================

create table tmc.pt_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  pt_booking_id uuid not null references tmc.pt_bookings(id) on delete cascade,
  profile_id uuid not null references tmc.profiles(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  resolution_note text
    check (resolution_note is null or char_length(resolution_note) <= 2000),
  with_restitution boolean,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  -- Het resolutie-drieluik is consistent per status: pending is
  -- onaangeroerd, approved draagt altijd de gemaakte restitutie-keuze,
  -- rejected nooit (de sessie is dan niet geannuleerd, dus er is geen
  -- restitutie-besluit).
  constraint pcr_resolution_state check (
    (status = 'pending' and resolved_by is null and resolved_at is null
      and with_restitution is null)
    or (status = 'approved' and resolved_by is not null
      and resolved_at is not null and with_restitution is not null)
    or (status = 'rejected' and resolved_by is not null
      and resolved_at is not null and with_restitution is null)
  )
);

comment on table tmc.pt_cancellation_requests is
  'Annuleer-verzoeken van leden op eigen PT-boekingen. Muteert nooit zelf de agenda: goedkeuren loopt via tmc.cancel_pt (PR J). Schrijven uitsluitend via de definer-RPCs (request/resolve); authenticated heeft alleen SELECT, DB-afgedwongen zoals tmc.membership_change_requests.';

-- Maximaal een openstaand verzoek per boeking; de race op dubbel
-- indienen wordt door deze index afgevangen (unique_violation wordt in
-- de RPC als pending_exists teruggegeven).
create unique index pcr_one_pending_per_booking
  on tmc.pt_cancellation_requests (pt_booking_id) where status = 'pending';
create index pcr_booking_idx
  on tmc.pt_cancellation_requests (pt_booking_id);
create index pcr_pending_created
  on tmc.pt_cancellation_requests (created_at) where status = 'pending';

alter table tmc.pt_cancellation_requests enable row level security;

create policy pcr_admin_all on tmc.pt_cancellation_requests
  for all using (tmc.is_admin()) with check (tmc.is_admin());
create policy pcr_self_read on tmc.pt_cancellation_requests
  for select using (profile_id = auth.uid());
-- De C4-eigen-sessie-grens: een actieve trainer leest alleen verzoeken
-- op boekingen van eigen sessies (zelfde join als pt_bookings_trainer_read,
-- plus is_active zoals in cancel_pt).
create policy pcr_trainer_read on tmc.pt_cancellation_requests
  for select using (
    tmc.is_staff() and pt_booking_id in (
      select b.id
      from tmc.pt_bookings b
      join tmc.pt_sessions s on s.id = b.pt_session_id
      join tmc.trainers t on t.id = s.trainer_id
      where t.profile_id = auth.uid() and t.is_active
    )
  );

revoke all on tmc.pt_cancellation_requests from public, anon;
grant select on tmc.pt_cancellation_requests to authenticated;
grant all on tmc.pt_cancellation_requests to service_role;

-- ============================================================
-- 2. Verzoek indienen: uitsluitend de eigenaar van de boeking
-- ============================================================

create or replace function tmc.request_pt_cancellation(
  p_pt_booking_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_booking tmc.pt_bookings%rowtype;
  v_session tmc.pt_sessions%rowtype;
  v_req_id uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- Alleen de eigenaar van de boeking; voor ieder ander is de boeking
  -- onvindbaar. Ook staf dient hier niet in: staf annuleert direct via
  -- cancel_pt in de agenda.
  select b.* into v_booking
  from tmc.pt_bookings b
  where b.id = p_pt_booking_id and b.profile_id = v_uid
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_booking.status <> 'booked' then
    return jsonb_build_object('ok', false, 'reason', 'not_requestable');
  end if;

  select s.* into v_session
  from tmc.pt_sessions s
  where s.id = v_booking.pt_session_id;

  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  -- Bewust geen verdere tijdgrens: ook vlak voor de sessie mag het lid
  -- laten weten dat hij niet kan. Staf beslist over de consequentie.

  if exists (
    select 1 from tmc.pt_cancellation_requests r
    where r.pt_booking_id = v_booking.id and r.status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'pending_exists');
  end if;

  begin
    insert into tmc.pt_cancellation_requests (pt_booking_id, profile_id, reason)
    values (v_booking.id, v_uid, nullif(left(trim(p_reason), 2000), ''))
    returning id into v_req_id;
  exception when unique_violation then
    -- Race met een gelijktijdig verzoek: zelfde uitkomst als de check.
    return jsonb_build_object('ok', false, 'reason', 'pending_exists');
  end;

  -- Sessie-context voor het event-spoor en de trainer-mail in de
  -- TS-laag, zodat die niet opnieuw hoeft te lezen.
  return jsonb_build_object(
    'ok', true,
    'request_id', v_req_id,
    'pt_booking_id', v_booking.id,
    'pt_session_id', v_session.id,
    'trainer_id', v_session.trainer_id,
    'start_at', v_session.start_at,
    'end_at', v_session.end_at,
    'format', v_session.format,
    'profile_id', v_booking.profile_id
  );
end;
$function$;

-- ============================================================
-- 3. Verzoek afhandelen: staf, met de eigen-sessie-grens
-- ============================================================

-- Bij approve is de KERN de restitutie-keuze (zoals de annuleer-flow uit
-- PR J): p_with_restitution moet expliciet true of false zijn zodra er
-- een credit verrekend is. Bij een boeking zonder verrekende credit
-- (betaallink) is er geen keuze; de RPC legt dan false vast, er valt
-- niets te verrekenen. De annulering zelf loopt integraal via
-- tmc.cancel_pt, dat onder dezelfde aanroeper (auth.uid()) de
-- staff-keuze accepteert en de refund door de geauditeerde kern voert.
-- Faalt cancel_pt (sessie intussen geweest, boeking al geannuleerd),
-- dan blijft het verzoek pending en komt de reden terug; staf kan dan
-- alsnog afwijzen met een toelichting.
create or replace function tmc.resolve_pt_cancellation(
  p_request_id uuid,
  p_approve boolean,
  p_with_restitution boolean default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_is_own_trainer boolean := false;
  v_req tmc.pt_cancellation_requests%rowtype;
  v_booking tmc.pt_bookings%rowtype;
  v_session tmc.pt_sessions%rowtype;
  v_with boolean;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 2000), '');
  v_cancel jsonb;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select r.* into v_req
  from tmc.pt_cancellation_requests r
  where r.id = p_request_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select b.* into v_booking
  from tmc.pt_bookings b
  where b.id = v_req.pt_booking_id
  for update;

  select s.* into v_session
  from tmc.pt_sessions s
  where s.id = v_booking.pt_session_id;

  v_is_own_trainer := exists (
    select 1 from tmc.trainers t
    where t.id = v_session.trainer_id
      and t.profile_id = v_uid
      and t.is_active
  );

  -- C4-eigen-sessie-grens: alleen admin of de trainer van de sessie;
  -- ieder ander krijgt not_found, zoals in cancel_pt.
  if not (v_is_admin or v_is_own_trainer) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Idempotent: een al opgeloste aanvraag opnieuw resolven weigert
  -- netjes, met de bestaande uitkomst erbij.
  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'already_resolved',
      'status', v_req.status);
  end if;

  if p_approve then
    v_with := case
      when v_booking.credits_used_from is null then false
      else p_with_restitution
    end;
    if v_with is null then
      return jsonb_build_object('ok', false, 'reason', 'restitution_required');
    end if;

    v_cancel := tmc.cancel_pt(v_req.pt_booking_id, v_with);
    if not coalesce((v_cancel ->> 'ok')::boolean, false) then
      return jsonb_build_object('ok', false,
        'reason', coalesce(v_cancel ->> 'reason', 'cancel_failed'));
    end if;

    update tmc.pt_cancellation_requests
    set status = 'approved',
        with_restitution = v_with,
        resolution_note = v_note,
        resolved_by = v_uid,
        resolved_at = now()
    where id = v_req.id;

    return jsonb_build_object(
      'ok', true,
      'outcome', 'approved',
      'with_restitution', v_with,
      'credits_refunded', coalesce((v_cancel ->> 'credits_refunded')::boolean, false),
      'within_window', (v_cancel ->> 'within_window')::boolean,
      'request_id', v_req.id,
      'pt_booking_id', v_req.pt_booking_id,
      'pt_session_id', v_session.id,
      'trainer_id', v_session.trainer_id,
      'start_at', v_session.start_at,
      'format', v_session.format,
      'profile_id', v_req.profile_id
    );
  end if;

  -- Afwijzen: sessie en boeking blijven ongemoeid.
  update tmc.pt_cancellation_requests
  set status = 'rejected',
      resolution_note = v_note,
      resolved_by = v_uid,
      resolved_at = now()
  where id = v_req.id;

  return jsonb_build_object(
    'ok', true,
    'outcome', 'rejected',
    'request_id', v_req.id,
    'pt_booking_id', v_req.pt_booking_id,
    'pt_session_id', v_session.id,
    'trainer_id', v_session.trainer_id,
    'start_at', v_session.start_at,
    'format', v_session.format,
    'profile_id', v_req.profile_id
  );
end;
$function$;

-- ============================================================
-- 4. ACL: zelfde patroon als de change-request-RPC's
-- ============================================================

revoke all on function tmc.request_pt_cancellation(uuid, text) from public, anon;
grant execute on function tmc.request_pt_cancellation(uuid, text) to authenticated, service_role;

revoke all on function tmc.resolve_pt_cancellation(uuid, boolean, boolean, text) from public, anon;
grant execute on function tmc.resolve_pt_cancellation(uuid, boolean, boolean, text) to authenticated, service_role;

commit;
