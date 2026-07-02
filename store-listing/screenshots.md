# Screenshots — The Movement Club (member-app)

## Kan dit nu al gemaakt worden?

**Nee.** Dit hele Fase 2-traject (PR1 t/m PR7, de Capacitor-wrapper) is
gebouwd zonder Xcode, Android Studio of een simulator/device beschikbaar in
de bouw-omgeving — dat is al eerder in dit traject vastgesteld en wordt hier
gewoon overgenomen. Dit bestand is dus een instructie voor wie straks wél
een werkende native build (simulator of fysiek device) heeft, niet een
levering van de screenshots zelf.

Zodra die build er is: gebruik dit bestand als checklist, in de aangegeven
volgorde, met de hieronder genoteerde afmetingen.

## Welke schermen, in welke volgorde

Prioriteit = wat het beste laat zien wat de app daadwerkelijk doet, met het
sterkste/meest herkenbare scherm eerst (dat is meestal het scherm dat het
vaakst in preview-thumbnails wordt getoond).

1. **`/app/rooster`** — het weekrooster met pijler-filter (Vrij trainen,
   Yoga & mobility, Kettlebell, Kids, Senior) en boekbare sessies. Dit is het
   scherm dat leden het vaakst gebruiken en toont meteen de kernwaarde:
   boeken in een besloten, overzichtelijk rooster.
2. **`/app/boekingen`** — overzicht van aankomende en afgelopen boekingen
   incl. status (geboekt/aanwezig/no-show/geannuleerd). Toont dat de app
   ook na het boeken nog waarde biedt.
3. **`/app/abonnement`** — lidmaatschap-overzicht: huidig plan, resterende
   ritten/PT-sessies, gastenpassen, pauze-aanvraag en opzeggen. Toont de
   zelfservice-kant van de app.
4. **`/app/support`** — WhatsApp/telefoon/e-mail contactopties + FAQ. Laat
   zien dat er een laagdrempelige supportlijn is, goed als laatste/vijfde
   screenshot (minder centraal dan de eerste drie).

Optioneel als vijfde/zesde slot (als de store meer dan 4 screenshots wil
en er ruimte is): `/app/facturen` (betaalstatus) — minder prioritair omdat
het overlapt met wat `/app/abonnement` al laat zien, maar wel relevant als
"transparantie over betalingen" verkoopargument.

Neem screenshots van een ingelogd lid-account met representatieve (niet
lege) data — een leeg rooster of een lidmaatschap zonder historie oogt niet
premium en past niet bij de "luxe, besloten boutique"-positionering uit
`CLAUDE.md`.

## Afmetingen-eisen (opgezocht juli 2026 — check bij twijfel de bron opnieuw, Apple/Google wijzigen dit wel eens)

### Apple App Store

- **6.9" iPhone-klasse** (dit is nu de te leidende/primaire iPhone-maat —
  dekt iPhone 15/16/17 Pro Max): **1320 × 2868 px**, portrait. Apple schaalt
  dit automatisch naar de kleinere iPhone-klassen, dus alleen deze maat is
  in principe verplicht te leveren.
- **13" iPad-klasse** (iPad Pro M4, indien de app ook op iPad wordt
  aangeboden): **2064 × 2752 px**, portrait.
- Bestandsformaat: platte PNG of JPG (RGB, geen alpha/transparantie-kanaal).
- Aantal: minimaal 1, maximaal 10 screenshots per device-klasse per taal.

### Google Play Console

- **Telefoon-screenshots:** aanbevolen **1080 × 1920 px** (portrait,
  industriestandaard). Harde grenzen: elke zijde tussen 320 px en 3840 px,
  en de langste zijde mag niet meer dan 2× de kortste zijde zijn
  (beeldverhouding tussen 16:9 en 9:16).
- Bestandsformaat: JPEG of 24-bit PNG zónder alpha-kanaal (transparante
  PNG's worden geweigerd). Max. 8 MB per screenshot.
- Aantal: **minimaal 2**, maximaal 8 screenshots per apparaattype — dus met
  de 4 (of 5) schermen hierboven zit dat ruim goed.

---

**Bronnen (opgezocht juli 2026):**
- [Screenshot specifications — App Store Connect Help (Apple)](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Apple App Store screenshot sizes & guidelines (2026) — MobileAction](https://www.mobileaction.co/guide/app-screenshot-sizes-and-guidelines-for-the-app-store/)
- [App Store Screenshot Dimensions 2026 — Screenhance](https://screenhance.com/blog/app-store-screenshot-dimensions-2026)
- [Google Play Screenshot Requirements 2026 — screenshots.live](https://screenshots.live/en/guides/google-play-screenshot-requirements)
- [Play Store Screenshot Size & Dimensions (Google Play 2026 Guide) — ScreenKit](https://screenkit.tools/specs/google-play-screenshot-sizes)
