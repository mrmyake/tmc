# Handleiding — The Movement Club

Voor: Marlon
Doel: het systeem gebruiken én onderhouden zonder hulp van een developer.

Dit document beschrijft hoe je dag-tot-dag het systeem aanstuurt: leden, rooster, pauzes, content en e‑mails. Bewaar deze link in je bookmarks.

---

## 1. Inloggen

Je werkt met twee aparte beheerschermen:

| Wat | Waar | Waarvoor |
|---|---|---|
| **Admin cockpit** | https://www.themovementclub.nl/app/admin | Leden, rooster, pauzes, trainers, instellingen |
| **Sanity Studio** | https://www.themovementclub.nl/studio | Teksten, foto's, openingstijden, aanbod, prijzen, FAQ, blog |

Beide log je in met je e‑mailadres. Het systeem stuurt je een inlog‑link (magic link) of laat je inloggen via Google.

**Goed om te weten**
- Je account is gemarkeerd als `admin`. Daarmee zie je álles: het lidscherm, het trainerscherm én de admin cockpit.
- Bovenin rechts staat je profielfoto. Klik daarop voor **Schakel naar** → je kunt schakelen tussen Admin, Trainer en Lid view zonder uit te loggen.

---

## 2. De cockpit in vogelvlucht

Links in de admin cockpit (op desktop) staat de zijbalk. **De cockpit werkt alleen op desktop of een groot tablet** — op je telefoon krijg je een melding dat je naar een groter scherm moet.

| Menu‑item | Wat je hier doet |
|---|---|
| **Dashboard** | Snelle blik op de week: leden, MRR, bezetting, no‑shows |
| **Rooster** | Lessen plannen en aanpassen per week |
| **Leden** | Zoeken, filteren, lid openen, betalingen zien |
| **Trainers** | Trainers toevoegen, profielen aanpassen |
| **Pauzes** | Pauze‑verzoeken van leden goed- of afkeuren |
| **Aankondigingen** | Berichten voor leden in hun app |
| **Instellingen** | Annuleringsvenster, prijzen, no‑show regels |
| **Content ↗** | Opent Sanity Studio in een nieuw tabblad |

Rechtsboven zie je een belletje 🔔: dat telt openstaande pauze‑verzoeken. Klik om er direct heen te gaan.

---

## 3. Dashboard — wat zegt het je?

Vier KPI‑tegels bovenin:

- **Actieve leden** — lopende abonnementen
- **MRR** — maandelijkse omzet uit abonnementen (geprorateerd uit de 4‑weekse cyclus)
- **Bezetting (7d rolling)** — percentage gevulde plekken deze week. De subtekst toont "X van Y plekken".
- **No‑show rate** — percentage geboekte plekken waar het lid niet kwam opdagen (laatste 30 dagen)

Daaronder:

- **Bezetting per dag** — staafdiagram van maandag t/m zondag. Helpt je zien op welke dagen er ruimte is.
- **Activiteit** — recent: nieuwe leden, opzegverzoeken, gefaalde betalingen.
- **Quick tiles** — direct doorklikken naar openstaande pauze‑verzoeken, openstaande facturen, en de lessen van vandaag.

**Wanneer kijken?** Eens per week (bv. maandagochtend) is voldoende. Wanneer een KPI rood lijkt of de bezetting plots inzakt, klik door om uit te zoeken waarom.

---

## 4. Leden beheren

**Pad:** Admin cockpit → **Leden**

### Lijst
- Bovenin: zoekbalk (op naam of e‑mail), filter op **status** (actief, gepauzeerd, opzegverzoek, opgezegd…) en op **abonnementstype**.
- Sorteren op naam, laatste sessie, MRR of credits.
- "Toon inactieven" vink je aan als je een oud‑lid zoekt.

### Lid openen
Klik op een naam → lid‑detail. Hier zie je:
- Persoonlijke gegevens (naam, e‑mail, telefoon)
- Abonnement & status
- Recente sessies en boekingen
- Credits (bij `ten_ride_card` / `pt_package`)
- Betalingen en facturen

### Veelvoorkomende acties
- **Pauze handmatig toekennen** → ga naar Pauzes (zie hieronder) of gebruik de knop in het lid‑detail.
- **Lid handmatig opzeggen** → doe dit alleen in overleg met het lid; gebruik de opzeg‑knop in het detailscherm. De automatische opzegstroom is netter (lid doet het zelf via `/app/abonnement`).
- **Betalingen nakijken** → klik door naar facturen om een failed payment te bekijken.

