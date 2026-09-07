# Testinstructie: check-in

Twee scenario's om het check-in-pad handmatig te verifiëren: een lid met een
geboekte les, en vrij trainen zonder boeking via de tablet-route. Voer dit uit
op productie of preview met een testprofiel, niet met een echt lid.

Let op: `tmc.check_ins` heeft geen `is_test`-kolom. Een rij die je hier
aanmaakt is op geen enkele manier automatisch herkenbaar als test. Noteer
zelf het profiel, de sessie en het tijdstip zodat je de rij later terugvindt,
en ruim op zoals aan het eind van elk scenario staat beschreven.

Alle SQL hieronder is read-only tenzij expliciet als opruimstap gemarkeerd.
Voer schrijfacties bij voorkeur via de UI uit (zie "Ongedaan maken" per
scenario); de SQL-varianten zijn een noodgreep als de UI-route zelf niet
werkt.

## Vooraf

- Log in op `/app` als admin.
- Kies of maak een testprofiel dat je makkelijk herkent (bijvoorbeeld via de
  walk-in-aanmaak in scenario B), niet een bestaand lid.
- Noteer de `profile_id` van dat testprofiel zodra je hem kent, je hebt hem
  nodig voor de controlequeries.

## Scenario A: lid met een geboekte les

1. Zorg dat het testprofiel een boeking heeft op een sessie die vandaag
   plaatsvindt (via `/app/rooster` als het testprofiel een eigen login heeft,
   of laat een admin de boeking aanmaken).
2. Log in op `/app/admin` en klik in de sidebar op "Rooster".
3. Klik op het sessieblok van de les waarop het testprofiel geboekt staat.
   Er opent een paneel aan de rechterkant.
4. Klik op de tab "Deelnemers".
   **Verwacht in de UI:** het testprofiel staat in de lijst met status
   "Geboekt".
5. Vink het testprofiel aan als "Aanwezig" en sla op.
   **Verwacht in de UI:** de status van de rij verandert naar "Aanwezig",
   geen foutmelding.
6. Ga terug naar "Rooster" en kijk in het paneel "Vrij trainen vandaag" onder
   "Check-ins vandaag". **Verwacht in de UI:** het testprofiel staat in die
   lijst met de huidige tijd en de pillar van de sessie.

**Controle in de database:**

```sql
-- Check-in-rij: hoort te bestaan, met booking_id gevuld
select id, profile_id, session_id, booking_id, check_in_method,
       access_type, pillar, checked_in_at
from tmc.check_ins
where profile_id = '<profile_id van het testprofiel>'
order by checked_in_at desc
limit 5;

-- Boeking: attended_at hoort gevuld te zijn, no_show_at leeg
select id, profile_id, session_id, status, attended_at, no_show_at
from tmc.bookings
where profile_id = '<profile_id van het testprofiel>'
order by booked_at desc
limit 5;
```

Verwacht: één nieuwe rij in `check_ins` met `check_in_method = 'admin_web'`,
`access_type = 'membership'` (tenzij het testprofiel geen dekkende
membership heeft, dan `drop_in`), en `booking_id` gelijk aan de boeking-id.
In `bookings` hoort dezelfde rij nu `attended_at` gevuld te hebben en
`no_show_at` leeg.

**Ongedaan maken:** ga terug naar de Deelnemers-tab van diezelfde sessie en
zet de status van het testprofiel terug naar "Geboekt". Dit verwijdert de
`check_ins`-rij en maakt `attended_at` weer leeg, in de UI zelf, geen SQL
nodig.

Als de UI-route om wat voor reden dan ook niet werkt, kan de rij handmatig
weg:

```sql
delete from tmc.check_ins where id = '<check_in id uit de select hierboven>';
update tmc.bookings set attended_at = null where id = '<booking id>';
```

## Scenario B: vrij trainen zonder boeking, via /checkin

1. Open `/checkin` (nu ook bereikbaar via de "Check-in"-link onderin de
   admin-sidebar, opent in een nieuw tabblad) of typ de URL rechtstreeks in.
2. Klik rechtsboven op het slotje om de adminmodus te ontgrendelen.
   **Verwacht in de UI:** een PIN-invoerscherm, ook als je in een andere tab
   al als admin bent ingelogd. Dit scherm checkt alleen de PIN, niet je
   login-sessie.
3. Voer de PIN in (in te stellen op `/app/admin/instellingen`).
   **Verwacht in de UI:** je komt in het adminpaneel met twee kolommen,
   "Vandaag ingecheckt" links en "Iemand anders inchecken" rechts.
4. Zoek het testprofiel op naam of e-mail rechts, of gebruik "Nieuwe walk-in"
   om er een aan te maken als je nog geen testprofiel hebt.
5. Klik op de pillar-knop "Vrij trainen" (of "Drop-in" als het testprofiel
   geen dekkende membership heeft).
   **Verwacht in de UI:** een groene toast "Ingecheckt: [voornaam]", de rij
   verschijnt direct links in "Vandaag ingecheckt".

**Controle in de database:**

```sql
select id, profile_id, session_id, booking_id, check_in_method,
       access_type, pillar, checked_in_at
from tmc.check_ins
where profile_id = '<profile_id van het testprofiel>'
order by checked_in_at desc
limit 5;
```

Verwacht: een nieuwe rij met `check_in_method = 'admin_tablet'`,
`pillar = 'vrij_trainen'`, en `booking_id = null` (dit veld wordt op dit pad
nooit gevuld, ook niet als het testprofiel toevallig een boeking heeft). Als
je "Drop-in" koos, `access_type = 'drop_in'`.

**Ongedaan maken:** klik in "Vandaag ingecheckt" op "Undo" naast de rij van
het testprofiel. Dit verwijdert de `check_ins`-rij via de UI, en boekt bij
een rittenkaart-check-in (`access_type = 'credit'`) automatisch de rit terug.
Gebruik daarom de Undo-knop, niet een handmatige delete, als je met een
rittenkaart hebt getest, anders klopt het creditsaldo niet meer.

Alleen als de Undo-knop zelf niet werkt:

```sql
delete from tmc.check_ins where id = '<check_in id uit de select hierboven>';
```

Als de test met `access_type = 'credit'` liep en je zo moest opruimen,
controleer en herstel het rittenkaartsaldo apart, een handmatige delete boekt
niets terug.
