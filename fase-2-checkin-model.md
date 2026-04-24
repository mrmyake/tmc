# Fase 2 — Check-in model (DRAFT)

**Status:** DRAFT — te herijken na implementatie van fase 1 + discovery-rapport.
**Gate 1:** lees eerst de "Re-evaluation gate" hieronder. Pas starten als Ilja expliciet akkoord geeft dat fase 2 nog klopt.
**Gate 2:** Claude Code voert eerst **Stap 0 — Discovery** uit en rapporteert. Pas bouwen na Ilja's go.

---

## Re-evaluation gate

Na fase 1 is Vrij Trainen losgeknipt van rooster. Voor we hieraan beginnen, beantwoord:

1. **Voelt het probleem opgelost?** Als leden nu zonder haperen Vrij Trainen boeken en het aantal support-vragen gaat omlaag, is de urgentie voor fase 2 misschien lager dan nu ingeschat.
2. **Is de frequency cap in de praktijk een pijnpunt?** Leden klikken nu "boeken" op de app, ook als ze later niet komen. Als dat nauwelijks voorkomt, is attendance-based tellen minder waardevol.
3. **Wil Marlon een studio-tablet?** Fase 2 staat of valt bij een fysieke tablet bij de deur als primair check-in-surface. Als dat logistiek niet lukt (geen tablet, geen wifi, geen vaste plek), is fase 2 niet haalbaar in deze vorm.
4. **Zijn er nieuwe use-cases opgedoken?** Fase 1 geeft zicht op wat leden nu wél makkelijk kunnen. Misschien blijkt een heel ander probleem belangrijker.

Als de antwoorden grotendeels "ja, doorgaan" zijn: start met Stap 0. Als niet: aanpassen of on hold.

---

## Stap 0 — Discovery (verplicht, vóór implementatie)

Claude Code voert deze stap uit en rapporteert terug. **Niets bouwen.** Ilja en Claude (in chat) beoordelen het rapport en passen deze spec aan waar nodig, vóór implementatie start.

### Te beantwoorden uit de codebase

**Data-model:**

1. `profiles` schema volledig: alle kolommen, required/nullable, unique constraints, defaults. Specifiek:
   - Bestaat een `phone` kolom? Zo ja: required? Unique? Welk format (raw string, E.164)?
   - Staat er een link naar `auth.users.id` (zodat we weten of elke profile een auth-user heeft)?
   - Is `email` nullable? (Relevant voor gasten zonder email.)
2. Wat doet `src/lib/supabase/ensure-profile.ts`? Wordt het aangeroepen in de guest-pass flow, de drop-in checkout flow, of alleen bij signup?
3. `guest_passes` schema volledig + hoe een gast nu wordt opgeslagen bij een guest-pass boeking:
   - Wordt er een `profiles`-rij aangemaakt voor de gast, of alleen een entry in `guest_passes` met email?
   - Is er een `auth.users` rij voor gasten, of niet?
   - Bestaat er een `guest_email` of `invitee_email` veld ergens, naast de profiles-tabel?
4. Drop-in checkout flow: webhook-pad bij `/api/checkout/dropin` — welke records worden aangemaakt (profile, auth.user, booking)?

**Logica / helpers:**

5. Waar zit de frequency-cap check? File + functienaam. Is het één reusable helper (bv. `checkFrequencyCap` of `canBookSession`), of inline in een server action?
6. Bestaat er een eligibility-helper (bv. `getEligiblePillars(user)`, `hasActiveMembership(user)`, `getCoveredPillars(membership)`)? Waar, wat is de signature, is-ie reusable?
7. `src/components/nav/MemberNav.tsx`: server-rendered met props, of client-side met hook? Hoe komt eligibility daar nu binnen?

**Componenten:**

8. Bestaat er een herbruikbare weekstrip in `src/app/(app)/app/rooster/_components/`? Noteer: bestandspad, component-naam, props-shape.

**Vooruitblik:**

9. Zijn er ergens al placeholder/comment-hints over een toekomstig check-in of attendance concept? (Grep: `check.in`, `attendance`, `present`, `kiosk`, `tablet`, `checkin`.)
10. Wat is het huidige pad na succesvolle signup: landt nieuwe lid direct in de app, of eerst op een intake/welkom-pagina? (Relevant voor hoe we een gast-naar-lid-conversie modelleren.)

