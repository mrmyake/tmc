# Spec: lead magnet "Welke yoga past bij jou?"

Opdracht van Ilja, branch `feat/yoga-test`. Publieke landingspagina op themovementclub.nl met een gratis proefles via proefcode JOUWYOGA.

## Werkwijze

- Model: Sonnet (frontend plus API-route; geen RLS, Mollie of SECURITY DEFINER). Blijkt er toch een migratie of RPC-wijziging nodig: eerst voorleggen; RPC- of RLS-werk gaat dan naar Fable in een aparte PR.
- Feature-branch `feat/yoga-test` vanaf main, in een eigen worktree, niet in de main-werkboom.
- Discovery-first: fase 1, rapporteren, STOP. Pas na akkoord van Ilja fase 2.
- Schema `tmc` only. Geen `supabase db push` voor de PR gemerged is. Migration-entry `20260503` nooit aanraken. Nooit self-mergen.
- Geen em dashes, nergens: niet in code, copy, commits of deze spec.
- Alle Nederlandse tekst krijgt `// COPY: confirm met Marlon`.
- Huisstijl: volg de bestaande marketingpagina's en de design-skill in `~/.claude/skills/the-movement-club-design/` (warm black #0E0C0B, Stone #F4EFE6, Champagne #B9986A, Fraunces display, Inter body, 8px kaartradius, 4px controlradius). Mobiel eerst: het verkeer komt vooral van Instagram en Google Ads.

## Proefcode

- JOUWYOGA wordt door Ilja in de admin-cockpit aangemaakt (scope `yoga_mobility`, max_uses null, one_per_person true, new_customers_only true, geen valid_through). Niet aanmaken in een migratie of seed.
- Codes staan in `tmc.trial_codes` in hoofdletters (check `code = upper(code)`). Op de site tonen als "JOUWYOGA".
- De code is een constante in de quiz-config (`trialCode: 'JOUWYOGA'`), niet verspreid door componenten.

## Fase 1: discovery (rapporteren, dan STOP)

1. Slugs van `tmc.class_types`. Nidra heeft slug `kettlebell-basics`, Yin `vinyasa-yoga`, Restorative `mobilitymannen`, Vinyasa Flow `flow-yoga`. Zoek uit waar `class_types.slug` gebruikt wordt (app, routes, Sanity-referenties, links in mails). Stel correcte slugs voor (bijv. `nidra`, `yin`, `restorative`, `vinyasa-flow`) en zeg of hernoemen iets breekt. Niets wijzigen.
2. Rooster zonder login: welke bestaande server-side leesroute voor het publieke rooster bestaat er (actieve `schedule_templates` binnen valid_from/valid_until, met trainer-naam)? Hergebruik liever dan nieuw. Meld de conventie van `day_of_week` (0 = zondag of ISO).
3. /proefles met code: kan /proefles via queryparameters direct de kaart "Ik heb een proefcode" openen met de code ingevuld (`?code=JOUWYOGA`) en een les voorselecteren (`?les=<class_type_id>`)? Wordt een ingetypte code server-side naar hoofdletters gezet? Zo niet, de kleinste aanpassing. De drie kaarten, MOVENOW en de gratis proefles uit de openingsperiode blijven ongemoeid.
4. Kan een les met scope `yoga_mobility` worden voorgeselecteerd en geboekt met de code, inclusief alle zes uitkomsten (ook Pilates en Nidra)?
5. Geldt "max 4 gratis proefplekken per les" uit de openingsperiode ook voor boekingen via een proefcode? Rapporteer; niets wijzigen.
6. Codestatus zonder inwisselen: bestaat een server-side manier om te checken of een code actief is, zonder gebruik te verbruiken en zonder `trial_code_attempts` op te hogen? Zo niet, stel voor hoe (geen nieuwe grants voor anon).
7. Attributie: kan de quiz-uitslag (welke les) mee in `tmc.lead_attributions` zonder schemawijziging? Zo niet, stel een minimale migratie voor, maar bouw die niet.
8. E-mail: patroon van `/api/proefles` voor MailerLite, patroon voor transactionele mail via MailerSend, en bestaande rate limiting per IP die herbruikbaar is.
9. Analytics en consent: hoe stuurt de site GA4- en Meta-events, en via welke cookiebanner-check?

