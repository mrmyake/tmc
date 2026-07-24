-- 20260812000000_capacity_business_rule_values.sql
--
-- Capaciteitscorrectie naar de besloten businessregel (capacity-integrity,
-- 2026-07-23): yoga_mobility maximaal 8 (stond op 10) en kettlebell
-- maximaal 20 (stond op NULL, oftewel onbeperkt; dat was een bewuste
-- keuze in 20260707000000_kettlebell_unlimited_capacity.sql en wordt hier
-- per businessbesluit teruggedraaid). Kids (8) en senior (6) vallen
-- buiten de regel en blijven ongemoeid.
--
-- Scope: toekomstige scheduled class_sessions plus alle
-- schedule_templates (de generate-sessions cron kopieert de
-- template-capaciteit naar nieuwe sessies; templates worden in de
-- admin-UI beheerd, niet uit Sanity gesynchroniseerd). Het mechanisme
-- "capacity NULL = onbeperkt" blijft bestaan; er is alleen geen pillar
-- meer die het gebruikt.

-- Assertie vooraf: geen enkele toekomstige sessie mag door deze
-- verlaging boven zijn eigen capaciteit uitkomen. Op 2026-07-23 waren er
-- nul zulke sessies; staat er op push-moment toch een, dan faalt de
-- migratie hier hardop in plaats van stilletjes een overvolle sessie te
-- maken.
do $$
declare
  v_bad int;
begin
  select count(*) into v_bad
  from tmc.class_sessions cs
  where cs.status = 'scheduled'
    and cs.start_at > now()
    and (
      (cs.pillar = 'yoga_mobility' and tmc.session_occupancy(cs.id) > 8)
      or (cs.pillar = 'kettlebell' and tmc.session_occupancy(cs.id) > 20)
    );
  if v_bad > 0 then
    raise exception
      'capacity_business_rule_values: % toekomstige sessie(s) zitten al '
      'boven de nieuwe grens (yoga_mobility 8, kettlebell 20); los dat '
      'eerst handmatig op', v_bad;
  end if;
end $$;

update tmc.class_sessions
set capacity = 8
where pillar = 'yoga_mobility'
  and status = 'scheduled'
  and start_at > now()
  and capacity is distinct from 8;

update tmc.class_sessions
set capacity = 20
where pillar = 'kettlebell'
  and status = 'scheduled'
  and start_at > now()
  and capacity is distinct from 20;

update tmc.schedule_templates st
set capacity = 8
from tmc.class_types ct
where ct.id = st.class_type_id
  and ct.pillar = 'yoga_mobility'
  and st.capacity is distinct from 8;

update tmc.schedule_templates st
set capacity = 20
from tmc.class_types ct
where ct.id = st.class_type_id
  and ct.pillar = 'kettlebell'
  and st.capacity is distinct from 20;

-- Assertie achteraf: geen afwijkende waarden meer in de scope.
do $$
begin
  if exists (
    select 1 from tmc.class_sessions
    where status = 'scheduled' and start_at > now()
      and ((pillar = 'yoga_mobility' and capacity is distinct from 8)
        or (pillar = 'kettlebell' and capacity is distinct from 20))
  ) or exists (
    select 1
    from tmc.schedule_templates st
    join tmc.class_types ct on ct.id = st.class_type_id
    where (ct.pillar = 'yoga_mobility' and st.capacity is distinct from 8)
       or (ct.pillar = 'kettlebell' and st.capacity is distinct from 20)
  ) then
    raise exception
      'capacity_business_rule_values: capaciteiten staan niet op de '
      'bedoelde waarden na de update';
  end if;
end $$;