### Rapportage-template

Claude Code levert een markdown-rapport op (`fase-2-discovery-report.md`) met per vraag:
- Wat hij vond (inclusief relevante code-snippets of schema-definities, bestandspaden, regelnummers)
- Of het matcht met de aanname in deze spec, of ervan afwijkt
- Als afwijking: wat dat voor fase 2 betekent

Aan het eind: een "Aanpassingen aan fase 2 MD" sectie met concrete voorstellen.

**Stop dan.** Niet bouwen. Wacht op go.

---

## Waarom (huidige hypothese)

Boeken en aanwezig zijn zijn nu hetzelfde ding. Dat is een probleem voor:

- **Vrij Trainen**: lid boekt "dag X", komt misschien niet. Telt nu mee voor de 2×/week cap.
- **Walk-ins**: Marlon kan iemand niet op plek laten trainen zonder die persoon eerst een account te laten maken en te laten boeken.
- **Gasten / proeflessen / last-minute**: nu drie losse flows (`guest_passes` tabel, `/checkout/dropin`, `ten_ride_card`). Kan één surface worden.

Oplossing: **reservering** en **attendance** los van elkaar modelleren. Check-in is first-class, universeel inzetbaar, per-pillar toggleable. Fysiek in de studio op een tablet, met twee modi: zelf (lid tikt nummer) en admin (Marlon checkt iemand anders in of voegt gast toe).

---

## Universele regels

(zelfde als fase 1)

- **Server components default**, client components alleen voor interactiviteit.
- **Auth** via bestaande middleware + `(app)` route group. Check-in-route `/checkin` is een uitzondering — zie onder.
- **RLS** moet alle queries dekken. Geen service-role in de client. Server actions voor mutations.
- **Geen hardcoded hex, spacing of font-stacks.** Alles via skill tokens / Tailwind config.
- **Bestaande componenten hergebruiken.** Eerst `components/` en `ui_kits/member/` checken.
- **Copy:** NL user-facing, geen em-dashes, geen emoji's. `// COPY: confirm with Marlon` bij twijfel.
- **A11y:** keyboard nav, focus rings, aria-labels, semantic HTML. Extra aandacht: tablet-UI moet werken voor slechtzienden.
- **Loading + error + empty states** altijd expliciet.
- **Motion:** skill standaard.
- **TypeScript strict**, props interfaces geëxporteerd.

## Werkvolgorde per scherm

1. Lees skill, lees relevante sectie uit `tmc-member-system.md`, haal Stitch-scherm op via MCP.
2. Rapporteer reconciliatie-tabel (Stitch-element → skill-component → Supabase-data). Wacht op go.
3. Implementeer. Gefaseerd in PR's — zie deliverables.
4. `npm run typecheck` + `npm run lint` + `npm run build` moeten groen.

---

## Conceptueel model

### Reservering vs. attendance

| Concept | Wat het is | Waar gemaakt |
|---|---|---|
| **Booking** | Intentie + capaciteit-claim voor een sessie | Lid in app |
| **Check-in** | Registratie van fysieke aanwezigheid | Studio-tablet (self of admin-modus) |
| **Frequency cap** | Hoe vaak mag iemand trainen in periode X | Getoetst op check-ins |

Check-in kan mét of zonder booking:
- **Met booking**: lid heeft geboekt, komt, checkt in.
- **Zonder booking**: walk-in, gast, last-minute, proefles, drop-in.

### Iedereen is een profile

Aanname (**te bevestigen in Stap 0**): gasten, drop-ins, proefles-deelnemers krijgen allemaal een `profiles` rij. Verschil met een lid is puur: heeft een profile een row in `memberships` met `status = 'active'`?

- Actief lid → `membership` als access_type
- Profile zonder active membership → `guest_pass` / `drop_in` / `trial` / `comp` als access_type, afhankelijk van context

Als uit Stap 0 blijkt dat gasten nu **geen** profile-rij krijgen: die flow aanpassen in PR 1 (profiles voor gasten toevoegen, data migreren).

### Tablet als primaire surface

Eén fysieke iPad/tablet in de studio, altijd op `themovementclub.nl/checkin`. Kiosk-modus. Twee modi:

