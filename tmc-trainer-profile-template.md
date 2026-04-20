# The Movement Club — Trainer Profile Template

Deze template beschrijft hoe trainerprofielen opgebouwd worden: welke velden in Sanity moeten komen, welke copy-richtlijnen gelden, hoe foto's gemaakt worden en hoe de trainer aan de Supabase-backend wordt gekoppeld. Drie ingevulde voorbeelden (Marlon, een standaard PT en een yoga/mobility docent) dienen als blauwdruk voor het vullen van de overige trainers.

---

## 1. Waarom dit belangrijk is

Trainerprofielen doen in TMC drie dingen tegelijk:

1. **Marketing** — ze staan op de publieke `/trainers` en `/over` pagina's en dragen de premium-positionering.
2. **Boekingssysteem** — ze bepalen welke trainer welke lessen geeft, wat hun PT-tarief is, en welke lestypes ze kunnen draaien.
3. **Operations** — ze sturen urenregistratie (ZZP), PT-beschikbaarheid en admin-permissies aan.

Eén verkeerd veld (bijvoorbeeld een vergeten `pt_tier`) betekent dat leden het verkeerde bedrag afgerekend krijgen bij PT-boeking, of dat Marlon per ongeluk in de standaard-tier zit. Deze template voorkomt dat.

---

## 2. Koppeling tussen Sanity en Supabase

Een trainer heeft **twee gekoppelde records**:

**In Supabase (`trainers` tabel)** — de runtime-data die het boekingssysteem nodig heeft: wie de trainer is, welk tarief, welke tier, welke pijler-specialisaties. Gekoppeld aan een `profiles` rij met `role='trainer'` zodat de trainer kan inloggen op `/app/trainer`.

**In Sanity (`trainer` document)** — de marketing- en content-kant: bio, foto's, quote, socials, certificeringen. Hier schrijft Marlon nieuwe content zonder dat er code bij komt kijken.

De twee worden verbonden via twee velden: Sanity bevat een `supabaseTrainerId` (uuid), Supabase bevat een `sanity_id` (string). Bij het aanmaken van een nieuwe trainer wordt eerst de Supabase-record gemaakt (inclusief auth-user), daarna het Sanity-document, en vervolgens de referenties over en weer gezet. Een CC-seed-script handelt dit af.

---

## 3. Uitbreiding Sanity `trainer` schema

Huidig schema (al aanwezig): `name`, `slug`, `bio`, `photo`, `specialties`, `socials`, `quote`.

### Nieuwe velden toevoegen

Voeg onderstaande velden toe aan `sanity/schemas/trainer.ts`. De velden met een `hidden` conditie zijn alleen relevant als de trainer ook PT aanbiedt.

