# TMC Member App — Testen met dummy leden

Korte how-to voor het testen van de member-flows (guest passes, rentals,
booking, abonnement) met voorgebakken dummy leden.

---

## Setup

### 1. Supabase redirect-whitelist

Magic-link redirects moeten door Supabase erdoor gelaten worden.
Eenmalig toevoegen in de [Supabase dashboard → Auth → URL Configuration
→ Redirect URLs](https://supabase.com/dashboard/project/iljyitdazzhalblqetkx/auth/url-configuration):

- `http://localhost:3000/auth/callback`
- `https://www.themovementclub.nl/auth/callback` (al aanwezig)

### 2. Seed runnen

```bash
# Productie — magic-links redirecten naar themovementclub.nl
npm run seed:dummies

# Lokaal — magic-links redirecten naar je dev server
SEED_SITE_URL=http://localhost:3000 npm run seed:dummies
```

De output eindigt met 8 klikbare URLs. Plak in een browser (incognito om
meerdere tegelijk open te hebben), je bent direct ingelogd als dat lid.

Re-run = verse URLs. Magic-links zijn 1 uur geldig, daarna opnieuw
seeden. Membership-rijen worden per dummy overschreven zodat state
voorspelbaar blijft.

### 3. Admin account

Voor `/app/admin/*` flows heb je een admin profile nodig. De seed maakt
alleen members aan — je eigen account promote je eenmalig via SQL:

```sql
update public.profiles set role = 'admin' where email = 'me@ilja.com';
```

---

## De dummies

| Email | Plan | Guest passes | Notitie |
|---|---|---|---|
| `yoga-1x@tmc.test` | Yoga & Mobility 1×/wk | 1 | eligible, minimum |
| `yoga-unl@tmc.test` | Yoga & Mobility Onbeperkt | 2 | eligible, max |
| `kettle-2x@tmc.test` | Kettlebell 2×/wk | 1 | kettlebell pillar |
| `allin-3x@tmc.test` | All Inclusive 3×/wk | 1 | frequency_cap in UI |
| `allin-unl@tmc.test` | All Access Onbeperkt | 2 | covered_pillars = alles |
| `vrij-2x@tmc.test` | Vrij Trainen 2×/wk | 0 | niet eligible |
| `tenride@tmc.test` | Rittenkaart (10 credits) | 0 | credit-flow |
| `paused@tmc.test` | All Inclusive, gepauzeerd | 1 | paused telt nog mee |

Membership-start staat 6 weken terug gezet, zodat de huidige billing
cycle echt is en niet pas na een boeking begint.

---

## Test scenario's

### Rentals (yoga/mobility)

1. Log in als `yoga-unl@tmc.test`.
2. `/app/rooster` → kies een Vinyasa Yoga of Mobility Reset sessie.
3. Vink **Yogamat** en **Handdoek** aan in het booking panel.
4. Boek.
5. Promoveer je eigen account naar admin, log als admin in.
6. `/app/admin/rooster` → klik die sessie aan.
7. Check: "Huur vandaag" strip toont `1 mat · 1 handdoek`, chip op
   deelnemer zegt **Mat** en **Handdoek**.
8. Download CSV, check kolommen `Mat` en `Handdoek`.

**Edge case**: boek een kettlebell-sessie — rental-checkboxes horen
niet te verschijnen (pillar is niet yoga_mobility).

### Guest-pass happy path

1. Log in als `allin-unl@tmc.test` (2 passes beschikbaar).
2. Boek een willekeurige sessie.
3. Klik opnieuw op diezelfde sessie → panel opent met **Gast meenemen**.
4. "Neem een gast mee" → vul naam + willekeurige email (bv.
   `marie@example.com`) → "Gast toevoegen".
5. Check: teller gaat van 2 → 1, success-message, inline reset.
6. Ga naar `/app/abonnement`. Guest-passes sectie toont `1`, lijst
   bevat Marie + sessie-naam + datum.
7. Repeat stap 3-5 met een andere email. Teller → 0.
8. Repeat een 3e keer. Knop hoort disabled met "passes op, nieuwe op
   [datum]".

### Guest-pass rate-limit (2× per 3 maanden)

1. Als `allin-unl@tmc.test`: nodig `jan@example.com` uit.
2. Log in als `yoga-unl@tmc.test` (ander lid) en nodig `jan@example.com`
   uit op een andere sessie.
3. Log in als `kettle-2x@tmc.test` en probeer `jan@example.com` voor
   een 3e keer uit te nodigen.
4. Verwacht: foutmelding "Jan is al 2× te gast geweest dit kwartaal.
   Een lidmaatschap ligt nu voor de hand..."

### Guest is al lid

1. Als `allin-unl@tmc.test`: probeer `yoga-1x@tmc.test` als gast uit
   te nodigen.
2. Verwacht: "Dit e-mailadres hoort al bij een actief lid."

### Niet-eligible abonnementen

- `vrij-2x@tmc.test` → in BookingSheet (na boeking) → "Je huidige
  abonnement geeft geen guest passes."
- `tenride@tmc.test` → idem. Plus credits-tile op `/app/abonnement`
  toont `10 / 10`.

### Paused membership

1. Log in als `paused@tmc.test`.
2. `/app/abonnement` → status-badge "paused", guest-passes sectie is
   zichtbaar (paused telt mee voor allocation).

### Capaciteit + guest-passes

1. Boek een sessie vol met losse member-dummies tot 1 plek over.
2. Log in als `allin-unl@tmc.test` (al geboekt op die sessie).
3. Probeer een gast uit te nodigen — werkt, neemt laatste plek.
4. Probeer 2e gast → "Deze sessie is vol."

### Email flow (sanity check)

Elke guest-book verstuurt een `guest_confirmation` mail. Dummy emails
(`@tmc.test`) bouncen, dus check dit met een echte email:
1. Als `allin-unl@tmc.test`, nodig je eigen echte email uit.
2. Check inbox — preview "Je staat op de lijst: [class] · [datum]",
   serif heading, champagne-accent CTA "Bekijk de studio".

---

## Troubleshooting

**Magic-link verloopt / "Invalid token"**  
Re-run `npm run seed:dummies` — links zijn 1 uur geldig.

**"Redirect URL not allowed"**  
Voeg de redirect URL toe in Supabase → Auth → URL Configuration.

**Lid zit vast in verkeerde state**  
Re-seed. Script wist bestaande membership + guest_passes voor die
dummy en begint vers.

**Guest-pass teller klopt niet**  
Check `public.guest_passes` in Supabase SQL editor — één rij per
(profile_id, period_start). Re-seed om te resetten.

**Rental checkboxes verschijnen niet**  
Alleen op sessies met pillar `yoga_mobility`. Check `class_sessions.
pillar` in SQL editor.

---

## Volgende keer dat je dit oppakt

1. `npm run seed:dummies` → verse URLs
2. Doorloop de scenario's hierboven
3. Bij regressies: stukken om weer te controleren staan in
   `tmc-guestpass-prompt.md` (oorspronkelijke spec) en het commit
   bereik `ceb8aca` → `7441250`
