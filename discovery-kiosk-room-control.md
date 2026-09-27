# Discovery: bediening licht en Sonos per zaal vanuit de kiosk

Datum: 2026-09-26. Branch `feat/kiosk-room-control-discovery`. Uitsluitend onderzoek; er is niets gebouwd, geen HA-configuratie aangeraakt, geen migratie geschreven.

Deel 1 (Home Assistant) is uitgevoerd via de bestaande SSH-toegang en de REST API, alleen-lezen, op 2026-09-26 (VPN naar de studio). Deel 2 (repo) stond al.

Op 2026-09-27 is stap 0 (het handmatige HA-werk) grotendeels uitgevoerd: backup, Sonos-groepsbeleid, areas en de zes Yoga-scripts. Dit was niet langer alleen-lezen; zie "Stap 0: uitvoering" voor het volledige logboek, inclusief twee onbedoelde afwijkingen die zijn opgemerkt, gemeld en gecorrigeerd.

## Deel 1: Home Assistant

Omgeving: Home Assistant OS op generic-x86-64, Core **2026.9.3** (geen update beschikbaar), Core luistert op poort 80 zonder SSL. Alleen `ha core info`, de `.storage`-registers, de yaml-bestanden en `GET /api/*` zijn gelezen.

### A. Home Assistant Cloud
**Uit.** De `cloud`-component is geladen (standaardonderdeel van elke installatie), maar er bestaat geen `.storage/cloud`: er is nooit ingelogd bij Nabu Casa, dus geen abonnement, geen Remote UI. Dit is de grootste blokkade voor de architectuur: Vercel kan HA vandaag niet bereiken. Zie stap 0.

### B. Areas, apparaten, entities
Zes areas:

| area_id | naam | wat eronder hangt |
|---|---|---|
| `yoga_studio` | Yoga Studio | Sonos One (`media_player.yoga_studio_yoga_studio`) |
| `kracht_front` | Kracht Front | Sonos Era 100 SL (`media_player.kracht_front_kracht_front`) |
| `kracht_back` | Kracht Back | Sonos Era 100 SL (`media_player.kracht_back_kracht_back`) |
| `kracht_studio` | Kracht Studio | leeg |
| `kitchen` | Kitchen | Sonos Era 100 (alleen `switch.kitchen_*`, geen media_player-entity in registry of states) |
| `living_room` | Communal Area | leeg |

De drie lichtapparaten (zie C) hebben **geen area**, ook niet via het apparaat. Verder staan er zo'n twintig apparaten uit de oude thuisinstallatie in (Cast-groepen, Nest Hubs, LG-speakers, Sonos "Buiten" en "Dining Room"); die zijn allemaal `unavailable` en hebben geen area. Ze doen niet mee, maar vervuilen wel elke `media_player.*`-lijst.

### C. Licht
Drie `light.*`-entities, alle via Zigbee2MQTT (platform `mqtt`), alle **beschikbaar** (state `off`, niet `unavailable`), kleurmodi `color_temp` en `xy`, bereik 2000 tot 6535 K:

| entity | apparaat | area |
|---|---|---|
| `light.yoga_studio_plafond` | MiBoxer 5 in 1 LED Controller | geen |
| `light.yoga_studio_kast` | MiBoxer 5 in 1 LED Controller | geen |
| `light.yoga_studio_plint` | Tuya Zigbee RGB+CCT light (geen MiBoxer) | geen |

**Kracht Studio: geen enkele lichtcontroller gekoppeld.** Alleen de drie in de Yoga Studio bestaan. **Entree: geen area en geen licht.** Een automation pollt de drie controllers elke 30 s via MQTT omdat de RF-afstandsbediening wijzigingen niet terugmeldt (zie E); de HA-status kan dus tot 30 s achterlopen op wat iemand met de afstandsbediening doet.

### D. Sonos
Drie Sonos-spelers in de studio, alle online (`paused`):

| entity | model | area | volume nu |
|---|---|---|---|
| `media_player.yoga_studio_yoga_studio` | Sonos One | Yoga Studio | 0.12 |
| `media_player.kracht_front_kracht_front` | Era 100 SL | Kracht Front | 0.08 |
| `media_player.kracht_back_kracht_back` | Era 100 SL | Kracht Back | 0.08 |

