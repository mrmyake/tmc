# Claude Code opdracht: Yoga-minisite TMC

## Doel
Bouw een yoga-minisite als subdirectory binnen de bestaande TMC-site (`themovementclub.nl/yoga/...`), gericht op vindbaarheid via SEO, AI-zoekmachines (GEO) en Google Ads. Pré-opening: hoofd-CTA is wachtlijst/vroege inschrijving (MailerLite), niet een boeking.

## Stack en kaders (bekend, niet opnieuw kiezen)
- Next.js 16 App Router, Tailwind 4, TypeScript, Sanity CMS (project `hn9lkvte`, dataset production), Vercel. Let op: `params`/`searchParams` zijn async (await), zoals in de rest van de codebase.
- Designtokens en visuele richtlijn: skill `the-movement-club-design`. Warm zwart `#0E0C0B`, Stone 100 `#F4EFE6`, Champagne `#B9986A`, Fraunces (display), Inter (body).
- GA4 `G-2VFCDM4KRZ` is al actief. Conversie-events koppelen aan CTA-kliks.
- Schrijfregels in alle copy: Nederlands, geen em dashes. Gebruik komma, puntkomma, dubbele punt of herformuleer.
- NIET doen: geen Sentry, geen apart domein of subdomein (alles onder `/yoga`).

## STAP 0 (verplicht, eerst doen, dan stoppen en rapporteren)
Schrijf nog GEEN code. Inspecteer en rapporteer:
1. Sanity: bestaande schema's, hoe documenten worden gequeryd (GROQ helpers), waar schema's staan, hoe images/portable text nu worden afgehandeld.
2. Routing: hoe bestaande pagina's en metadata (`generateMetadata`, OG, canonical) zijn opgezet. Bestaat er al een gedeelde SEO-/metadata-helper?
3. Structured data: wordt er al JSON-LD/schema.org gerenderd? Zo ja, waar en hoe.
4. `sitemap.ts`/`sitemap.xml` en `robots.txt`: huidige inhoud en generatiewijze. Staat er al een `llms.txt`?
5. MailerLite-integratie: bestaat er al een wachtlijst-/inschrijfflow of API-koppeling die hergebruikt kan worden?
6. Designsysteem: welke herbruikbare componenten (hero, card, sectie, CTA, FAQ-accordion) bestaan al.
7. Mediahandling: hoe worden afbeeldingen geoptimaliseerd (`next/image`, Sanity image pipeline).

Rapporteer de bevindingen plus een definitief voorstel voor de PR-opdeling (zie hieronder) en wacht op go voordat je bouwt.

## Voorgestelde PR-opdeling (één per scherm/feature, bevestig in STAP 0)
- **PR-Y1: Sanity-content** — schema's `yogaStyle`, `yogaTeacher` + GROQ-queries + seed met de content uit "Contentbron" hieronder. Geen frontend. GEEN `scheduleSlot`-schema: het rooster blijft in Supabase (`class_sessions`/`class_types`/`trainers`) en wordt beheerd via de bestaande admin rooster-tool op `/app/admin/rooster`.
- **PR-Y2: Hub + vormpagina's** — `/yoga` en `/yoga/[style]` (yin-yoga, restorative-yoga, yoga-nidra, irest, flow-yoga). Inclusief vergelijkingstabel en FAQ-blokken.
- **PR-Y3: Docenten + rooster** — `/yoga/docenten`, `/yoga/docenten/[slug]`, `/yoga/rooster`. Het rooster leest uit Supabase (gefilterd op pillar `yoga_mobility`), in de stijl van de bestaande publieke `/rooster`-pagina; sessies worden ingevoerd via de admin rooster-tool, niet in Sanity.
- **PR-Y4: SEO/GEO-laag + wachtlijst** — JSON-LD (HealthClub/SportsActivityLocation, Course/Service, Person, FAQPage, BreadcrumbList), sitemap-uitbreiding, `robots.txt` met AI-crawlers, `llms.txt`, interne links vanuit hoofdnavigatie/home. Plus de wachtlijst-CTA: nieuw endpoint `/api/leads/yoga-waitlist` dat `addSubscriber` aanroept met de bestaande MailerLite-groep "Yoga Wachtlijst" (reeds aangemaakt; voeg het group-ID toe aan `GROUPS` in `src/lib/mailerlite.ts`, zoals de andere groepen). Hergebruik het lead-formulierpatroon en UTM-mapping (`src/lib/utm.ts`).