- **Zelf-modus (default)** — lid tikt telefoonnummer, bevestigt, klaar. Scherm reset na 2s voor de volgende.
- **Admin-modus** — Marlon (of team-lid) tapt een "TMC"-knop rechtsboven → password prompt → admin-modus. Zoek op naam, voeg nieuwe gast toe, corrigeer check-ins, export dagoverzicht.

Geen in-app check-in. Geen QR. Geen geofence. Ook geen OTP — de tablet staat in de studio, Marlon is fysiek aanwezig, fraud-threat is laag.

### Check-in is universeel, maar configureerbaar

Niet elke sessie-type leent zich. Kids/Senior: Marlon kent de vaste groep. Dus per-pillar toggle.

Nieuwe settings (toevoegen aan bestaande settings-locatie — **te bevestigen in Stap 0**):

```
check_in_enabled                  boolean   default true
check_in_required_for_cap         boolean   default true
check_in_pillar_yoga_mobility     boolean   default true
check_in_pillar_kettlebell        boolean   default true
check_in_pillar_vrij_trainen      boolean   default true
check_in_pillar_kids              boolean   default false
check_in_pillar_senior            boolean   default false
check_in_pillar_pt                boolean   default false
```

Effect:
- `check_in_enabled = false` → systeem valt terug op booking-based cap (huidig model).
- Per pillar off → bookings tellen direct mee voor cap, geen check-in nodig.

---

## Data-model schets

```sql
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),  -- altijd een profile, ook voor gasten (na PR 1)
  session_id uuid references public.class_sessions(id),     -- nullable: vrij trainen zonder booking
  booking_id uuid references public.bookings(id),            -- nullable: walk-in heeft geen booking
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references public.profiles(id),         -- admin/trainer id; bij self-checkin = profile_id
  check_in_method text not null check (check_in_method in (
    'self_tablet',   -- lid tikte eigen nummer op studio-tablet
    'admin_tablet',  -- Marlon/team checkte iemand in via admin-modus
    'admin_web'      -- fallback: admin-UI op eigen laptop (tablet offline)
  )),
  access_type text not null check (access_type in (
    'membership',
    'guest_pass',
    'credit',
    'drop_in',
    'trial',
    'comp'
  )),
  pillar text not null,         -- gedenormaliseerd voor cap-queries zonder join
  notes text,
  created_at timestamptz not null default now()
);

create index on public.check_ins (profile_id, checked_in_at desc);
create index on public.check_ins (session_id);
create index on public.check_ins (pillar, checked_in_at desc);
create unique index on public.check_ins (session_id, profile_id)
  where session_id is not null;  -- voorkom dubbele check-in per lid per sessie
create unique index on public.check_ins (profile_id, (checked_in_at::date), pillar)
  where session_id is null;      -- voor vrij trainen: max 1 check-in per dag per pillar
```

**RLS:**
- Leden zien alleen eigen check-ins
- Admin/trainer zien alles
- Insert alleen via server actions (geen direct client access)
- Update: alleen admin binnen X minuten (undo / correct check-in)

**Migratie bestaande tabellen** (concept, te bevestigen met Stap 0 resultaten):
- `guest_passes` blijft bestaan als quota-teller. Wordt bij check-in met `access_type = 'guest_pass'` definitief verbruikt.
- `ten_ride_card` credits: bij `access_type = 'credit'` wordt één credit afgeschreven via server action (of trigger).
- `bookings` blijft ongewijzigd. Bij check-in wordt booking-record aan check-in gekoppeld via `booking_id`.

---

## Telefoonnummer als identifier

Bij tablet-check-in: telefoonnummer = lookup-key voor profile.

**Vereisten** (te verifiëren/toevoegen in Stap 0 rapport):
- `profiles.phone` moet bestaan, verplicht, en unique
- Server-side normalisatie naar E.164 (`+31612345678`) bij opslag en lookup
- Library: `libphonenumber-js`
- Bij signup-flow: phone-veld verplicht maken en valideren
- Bestaande profiles zonder phone: one-off migratie + Marlon benadert die leden persoonlijk

**Fallback op tablet als phone onbekend:**
- "Nummer niet gevonden?" → zoek op naam (admin-modus opent vanzelf)
- "Ik heb geen nummer" → admin maakt ter plekke een gast-profile aan, met tijdelijke naam als phone-placeholder