Zalen met Sonos: Yoga Studio (één speler) en Kracht (twee spelers, front en back). Entree heeft er geen.

**Groepering op dit moment: alle drie in één groep**, met Yoga Studio als coördinator (`group_members` begint bij yoga op alle drie). Dat is relevant voor het ontwerp: `media_play_pause` op een groepslid werkt op de hele groep, dus "pauze in Kracht" pauzeert nu ook de Yoga Studio. Volume is wel per speler. De app kan dit niet negeren; er moet een groepsbeleid komen (stap 0).

### E. Scripts, scènes, automations, helpers
- `scripts.yaml`: leeg (0 bytes). Er bestaat **geen enkel script**, dus ook geen savasana- of inloop-script.
- `scenes.yaml`: leeg.
- Helpers (`input_number`, `input_boolean`, `input_select`, timers): geen.
- `automation.yoga_licht_status_pollen` (aan): elke 30 s een `mqtt.publish` naar `zigbee2mqtt/<naam>/get` voor plafond, plint en kast, zodat HA de status kent na gebruik van de RF-afstandsbediening. Raakt geen Sonos.
- Beschikbare services: `script.turn_on`, `media_player.volume_set`, `media_player.media_play_pause` bestaan alle drie (plus `join`/`unjoin` op media_player, die buiten de whitelist blijven).

**Testpagina `/config/www/licht-test-yoga.html`** (23 KB, 2026-09-23; niet gewijzigd). Stuurt `light.turn_on`/`turn_off` rechtstreeks aan met `brightness_pct`, `color_temp_kelvin` en `transition`; de long-lived token staat niet in het bestand maar in de localStorage van de browser die hem gebruikt. Constanten: WARM = 2700 K, COOL = 5000 K, overgang 1,5 s, `pct 0` betekent `turn_off`. De zes scènes, de basis voor de HA-scripts:

| scène | plafond | plint | kast |
|---|---|---|---|
| Inloop | 45 %, 2700 K | 70 %, 2700 K | 100 %, 5000 K |
| Les | 75 %, 2700 K | 30 %, 2700 K | uit |
| Savasana | uit | 12 %, 2700 K | uit |
| Uitloop | 60 %, 2700 K | 70 %, 2700 K | 100 %, 5000 K |
| Schoonmaak | 100 %, 5000 K | 100 %, 5000 K | 100 %, 5000 K |
| Uit | uit | uit | uit |

De pagina draagt zelf `// COPY: confirm met Marlon` bij de scènetabel; de waarden zijn dus nog niet bevestigd.

### F. Gebruiker `tmc-kiosk` en rechten
- **`tmc-kiosk` bestaat niet.** Niet-systeemgebruikers: "Ilja Goossens" en "Claude", beide in `system-admin`. Er is geen enkele niet-admin gebruiker; `local_only` staat overal uit.
- HA-versie 2026.9.3. Een niet-admin in de groep Users (`system-users`) heeft beleid `entities: all` met control-rechten. `script.turn_on`, `media_player.volume_set` en `media_player.media_play_pause` zijn entity-services met een permissiecheck per entity, dus een Users-lid mag ze via `POST /api/services/<domain>/<service>` aanroepen. Alleen `system-read-only` blokkeert dat. Admin-only zijn `/api/config/*`, `/api/template`, `POST /api/states` en kernservices zoals `homeassistant.restart`.
- De long-lived token maakt de gebruiker op de eigen profielpagina; dat vereist één keer inloggen als `tmc-kiosk`. Vlag "Can only log in from the local network" moet uit blijven, anders weigert HA de token via Nabu Casa.
- HA kent geen per-entity-beleid voor gewone gebruikers: `tmc-kiosk` kan technisch elke entity bedienen. De whitelist in onze route is de enige inperking.

## Deel 2: repo

