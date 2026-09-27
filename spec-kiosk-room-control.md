# Spec: kiosk-zaalbediening licht en Sonos (spec-kiosk-room-control.md)

## Status

**In bouw.** PR 1 (deze PR) legt de spec vast en levert de HA-client en de event-types. Geen API-route, geen server action, geen UI: die komen in PR 2 en PR 3. Achtergrond en het volledige HA-discovery-logboek (inclusief stap 0, de handmatige HA-configuratie van 2026-09-27) staan in `discovery-kiosk-room-control.md`.

---

## Doel

Staff (trainer of admin) bedient vanaf de kiosk-tablet of de eigen telefoon licht en Sonos per zaal, met vaste scènes per zaal in plaats van losse lampbediening. Geen muziekkeuze in de app: die doet de docent in de Sonos-app op de eigen telefoon. Bediening start altijd handmatig; er is geen automatische koppeling aan lesstart of lesagenda.

## Architectuur

De browser praat nooit rechtstreeks met Home Assistant (HA). Een server-side laag (server action of route handler, PR 2) staat ertussen:

1. **Staff-poort.** `requireTrainerOrAdmin()` (`src/lib/admin/require-trainer-or-admin.ts`), dezelfde gate als `/kiosk` en `/app/trainer/**`. v1 staat alleen open voor een ingelogde trainer- of adminsessie. Zie "PIN-pad" hieronder voor waarom er geen los kiosk-PIN-pad is.
2. **Whitelist.** De aanroeper geeft nooit een HA-entity-id door. Hij geeft een zaal plus een vaste actie-enum door (bijvoorbeeld `{ room: "yoga_studio", action: "scene", scene: "les" }`); de whitelist-laag (PR 2, `src/lib/room-control/`) vertaalt dat naar het bijbehorende entity_id en roept pas dan de HA-client aan. Zie "Whitelist per zaal" hieronder voor de volledige, gesloten lijst.
3. **HA-client** (`src/lib/home-assistant.ts`, deze PR). Roept de HA REST API aan via Nabu Casa Remote UI (`HA_BASE_URL`, `HA_TOKEN` van de niet-admin HA-gebruiker `tmc-kiosk`). Valideert zelf niets tegen de whitelist: dat is met opzet de taak van stap 2, zodat de client een dom, herbruikbaar stukje infrastructuur blijft en de whitelist op één plek staat.
4. **Events.** Elke geslaagde of mislukte actie wordt gelogd via `emitEvent()` (`src/lib/events/emit.ts`), append-only in `tmc.events`. Geen migratie nodig: de database checkt alleen `actor_type`, event-namen en subject-type zijn pure TS-uitbreidingen.

```
browser (kiosk of telefoon)
  -> server action / route handler   [staff-poort, whitelist, event]
    -> src/lib/home-assistant.ts     [timeout, retry-beleid, foutafhandeling]
      -> Nabu Casa Remote UI -> Home Assistant -> Zigbee2MQTT / Sonos
```

## Whitelist per zaal

Gesloten lijst, geen vrije entity-ids. Bron: `discovery-kiosk-room-control.md`, "Whitelist per zaal" en "Stap 0: uitvoering" (getest op 2026-09-27 tegen de echte lampen).

### Yoga Studio

| actie | HA-entity | status |
|---|---|---|
| Inloop | `script.yoga_inloop` | bestaat, getest |
| Les | `script.yoga_les` | bestaat, getest |
| Savasana | `script.yoga_savasana` | bestaat, getest |
| Uitloop | `script.yoga_uitloop` | bestaat, getest |
| Schoonmaak | `script.yoga_schoonmaak` | bestaat, getest |
| Uit | `script.yoga_uit` | bestaat, getest |
| Sonos (volume, afspelen/pauze) | `media_player.yoga_studio_yoga_studio` | bestaat |

Eén Sonos-speler, geldt als zijn eigen coördinator.

### Kracht Studio

| actie | HA-entity | status |
|---|---|---|
| lichtscènes | geen: nog geen enkele lichtcontroller gekoppeld | niet in de whitelist tot dat verandert |
| Sonos volume | `media_player.kracht_front_kracht_front` **en** `media_player.kracht_back_kracht_back` | bestaan |
| Sonos afspelen/pauze | `media_player.kracht_front_kracht_front` (coördinator) | bestaat |

Kracht Front en Kracht Back vormen samen één Sonos-groep, Front als coördinator (ingesteld in stap 0, 2026-09-27). Zolang Kracht geen licht heeft, toont de UI (PR 3) voor deze zaal alleen het Sonos-blok, geen scèneknoppen.

### Entree

Geen area, geen licht, geen Sonos (discovery §B/C/D). Niet in de whitelist; komt er pas bij als er apparatuur hangt.