**Let op:** dit scherm wijzigt direct in de echte database. Er is geen "ongedaan maken". Twijfel je? Vraag het eerst aan Ilja.

---

## 5. Rooster maken

**Pad:** Admin cockpit → **Rooster**

Je werkt per **week** (ISO‑week). Bovenin pijltjes om vooruit/terug te bladeren.

### Een les plannen
1. Klik op een leeg blok in de week‑grid op het juiste tijdstip.
2. Vul in: pijler (Yoga/Mobility, Kettlebell, PT, Kids, Senior…), trainer, capaciteit, eventueel notitie.
3. Opslaan. De les staat nu in het rooster en is direct boekbaar voor leden.

### Een les aanpassen
- Klik op de bestaande les → wijzig trainer, tijd of capaciteit.
- Wil je een les **annuleren**: zet status op `cancelled`. Geboekte leden krijgen automatisch hun credit terug en (afhankelijk van timing) een mail.

### Terugkerende lessen
Het systeem ondersteunt herhalingen (zie spec `tmc-sessies-recurrence-vrij-trainen.md`). In de praktijk: je legt het basisrooster één keer goed neer per kwartaal en past per week alleen de uitzonderingen aan (feestdagen, vakanties, vervangingen).

### Vrij Trainen
Vrij Trainen verschijnt **niet** in de admin bezettings‑KPI's en is uitgesloten in een aantal lijsten — dat is bewust. Vrij Trainen heeft zijn eigen flow met andere cancel‑regels.

---

## 6. Pauze‑verzoeken afhandelen

**Pad:** Admin cockpit → **Pauzes** (of klik op het 🔔 belletje)

Leden vragen via hun eigen scherm een pauze aan met een reden:
- **Zwangerschap**
- **Medisch** (vereist medisch attest, geüpload door het lid)
- **Anders (goedgekeurd)** — alles wat niet onder bovenstaand valt

Per regel zie je: lid, periode, reden, eventuele notitie en het attest.

### Wat te doen
- **Goedkeuren**: de pauze gaat in op de startdatum, abonnement loopt door op pauze‑tarief (zie Instellingen).
- **Afwijzen**: geef een korte reden mee zodat het lid weet waarom. Het lid krijgt automatisch een mail.

**Vuistregel**: medische redenen met attest → altijd goedkeuren. Bij "anders" kort overwegen of het past binnen het beleid (vakantie >2 weken bv.).

---

## 7. Aankondigingen

**Pad:** Admin cockpit → **Aankondigingen**

Korte berichten die leden zien in hun eigen scherm (bv. "Studio gesloten op 27 april" of "Nieuwe Mobility class op donderdagavond").

- **Titel + body** — kort houden, max 2 zinnen.
- **Doelgroep** — alle leden, of specifiek per rol/abonnement.
- **Verloopdatum** — vul altijd in, anders blijft de aankondiging eindeloos staan.

**Tip:** schrijf voor leden, niet voor zoekmachines. Geen marketing‑taal, gewoon directe communicatie.

---

## 8. Trainers

**Pad:** Admin cockpit → **Trainers**

Hier voeg je een nieuwe trainer toe of pas je een bestaand profiel aan (foto, bio, specialisme, beschikbaarheid). De trainer logt zelf in op `/app/trainer/sessies` om eigen lessen te zien en presentie bij te houden.

**Nieuwe trainer toevoegen**
1. Klik **Nieuwe trainer**.
2. Vul naam, e‑mailadres en rol (`trainer`) in.
3. Trainer ontvangt een uitnodigingsmail.

**Trainer verwijderen / pauzeren**
Doe dit nooit zonder eerst hun gekoppelde sessies over te boeken naar een andere trainer.

---

## 9. Instellingen — met beleid aanpassen

**Pad:** Admin cockpit → **Instellingen**

Dit scherm bepaalt het hele boekings‑ en betalingsbeleid. **Wijzig hier alléén als je zeker weet wat je doet.** Bij twijfel: vraag Ilja.