### G. `HA_BASE_URL` en `HA_TOKEN`
Nergens gedefinieerd. Er is geen `.env.example` en geen env-typing (geen `ProcessEnv`-declaratie, geen zod-schema); env-vars worden per module direct uit `process.env` gelezen met een "niet geconfigureerd, dan null"-patroon (zie J). De namen komen niet voor in de 44 Vercel-variabelen en niet in `.env.local` (alleen op naam gecontroleerd). Lokaal bestaat wel `~/.config/tmc-ha/env` met `HA_URL`, `HA_TOKEN`, `HA_SSH_HOST`, `HA_SSH_USER` en `HA_SSH_PORT` voor discovery vanaf de Mac; dat is een admin-token voor het lokale adres, niet de token die de app straks gebruikt.

### H. Hoe de app staff bepaalt
Rollen: `profiles.role` is één string (`member`, `trainer`, `admin`); geen role-arrays. "Staff" is admin, of een actieve `trainers`-rij. Die regel staat op drie plekken die elkaar spiegelen:

- Database: `tmc.is_staff()` (live definitie geverifieerd via `pg_get_functiondef`): `is_admin() or exists (select 1 from tmc.trainers where profile_id = auth.uid() and is_active)`.
- TS-gate: `requireTrainerOrAdmin()` in `src/lib/admin/require-trainer-or-admin.ts`. Cookie-client, `auth.getUser()`, `profiles.role`, en voor niet-admins de trainers-rij via de service-role-client. Geeft `{ ok, userId, actorType: "admin" | "trainer" }` terug, precies wat `emitEvent` nodig heeft.
- Layout-guards: `src/app/kiosk/layout.tsx` en `src/app/app/trainer/layout.tsx` doen dezelfde check inline (alleen `profiles.role`, zonder de trainers-rij-eis).

Middleware: `src/proxy.ts` ververst alleen de sessie-cookies en gate't `/app/*` op "ingelogd"; rollen zitten nooit in de proxy. Voor route handlers bestaat het patroon `requireAdminGate()` in `src/app/api/akiles/oauth/_lib.ts`: zelfde check, maar met echte HTTP-statussen (401/403) in plaats van een message.

**Patroon voor de nieuwe route:** `requireTrainerOrAdmin()` hergebruiken (geen vierde kopie van de rolcheck), verpakt in een route-variant die 401/403 teruggeeft zoals `requireAdminGate()`. `actorType` uit het resultaat gaat één op één door naar het event.

### I. Ontgrendelde PIN-sessie op de kiosk
Er is een concept, maar niet het concept uit de opdracht:

