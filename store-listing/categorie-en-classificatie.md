# Categorie & classificatie — The Movement Club (member-app)

Voorstellen op basis van de daadwerkelijke functionaliteit (zie
`src/app/app/rooster/page.tsx`, `boekingen/page.tsx`, `abonnement/page.tsx`,
`facturen/page.tsx`, `support/page.tsx`): rooster inzien en boeken,
boekingen/aanwezigheid inzien, lidmaatschap + gastenpassen beheren
(inclusief pauze-aanvraag en zelf-opzeggen), betaalstatus inzien, support via
WhatsApp/telefoon/e-mail + FAQ. Geen social feed, geen user-generated
content, geen chat tussen leden onderling, geen med­ische diagnostiek.

## Categorie

### Apple App Store

**Voorstel: Health & Fitness** (primaire categorie).

Toelichting: Apple's officiële categorie-omschrijving noemt expliciet
"fitness, workout tracking" en vergelijkbare gym/studio-gerelateerde content
als voorbeelden binnen Health & Fitness — dat is een directe match met wat
deze app doet (trainingssessies boeken/beheren). Er is geen aparte
"Sports"-onderverdeling nodig omdat de app geen wedstrijd- of
teamsport-functionaliteit heeft.

Secundaire categorie: geen noodzaak, maar "Lifestyle" is een redelijk
alternatief mocht Apple bij review vragen om een tweede categorie te kiezen.

Let op: Apple heeft vanaf voorjaar 2026 een extra vraag toegevoegd voor apps
in de Medical- of Health & Fitness-categorie over regulatory status per
regio. Voor deze app is dat waarschijnlijk "geen medisch hulpmiddel /
n.v.t." — dit is een boeking/lidmaatschap-app, geen gezondheidsmeting of
-diagnostiek — maar bevestig dat bij het invullen zelf in App Store Connect,
niet aangenomen hier.

### Google Play Console

**Voorstel: Health & Fitness** (interne category-id: `HEALTH_AND_FITNESS`).

Toelichting: dezelfde redenering als Apple — de Play-categorie-omschrijving
dekt apps die gebruikers helpen hun fitness/wellbeing te managen, en een
booking/membership-app voor een fysieke trainingsstudio valt daar
overduidelijk onder.

Google Play toont de categorienaam gelokaliseerd per store-taal; de exacte
Nederlandse UI-string kon niet met zekerheid worden bevestigd via
webzoekopdracht (varianten als "Gezondheid en fitness" en "Gezondheid,
Dieet & Fitness" kwamen beide voorbij in verschillende contexten) — check de
exacte NL-labeltekst in de Play Console-dropdown zelf bij het invullen, de
onderliggende categorie-id (`HEALTH_AND_FITNESS`) is wel zeker.

**Let op — Health apps declaration (Google Play):** sinds de invoering van
Google's "Health apps declaration form" moet élke app op Google Play dit
formulier invullen, ook als er geen gezondheidsfuncties zijn. Voor deze app
is de verwachte invulling "geen gezondheidsfuncties" (geen bloeddruk-,
hartslag- of andere medische metingen, geen symptoom-tracking) — dit moet
apart in Play Console → App content ingevuld worden, los van de
categoriekeuze zelf.

## Leeftijdsclassificatie / age rating

### Apple — nieuwe age-rating-systematiek (2025/2026)

Belangrijk: Apple heeft medio 2025 de age-rating-categorieën herzien.
12+ en 17+ zijn vervangen door een fijnmaziger systeem: **4+, 9+, 13+, 16+,
18+**. Ontwikkelaars moesten de bijgewerkte age-rating-vragenlijst vóór
31 januari 2026 opnieuw invullen; de nieuwe classificaties zijn zichtbaar
vanaf iOS/iPadOS/macOS 26.

**Voorstel: 4+.**

Onderbouwing (aanname op basis van wat de app wél/niet doet, niet
klakkeloos overgenomen): geen geweld, geen seksuele content, geen
grof taalgebruik, geen alcohol/drugs/gokken-referenties, geen
user-generated content en geen ongemodereerde social/chat-functionaliteit
tussen gebruikers (support loopt via WhatsApp/telefoon/e-mail naar de
studio, niet via in-app chat tussen leden). Dat is precies het profiel
waarvoor Apple's laagste/breedste rating (4+) bedoeld is. Loop bij het
invullen wel de volledige vragenlijst na — met name de nieuwe vragen over
gevoelige content — voor de zekerheid, dit voorstel is geen garantie voor de
uitkomst van Apple's eigen vragenlijst.

### Google Play — IARC-vragenlijst

Content ratings op Google Play lopen via de IARC-vragenlijst (International
Age Rating Coalition) in Play Console → App content → Content ratings. Eén
vragenlijst genereert automatisch de regionale ratings (ESRB voor
Noord-Amerika, PEGI voor Europa, USK voor Duitsland, enz.).

**Voorstel: laagste beschikbare classificatie** (in Europa doorgaans
PEGI 3 als resultaat van de vragenlijst).

Onderbouwing: zelfde redenering als bij Apple — geen geweld, seksuele
content, drugs/gokken-referenties, grof taalgebruik of ongemodereerde
gebruikersinteractie. Dit is een boeking/lidmaatschap-app voor een fysieke
studio. Nogmaals: dit is een voorspelling van de uitkomst, geen invulling —
de daadwerkelijke IARC-vragenlijst moet door een mens met accounttoegang
worden doorlopen, aangezien de exacte vraagformulering bepaalt welke rating
er automatisch uitrolt.

---

**Bronnen (opgezocht juli 2026):**
- [Categories and Discoverability — App Store (Apple)](https://developer.apple.com/app-store/categories/)
- [Age Rating Updates — Upcoming Requirements (Apple Developer)](https://developer.apple.com/news/upcoming-requirements/?id=07242025a)
- [Apple Overhauls App Store Age Ratings — MacRumors](https://www.macrumors.com/2025/07/25/apple-overhauls-app-store-age-ratings/)
- [Important: iOS App Age Rating Updates Required by January 31, 2026](https://www.socastdigital.com/2025/12/15/important-ios-app-age-rating-updates-required-by-january-31-2026/)
- [Health app categories and additional information — Play Console Help](https://support.google.com/googleplay/android-developer/answer/13996367?hl=en)
- [Content Ratings — Play Console Help](https://support.google.com/googleplay/android-developer/answer/9898843?hl=en)
