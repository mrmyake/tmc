-- rapport-trainingsbeheer.md PR 1: class_types beheerd via admin, niet Sanity.
-- Sanity had al geen classType/classPillar-documenten (0 stuks in production);
-- deze migratie voegt alleen de kolommen toe die de admin-CRUD nodig heeft.
--
-- default_capacity wordt nullable: NULL betekent onbeperkte capaciteit
-- (alleen de kettlebell-les vandaag). Functioneel gebruik van NULL in
-- booking/waitlist/hard cap/KPI's is PR 2; hier bestaat de kolom alvast.

alter table tmc.class_types
  add column color text,
  add column sort_order integer not null default 0,
  add column created_at timestamptz not null default now();

alter table tmc.class_types
  alter column default_capacity drop not null;

-- Initiele sort_order op basis van pillar-volgorde (class_pillars.display_order)
-- en daarbinnen alfabetisch op naam, zodat de admin-lijst meteen zinvol
-- gesorteerd is in plaats van willekeurig.
with ranked as (
  select
    ct.id,
    row_number() over (
      order by cp.display_order, ct.name
    ) as rn
  from tmc.class_types ct
  join tmc.class_pillars cp on cp.code = ct.pillar
)
update tmc.class_types ct
set sort_order = ranked.rn * 10
from ranked
where ranked.id = ct.id;