- `/checkin` (geen login) heeft een gedeelde team-PIN: 6 cijfers, bcrypt-hash in `tmc.booking_settings.admin_checkin_pin_hash`, verify via `verify_admin_checkin_pin` (SECURITY DEFINER), brute-force-throttle per IP (`register_checkin_pin_attempt`). Na een goede PIN zet `unlockAdminMode()` in `src/lib/check-in/admin-lock.ts` een httpOnly-cookie `tmc_admin_unlock` met waarde `"1"` en een TTL van vijf minuten. `requireStaff()` in `src/lib/check-in/actions.ts` accepteert ingelogde staff óf die cookie; in het cookie-pad is `userId` null en het event-actortype `tablet`.
- `/kiosk` (PR #187) werkt anders: de tablet is daar gewoon ingelogd als trainer of admin (layout-guard), er is geen PIN en geen kiosk-account.
- Een **trainer-eigen PIN** bestaat niet. Er is één gedeelde PIN, en de memory-notitie van 2026-09-10 markeert "PIN zichtbaar op trainer-profiel" expliciet als later. Er staat geen open PR voor (enige open PR is #209, account-deletion).

Conclusie: "kiosk-account met ontgrendelde trainer-PIN" is afhankelijk van werk dat nog niet bestaat. Bovendien is het huidige cookie-pad **niet herbruikbaar voor bediening**: de cookiewaarde is een onversleutelde `"1"` zonder handtekening. Wie in de browser zelf `tmc_admin_unlock=1` zet, passeert `isAdminUnlocked()`. Vandaag beperkt dat zich tot check-in-acties; gekoppeld aan licht en muziek wordt het een open afstandsbediening voor iedereen op de studiowifi. Zie risico's.

Aanbeveling: v1 uitsluitend op een ingelogde staff-sessie, precies zoals `/kiosk` nu al werkt. Het PIN-pad komt pas in beeld als (a) de cookie een ondertekende waarde met vervaltijd krijgt en (b) de trainer-PIN bestaat.

### J. Patroon voor externe diensten server-side
Referentie is `src/lib/akiles.ts` met `src/lib/outbound-timeouts.ts`, en `src/lib/mollie.ts` voor de configuratie-discipline:

- **Configuratie:** ontbreken de env-vars, dan geeft de client-factory `null` en doet de feature niets (stil). Een verkeerde configuratie is luid (één `console.error`, nooit de waarde). Live-koppelingen zijn beperkt tot `VERCEL_ENV === "production"` omdat previews hetzelfde Supabase-project delen; voor HA geldt dat argument ook (een preview mag geen lampen in de studio schakelen).
- **Timeout:** elke uitgaande fetch krijgt `AbortSignal.timeout(<DIENST>_TIMEOUT_MS)` uit `outbound-timeouts.ts` (Akiles 4 s, Mollie 8 s, ntfy 5 s). Een timeout of netwerkfout wordt een gewone dienstfout (`AkilesApiError` met status 504) die op dezelfde plek gevangen wordt als elke andere fout van die dienst. Nooit een throw naar een caller die dat niet verwacht.
- **Retries:** alleen bij 429 en 503, met `Retry-After` of 2 s, maximaal drie pogingen, en alleen voor idempotente calls. Voor bediening: `script.turn_on` en `volume_set` zijn idempotent, `media_play_pause` is een toggle en mag **nooit** herhaald worden.
- **Fouten:** eigen error-klasse met status en pad, foutbody afgekapt op 200 tekens, tokens nooit in logs. Ernstige storingen gaan naar ntfy (`sendNotification` in `src/lib/ntfy.ts`).
- **Gate in route handlers:** cookie-client plus `profiles.role`, statussen 401/403/409 (zie H).

### K. Events
`emitEvent()` in `src/lib/events/emit.ts`: append-only insert in `tmc.events` via de service-role-client, throwt nooit, geeft `boolean` terug. `EventType`, `ActorType` en `SubjectType` zijn TS-unions; de database controleert alleen `actor_type` (live geverifieerd: enige CHECK op `tmc.events` is `events_actor_type_check` met `member, admin, trainer, system, tablet, visitor`). Nieuwe event-namen en een nieuw subject-type vragen dus alleen een TS-uitbreiding, geen migratie.

Voorstel, in lijn met het bestaande `<domein>.<werkwoord_voltooid>`-patroon:

- `room.scene_activated`, payload `{ room, scene, script_entity_id, ha_status }`
- `room.sonos_adjusted`, payload `{ room, action: "volume_set" | "play_pause", volume?, media_entity_id, ha_status }`
- `room.control_failed`, payload `{ room, action, ha_status, reason }` voor timeouts en niet-2xx (zelfde gedachte als `webhook.failed`)

`actorType` is `admin` of `trainer` uit de gate, `actorId` het profiel; `subjectType` nieuw `"room"` met `subjectId` null (zalen hebben geen uuid) of weggelaten. Geen PII in de payload.

### Extra bevinding: de app kent geen zalen
Er is geen `room`-, `zaal`- of `location`-kolom in `class_sessions`, `class_types` of `schedule_templates`, en het woord komt in `src/` niet voor. Wel heeft elke sessie een `pillar` (`vrij_trainen`, `yoga_mobility`, `kettlebell`, `kids`, `senior`; acht actieve lestypen live). De standaardzaal van "de geselecteerde les" kan dus alleen uit de pillar afgeleid worden:

| pillar | zaal (voorstel) |
|---|---|
| `yoga_mobility` | Yoga Studio |
| `kettlebell`, `vrij_trainen` | Kracht |
| `kids`, `senior` | onbekend, aan Marlon vragen |

Voorstel: een vaste map `ROOM_BY_PILLAR` in code, geen schema-wijziging. Sessieselectie bestaat al: `/kiosk` linkt naar `/app/trainer/sessies/[id]?from=kiosk`; van daaruit is de pillar bekend.

## Stap 0: uitvoering (2026-09-27)

Uitgevoerd via VPN naar 192.168.1.200, met `~/.config/tmc-ha/env` als bron voor `HA_URL`/`HA_TOKEN`/SSH-gegevens (waarden nooit getoond of gelogd). Twee expliciete akkoorden gevraagd en gekregen vóór hoorbare/zichtbare acties (stap 2 en stap 5); geen gebruikers, tokens, Cloud, de poll-automation, de testpagina, integraties of add-ons aangeraakt; geen entities, devices of areas verwijderd (met één uitzondering, zie afwijking 2 hieronder, die zelf gecreëerd was tijdens deze sessie en na akkoord is opgeruimd).

### Stap 1: backup
`ha backups new --name "pre-kiosk-stap0"` afgerond zonder fouten. **Slug: `14281b7e`**, volledige backup, 3,39 MB, `homeassistant: 2026.9.3`.

### Stap 2: Sonos-groepen
`group_members` vóór wijziging, voor alle drie de entities identiek:
```
["media_player.yoga_studio_yoga_studio", "media_player.kracht_front_kracht_front", "media_player.kracht_back_kracht_back"]
```
Eén groep van drie, Yoga Studio eerst (coördinator). Geen losse entities gevonden voor een gepaarde speaker-helft: elke zone heeft precies één `media_player`-entity, stereoparen verschijnen dus als één speler, zoals verwacht.

Klopte niet met het doel. Na akkoord ("studio leeg"): `media_player.unjoin` op `media_player.yoga_studio_yoga_studio`, daarna `media_player.join` met `media_player.kracht_front_kracht_front` als target en `media_player.kracht_back_kracht_back` als `group_members`. Geen muziek gestart of gepauzeerd (alle drie bleven `paused`).

`group_members` na wijziging:
```
media_player.yoga_studio_yoga_studio:   ["media_player.yoga_studio_yoga_studio"]
media_player.kracht_front_kracht_front: ["media_player.kracht_front_kracht_front", "media_player.kracht_back_kracht_back"]
media_player.kracht_back_kracht_back:   ["media_player.kracht_front_kracht_front", "media_player.kracht_back_kracht_back"]
```
Yoga Studio los, Kracht Front en Kracht Back gegroepeerd met Front als coördinator (eerste in de lijst op beide entities). Doel bereikt.

### Stap 3: areas
Area `kracht_studio` ("Kracht Studio") bestond al (leeg). Via de websocket-API (`config/entity_registry/update`, met `HA_TOKEN`) is `area_id` gezet op:
- `media_player.kracht_front_kracht_front` → `kracht_studio`
- `media_player.kracht_back_kracht_back` → `kracht_studio`
- `light.yoga_studio_plafond` → `yoga_studio`
- `light.yoga_studio_plint` → `yoga_studio`
- `light.yoga_studio_kast` → `yoga_studio`

Alle vijf bevestigd op schijf. De oude areas `kracht_front` en `kracht_back` bestaan nog (niet verwijderd), nu zonder entities erover, puur als restant.

### Stap 4: scripts Yoga Studio
`configuration.yaml` bevestigd: `script: !include scripts.yaml` (regel 10). `scripts.yaml` was 0 bytes vóór schrijven.

**Kleurtemperatuur per licht, afwijking van de aanname in de opdracht:** alle drie de lichten, **inclusief de plint (Tuya Zigbee RGB+CCT)**, rapporteren `supported_color_modes: ["color_temp", "xy"]` met bereik 2000–6535 K. De aanname dat de Tuya-plint geen `color_temp` zou ondersteunen klopt niet met de live data (RGB+CCT betekent juist dat kleurtemperatuur wél ondersteund wordt); kleurtemperatuur is daarom bij alle drie de lichten in alle scripts opgenomen, niet weggelaten.

**Afwijking 1, gemeld vóórdat verder gegaan is:** de eerste versie van `scripts.yaml` bevatte per ongeluk een extra top-level `script:`-sleutel (naast de al bestaande `script: !include scripts.yaml` in `configuration.yaml`), waardoor alle zes scripts dubbel genest en ongeldig werden. Vervolgens bleek `ha core check` in deze Supervisor-versie geen stille dry-run te zijn: het commando herstart Home Assistant Core daadwerkelijk (bevestigd in `ha core logs`: service-stop, "Home Assistant Core finish process exit code 0", herstart). Dat gebeurde dus al vóór `script.reload`, als bijwerking van het commando dat stap 4 zelf voorschreef, niet van een bewuste herstart-actie. Gecontroleerd na deze herstart: Sonos-groepering nog intact (zie stap 2), de drie lichten stonden op `off`, HA Core draaide weer normaal op 2026.9.3. De ongeldige scripts zijn zelf nooit uitgevoerd (Home Assistant weigerde ze bij het parsen, vóór enige actie op licht), dus er is geen licht of geluid geraakt door deze fout zelf. Wel ontstond een overbodige entity `script.script` in het entity-register.

Hierop gestopt en akkoord gevraagd. Op basis daarvan aangepast: `scripts.yaml` gecorrigeerd (de extra `script:`-regel verwijderd, inhoud gede-indenteerd naar zes top-level script-ids), en gevalideerd via `POST /api/config/core/check_config` (REST, geen herstart) in plaats van `ha core check`. Resultaat: `{"result":"valid","errors":null,"warnings":null}`. Daarna `script.reload` aangeroepen (geen `homeassistant.restart`).

Zes scripts geladen, elk `state: off`:
- `script.yoga_inloop` (Inloop)
- `script.yoga_les` (Les)
- `script.yoga_savasana` (Savasana)
- `script.yoga_uitloop` (Uitloop)
- `script.yoga_schoonmaak` (Schoonmaak)
- `script.yoga_uit` (Uit)

Elk script: `mode: restart`, `transition: 1.5`, parallelle `light.turn_on`/`light.turn_off`-acties per zone, `# COPY: confirm met Marlon` bij elke waarde, Nederlandse `alias`.

**Afwijking 2, opgelost na akkoord:** de overbodige entity `script.script` uit afwijking 1 is via de websocket-API (`config/entity_registry/remove`) verwijderd, expliciet na akkoord en uitsluitend deze ene entity; er is niets anders verwijderd.

### Stap 5: testen
Akkoord gevraagd en gekregen ("studio leeg"). Scripts één voor één aangeroepen in de volgorde Inloop, Les, Savasana, Uitloop, Schoonmaak, Uit, telkens 3 s wachten en per licht `state`, `brightness` en `color_temp_kelvin` uitgelezen.

| scène | plafond | plint | kast |
|---|---|---|---|
| Inloop | aan, 45% (115/255), 2702K | aan, 70% (178/255), 2702K | aan, 100%, 5000K |
| Les | aan, 75% (191/255), 2702K | aan, 30% (76/255), 2702K | uit |
| Savasana | uit | aan, 12% (31/255), 2702K | uit |
| Uitloop | aan, 60% (153/255), 2702K | aan, 70% (178/255), 2702K | aan, 100%, 5000K |
| Schoonmaak | aan, 100%, 5000K | aan, 100%, 5000K | aan, 100%, 5000K |
| Uit | uit | uit | uit |

Alle zes komen overeen met de scènetabel binnen normale afronding. Enige afwijking: de gevraagde 2700 K komt terug als 2702 K (kelvin↔mired-afronding van de Zigbee-devices, geen configuratiefout); 5000 K komt exact terug. Percentages kloppen exact na afronding van `brightness_pct` naar 0–255. Afgesloten met `script.yoga_uit`, alle drie de lichten `off`.

## Whitelist per zaal (definitief na de HA-run)

Alleen zalen met echt licht of een Sonos. Entree valt af: geen area, geen licht, geen Sonos.

**Yoga Studio** (area `yoga_studio`; licht: plafond, plint, kast; Sonos: één speler, los van elke groep)

| actie | entity | status |
|---|---|---|
| Inloop | `script.yoga_inloop` | **bestaat, getest** |
| Les | `script.yoga_les` | **bestaat, getest** |
| Savasana | `script.yoga_savasana` | **bestaat, getest** |
| Uitloop | `script.yoga_uitloop` | **bestaat, getest** |
| Schoonmaak | `script.yoga_schoonmaak` | **bestaat, getest** |
| Uit | `script.yoga_uit` | **bestaat, getest** |
| volume, afspelen/pauze | `media_player.yoga_studio_yoga_studio` | bestaat |

Alle zes scripts geschreven volgens de tabel uit E, gevalideerd, geladen en op 2026-09-27 getest tegen de studio-lampen (resultaten in "Stap 0: uitvoering", stap 5). Klaar voor gebruik in PR 2/3.

**Kracht Studio** (area `kracht_studio`; licht: nog niets gekoppeld; Sonos: twee spelers, samen één groep)

| actie | entity | status |
|---|---|---|
| lichtscènes | `script.kracht_*` | pas als de controllers hangen; tab toont tot die tijd alleen Sonos |
| volume | `media_player.kracht_front_kracht_front` en `media_player.kracht_back_kracht_back` (zelfde niveau op beide) | bestaan |
| afspelen/pauze | `media_player.kracht_front_kracht_front`, **bevestigd coördinator van het Kracht-paar** na de groepscorrectie in stap 0 | bestaat |

Volume server-side geclampt (voorstel 0,00 tot 0,60, stappen 0,05). `join`, `unjoin`, `select_source` en `play_media` blijven buiten de whitelist; muziekkeuze en groepering doet de docent in de Sonos-app.

## Risico's

**Security**
1. Het `tmc_admin_unlock`-cookie is vervalsbaar (waarde `"1"`, ongetekend). Niet gebruiken voor bediening tot het een HMAC-getekende waarde met vervaltijd is; v1 alleen op ingelogde staff.
2. `HA_TOKEN` geeft `tmc-kiosk` control op álle entities, inclusief de thuisrestanten; de whitelist in de route is de enige grens. Daarom: geen entity-ids uit de request-body doorsturen, alleen een enum-waarde die server-side naar een vast id vertaalt; volume server-side clampen.
3. Nabu Casa maakt HA vanaf internet bereikbaar. De token is de sleutel; opslaan als sensitive env op Vercel, alleen productie, roteren als iemand het team verlaat. Geen `NEXT_PUBLIC_`-variant.
4. De testpagina bewaart een admin-token in de localStorage van elke browser waarin hij is gebruikt. Zodra de scripts bestaan: die token intrekken en de pagina verwijderen of achter de `tmc-kiosk`-token zetten (handmatig, buiten deze discovery).
5. Route handler heeft geen CSRF-bescherming van zichzelf; server actions wel (same-origin). Kies een server action, of controleer `Origin` en accepteer alleen JSON-POST.
6. Rate limit: één staff-sessie kan de route hameren. Een simpele per-gebruiker-throttle (bijvoorbeeld 1 actie per 300 ms) voorkomt Sonos-flooding.
7. Preview-deployments delen het Supabase-project. Zonder `VERCEL_ENV`-guard schakelt een preview echte lampen.

**Afhankelijkheid van internet en van HA**
1. Nabu Casa staat nog uit; tot dat geregeld is bestaat er geen pad van Vercel naar HA. Alternatief is een eigen tunnel (Cloudflare Tunnel of een reverse proxy op de UniFi), maar Nabu Casa is het minste onderhoud.
2. Twee hops: studio naar Vercel naar Nabu Casa naar HA. Valt de studio-internet uit, dan werkt de kiosk toch al niet (Supabase). Valt Nabu Casa uit, dan faalt alleen de bediening; de Sonos-app, de RF-afstandsbediening en de fysieke schakelaars blijven de terugvaloptie. Dat moet de UI ook zeggen.
3. Timeout 4 s per call (zelfde als Akiles), geen retry op `media_play_pause`, hooguit één retry op `script.turn_on` bij 503.
4. Sonos-groepering: zolang alle drie de spelers in één groep staan, raakt pauze in de ene zaal ook de andere. De app kan dat niet oplossen zonder `join`/`unjoin` in de whitelist; het groepsbeleid is een afspraak met de docenten (stap 0).
5. Lichtstatus loopt tot 30 s achter na gebruik van de RF-afstandsbediening (poll-automation). Geen probleem zolang v1 geen status toont.
6. Bediening start altijd handmatig (afspraak); geen cron, geen automation aan lesstart.
7. `ha core check` (Supervisor CLI) is in deze installatie geen dry-run: het herstart Home Assistant Core echt en rapporteert alleen of Core weer opstart, niet of elk individueel item (zoals een script) geldig is. Een script met een fout wordt stil uitgeschakeld terwijl de check toch "ok" meldt. Voor toekomstige wijzigingen aan `scripts.yaml`/`scenes.yaml`/`automations.yaml` vanaf een pijplijn: gebruik `POST /api/config/core/check_config` (REST, geen herstart) plus het juiste `<domein>.reload`, nooit `ha core check`.

## Voorstel PR-indeling

**Stap 0, handmatig in HA en Sonos (geen PR):**
1. ~~Nabu Casa-abonnement afsluiten, inloggen in HA, Remote UI aanzetten.~~ **Nog open.** Zonder dit kan PR 2 niet getest worden vanaf Vercel; dit is nu het enige echte blokkerende punt.
2. ~~Gebruiker `tmc-kiosk` aanmaken...~~ **Nog open.** Niet-admin (groep Users), `local_only` uit, long-lived token, als sensitive env `HA_TOKEN` op Vercel (productie); `HA_BASE_URL` wordt het https-adres van Remote UI, niet het lokale poort-80-adres.
3. ~~De zes Yoga-scripts aanmaken~~ **Gedaan (2026-09-27).** Zie "Stap 0: uitvoering". Lampen hangen ook onder area `yoga_studio`.
4. Scènewaarden en scènenamen bevestigen met Marlon. **Nog open** (elke waarde draagt `# COPY: confirm met Marlon`, ook in `scripts.yaml` zelf).
5. ~~Sonos-groepsbeleid afspreken en instellen~~ **Gedaan (2026-09-27).** Yoga Studio los, Kracht Front (coördinator) en Kracht Back gegroepeerd. Let op: dit is de HA-groepstoestand, niet een permanente instelling; een docent die in de Sonos-app handmatig hergroepeert, wijzigt hem weer. Als dat vaak gebeurt is een periodieke correctie (cron of check bij scriptaanroep) een vervolgpunt.
6. Beslissen of kids en senior in Yoga Studio of Kracht plaatsvinden (voor `ROOM_BY_PILLAR`). **Nog open.**
7. Later, als de Kracht-controllers hangen: `script.kracht_*` toevoegen en de whitelist uitbreiden (kleine vervolg-PR).
8. De admin-token van de testpagina (`/config/www/licht-test-yoga.html`, localStorage van elke browser die hem gebruikt heeft) intrekken zodra `tmc-kiosk` in productie draait (risico security 4).

**PR 1, spec en fundament (klein):** `spec-kiosk-room-control.md` met whitelist, de stap-0-checklist en ledger; `HA_TIMEOUT_MS` in `outbound-timeouts.ts`; `src/lib/home-assistant.ts` volgens het Akiles-patroon (configured-or-null, alleen productie, timeout, eigen error-klasse); nieuwe event-types en `SubjectType "room"` in `emit.ts`. Analytics: geen (achter login, `tmc.events`).

**PR 2, server-actie of route:** `src/lib/room-control/` met `ROOM_BY_PILLAR`, de whitelist als const-object (Yoga: zes scripts plus één media_player; Kracht: twee media_players, geen scripts), en één server action (of `POST /api/room-control`) die `requireTrainerOrAdmin()` doorloopt, de actie valideert tegen de whitelist, HA aanroept en het event schrijft. Unit-tests op de whitelist-validatie, het clampen van volume en de Kracht-paarlogica, zonder HA. Analytics: geen.

**PR 3, UI:** `/kiosk/bediening` met tabs Yoga Studio en Kracht, standaardtab uit de pillar van de meegegeven sessie, zes scèneknoppen voor Yoga, volume-stappen en play/pause per zaal, Kracht zonder lichtblok tot de controllers er zijn; ingang vanaf `KioskFrame` en vanaf `/app/trainer/sessies/[id]`; hetzelfde scherm op `/app/trainer/bediening` voor de telefoon (TrainerNav-ingang). Foutmelding bij HA-storing verwijst naar Sonos-app en afstandsbediening. Alle Nederlandse tekst met `// COPY: confirm met Marlon`. Analytics: geen.

**PR 4, later en optioneel:** statusweergave (huidig volume, speelt/pauze, actieve scène) via één GET naar HA-states; het PIN-pad zodra de cookie getekend is en de trainer-PIN bestaat; Kracht-lichtscripts.