```typescript
defineField({
  name: 'supabaseTrainerId',
  title: 'Supabase Trainer ID',
  type: 'string',
  description: 'Auto-gevuld bij aanmaken, niet handmatig wijzigen.',
  readOnly: true,
}),

defineField({
  name: 'role',
  title: 'Rol',
  type: 'string',
  options: {
    list: [
      { title: 'Head Trainer',       value: 'head_trainer' },
      { title: 'Personal Trainer',   value: 'personal_trainer' },
      { title: 'Yoga & Mobility',    value: 'yoga_mobility' },
      { title: 'Kids Coach',         value: 'kids' },
      { title: 'Senior Coach',       value: 'senior' },
    ],
  },
  validation: (r) => r.required(),
}),

defineField({
  name: 'pillarSpecialties',
  title: 'Pijler-specialisaties',
  description: 'Welke lestypes geeft deze trainer?',
  type: 'array',
  of: [{ type: 'string' }],
  options: {
    list: [
      { title: 'Vrij Trainen',     value: 'vrij_trainen' },
      { title: 'Yoga & Mobility',  value: 'yoga_mobility' },
      { title: 'Kettlebell Club',  value: 'kettlebell' },
      { title: 'Kids',             value: 'kids' },
      { title: 'Senior 65+',       value: 'senior' },
    ],
  },
}),

defineField({
  name: 'isPtAvailable',
  title: 'Beschikbaar voor Personal Training?',
  type: 'boolean',
  initialValue: false,
}),

defineField({
  name: 'ptTier',
  title: 'PT Tier',
  type: 'string',
  description: 'Premium = €95/sessie (Marlon), Standaard = €80/sessie.',
  options: {
    list: [
      { title: 'Premium (Marlon)', value: 'premium' },
      { title: 'Standaard',        value: 'standard' },
    ],
  },
  hidden: ({ parent }) => !parent?.isPtAvailable,
}),

defineField({
  name: 'certifications',
  title: 'Certificeringen',
  description: 'Een per regel. Bijv. "Kettlebell Master — StrongFirst SFG II"',
  type: 'array',
  of: [{ type: 'string' }],
}),

defineField({
  name: 'yearsOfExperience',
  title: 'Jaren ervaring',
  type: 'number',
  validation: (r) => r.min(0).max(60),
}),

defineField({
  name: 'languages',
  title: 'Lestalen',
  type: 'array',
  of: [{ type: 'string' }],
  options: {
    list: [
      { title: 'Nederlands', value: 'nl' },
      { title: 'Engels',     value: 'en' },
    ],
  },
  initialValue: ['nl'],
}),

defineField({
  name: 'availabilityNotes',
  title: 'Beschikbaarheid (vrije tekst)',
  type: 'text',
  description: 'Niet publiek. Voor admin-planning. Bijv. "Dinsdag en donderdag niet beschikbaar."',
  rows: 3,
}),

defineField({
  name: 'heroQuote',
  title: 'Hero quote',
  description: 'Korte, krachtige quote die op trainer-detail pagina boven de bio staat. Max 12 woorden.',
  type: 'string',
  validation: (r) => r.max(120),
}),

defineField({
  name: 'displayOrder',
  title: 'Volgorde op /trainers pagina',
  type: 'number',
  initialValue: 0,
}),

defineField({
  name: 'isActive',
  title: 'Actief',
  description: 'Uitzetten als trainer tijdelijk of permanent weg is.',
  type: 'boolean',
  initialValue: true,
}),
```

### Niet in Sanity — alleen in Supabase (admin-only)

Deze velden raken financiële data en horen niet in het content-CMS:

- `hourly_rate_in_cents` — wat TMC aan de ZZP-trainer per uur betaalt (€40 voor standaard, n.v.t. voor Marlon)
- `pt_session_rate_cents` — wat het lid betaalt voor één losse PT-sessie
- `has_access_to_admin_panel` — permissie-vlag

Deze worden rechtstreeks in Supabase `trainers` tabel gezet via de admin-cockpit `/app/admin/trainers`.

---

## 4. Foto-specificaties

Consistentie in fotostijl draagt het boutique/premium gevoel. Elke trainer heeft drie foto's nodig:

**Portretfoto (hoofdbeeld)**
- 1:1 vierkant, 2000×2000 px minimum
- Donkere achtergrond (diep warm zwart of antraciet, passend bij branding)
- Professioneel belicht — zachte sidelight, geen felle flash
- Trainer kijkt in de camera, rustige expressie — geen geforceerde glimlach
- Kleding: gedempte tonen (zwart, antraciet, crème, olive) — geen felle kleuren, geen logo's van andere merken
- Crop: borst-omhoog, schouders in beeld

**Action shot (secundair)**
- 3:2 horizontaal, 2400×1600 px minimum
- Trainer in beweging: een kettlebell swing, yoga pose, PT-cue geven
- Zelfde lichtsetting als portret — cinematisch, low-key
- Toont fysieke details (hand op gewicht, focus in ogen) boven lachende groepsshots

**Detailshot (tertiair, optioneel voor hero-section)**
- Vrij formaat
- Alleen handen, armen, voeten of apparatuur — geen gezicht
- Fungeert als textuur/atmosfeer op de trainer-pagina