### Wat buiten de whitelist blijft, altijd

`light.turn_on`/`turn_off` los, elke andere `script.*`, `media_player.join`/`unjoin`/`select_source`/`play_media`, en elke andere domein-service. Muziekkeuze en Sonos-groepering blijven bij de docent, in de Sonos-app.

## Sonos-regels

Twee regels, precies zo geïmplementeerd in PR 2 (hier vastgelegd, nog niet gebouwd):

1. **Volume per zaal geldt voor alle spelers van die zaal, op hetzelfde niveau.** Een volumewijziging voor Kracht roept `setVolume` aan op zowel `media_player.kracht_front_kracht_front` als `media_player.kracht_back_kracht_back`, met dezelfde waarde. Voor Yoga Studio is dat triviaal (één speler). Volume wordt server-side geclampt (voorstel: 0,00 tot 0,60, stappen van 0,05); de client (`src/lib/home-assistant.ts`) valideert alleen het basiscontract 0 tot 1, niet dit zaal-specifieke plafond.
2. **Afspelen/pauze gaat alleen naar de coördinator van de zaal, en wordt geweigerd als de Sonos-groep is afgeweken.** Vóór de `media_play_pause`-call leest PR 2 (via `getStates`) de `group_members` van de coördinator-entity. Bevat die lijst een speler die niet tot de eigen zaal-whitelist hoort (bijvoorbeeld omdat een docent in de Sonos-app handmatig heeft hergroepeerd, zie discovery-risico "Afhankelijkheid van internet en van HA" #4), dan wordt de actie geweigerd met een duidelijke melding in plaats van blind de verkeerde zaal te pauzeren of af te spelen. Dezelfde check geldt symmetrisch: ontbreekt een eigen zaalspeler uit `group_members` (bijvoorbeeld Kracht Back apart getrokken), dan wordt ook geweigerd, want dan pauzeert de coördinator niet de hele zaal.

Deze validatie hoort in de whitelist-/orchestratielaag (PR 2), niet in `src/lib/home-assistant.ts`: de client roept exact aan wat hem gevraagd wordt en kent geen zaal-indeling.

## Staff-toegang en het PIN-pad

**v1: uitsluitend ingelogde staff.** Elke aanroep gaat door `requireTrainerOrAdmin()`, hetzelfde patroon als `/kiosk` en `/app/trainer/**`. Geen los kiosk-PIN-pad in v1.

**Waarom niet nu al een PIN-pad.** Er bestaat vandaag één gedeelde check-in-PIN (`tmc.booking_settings.admin_checkin_pin_hash`, `/checkin`), met een ontgrendel-cookie (`tmc_admin_unlock`) dat een ongetekende waarde `"1"` is zonder vervaltijd-handtekening: wie die cookie zelf zet, passeert de check. Voor check-in-acties is dat beperkt risico; gekoppeld aan licht en muziek zou het een open afstandsbediening worden voor iedereen op de studiowifi (discovery-risico security #1). Een PIN-pad voor zaalbediening volgt pas nadat:

1. het cookie een HMAC-getekende waarde met een echte vervaltijd krijgt, en
2. er een trainer-eigen PIN bestaat (vandaag is er maar één gedeelde PIN; zie de memory-notitie van 2026-09-10 en het check-in-spoor in `spec-akiles-access.md`-achtige stijl van "PIN zichtbaar op profiel, achter een expliciete tik").

Tot dat er is, blijft v1 op ingelogde staff staan. Dit is geen tijdelijke workaround die later stiekem losser wordt: het PIN-pad is een bewust latere, apart te beoordelen uitbreiding (PR 4).

## HA-client (`src/lib/home-assistant.ts`)

- **Configuratie:** `getHomeAssistantClient()` geeft `null` zonder `HA_BASE_URL`/`HA_TOKEN`, en buiten productie (`VERCEL_ENV !== "production"`) tenzij `HA_ALLOW_NON_PRODUCTION=1` expliciet gezet is. Zonder die guard zou een preview-deployment (zelfde Supabase-project als productie) de echte studio kunnen bedienen.
- **Functies:** `runScript(entityId)`, `setVolume(entityId, level)` (0 tot 1), `playPause(entityId)`, `getStates(entityIds)`.
- **Timeout:** `HA_TIMEOUT_MS` (`outbound-timeouts.ts`), voorlopig 4 s naar analogie van Akiles; nog niet gemeten tegen live verkeer omdat Nabu Casa Remote UI op het moment van deze PR nog uitstaat (stap 0, punt 1). Herzien zodra dat wel actief is.
- **Retries:** geen op `runScript` en `playPause` (niet idempotent: een tweede `media_play_pause` zou de eerste ongedaan maken). Ten hoogste één retry op `getStates` en `setVolume`, op 429/503, met `Retry-After` of 1 s.
- **Fouten:** `HomeAssistantError` met status, pad (zonder host) en een afgekapte responsbody. Token en base-URL komen nooit in een foutmelding.
- **Geen whitelist-validatie in deze module.** Zie "Architectuur" punt 2/3. Een caller mag nooit een entity_id rechtstreeks uit gebruikersinvoer doorgeven.

## Analytics

Geen. De hele zaalbediening speelt zich af achter login op `/kiosk` en `/app/trainer/**`; dat is productgedrag achter de meetgrens en gaat naar `tmc.events`, niet naar GA4 (spec-analytics.md, de vier poorten).

## Ledenomgeving-impact

Geen. Deze feature is staff-only; er verandert niets aan een ledenscherm, ledenrechten of ledendata.

## PR-indeling

**Stap 0, handmatig in HA en Sonos (geen PR, uitgevoerd 2026-09-27, deels nog open).** Volledig logboek: `discovery-kiosk-room-control.md`, "Stap 0: uitvoering" en "Voorstel PR-indeling". Kort:

- Gedaan: backup, Sonos-groepsbeleid (Yoga los, Kracht Front/Back gegroepeerd met Front als coördinator), areas, de zes Yoga-scripts (geschreven, gevalideerd en getest tegen de echte lampen).
- Nog open, blokkeert PR 2 in productie: Nabu Casa Remote UI aanzetten, de gebruiker `tmc-kiosk` aanmaken en zijn token als sensitive env op Vercel zetten, de scènewaarden laten bevestigen door Marlon, de admin-token van de testpagina intrekken, en de kids/senior-zaalkeuze voor `ROOM_BY_PILLAR`.

**PR 1 (deze PR):** deze spec, `discovery-kiosk-room-control.md` mee naar main, `HA_TIMEOUT_MS` in `outbound-timeouts.ts`, `src/lib/home-assistant.ts`, de nieuwe event-types (`room.scene_activated`, `room.sonos_adjusted`, `room.control_failed`) en subject-type `"room"` in `src/lib/events/emit.ts`. Geen migratie: alleen TS-uitbreiding.

**PR 2:** `src/lib/room-control/` met `ROOM_BY_PILLAR`, de whitelist als const-object (hierboven), de Sonos-regels (volume op alle zaalspelers, coördinator-check vóór play/pause), en één server action of `POST /api/room-control` die `requireTrainerOrAdmin()` doorloopt, valideert tegen de whitelist, de HA-client aanroept en het event schrijft. Unit-tests op de whitelist-validatie, de volume-clamp en de coördinator-/groepscheck, zonder een echte HA-verbinding.

**PR 3:** UI, `/kiosk/bediening` met tabs Yoga Studio en Kracht Studio, standaardtab afgeleid uit de pillar van de meegegeven sessie (`ROOM_BY_PILLAR`), zes scèneknoppen voor Yoga, volume-stappen en play/pause per zaal, Kracht zonder lichtblok tot de controllers er hangen. Ingang vanaf `KioskFrame` (`/kiosk`) en vanaf `/app/trainer/sessies/[id]`; hetzelfde scherm op een telefoon-route voor staff. Foutmelding bij een HA-storing verwijst naar de Sonos-app en de fysieke schakelaars/afstandsbediening als terugval. Alle Nederlandse tekst met `// COPY: confirm met Marlon`.

**PR 4, later:** statusweergave (huidig volume, speelt/pauze, actieve scène) via `getStates`; het PIN-pad zodra de twee voorwaarden hierboven vervuld zijn; Kracht-lichtscripts zodra de controllers hangen.

---

## Ledger

Elke PR die gedrag, schema of data van deze feature wijzigt voegt hier een regel toe: PR-nummer, datum, wat er gewijzigd is in één zin, en wat bewust niet is aangeraakt.

- **PR #210, 2026-09-27: spec, HA-client en event-types (PR 1 van 4).** `spec-kiosk-room-control.md` en `discovery-kiosk-room-control.md` toegevoegd, `src/lib/home-assistant.ts` (configured-or-null, alleen productie tenzij `HA_ALLOW_NON_PRODUCTION=1`, timeout, geen retry op niet-idempotente calls, eigen foutklasse zonder token/URL) en `HA_TIMEOUT_MS` in `outbound-timeouts.ts`, event-types `room.scene_activated`/`room.sonos_adjusted`/`room.control_failed` en subject-type `room` in `src/lib/events/emit.ts`. Bewust niet aangeraakt: geen API-route, geen server action, geen UI, geen migratie (de database checkt alleen `actor_type`), geen whitelist-validatie in de client zelf, en niets aan de HA-configuratie zelf (die staat vast sinds stap 0 op 2026-09-27, zie `discovery-kiosk-room-control.md`).