## Fase 2: bouw (pas na akkoord)

Route `/welke-yoga-past-bij-jou`, publiek, indexeerbaar, eigen metadata (title, description, OG-afbeelding), in de sitemap. Drie views op een pagina: start, vraag (een per scherm), uitslag. Voortgangsbalk "Vraag X van 8", knop "Vorige vraag", een antwoord tikken gaat automatisch door.

Inhoud in een getypeerd configuratiebestand (bijv. `src/lib/yoga-test/config.ts`), niet hardcoded in componenten.

### Startscherm

- Eyebrow: "Yoga bij The Movement Club"
- H1: "Welke yoga past bij jou?"
- Lead: "Vinyasa, Yin, Pilates, Nidra: het zijn allemaal heel verschillende lessen. Beantwoord 8 korte vragen en je ziet welke les op ons rooster het beste bij je past, en wanneer je hem kunt volgen."
- Feiten: "8 vragen", "1 min van je tijd", "max 8 per les"
- Knop: "Start de test"; daaronder: "Je ziet je uitslag direct, zonder e-mailadres."

### Uitkomsten (sleutel, class_type; koppel op class_types.id, niet op slug)

- v = Vinyasa Flow
- p = Pilates
- ym = Yin Movement
- y = Yin
- r = Restorative
- n = Nidra

Volgorde bij gelijke score: v, y, p, ym, r, n. Een uitkomst zonder actieve roostertijden valt af en de volgende in de ranking wordt de uitslag.

### Vragen en punten (antwoordtekst, punten)

1. "Wat wil je vooral uit yoga halen?"
   - "Energie en een goede workout": v3 p1
   - "Een sterkere core en een betere houding": p3 ym2
   - "Soepeler worden": y3 ym2
   - "Tot rust komen en stress kwijtraken": n3 r2
2. "Hoe voel je je meestal aan het eind van de dag?"
   - "Onrustig, ik moet nog bewegen": v2
   - "Stijf, vooral in rug, heupen of schouders": y2 ym1
   - "Op, ik wil alleen nog liggen": r2 n1
   - "Mijn lichaam is prima, mijn hoofd zit vol": n3
3. "Welk tempo past bij jou?"
   - "Vlot, steeds in beweging": v3
   - "Rustig en precies, elke beweging gecontroleerd": p3
   - "Afwisselend, rustig en dan weer uitdagend": ym3
   - "Langzaam, minutenlang in een houding": y3 r2
4. "Hoe makkelijk kun jij ontspannen?"
   - "Makkelijk, daar heb ik geen hulp bij nodig": v1 p1
   - "Pas als ik eerst flink heb bewogen": v2 ym1
   - "Lastig, mijn hoofd blijft maar doorgaan": n3 r1
   - "Wisselend, het hangt af van hoe druk ik het heb": y1 r1 n1
5. "Wat spreekt je het meest aan?"
   - "Zweten en voelen dat je gewerkt hebt": v2 p1
   - "Spieren voelen waarvan je niet wist dat je ze had": p2 ym2
   - "Lang in een houding blijven en voelen dat er iets loslaat": y3 r1
   - "Helemaal ondersteund liggen op bolsters en dekens": r3 n1
6. "Hoeveel ervaring heb je met yoga of pilates?" (hint: "Elke les is ook geschikt als je net begint.")
   - "Geen, ik begin net": r1 y1 n1
   - "Een beetje, ik heb het wel eens gedaan": geen punten
   - "Ik doe het regelmatig": v2 ym1