## Pagina-eisen
### /yoga (hub)
- H1 met lokale term, bv. "Yoga in Loosdrecht bij The Movement Club".
- Korte propositie, vergelijkingstabel van de vijf vormen (as: rust naar actief), docentenstrip, rooster-preview, prominente wachtlijst-CTA.
- Dient als brede Google Ads-landingspagina.

### /yoga/[style] (per vorm)
- Eerste alinea begint met een citatie-klare definitiezin ("Yin yoga is ...").
- Secties: voor wie, wat het je brengt, wie geeft de les (link naar docent), FAQ-accordion, CTA.
- `FAQPage` JSON-LD op basis van het FAQ-blok.
- Strak thematisch, geschikt als losse Ads-advertentiegroep-landing.

### /yoga/docenten/[slug] (per docent)
- Bio, vormen die zij geven, link naar rooster, `Person` JSON-LD (E-E-A-T).

### /yoga/rooster
- Uit Supabase `class_sessions` (pillar `yoga_mobility`), beheerd via de admin rooster-tool op `/app/admin/rooster`. Hergebruik het patroon van de publieke `/rooster`-pagina (`createAdminClient`, week-grid). Toon weekrooster. KB/Kracht/65+ vallen onder andere pillars en verschijnen hier dus niet.

## SEO/GEO-eisen
- Per pagina: unieke title/description, canonical, OG/Twitter, Nederlandse alt-teksten met lokale term.
- JSON-LD zoals in PR-Y4.
- `robots.txt`: sta GPTBot, ClaudeBot, PerplexityBot, Google-Extended expliciet toe en verwijs naar sitemap.
- `llms.txt` in root: beknopte index met links naar `/yoga` en de vormpagina's.
- Vermijd "coming soon"-feel; publiceer echte content met wachtlijst-CTA zodat pagina's nu al indexeren.