---

## Frequency cap migratie

**Huidige logica** (uit `tmc-member-system.md`, server-side bij booking):

> Check frequency cap: tel bookings in dezelfde ISO-week voor diezelfde pijler. Als `>= frequency_cap`: reject "Je weekcap is bereikt".

**Nieuwe logica:**

Bij **booking** (soft check): tel bookings + check-ins samen in ISO-week per pillar. Als `>= cap`: toon waarschuwing "Je hebt deze week al X trainingen staan. Doorgaan?" — géén hard reject.

Bij **check-in** (hard check): tel alleen check-ins in ISO-week per pillar. Als `>= cap` en `access_type = 'membership'`: op de tablet in zelf-modus gewoon tonen "Je weekcap is bereikt — check met Marlon". In admin-modus de keuze geven "registreer als drop-in" met prijs.

Per-pillar toggle: als `check_in_pillar_X = false`, blijft de oude booking-time cap-check gelden voor die pillar.

**Overgangsperiode:**

Optie A — backfill historische bookings als check-ins met `check_in_method = 'admin_web'` en `checked_in_at = booking.session.start_at`. Houdt cap coherent over launch-grens.

Optie B — cap start fresh vanaf launch-datum. Simpeler, maar "ik zou 3× mogen en app zegt 0 deze week" is verwarrend.

**Voorstel:** Optie A. Maakt één week voor launch een backfill-script, loopt historische bookings door, maakt check-ins aan op basis van "booking + 30 min".

---

## No-show beleid

Drie opties:

- **Soft** — geen consequentie, plek wordt X min voor start vrijgegeven voor walk-ins.
- **Strict** — no-show telt mee voor cap.
- **Hybride** — plek vrijgeven voor walk-ins X min voor start, géén straf voor het lid. **Voorstel.**

Implementatie: edge function of cron die X min voor start alle bookings zonder check-in als `no_show` markeert en de plek vrijgeeft. Config: `no_show_release_minutes` (default 10).

---

## UX — Tablet (`/checkin`)

Publieke route, geen middleware-auth. Optimized voor iPad-landscape primair, werkt ook op portrait en telefoon (fallback voor offline tablet).

### Zelf-modus (default scherm)

Groot centraal numeriek toetsenbord. Boven: korte welkom-tekst. Boven de knoppen: ingevoerd nummer in groot font.

Flow:
1. Lid tikt nummer
2. Bij 10 cijfers: automatisch lookup
3. Gevonden → toon groot "Hoi, {firstName} {lastInitial}." met sessie-context als van toepassing:
   - Booking vandaag binnen 30 min → "Check je in voor [sessie] om [tijd]?"
   - Geen booking, vrij trainen beschikbaar → "Check je in voor Vrij Trainen?"
   - Geen booking, geen vrij-trainen-toegang → "Je hebt vandaag niks geboekt. Spreek Marlon even aan."
4. Tap "Check in" → check-in geregistreerd → bevestigingsscherm 2s → reset
5. Niet gevonden → "Nummer niet gevonden. Zoek op naam?" → schakelt naar admin-modus

Privacy: na check-in direct resetten zodat volgende tikker geen naam ziet.

### Admin-modus

Toegang via tap op subtiele "TMC" knop rechtsboven → prompt password of PIN → admin-modus actief.

Lay-out: splitscreen (op tablet landscape):
- **Links: Nu aanwezig** — lijst check-ins vandaag, recentste boven
- **Rechts: Acties**
  - Zoekveld (naam of email) met typeahead over profiles
  - "Nieuwe gast/drop-in" → mini-form: naam + telefoonnummer + access_type
  - Actieve boekingen nog-niet-ingecheckt: lijst met 1-klik check-in knoppen

Correcties: tap op een check-in in de lijst → optie "undo" binnen X minuten.

"Terug naar zelf-check-in" knop prominent — tablet gaat weer in kiosk-modus.

### Fallback: admin op eigen laptop

Als tablet offline of afwezig, kan Marlon hetzelfde doen via `/app/admin/studio` op eigen device. Zelfde UI-patronen, alleen zonder kiosk-modus. Server actions zijn identiek.

---