7. "Wanneer train je het liefst?"
   - "Door de week, overdag": bucket weekdag-dag (ma t/m vr, start voor 17:00)
   - "Door de week, 's avonds": bucket weekdag-avond (ma t/m vr, start vanaf 17:00)
   - "In het weekend": bucket weekend (za en zo)
   - "Maakt me niet uit": geen bucket

   Punten NIET hardcoden: elke uitkomst die in het live rooster minstens een tijd in de gekozen bucket heeft, krijgt +1.
8. "Is er iets waar we rekening mee moeten houden?" (hint: "Bijvoorbeeld een blessure, zwangerschap of fysieke klachten.")
   - "Nee" / "Ja": geen punten. Bij "Ja" verschijnt op de uitslag: "Je gaf aan dat er iets is om rekening mee te houden. Fijn dat je het zegt. Laat het ons even weten bij je boeking of bel ons, dan stemt de trainer de les op je af." De quiz geeft nooit medisch advies en stuurt bij "Ja" niet naar een bepaalde les.

### Uitslagteksten (eyebrow standaard "Jouw les")

- v "Vinyasa Flow". Waarom: "Jij wilt bewegen, energie kwijt en na afloop voelen dat je iets gedaan hebt." Wat: "Een dynamische les waarin je houdingen vloeiend op je ademhaling verbindt. Je bouwt kracht, souplesse en focus op, en je blijft in beweging."
- p "Pilates", eyebrow "Geen yoga, wel precies wat je zoekt". Waarom: "Jij zoekt kracht van binnenuit: een sterke core, een betere houding en controle over elke beweging." Wat: "Gecontroleerde oefeningen die je core versterken, je houding verbeteren en je lichaam in balans brengen. Rustig tempo, maar je voelt het de dag erna."
- ym "Yin Movement". Waarom: "Jij wilt allebei: loslaten en sterker worden. Niet alleen rekken, niet alleen werken." Wat: "Een combinatieles waarin diepe, aangehouden yin-houdingen samenkomen met pilatesoefeningen voor kracht en controle."
- y "Yin". Waarom: "Jij voelt je stijf of gespannen en wilt soepeler worden, zonder haast." Wat: "Een langzame les met lang aangehouden houdingen die dieper gelegen bindweefsel en gewrichten soepel maken. Je leert loslaten, letterlijk."
- r "Restorative". Waarom: "Jij hebt vooral herstel nodig. Je lichaam en je hoofd mogen even helemaal niets." Wat: "Een rustige les waarin je met bolsters en dekens lang ondersteund in houdingen ligt, zodat je zenuwstelsel kan herstellen."
- n "Nidra". Waarom: "Jouw lichaam is het probleem niet, je hoofd staat gewoon nooit uit." Wat: "Een begeleide, diep ontspannende meditatie in lighouding. Je hoeft niets te kunnen, alleen te liggen en te luisteren."

### Uitslagscherm

- Kaart met eyebrow, naam (Fraunces, groot), waarom, wat.
- "Op het rooster": live tijden van die les, als "ma 10:30, met Kim" (voornaam trainer). Tijden in de gekozen bucket van vraag 7 krijgen een champagne-markering links.
- Codeblok (gestippelde champagne-rand): "Je eerste les is gratis met code" plus "JOUWYOGA".
- Primaire knop "Boek je gratis proefles" naar /proefles met de kaart "Ik heb een proefcode" open, JOUWYOGA ingevuld en deze les voorgeselecteerd (volgens discovery punt 3 en 4).
- Fallback: is de code niet actief (ingetrokken of op, volgens discovery punt 6), dan geen codeblok en knop "Boek je proefles" naar de betaalde kaart, met de les voorgeselecteerd. Status server-side checken bij het renderen, zonder de code te verbruiken; kort cachen (bijv. 5 minuten).
- Secundaire knop "Liever eerst even gebeld worden" naar /proefles, kaart "Liever gebeld worden".
- Blok "Ook iets voor jou": de nummer 2 uit de ranking, met naam en dagen/tijden, knop "Bekijk" wisselt de uitslag om.
- Blok "Je uitslag in je mail?": "Dan sturen we je uitslag, de lestijden en wat je voor je eerste les moet weten. Matjes liggen klaar, neem zelf een handdoek mee." Velden voornaam (optioneel) en e-mailadres, los aankruisvakje (standaard uit): "Stuur me ook af en toe tips en nieuws van The Movement Club. Afmelden kan altijd." Knop "Stuur mijn uitslag". Bevestiging in de pagina: "Dank je, {naam}. Je uitslag voor {les} staat in je mail."
- Link "Test opnieuw doen".