## Contentbron (seed in Sanity)
De gezaghebbende brontekst (volledige vorm-definities en docenten-bio's, woordelijk) staat in `Yoga/Yoga.pdf`. De samenvattingen hieronder zijn daaruit afgeleid; raadpleeg de PDF voor de volledige stem en herschrijf licht (Nederlands, geen em dashes). Bruikbare intro voor de `/yoga`-hub (lichte redactie): "Binnen yoga zijn er verschillende vormen, elk met een eigen doel en gevoel. Sommige lessen zijn vooral gericht op diepe ontspanning en herstel, andere op beweging, kracht en energie."

### Beeldmateriaal (placeholders)
Gebruik de aangeleverde docentenfoto's in `Yoga/` als placeholder-beeld: `Kim.jpeg` (+ `kim2.jpg`), `Annouschka.jpeg`, `Bionda.jpeg`, `Connie.jpg`. Plaats ze als lokale placeholders (bv. `public/images/yoga/`) en referentieer via `next/image`, totdat definitieve beelden in Sanity staan. Aandachtspunten uit de bron: `Bionda.jpeg` is nog GEEN yogafoto en moet vervangen worden voor live; `Connie.jpg` pas tonen na bevestiging samenwerking. Voor vormpagina's zonder aangeleverd beeld: gebruik een neutrale placeholder in de designstijl, geen stockfoto's met verkeerde sfeer.

### Vormen (definities, herschrijf licht, behoud betekenis)
- **Yoga Nidra**: geleide diepe rustsessie, je ligt en doet niets, begeleid naar diepe ontspanning. Voor stress, slecht slapen, vermoeidheid, hoofd dat altijd aan staat.
- **iRest**: lijkt op Yoga Nidra maar therapeutischer; bewust contact met lichaam, emoties en innerlijke veiligheid; bij stress, burn-out, angst, trauma, overprikkeld zenuwstelsel. Helpt spanning en emoties veilig herkennen en reguleren.
- **Restorative**: rustig met ondersteunde houdingen (kussens, dekens, blokken), geen kracht nodig; lichaam voelt zich veilig om los te laten. Bij vermoeidheid, stress, herstel, behoefte aan diepe rust.
- **Yin**: rustig maar iets actiever/intenser; langer in houding (paar minuten), rek en druk op bindweefsel, gewrichten, fascia; niet pijnlijk. Laat spanning los, maakt soepeler, creeert ruimte.
- **Flow**: meest actieve vorm; vloeiend bewegen op ademritme; dynamisch en energiek; voor kracht, mobiliteit, balans, lichaamsbewustzijn, vitaliteit.

### Docenten (bio's, lichte redactie, behoud stem)
- **Kim** (Flow): 40, moeder, werkt daarnaast bij maatschappelijke organisatie. Begon 12 jaar geleden als aanvulling op krachttraining, ontdekte mentale voordelen; yoga als way of life. De mat als spiegel; voelen zonder oordeel; terug naar jezelf vanuit flow en balans. Geeft Vinyasa flow plus Yin/Restorative-ervaring.
- **Bionda** (Restorative): zachte les rond ontspanning, ademhaling en resetten van het zenuwstelsel. Niet presteren maar thuiskomen in je lichaam; rustige houdingen, props, warme sfeer; vertragen, opladen, even zijn. FOTO NOG VERVANGEN voordat live (huidige foto is geen yogafoto).
- **Connie / Constanze Fluhme** (Yoga Nidra & iRest): gecertificeerd Yoga Nidra- en iRest-docent; combineert diepe ontspanning met bewustwording, adem en lichamelijk herstel. Achtergrond in communicatie/media/cultuur. Werkt rond thema's hormonen, energie, slaap, stress, burn-out. Verdiept zich in Vinyasa/Yin/Restorative richting Yoga Alliance. BEVESTIG samenwerking voordat naam/foto live; gebruik GEEN eigen conceptnamen tenzij expliciet afgesproken.
- **Annouschka** (Yin, ook Restorative/Nidra): geboren in Belgie, 27 jaar in Nederland; via zorg, mindfulness, holistisch coachen en NLP naar yoga; teacheropleiding afgerond. Veilige, zachte ruimte om te vertragen; lichaam echt voelen, spanning loslaten, zenuwstelsel kalmeren, diep herstel.

### Rooster (Supabase, via admin rooster-tool)
Voer onderstaand weekrooster in via de admin rooster-tool (`/app/admin/rooster`): maak de yoga `class_types` (Yin, Restorative, Yoga Nidra, iRest, Flow) onder pillar `yoga_mobility` en koppel de juiste `trainers` (Kim, Bionda, Connie, Annouschka, Marlon). Niet in Sanity zetten.

| Tijd | Ma | Di | Wo | Do | Vr | Za | Zo |
|---|---|---|---|---|---|---|---|
| 09:00 | Annouschka - Yin | | Annouschka - Yin | Connie - Nidra/iRest | Kim - Flow | Bionda - Restorative | KB - Marlon |
| 13:00 | | | | 65+ Kracht - Marlon | | | |
| 16:00 | | | Kids Kracht - Marlon | | | | |
| 19:00 | | | KB - Marlon | | | | |
| 19:30 | Bionda - Restorative | Connie - Nidra/iRest | Kim - Flow | Annouschka - Yin | | | |

Resolutie van de bron-twijfel "Yin Man?!": er staat nu een Yin op maandag (Annouschka, 09:00), zodat er elke dag behalve zondag minstens een les is. De 09:00-ochtendrij loopt zo door van maandag tot en met zaterdag. Bionda's maandagles is bevestigd door haar bio ("Op maandag geef ik restorative yoga").

KB en Kracht zijn geen yogavormen; toon op het rooster maar koppel ze niet aan yoga-vormpagina's.

## Acceptatie per PR
- Build groen, lint groen, types kloppen.
- Geen em dashes in copy.
- Geen Sentry-referenties geintroduceerd.
- Lighthouse mobiel: performance en SEO in het groen op de nieuwe pagina's.
- JSON-LD valideert (Rich Results Test) zonder fouten.
