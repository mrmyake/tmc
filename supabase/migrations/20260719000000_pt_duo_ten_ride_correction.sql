-- Catalogue seed correction: the PT and Duo rittenkaart are 10 rides, not
-- 12. The catalogue originally seeded the 2026-07-08-confirmed value (12);
-- that decision has now been revised to 10. This is an input correction,
-- not a bug fix: tmc.activate_order() already reads credits dynamically
-- from tmc.catalogue at activation (verified live: no hardcoded 12
-- anywhere in the DB layer, and a live grep across every function body in
-- the tmc schema for 'pt_12'/'duo_12' returned zero hits). Prices are
-- unchanged (PT 90000, Duo 110000); only the ride count, slug, and label
-- change.
--
-- No FK references tmc.catalogue.slug (verified live), so renaming the
-- slug in place is safe. tmc schema only; public and tvmuur untouched;
-- 20260503 placeholder untouched.

begin;

update tmc.catalogue
set slug = 'pt_10',
    credits = 10,
    display_name = 'Personal training 1-op-1, 10-rittenkaart' -- COPY: confirm met Marlon
where slug = 'pt_12';

update tmc.catalogue
set slug = 'duo_10',
    credits = 10,
    display_name = 'Personal training duo, 10-rittenkaart' -- COPY: confirm met Marlon
where slug = 'duo_12';

-- Self-verifying: abort if either row didn't land exactly as expected, or
-- if the old slugs are still (or unexpectedly) present.
do $$
declare
  v_pt record;
  v_duo record;
begin
  select price_cents, credits, display_name into v_pt from tmc.catalogue where slug = 'pt_10';
  if v_pt.price_cents is distinct from 90000 or v_pt.credits is distinct from 10 then
    raise exception 'pt_10 seed correction failed: price_cents=%, credits=%', v_pt.price_cents, v_pt.credits;
  end if;

  select price_cents, credits, display_name into v_duo from tmc.catalogue where slug = 'duo_10';
  if v_duo.price_cents is distinct from 110000 or v_duo.credits is distinct from 10 then
    raise exception 'duo_10 seed correction failed: price_cents=%, credits=%', v_duo.price_cents, v_duo.credits;
  end if;

  if exists (select 1 from tmc.catalogue where slug in ('pt_12', 'duo_12')) then
    raise exception 'old pt_12/duo_12 slugs still present after rename';
  end if;
end $$;

commit;