### API-route voor het mailblok (`POST /api/yoga-test`)

- De server controleert het e-mailadres en berekent de uitslag opnieuw uit de antwoorden; vertrouw nooit een uitslag die de client meestuurt.
- Uitslagmail altijd via MailerSend (transactioneel): les, waarom, live tijden, de code JOUWYOGA (alleen als die actief is) en een CTA naar /proefles met code en les ingevuld. In de HTML nooit een volledige URL als zichtbare tekst, alleen tekstlinks (eerder belandde mail met zichtbare URL in spam).
- Alleen bij aangevinkte opt-in: MailerLite-subscriber in groep `MAILERLITE_YOGA_TEST_GROUP_ID` (nieuwe env-var, Ilja zet hem in Vercel) met custom field `yoga_test_result` = naam van de les. Zonder opt-in geen MailerLite.
- Rate limiting per IP volgens het bestaande patroon uit discovery punt 8.
- ntfy-alert naar staf zoals /api/proefles, met les en of er opt-in was.

### Analytics

Events `yoga_test_start`, `yoga_test_complete` (met uitslag), `yoga_test_book_click`, `yoga_test_email_submit`, alleen na toestemming via de bestaande cookiebanner.

### Acceptatie

- Werkt zonder login, mobiel en desktop.
- Elke uitkomst is te bereiken; een unit test doorloopt alle antwoordcombinaties en logt per uitkomst het aandeel overwinningen (verwachting met vaste roosterpunten: ongeveer v 31%, y 22%, n 13%, ym 11%, p 11%, r 11%).
- Een uitkomst zonder roostertijden wordt nooit getoond.
- End-to-end op preview: uitslag, "Boek je gratis proefles", /proefles opent met JOUWYOGA en de les ingevuld, boeking slaagt zonder betaling met een nieuw e-mailadres, tweede poging met hetzelfde adres wordt geweigerd (one_per_person).
- Fallback getest: met een ingetrokken testcode verschijnt de betaalde knop zonder codeblok.
- Rapporteer na de bouw: preview-URL, screenshots van start, een vraag, de Pilates-uitslag, /proefles met ingevulde code en de mailbevestiging, en de testuitvoer. Niet mergen; Ilja geeft akkoord per PR.

## Besluiten na fase 1 (akkoord Ilja)

