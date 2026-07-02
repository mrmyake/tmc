# store-listing

Losstaand van de Next.js-app, analoog aan `capacitor-shell/` — geen code,
alleen tekst-content ter voorbereiding van de App Store Connect- en
Google Play Console-submissies voor de member-app van The Movement Club.

**Wat dit is:** copy en operationele checklists om direct te kunnen
kopiëren/plakken tijdens het invullen van de store-listings. Geen van deze
bestanden wordt door de build gelezen — dit is puur mens-naar-mens
documentatie voor wie de submissie doet.

**Wat dit niet is:** dit is geen vervanging voor de daadwerkelijke
App Store Connect / Google Play Console developer-accounts (worden apart
geregeld), de eigenlijke native build (Xcode/Android Studio), of de
screenshots zelf. Die stappen gebeuren later, door een mens, buiten deze PR.

## Bestanden

- `beschrijving.md` — korte + lange app-beschrijving (NL) en een
  keywords-suggestie voor beide stores. Bevat marketing-copy — zie het
  `COPY: confirm with Marlon`-blokje bovenaan voor de reviewstatus.
- `categorie-en-classificatie.md` — voorgestelde store-categorie en
  leeftijdsclassificatie per store, met onderbouwing.
- `screenshots.md` — welke schermen gefotografeerd moeten worden, in welke
  volgorde, en de actuele afmetingen-eisen per store. Legt ook expliciet vast
  waarom de screenshots zelf niet in deze sessie gemaakt worden.

## Hoe te gebruiken

1. Open App Store Connect (App Information / Pricing and Availability /
   Age Rating) en Google Play Console (Store presence / App content) naast
   deze bestanden.
2. Kopieer de copy uit `beschrijving.md` naar de juiste velden — check eerst
   of Marlon de marketing-copy heeft goedgekeurd (zie het COPY-blokje
   bovenaan dat bestand).
3. Vul categorie en classificatie in aan de hand van
   `categorie-en-classificatie.md`. Dit zijn onderbouwde voorstellen, geen
   garanties — beide stores kunnen hun eigen vragenlijst anders uitkomen.
4. Zodra er een werkende native build met simulator/device beschikbaar is,
   volg `screenshots.md` voor welke schermen, in welke volgorde, en op welke
   afmetingen.

Alle cijfers (tekenlimieten, pixelafmetingen, aantallen) zijn tijdens het
schrijven van deze map (juli 2026) opgezocht en met bron genoteerd in de
betreffende bestanden — store-eisen veranderen wel eens, dus check bij twijfel
de gelinkte bron opnieuw voordat je een submissie indient.