Alle foto's in WebP-formaat exporteren, kleurprofiel sRGB. Naming-conventie: `trainer-{slug}-portrait.webp`, `trainer-{slug}-action.webp`, `trainer-{slug}-detail.webp`.

---

## 5. Copy-richtlijnen per veld

**`name`** — voornaam + achternaam, bijv. "Marlon Bakker". Niet alleen voornaam, niet "Mrs. Bakker".

**`heroQuote`** — één punchy zin, persoonlijk, niet cliché. Niet: "Movement is life." Wel: "Ik train je niet harder — ik train je slimmer."

**`bio` (Portable Text)** — drie alinea's, 150-250 woorden totaal:
1. *Wie ben je* — één persoonlijk detail dat ze niet op elke gymwebsite lezen
2. *Wat doe je hier* — je specialisme binnen TMC, hoe je traint, voor wie
3. *Waar kom je vandaan* — achtergrond en certificeringen in verhaalvorm, niet als lijst

Vermijd: "gepassioneerd", "holistische aanpak", "helpt mensen het beste uit zichzelf halen". Cliché-taal past niet bij de positionering.

**`specialties`** — 3-5 concrete termen. "Kettlebell", "Powerlifting", "Postpartum herstel" — niet "Strength", "Fitness", "Wellness".

**`certifications`** — één per regel, met instantie: "StrongFirst SFG II Certified", "Yin Yoga Teacher (200h, Yoga Alliance)", "NSCA-CSCS". Fancy titels zonder context weglaten.

**`availabilityNotes`** — alleen voor intern gebruik. Schrijf in eerste persoon zoals Marlon of de admin het zou noteren.

---

## 6. Drie ingevulde voorbeelden

### 6.1 Marlon — Head Trainer, Premium PT, Kettlebell Master

Dit is de blauwdruk voor de top-tier trainer. Alle velden ingevuld.

| Veld | Waarde |
|---|---|
| `name` | Marlon Bakker |
| `slug` | marlon-bakker |
| `role` | head_trainer |
| `pillarSpecialties` | `['vrij_trainen','kettlebell']` |
| `isPtAvailable` | true |
| `ptTier` | premium |
| `specialties` | `['Kettlebell','Strength','Mobility','Postpartum']` |
| `certifications` | `['StrongFirst SFG II Certified','NASM Corrective Exercise Specialist','Precision Nutrition Level 1']` |
| `yearsOfExperience` | 12 |
| `languages` | `['nl','en']` |
| `displayOrder` | 1 |
| `isActive` | true |

**`heroQuote`** — "Kracht is geen doel. Het is een middel om langer goed te bewegen."

**`bio`** — eerste alinea:
> Ik ben Marlon, oprichter en head trainer van The Movement Club. Ooit begonnen als danseres, gepivoteerd naar krachttraining toen ik ontdekte dat ik pas écht lenig werd toen ik leerde tillen. Dat inzicht — dat sterk zijn en soepel zijn hetzelfde dier is — is het fundament van alles wat ik hier doe.

Tweede alinea:
> In TMC focus ik op twee dingen: de Kettlebell Club, die ik zelf draai omdat er in Nederland weinig plekken zijn waar je deze techniek goed leert, en 1-op-1 personal training voor mensen die verder willen dan "een beetje fit blijven". Mijn PT's zijn geen willekeurige work-outs — elk programma begint met een grondige meting en bouwt op naar iets dat echt bij je lichaam past.

Derde alinea:
> Ik ben SFG Level II Certified via StrongFirst (de zwaardere van de twee grote kettlebell-scholen), NASM Corrective Exercise Specialist voor blessure-revalidatie, en Precision Nutrition Level 1 voor de voedingskant. Daarnaast werkte ik vier jaar als PT in Loosdrecht voordat ik TMC opende. Mijn doel is niet om je uit te putten — ik wil je over tien jaar nog in mijn gym zien lopen, beter dan toen je begon.

**`availabilityNotes`** (intern): "Kettlebell Club draai ik altijd zelf — ma/wo/vr 07:00 en 19:00. PT-slots in de middaguren. Woensdagmiddag vast blok Mobility Check 1-op-1's."

