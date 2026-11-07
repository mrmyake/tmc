-- Generieke teller voor pogingen per sleutel (feat/yoga-test).
--
-- Eerste gebruiker: het e-mailformulier van de quiz "Welke yoga past bij jou?"
-- (scope 'yoga_test', sleutel = IP, 10 pogingen per 30 minuten, daarna 15
-- minuten slot). Bedoeld om hergebruikt te worden door andere publieke
-- endpoints (de krachttrainingquiz, later /api/proefles) zonder per feature een
-- eigen tabel en RPC.
--
-- Semantiek volgt tmc.register_opening_trial_attempt (live definitie
-- opgehaald via pg_get_functiondef): elke poging telt, de p_max-de poging is
-- nog toegestaan en start het slot, een poging tijdens het slot wordt
-- geweigerd en telt niet mee, na het slot begint een vers venster. Verschil:
-- de bestaande tabel houdt een rij per IP met een teller; hier staat een rij
-- per poging, zodat het venster meeloopt met de klok (p_window) in plaats van
-- te vervallen na stilte, en de scope en de limieten per aanroep meegegeven
-- worden.
--
-- Opruimen gebeurt door de RPC zelf: rijen ouder dan p_window + p_lock voor
-- dezelfde scope en sleutel worden bij elke aanroep verwijderd. Geen cron.
--
-- Schema tmc only. Geen app-data. Draaien met `supabase db push` na merge van
-- de PR. Migration-entry 20260503 onaangeroerd.

begin;

create table tmc.rate_limit_attempts (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key text not null,
  attempted_at timestamptz not null default now()
);

comment on table tmc.rate_limit_attempts is
  'Generieke pogingenteller (scope plus sleutel, bv. yoga_test plus IP). Schrijven en lezen uitsluitend via tmc.register_rate_limited_attempt met service_role; geen policies, geen grants aan anon of authenticated. De RPC ruimt eigen oude rijen op.';

create index rate_limit_attempts_scope_key_attempted_at_idx
  on tmc.rate_limit_attempts (scope, key, attempted_at);

alter table tmc.rate_limit_attempts enable row level security;

revoke all on table tmc.rate_limit_attempts from public, anon, authenticated;
grant all on table tmc.rate_limit_attempts to service_role;

-- true = toegestaan, false = geweigerd (slot actief).
create function tmc.register_rate_limited_attempt(
  p_scope text,
  p_key text,
  p_max int,
  p_window interval,
  p_lock interval
)
returns boolean
language plpgsql
security definer
set search_path = tmc, pg_temp
as $function$
declare
  v_now timestamptz := now();
  v_count int;
  v_hit timestamptz;
begin
  if coalesce(p_scope, '') = '' or coalesce(p_key, '') = '' then
    raise exception 'scope en key zijn verplicht';
  end if;
  if p_max is null or p_max < 1 then
    raise exception 'p_max moet minstens 1 zijn';
  end if;
  if p_window is null or p_window <= interval '0' or p_lock is null or p_lock < interval '0' then
    raise exception 'p_window moet positief zijn en p_lock niet negatief';
  end if;

  -- Serialiseer per scope en sleutel, zodat parallelle aanroepen elkaars
  -- telling zien (zelfde doel als de upsert-rijlock in de bestaande RPC).
  perform pg_advisory_xact_lock(hashtext('rate_limit_attempts:' || p_scope), hashtext(p_key));

  -- Opruimen: alleen eigen oude rijen voor deze scope en sleutel.
  delete from tmc.rate_limit_attempts
  where scope = p_scope
    and key = p_key
    and attempted_at < v_now - (p_window + p_lock);

  -- De poging die het maximum bereikte (de p_max-de binnen het venster, van
  -- oud naar nieuw) start het slot.
  select count(*), max(attempted_at) filter (where rn = p_max)
    into v_count, v_hit
  from (
    select attempted_at,
           row_number() over (order by attempted_at, id) as rn
    from tmc.rate_limit_attempts
    where scope = p_scope
      and key = p_key
      and attempted_at >= v_now - p_window
  ) w;

  if v_count >= p_max then
    if v_now < v_hit + p_lock then
      return false;
    end if;
    -- Slot voorbij: vers venster, net als de bestaande RPC na een verlopen slot.
    delete from tmc.rate_limit_attempts where scope = p_scope and key = p_key;
  end if;

  insert into tmc.rate_limit_attempts (scope, key, attempted_at)
  values (p_scope, p_key, v_now);

  return true;
end;
$function$;

comment on function tmc.register_rate_limited_attempt(text, text, int, interval, interval) is
  'Registreert een poging voor scope plus sleutel. True = toegestaan. De p_max-de poging binnen p_window is nog toegestaan en start een slot van p_lock; tijdens het slot false zonder te tellen; daarna een vers venster. Ruimt eigen rijen ouder dan p_window + p_lock op.';

revoke all on function tmc.register_rate_limited_attempt(text, text, int, interval, interval)
  from public, anon, authenticated;
grant execute on function tmc.register_rate_limited_attempt(text, text, int, interval, interval)
  to service_role;

commit;