| Setting | Wat het doet |
|---|---|
| `cancellation_window_hours` | Tot hoeveel uur vóór de les een lid gratis kan annuleren |
| `vrij_trainen_cancel_window_minutes` | Hetzelfde, maar voor Vrij Trainen (in minuten) |
| `booking_window_days` | Hoeveel dagen vooruit een lid mag boeken |
| `fair_use_daily_max` | Max aantal boekingen per lid per dag |
| `no_show_strike_threshold` + `no_show_strike_window_days` | Na X no‑shows in Y dagen krijgt het lid een tijdelijke blok |
| `no_show_block_days` | Hoe lang die blok duurt |
| `no_show_release_minutes` | Hoeveel minuten na startdatum de plek automatisch vrijkomt bij geen check‑in |
| `registration_fee_cents` | Eenmalige inschrijfkosten |
| `drop_in_*_cents` | Drop‑in prijzen per pijler |
| `ten_ride_card_*_cents` | 10‑rittenkaart prijzen |
| `member_pt_discount_percent` | Korting op PT voor leden |
| `check_in_enabled` + `check_in_pillars` | Welke pijlers de fysieke check‑in flow gebruiken |
| `admin_checkin_pin_hash` | De pincode voor de tablet bij de ingang — zet via de aparte form |

**Prijswijzigingen** lopen door naar de website (`/aanbod`, `/proefles`) via Sanity. Op de admin‑kant pas je alleen de boekings‑logica aan; de prijzen die bezoekers zien staan ook in Sanity (zie sectie 10).

---

## 10. Content beheren in Sanity Studio

**Pad:** https://www.themovementclub.nl/studio

Dit is waar je álle teksten, foto's en content van de website aanpast — **zonder** dat je code aanraakt. Wijzigingen zijn binnen 5‑10 seconden live (incremental rebuild via Vercel).

### Wat je hier beheert

| Document | Inhoud |
|---|---|
| **Site Settings** | Adres, telefoon, WhatsApp, KvK, BTW, e‑mail — gebruikt op elke pagina |
| **Site Images** | Hero‑foto's, studio‑foto's, trainer‑foto's |
| **Opening Hours** | Openingstijden (gebruikt op de site én in Google Business) |
| **Trainer** | Marlon's bio, foto, socials |
| **Offering** | Aanbod‑items op `/aanbod` (PT, Small Group, Mobility, Strength) |
| **Pricing Tier** | Abonnementen en tarieven (zichtbaar op `/aanbod`) |
| **Testimonial** | Klant‑reviews op de homepage |
| **FAQ** | Veelgestelde vragen — filterbaar per pagina (`aanbod` / `crowdfunding` / `algemeen`) |
| **Blog Post** | Optioneel — voor content marketing |
| **Crowdfunding Tier** | Tiers voor de crowdfunding pagina |
| **Crowdfunding Settings** | Doelbedrag, tellers, status van de campagne |

### Hoe je iets aanpast

1. Klik links op het type document.
2. Kies een bestaand item of klik **+ Create** voor een nieuw item.
3. Vul de velden in. Verplichte velden zijn gemarkeerd.
4. **Publish** rechtsonder. (Drafts worden níét getoond op de site.)

### Tips voor onderhoud
- **Foto's**: minimaal 1600px breed, JPG of WebP. Sanity comprimeert automatisch.
- **Alt‑tekst** is verplicht bij elke afbeelding — niet alleen voor SEO maar ook voor toegankelijkheid.
- **Volgorde**: bij Offering, Pricing Tier en Testimonial bepaalt het veld `order` of het sleep‑handvat de volgorde op de site.
- **Inactief maken** in plaats van verwijderen — zet `active: false`. Dan blijft het in je archief maar verschijnt niet op de site.
- **Veranderen jullie de prijzen?** Pas dit aan op **twee plekken**: in Sanity (Pricing Tier — voor de website) én in Admin → Instellingen (voor de boekingslogica). Anders raken ze uit sync.

---

## 11. Leads en e‑mails (MailerLite)

**Pad:** https://app.mailerlite.com

Alle leads van de website komen automatisch in MailerLite terecht met een **tag** die zegt waar ze vandaan komen:

| Tag | Bron |
|---|---|
| `PDF Lead` | Beweeg Beter guide gedownload |
| `Mobility Reset` | 7‑dagen e‑mail sequence gestart |
| `Mobility Check Lead` | Gratis Mobility Check aangevraagd |
| `Proefles Lead` | Proefles aangevraagd |
| `Contact Lead` | Contactformulier |
| `Crowdfunding Backer` | Crowdfunding betaling gedaan |
| `Member` | Bestaand lid (wordt uitgesloten van lead magnets) |

### Wat je daar doet
- **Subscribers** → zoek een lead op naam/e‑mail.
- **Automations** → de e‑mail sequences (Beweeg Beter PDF, Mobility Reset 7 dagen, follow‑ups). Aanpassen kan, maar test eerst met je eigen e‑mailadres.
- **Campaigns** → ad‑hoc nieuwsbrieven (bv. een maandelijkse update aan leden).