---

### 6.2 Standaard PT — Youri (voorbeeld, vervang met werkelijke naam)

Dit is de template voor een andere PT in het team. `ptTier: standard`, eigen specialisme, geen Kettlebell Club.

| Veld | Waarde |
|---|---|
| `name` | Youri de Vries |
| `slug` | youri-de-vries |
| `role` | personal_trainer |
| `pillarSpecialties` | `['vrij_trainen']` |
| `isPtAvailable` | true |
| `ptTier` | standard |
| `specialties` | `['Powerlifting','Hypertrofie','Sportrevalidatie']` |
| `certifications` | `['EREPS EQF Level 4 Personal Trainer','CIAR Sportrevalidatie','NASM Performance Enhancement Specialist']` |
| `yearsOfExperience` | 7 |
| `languages` | `['nl','en']` |
| `displayOrder` | 2 |
| `isActive` | true |

**`heroQuote`** — "Grote gewichten, kleine details — daar zit het verschil."

**`bio`** — eerste alinea:
> Youri hier. Ik kwam in krachttraining terecht via rugby — een gescheurde kruisband op mijn 22e, een revalidatietraject dat me leerde dat goed tillen een skill is, niet een talent. Sinds die fysio-sessies ben ik nooit meer gestopt.

Tweede alinea:
> Bij TMC begeleid ik voornamelijk 1-op-1 PT's en Vrij Trainen-leden die gericht willen werken aan kracht of spieropbouw. Ik werk graag met mensen die eerder dachten "kracht is niks voor mij" — meestal klopt dat gewoon niet, het is alleen nooit goed uitgelegd. Naast PT help ik ook met sportrevalidatie na blessures, in overleg met fysiotherapeuten.

Derde alinea:
> EREPS EQF Level 4 gecertificeerd, aanvullend CIAR Sportrevalidatie en NASM PES voor de meer atletische trajecten. Trainde voor ik bij TMC kwam bij twee gyms in Hilversum en Amsterdam. Buiten de gym: rugby (nog steeds), BBQ (fanatiek), en twee Duitse staande honden die vinden dat ik te veel werk.

**`availabilityNotes`** (intern): "Beschikbaar di/do/za. Inhuurtarief €40/uur, factureert per maand."

---

### 6.3 Yoga & Mobility docent — Fenna (voorbeeld)

Geen PT, alleen groepslessen. `isPtAvailable: false`, dus `ptTier` verborgen.

| Veld | Waarde |
|---|---|
| `name` | Fenna de Boer |
| `slug` | fenna-de-boer |
| `role` | yoga_mobility |
| `pillarSpecialties` | `['yoga_mobility']` |
| `isPtAvailable` | false |
| `specialties` | `['Vinyasa','Yin Yoga','Functional Mobility','Ademwerk']` |
| `certifications` | `['200h Vinyasa Yoga Teacher (Yoga Alliance RYT-200)','100h Yin Yoga Teacher Training','Breathwork Facilitator — Soma IBF']` |
| `yearsOfExperience` | 9 |
| `languages` | `['nl','en']` |
| `displayOrder` | 3 |
| `isActive` | true |

**`heroQuote`** — "Mobility is geen rekoefening — het is weer leren luisteren."

**`bio`** — eerste alinea:
> Fenna, yoga- en mobility-docent bij TMC. Ooit werkte ik als fysiotherapeut op een revalidatieafdeling, waar ik dag in dag uit zag hoe weinig mensen nog vrij in hun lichaam bewegen. Dat werd mijn missie: mensen hun bewegingsvrijheid teruggeven, voordat er een blessure nodig is om eraan te denken.

Tweede alinea:
> In TMC draai ik Vinyasa, Yin en een wekelijkse Mobility-klas die zich specifiek richt op schouders, heupen en onderrug — de drie plekken waar moderne levensstijl ons het hardst raakt. Mijn lessen zijn rustig, niet zacht: je gaat werken, maar met precisie in plaats van intensiteit.