## UX — Wijzigingen in bestaande member-views

### `/app/rooster` + `/app/boekingen`

Geen check-in knop toevoegen. Wel: op de dag van een sessie een kleine status-hint tonen:
- Vóór start: "Staat op de lijst — check in bij binnenkomst op de tablet."
- Na check-in: "Ingecheckt om {tijd}." (groen/subtiel)
- No-show: "Niet ingecheckt." (neutraal, niet bestraffend)

### `/app/vrij-trainen` (uit fase 1)

Als `check_in_pillar_vrij_trainen = true`: pagina toont geen booking-flow meer. In plaats daarvan:
- Counter: "Deze week: 1 van 2 ingecheckt"
- Tekst: "Vrij Trainen loopt via de tablet in de studio. Kom tussen 06:00 en 22:00 langs."
- Lijst recente check-ins (laatste 5)

Als setting uit: fase 1 UI blijft zoals 'ie is (boeking-based).

### `/app/abonnement`

Counter update: "Deze week: 1 van 2 getraind" (was: "geboekt")
Sectie "Recent" toont laatste 5 check-ins met datum, tijd, sessie.

---

## UX — Admin uitbreidingen

### `/app/admin/rooster` per-sessie detail

Uitbreiding op bestaande view: per deelnemer een status-indicator:
- "Ingecheckt 09:14" (groen)
- "Geboekt, niet ingecheckt" (neutraal) + knop "Check in" (= admin-web check-in)
- "No-show" (nadat `no_show_release_minutes` verstreken)

### `/app/admin/instellingen`

Nieuwe sectie "Check-in" met de settings uit de toggle-lijst hierboven.

---

## Open beslissingen

1. **Vrij Trainen na check-in launch** — afschaffen van bookings voor deze pillar (puur check-in) OF behouden als "aankondiging"? Voorstel: afschaffen.
2. **No-show beleid** — voorstel: hybride.
3. **Migratie bestaande data** — voorstel: Optie A (backfill).
4. **Guest-pass quota check** — bij uitnodiging (bestaande flow) of bij check-in? Voorstel: quota reserveren bij uitnodiging, definitief verbruiken bij check-in. Als gast niet komt → quota terug.
5. **Credit-decrement** voor rittenkaart: bij booking of bij check-in? Voorstel: bij check-in.
6. **Tablet-auth in admin-modus** — PIN of password? Voorstel: 4-6 cijfer PIN, opgeslagen in `admin_settings`, zelfde voor alle admin-team-leden. Logout-timeout 5 min.
7. **Tablet-device registratie** — moet de tablet geregistreerd worden (bv. unieke device-token) om abuse te voorkomen? Voorstel: nee in eerste release. Later evalueren.

---

## Implementatie-volgorde

**PR 1 — Data + gast-profiles (als discovery dat nodig maakt)**
- Migratie: `check_ins` tabel + RLS + indices
- `profiles.phone` unique + required (als 't nog niet zo is)
- Eventueel: gast-profiles flow aanpassen op basis van discovery
- Server actions: `checkInByPhone`, `checkInByProfileId`, `undoCheckIn`, `addGuestProfile`
- Helper: `normalizePhone`, `getCheckInsThisWeek(profileId, pillar)`, `getTodayCheckIns()`
- Settings toevoegen

**PR 2 — Tablet-UI (`/checkin`)**
- Route + layout (kiosk-modus, geen auth-middleware)
- Zelf-modus scherm
- Admin-modus scherm + PIN-lock
- Wijzigingen in `/app/rooster` en `/app/boekingen`: status-indicators
- Wijzigingen in `/app/vrij-trainen`: check-in-gedreven als setting aan

**PR 3 — Cap-migratie + no-show + admin uitbreidingen**
- Cap-logica verhuizen naar check-in-based (per pillar-setting)
- No-show edge function
- `/app/admin/rooster` per-sessie status + check-in knop
- `/app/admin/instellingen` check-in sectie
- Backfill script voor historische bookings → check-ins
- Analytics events

Elke PR mergeable en testbaar op zichzelf. Commit messages:
- `feat(checkin): data model, server actions, gast-profile flow`
- `feat(checkin): studio tablet UI with self and admin modes`
- `feat(checkin): migrate frequency cap to attendance and admin polish`
