-- Trial booking (spec-community-growth.md §1, decided): self-service,
-- paid instant booking for a visitor with no account. Deliberately a
-- distinct table from tmc.guest_bookings, which is a different concept
-- (an existing, logged-in member bringing a companion for free).

create table tmc.trial_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tmc.class_sessions(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  email text not null check (length(trim(email)) > 0),
  phone text not null check (length(trim(phone)) > 0),
  price_paid_cents integer not null check (price_paid_cents >= 0),
  mollie_payment_id text,
  status text not null default 'pending'
    check (status in ('pending','paid','attended','no_show','cancelled')),
  cancel_token uuid not null default gen_random_uuid(),
  booked_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index trial_bookings_session_idx on tmc.trial_bookings(session_id);
create index trial_bookings_email_idx on tmc.trial_bookings(email);
create unique index trial_bookings_cancel_token_idx on tmc.trial_bookings(cancel_token);

-- Geen RLS-self-policy: de bezoeker heeft geen account, dus geen
-- auth.uid() om op te toetsen. Alle schrijf-/leespaden lopen via de
-- service-role (server actions/webhook), net als crowdfunding_backers.
alter table tmc.trial_bookings enable row level security;

create policy trial_bookings_admin_all on tmc.trial_bookings
  for all using (tmc.is_admin()) with check (tmc.is_admin());

-- Capaciteit moet proefles-boekingen meetellen, anders kan een lid nog
-- boeken op een plek die een betalende proeflesbezoeker al inneemt.
create or replace view tmc.v_session_availability as
select
  cs.id,
  cs.class_type_id,
  cs.trainer_id,
  cs.pillar,
  cs.age_category,
  cs.start_at,
  cs.end_at,
  cs.capacity,
  cs.status,
  count(b.id) filter (where b.status = 'booked') as booked_count,
  cs.capacity
    - count(b.id) filter (where b.status = 'booked')
    - count(tb.id) filter (where tb.status in ('pending','paid','attended'))
    as spots_available,
  count(w.id) filter (where w.confirmed_at is null and w.expired_at is null) as waitlist_count
from tmc.class_sessions cs
left join tmc.bookings b on b.session_id = cs.id
left join tmc.waitlist_entries w on w.session_id = cs.id
left join tmc.trial_bookings tb on tb.session_id = cs.id
where cs.status = 'scheduled'
group by cs.id;

-- tmc.events.actor_type moet 'visitor' toestaan: de bezoeker die een
-- proefles boekt heeft geen profiel-id, dus geen bestaande actor-type
-- past (member/admin/trainer/system/tablet zijn allemaal iets anders).
alter table tmc.events drop constraint events_actor_type_check;
alter table tmc.events add constraint events_actor_type_check
  check (actor_type in ('member','admin','trainer','system','tablet','visitor'));