### Belangrijke automations om te kennen
1. **PDF download** → tag `PDF Lead` → 1 dag later automatisch in Mobility Reset sequence.
2. **Mobility Reset dag 7** → CTA naar `/mobility-check`.
3. **Geen klik op dag 7?** → dag 9 follow‑up "Heb je vragen?"
4. **Mobility Check aanvraag** → notificatie naar jou + auto‑reply naar klant.
5. **No‑show check‑in na 7 dagen** → follow‑up mail.

**Aanpassen?** Open de automation, klik **Edit**, pas tekst aan, **Save**. Lopende leads gaan op het oude pad door — alleen nieuwe leads krijgen de nieuwe versie.

---

## 12. Maandelijks vinkje (kort onderhoud)

Eens per maand, ca. 30 minuten:

- [ ] **Dashboard scannen** — bezetting, MRR, no‑show rate. Zijn de KPI's gezond?
- [ ] **Leden zonder activiteit** — sorteer Leden op "laatste sessie oudste eerst" → bel een paar leden die al 3+ weken niet zijn geweest.
- [ ] **Openstaande facturen** — open Admin → klik op de Quick Tile. Stuur eventueel een herinnering of bel.
- [ ] **Pauze‑verzoeken nakijken** — staat er nog iets open?
- [ ] **Aankondigingen opschonen** — staan er aankondigingen die niet meer relevant zijn?
- [ ] **GA4 rapportage** (https://analytics.google.com) — kijk naar het Leads dashboard. Doel:
  - 10+ Mobility Check aanvragen/maand
  - 50+ PDF downloads/maand
  - 30+ Mobility Reset opt‑ins/maand
- [ ] **MailerLite open & click rates** — open rate Reset sequence >50%, klik op dag 7 CTA >10%. Zo niet: pas de tekst aan.
- [ ] **Google Business Profile** — post 1× per week iets nieuws (foto, update, aankondiging).
- [ ] **Recensies** — vraag tevreden leden om een Google review.

---

## 13. Wat te doen als er iets niet werkt

| Symptoom | Eerste check | Daarna |
|---|---|---|
| Lid kan niet boeken | Status van het lid (paused? cancelled?) en saldo/credits | Check Instellingen → `booking_window_days` en `fair_use_daily_max` |
| Lid is niet ingecheckt | Vraag of ze de tablet hebben gebruikt en op tijd waren | `no_show_release_minutes` bepaalt hoe lang de plek vrij stond |
| Pauze niet zichtbaar bij lid | Heb je 'm in Admin echt goedgekeurd? | Klik op het lid → pauzes‑tab |
| Site toont oude tekst | Heb je in Sanity gedrukt op **Publish** (niet alleen opgeslagen)? | Wacht 10 sec en hard‑refresh (Cmd+Shift+R) |
| Foto niet zichtbaar | Alt‑tekst ingevuld? `active` op true? | Check ook of de file groot genoeg is (>800px) |
| E‑mail niet aangekomen | Check spam‑folder. Klopt het e‑mailadres? | Open MailerLite → Subscribers → zoek de lead → tab "Activity" |
| Betaling gefaald | Open het lid → Betalingen | Lid krijgt automatisch een mail van Mollie om opnieuw te betalen |

**Komt er niet uit?** Mail of bel **Ilja** (ilja@…). Stuur altijd mee: de pagina‑URL, de naam van het lid, en een screenshot.

---

## 14. Veiligheid

- **Deel je inloglink nooit.** De magic link in je e‑mail is 15 minuten geldig en alleen voor jou.
- **Geef nooit iemand admin‑rechten** zonder overleg. Trainers krijgen rol `trainer`, niet `admin`.
- **Geen wachtwoorden in WhatsApp/SMS.** Stuur iemand een uitnodiging via het systeem; die genereert een eigen magic link.
- **Tablet bij de ingang**: de check‑in PIN code staat in Instellingen. Wijzig 'm elke ~6 maanden.

---

## 15. Snelle referenties

- **Website**: https://www.themovementclub.nl
- **Admin cockpit**: https://www.themovementclub.nl/app/admin
- **Sanity Studio**: https://www.themovementclub.nl/studio
- **MailerLite**: https://app.mailerlite.com
- **GA4 Analytics**: https://analytics.google.com (property: The Movement Club, ID `G-2VFCDM4KRZ`)
- **Google Business Profile**: https://business.google.com
- **Mollie dashboard** (betalingen): https://my.mollie.com

---

*Vragen, kapotte links of dingen die niet kloppen? Mail Ilja — dan werken we deze handleiding bij.*
