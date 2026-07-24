-- 20260811000000_enforce_session_capacity.sql
--
-- Harde capaciteitsgrens op database-niveau (capacity-integrity discovery,
-- 2026-07-23). De businessregel: het maximale aantal deelnemers van een
-- class_session is een harde bovengrens; leden (bookings), proeflessers
-- (trial_bookings) en gasten (guest_bookings) tellen allemaal mee, en de
-- grens mag onder geen enkele omstandigheid overschreden worden.
--
-- Waarom een trigger naast de RPC-gates: de drie RPC's
-- (book_class_session, book_guest_session, redeem_trial_code) checken
-- capaciteit al correct onder een sessie-rij-lock, maar de trial-flow
-- (startTrialBooking, src/lib/actions/trial-booking.ts) insert
-- rechtstreeks via service_role na een lockloze view-check. Twee
-- gelijktijdige proefles-boekingen op de laatste plek, of een proefles
-- naast een lopende leden-RPC, konden daardoor allebei doorgaan. Deze
-- trigger maakt de grens hard voor elk schrijfpad, ook voor toekomstige
-- code en handmatige inserts.
--
-- Werking: BEFORE INSERT (en BEFORE UPDATE wanneer een rij van een
-- niet-tellende naar een tellende status gaat, of van sessie wisselt)
-- lockt de class_sessions-rij met FOR UPDATE en weigert de schrijfactie
-- als de sessie al vol is. Omdat elke schrijver dezelfde rij-lock neemt,
-- serialiseert dit alle drie de tabellen tegen elkaar.
--
-- Lock-volgorde en deadlocks: de bestaande RPC's nemen de sessie-lock
-- ook (book_class_session: sessie dan membership; book_guest_session:
-- pass dan sessie; redeem_trial_code: code dan sessie). Geen enkel pad
-- neemt een pass-, code- of membership-lock NA de sessie-lock terwijl
-- een ander pad diezelfde lock ervoor neemt, dus er ontstaat geen cykel.
-- Binnen een RPC die de sessie-rij al gelockt heeft is de FOR UPDATE in
-- de trigger een no-op op een al gehouden lock.
--
-- De tellende statussen per tabel zijn exact die van
-- tmc.session_occupancy() (migratie 20260810): bookings 'booked',
-- trial_bookings 'pending'/'paid'/'attended', guest_bookings
-- 'booked'/'attended'. Ze worden per trigger als argument meegegeven;
-- wijzig ze samen met session_occupancy().
--
-- De foutmelding 'session_capacity_exceeded' (errcode P0001) is een
-- contract met de app-laag: startTrialBooking vangt deze tekst af en
-- toont een nette melding. Niet hernoemen zonder de app mee te wijzigen.

create or replace function tmc.enforce_session_capacity()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_counting text[] := string_to_array(tg_argv[0], ',');
  v_needs_check boolean;
  v_capacity int;
begin
  if tg_op = 'INSERT' then
    v_needs_check := new.status = any (v_counting);
  else
    -- Alleen checken als de rij capaciteit gaat innemen die hij nog niet
    -- innam: van niet-tellend naar tellend, of een tellende rij die naar
    -- een andere sessie verhuist. pending -> paid blijft bijvoorbeeld
    -- buiten schot: die rij telde al mee.
    v_needs_check := new.status = any (v_counting)
      and (old.status <> all (v_counting)
           or new.session_id is distinct from old.session_id);
  end if;

  if not v_needs_check then
    return new;
  end if;

  -- Serialisatiepunt: dezelfde rij-lock als de RPC-gates. BEFORE INSERT
  -- ziet de nieuwe rij zelf nog niet in de telling, dus de check is
  -- "bestaande bezetting >= capaciteit weigert de nieuwkomer".
  select capacity into v_capacity
  from tmc.class_sessions
  where id = new.session_id
  for update;

  if not found then
    -- Onbekende sessie laat de FK-constraint afhandelen.
    return new;
  end if;

  -- capacity null betekent onbeperkt: geen grens om te bewaken.
  if v_capacity is not null
     and tmc.session_occupancy(new.session_id) >= v_capacity then
    raise exception 'session_capacity_exceeded'
      using errcode = 'P0001',
            hint = 'Sessie is vol; capaciteit is een harde bovengrens over leden, proeflessers en gasten.';
  end if;

  return new;
end;
$function$;

comment on function tmc.enforce_session_capacity() is
  'Harde capaciteitsgrens: weigert elke insert (of status-flip naar een '
  'tellende status) op bookings/trial_bookings/guest_bookings zodra '
  'tmc.session_occupancy() de sessiecapaciteit zou overschrijden. '
  'Tellende statussen komen per trigger mee als argument en moeten '
  'gelijk blijven aan session_occupancy().';

-- Triggerfuncties zijn niet direct aanroepbaar, maar we halen de default
-- PUBLIC-EXECUTE er voor de hygiene toch af (conventie 20260810).
revoke execute on function tmc.enforce_session_capacity()
  from public, anon, authenticated, service_role;

drop trigger if exists bookings_enforce_capacity on tmc.bookings;
create trigger bookings_enforce_capacity
  before insert or update of status, session_id on tmc.bookings
  for each row execute function tmc.enforce_session_capacity('booked');

drop trigger if exists trial_bookings_enforce_capacity on tmc.trial_bookings;
create trigger trial_bookings_enforce_capacity
  before insert or update of status, session_id on tmc.trial_bookings
  for each row
  execute function tmc.enforce_session_capacity('pending,paid,attended');

drop trigger if exists guest_bookings_enforce_capacity on tmc.guest_bookings;
create trigger guest_bookings_enforce_capacity
  before insert or update of status, session_id on tmc.guest_bookings
  for each row
  execute function tmc.enforce_session_capacity('booked,attended');

-- Assertie: alle drie de triggers staan, anders rolt de migratie terug.
do $$
begin
  if (
    select count(*)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'tmc'
      and not t.tgisinternal
      and t.tgname in (
        'bookings_enforce_capacity',
        'trial_bookings_enforce_capacity',
        'guest_bookings_enforce_capacity'
      )
  ) <> 3 then
    raise exception
      'enforce_session_capacity: niet alle drie de triggers zijn aangemaakt';
  end if;
end $$;
