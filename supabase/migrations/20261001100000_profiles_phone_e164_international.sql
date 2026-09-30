-- Telefoonnummers op tmc.profiles: elk geldig internationaal E.164-nummer,
-- niet meer alleen +31 plus negen cijfers.
--
-- Waarom: expats en andere leden met een buitenlands nummer konden stap 2
-- van /abonnement en /kopen niet afronden (23514 op profiles_phone_e164_nl).
-- De app valideert en normaliseert voortaan met libphonenumber-js (default
-- land NL, isValid) en slaat altijd E.164 op; deze CHECK is het vangnet.
--
-- Nieuwe CHECK: ^\+[1-9][0-9]{7,14}$ (landcode plus nummer, 8 tot 15 cijfers,
-- geen voorloopnul). NULL blijft toegestaan (kolom is nullable, zie
-- profiles_phone_nullable). profiles_phone_unique blijft ongewijzigd.
--
-- Voorcontrole live (2026-09-30, xoivleieyfcxcfawgveh): 15 profielen, 3 met
-- nummer (alle +316...), 0 schenden de nieuwe CHECK. Geen functie, trigger of
-- view verwijst naar profiles_phone_e164_nl of hardcode +31 (pg_constraint,
-- pg_proc en pg_trigger doorzocht). handle_new_auth_user kopieert
-- raw_user_meta_data->>'phone' ongewijzigd door; het enige pad dat phone in
-- user metadata zet (kiosk walk-in) normaliseert eerst.
--
-- Uitrol: pas na de merge van de bijbehorende PR. De app-code herkent tijdens
-- de overgang beide constraint-namen. Rollback: drop de nieuwe CHECK en voeg
-- profiles_phone_e164_nl (^\+31[0-9]{9}$) opnieuw toe; dat lukt alleen zolang
-- geen buitenlandse nummers zijn opgeslagen.

begin;

alter table tmc.profiles drop constraint profiles_phone_e164_nl;

alter table tmc.profiles
  add constraint profiles_phone_e164
  check (phone ~ '^\+[1-9][0-9]{7,14}$');

comment on constraint profiles_phone_e164 on tmc.profiles is
  'Telefoon in E.164 (landcode plus nummer, 8 tot 15 cijfers). Vervangt profiles_phone_e164_nl (alleen +31).';

commit;