- **Startroute (optie C).** `GET /proefles/code/start?quiz=<id>&les=<class_type_id>[&tijd=...]`. De querystring bevat nooit de code: die komt uit de server-side allowlist `QUIZ_TRIAL_CODES` (`{ yoga: 'JOUWYOGA' }`) in `src/lib/yoga-test/config.ts`. Onbekend quiz-id of een meegegeven `?code=`: genegeerd, door naar `/proefles/code?les=...`. Bekende quiz: read-only `lookupUsableTrialCodeScope`; positief zet de route het bestaande ondertekende cookie via `setTrialCodeCookie` en stuurt naar `/proefles/code?les=...` (sessielijst direct zichtbaar); negatief naar `/proefles/boeken?les=...`. Geen teller (er is geen orakel); het gebruiksmaximum blijft bij `redeem_trial_code`. Reden voor de route: "Code controleren" doet meer dan valideren, het zet het cookie waaruit `startTrialBooking` de code leest.
- **Doorlinks.** De knoppen op de uitslag zijn gewone `<a>`-links (geen prefetch). Alle attributieparameters (gclid, gbraid, wbraid, fbclid, utm_*, lp) gaan ongewijzigd mee; heeft de bezoeker nog geen `utm_source`, dan krijgt de doorlink `utm_source=yoga_test&utm_medium=quiz&utm_campaign=welke_yoga`. De gekozen les staat in `?les=` en dus in het landingspad van `tmc.lead_attributions`. Geen migratie voor attributie.
- **Voorselectie.** Eerste sessie met plek binnen 14 dagen in de gekozen tijdsbucket van vraag 7; bestaat die niet, dan de eerstvolgende sessie met plek van die les (`src/lib/yoga-test/preselect.ts`). De bezoeker kiest altijd vrij.
- **Rate limiting.** Generieke teller: tabel `tmc.rate_limit_attempts` en `tmc.register_rate_limited_attempt(p_scope, p_key, p_max, p_window, p_lock)` (SECURITY DEFINER, `search_path = tmc, pg_temp`, alleen `service_role`), migratie `20261107120000_rate_limit_attempts.sql`. Quiz: scope `yoga_test`, sleutel IP, 10 per 30 minuten, daarna 15 minuten slot. De live definitie van `register_opening_trial_attempt` is via `pg_get_functiondef` opgehaald; verschil: een rij per poging in plaats van een teller per IP, zodat het venster met de klok meeloopt. Faalt de RPC (preview voordat de migratie is gepusht), dan laat de route door buiten productie en weigert op productie.
- **Slugs.** Niet in deze PR.
- **Analytics.** Vier events met een `hasConsent()`-poort, geregistreerd in `spec-analytics.md`. Geen Meta-pixel in de code, dus geen Meta-events.
- **Degradatie.** Bestaat JOUWYOGA nog niet (of is hij ingetrokken, op of verlopen), dan toont de uitslag geen codeblok en de knop "Boek je proefles" naar de betaalde kaart; de mail laat de code weg. Ontbreekt `MAILERLITE_YOGA_TEST_GROUP_ID`, dan wordt de opt-in overgeslagen met een waarschuwing in de logs. Weigert MailerLite het veld `yoga_test_result`, dan wordt de abonnee zonder veld toegevoegd.
- **Privacy.** De zorgvraag (vraag 8) blijft in de browser en wordt nooit naar de server gestuurd. ntfy bevat geen persoonsgegevens.

## Ledger

Bold-lead formaat, een regel per PR (PR-nummer, datum, wat gewijzigd, wat bewust niet aangeraakt).

- **PR #332 (2026-11-07, lead magnet "Welke yoga past bij jou?")**: branch `feat/yoga-test`. Nieuwe publieke pagina `/welke-yoga-past-bij-jou` (acht vragen, uitslag, mailblok), `POST /api/yoga-test` (MailerSend-uitslagmail, optionele MailerLite-opt-in, ntfy), startroute `GET /proefles/code/start`, voorselectie via `?les=` en `?tijd=` op `/proefles/code` en `/proefles/boeken`, `?kaart=bellen` op `/proefles`, migratie `20261107120000_rate_limit_attempts.sql` (generieke teller), vier events in het eventregister. Bewust niet aangeraakt: `checkTrialCode`, `CodeEntry`, `startTrialBooking`, `redeem_trial_code`, de drie kaarten op `/proefles`, MOVENOW, `/proefles/gratis`, `class_types.slug`, `/api/proefles` (krijgt de generieke teller later) en de code JOUWYOGA zelf (maakt Ilja aan in de admin). Gemerged met squash-commit `26b3b95` (2026-11-07). Migratie `20261107120000` gepusht naar schema tmc op 2026-11-07 (enige openstaande migratie; RLS aan, geen policies, geen grants aan anon of authenticated, EXECUTE alleen voor `service_role`); POST op productie zonder opt-in slaagde en schreef een rij in de teller.