Derde alinea:
> 200-uurs Vinyasa teacher via Yoga Alliance, aanvullend 100-uurs Yin specialization, en breathwork-certificering via Soma IBF. Blijf zelf leren bij internationale teachers (recent: Kathryn Budig, Jason Crandell). Buiten de mat: lange wandelingen, zelfgebakken brood, en een abonnement op te veel poëziebundels.

**`availabilityNotes`** (intern): "ZZP, €40/uur, factureert per 4 weken. Draait ma/do/za yoga + wo mobility. Dinsdagavond komt soms eens in de 2 weken te vervallen — eigen praktijk."

---

## 7. Onboarding-checklist voor een nieuwe trainer

Wanneer Marlon of de admin een nieuwe trainer toevoegt:

1. Beslis: geeft deze persoon PT? Zo ja: welke tier (premium is alleen Marlon).
2. Maak Supabase `profiles` record aan via admin-cockpit (`/app/admin/trainers/new`). Dit triggert auth-user aanmaak + magic-link invite.
3. Maak Supabase `trainers` record aan, gekoppeld aan de nieuwe profile. Zet `hourly_rate_in_cents` (intern) en `pt_session_rate_cents` (publiek).
4. Maak Sanity `trainer` document aan via `/studio`. Vul alle velden uit dit template in. `supabaseTrainerId` wordt auto-gevuld via webhook bij opslaan.
5. Upload drie foto's volgens spec (§4). In Sanity linken.
6. Check `isActive: true` en plaats in `displayOrder` tussen bestaande trainers.
7. Als PT-beschikbaar: voeg beschikbaarheid toe in admin-cockpit `/app/admin/trainers/{id}/availability` — dit vult het PT-slot rooster dat leden zien bij PT-booking.
8. Als groepsles-docent: voeg `schedule_templates` toe voor de vaste lesuren. Eerstvolgende cron-run genereert dan de concrete sessions voor 4 weken vooruit.
9. Laat de nieuwe trainer inloggen via magic link op `/app/trainer`. Check of rooster en deelnemerslijsten zichtbaar zijn.
10. Voor de publieke site: test `/trainers/{slug}` detail-pagina en `/trainers` overzicht.

---

## 8. Veelgemaakte fouten

- `pt_tier` vergeten te zetten → lid betaalt verkeerd tarief. Mitigatie: check constraint op Supabase + required-validatie in Sanity.
- Trainer heeft `isPtAvailable: false` maar wel `pt_session_rate_cents` in Supabase → systeem denkt dat PT kan worden geboekt. De `isPtAvailable` flag moet leidend zijn in UI-filters.
- Sanity document gemaakt zonder Supabase-record → trainer staat wel op marketing-site maar kan niet aan sessies gekoppeld worden. Altijd Supabase-eerst.
- `specialties` kopieert van een andere trainer zonder aanpassing → homogene trainer-pool, positionering verzwakt. Elk profiel moet uniek zijn.
- Action shot is stockfoto in plaats van werkelijk TMC-interieur → breekt de authenticiteit. Alle foto's in de studio maken of niet plaatsen.

---

## 9. CC-taak voor dit stuk

```
Voeg de nieuwe velden uit §3 toe aan sanity/schemas/trainer.ts.
Maak een Sanity-document custom action "Sync to Supabase" die bij opslaan
  de trainer-kerndata (pt_tier, specialties, hourly rates) schrijft naar
  public.trainers in Supabase via de Service Role key.
Bouw in /app/admin/trainers een lijst + create/edit flow die eerst de
  Supabase profile+trainer aanmaakt, daarna het Sanity-document seed't
  met de namen en role, en terugverwijst naar Sanity Studio om bio/foto
  in te vullen.
Seed Marlon's record als eerste via een migration script — `scripts/seed-marlon.ts`
  die de drie records (auth.user, profile, trainer) en het Sanity-document
  idempotent aanmaakt.
```

---

*Versie 1.0 — 20 april 2026*
