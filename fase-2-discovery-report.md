# Fase 2 — Discovery Report

**Status:** compleet, klaar voor beoordeling. Wacht op go voor implementatie.
**Datum:** 2026-04-24
**Scope:** Stap 0 uit `fase-2-checkin-model.md`. Alleen read-only onderzoek; niks aangepast.

---

## Context voor dit rapport

Fase 1 (vrij trainen loskoppelen) is gemerged en werkt. Gate 1-antwoorden van Ilja:

- Frequency-cap betekenis: "2× per week"-plan = max 2× per week. Bevestigd.
- Tablet komt er 100% — Marlon commit.
- Geen leden → **geen legacy-data-migratie-pijn**. Schema-wijzigingen kunnen strak zijn vanaf nul.
- Identifier-keuze: telefoon blijft primary, email is UX-regressie op tablet. Voorstel in dit rapport: phone unique + `member_code` fallback.

Op basis daarvan is de spec grotendeels uitvoerbaar, mits we 4-5 aannames corrigeren die in de volgende sectie gedekt worden.

---

## Antwoorden op de 10 discovery-vragen

### 1. `profiles` schema

**Bestand:** `supabase/migrations/20260421000000_tmc_member_system.sql:32-53`

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,          -- NOT NULL
  phone text,                   -- nullable, geen unique, geen format-check
  date_of_birth date,
  age_category text not null default 'adult',
  emergency_contact_name text,
  emergency_contact_phone text,
  health_intake_completed_at timestamptz,
  health_notes text,
  avatar_url text,
  role text not null default 'member',
  has_used_pt_intake_discount boolean not null default false,
  marketing_opt_in boolean not null default false,
  locale text not null default 'nl',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- index: profiles_email_idx (niet-unique)
```

Plus kolommen uit latere migraties:
- `street_address, postal_code, city, notes` (`20260422100000_add_profile_address.sql`)
- `acquisition_source, acquisition_medium, acquisition_campaign, acquisition_content, signup_path, first_touch_at` (`20260429000000_profiles_acquisition.sql`, gister gebouwd)

**Afwijkingen van spec-aanname:**

| Aanname | Realiteit | Impact fase 2 |
|---|---|---|
| `profiles.phone` unique + required | `phone text` nullable, geen unique-constraint, geen format-check | PR 1 moet: `not null`, `unique`, check-constraint op E.164. Sinds er geen leden zijn: gratis migration. |
| `email` nullable voor gasten | `email text not null` — en op `auth.users` ook unique | Gasten-via-profiles krijgen óf een echte email óf een placeholder. Zie vraag 3. |
| FK naar `auth.users.id` | Ja, expliciet. | Matcht. **Belangrijk:** gast-profiles zonder auth-user **kunnen niet bestaan** in huidig schema — de FK-constraint blokkeert het. Zie vraag 3. |

### 2. `ensure-profile.ts` gebruik

**Bestand:** `src/lib/supabase/ensure-profile.ts`

Doet `admin.from("profiles").upsert(...)` voor een gegeven `auth.User`. Wordt aangeroepen op **één plek**:
- `src/app/app/layout.tsx:28` — bij elke `/app/**` page-load, als safety-net wanneer de `on_auth_user_created` trigger ooit zou missen.

**Niet aangeroepen in:**
- Guest-pass flow (`src/lib/member/guest-pass-actions.ts`) — gasten krijgen geen profile.
- Checkout/Mollie flows (`/api/crowdfunding/checkout`, `/api/mollie/webhook`) — die werken met bestaande members.

**Impact fase 2:** als we gast-profiles invoeren, wordt `ensureProfile` niet bruikbaar omdat het een `auth.User` vereist. We hebben een nieuwe pad nodig: `ensureProfileForGuest({ firstName, lastName, phone, email? })` die direct insert in `profiles` zonder auth.users counterpart — **maar** de FK op `profiles.id → auth.users.id` verbiedt dat. Zie vraag 3 + aanbeveling onderaan.

### 3. `guest_passes` + huidige gast-opslag

**Migratie:** `supabase/migrations/20260427100000_guest_passes.sql`

Twee tabellen:
- `guest_passes` — quota-tracker (1 rij per membership per billing-periode, `passes_allocated`, `passes_used`)
- `guest_bookings` — actuele gast-uitnodigingen (`guest_name`, `guest_email`, `session_id`, `booked_by`, `status`)

```sql
create table public.guest_bookings (
  ...
  guest_name text not null,     -- vrije tekst
  guest_email text not null,    -- vrije tekst
  ...
);
```

**Belangrijkste finding:** gasten krijgen **géén `profiles`-rij en géén `auth.users`-rij**. Ze bestaan alleen als (guest_name, guest_email) tuples op `guest_bookings`. De uitnodigende member wordt via `booked_by` gelinkt; de gast zelf is een vrije-tekst-entry.

**Afwijkingen van spec-aanname "iedereen is een profile":**

| Aanname | Realiteit | Implicatie |
|---|---|---|
| Gast = `profiles`-rij, verschil met lid is alleen `memberships`-status | Gast = `guest_bookings`-rij, geen profile-relatie | Spec-PR 1 "gast-profile flow aanpassen" is niet een migratie maar een **nieuwe concept-laag** die het huidige gast-model vervangt of aanvult. |
| `profiles.email nullable` | `email text not null` | Maakt niet uit als we accepteren dat gasten een email-of-placeholder krijgen. |
| `profiles.id` zonder auth.users counterpart | Huidige FK verbiedt het | Schema-wijziging nodig: FK moet `on delete set null` worden én nullable, OF we maken een separate `pseudo_profiles` tabel. Zie aanbevelingen. |

### 4. Drop-in checkout flow

**Bestaat niet.** Grep naar `/api/checkout`, `/api/dropin`, `drop.in`, `dropin` geeft:
- `drop_in_yoga_cents` / `drop_in_kettlebell_cents` etc. — **prijzen** in `booking_settings`
- `planType ?? "drop-in"` — display-fallback in `AttendanceList.tsx:227` voor participants zonder membership
- `requiresPayment` flag in `can-book.ts` wanneer er geen covering membership is

Geen API-route, geen Mollie-setup, geen flow. **De enige payment-flows die echt bestaan zijn:**
- `/api/crowdfunding/checkout` — crowdfunding tiers
- `/api/mollie/webhook` — subscription webhook
- `startSignup()` server action — member signup met eerste betaling + sequence-start

**Impact fase 2:** spec veronderstelt een drop-in checkout die gemigreerd moet worden. Dat is er niet. In plaats daarvan moeten we voor "niet-lid checkt in" een flow **ontwerpen**:
- Admin voert gast in op tablet → maakt profile-rij → markeert check-in als `access_type = 'drop_in'` + prijs uit settings
- Betaling: cash of eenmalige Mollie-link die admin op de tablet toont? Scope-beslissing.

### 5. Frequency-cap check lokatie

**Bestand:** `src/lib/member/can-book.ts:60`, functie `canBook()`

Reusable, wel-gestructureerd. Telt bookings via:
- `usage.bookingsSamePillarThisWeek` (input parameter, berekend door caller)
- Vergelijkt met `covering.frequency_cap`

De daadwerkelijke query zit in `src/lib/member/booking-actions.ts:252-258`:

```ts
supabase
  .from("bookings")
  .select("id", { count: "exact", head: true })
  .eq("profile_id", user.id)
  .eq("status", "booked")
  .eq("pillar", session.pillar)
  .eq("iso_week", sessionIso.isoWeek)
  .eq("iso_year", sessionIso.isoYear)
```

`iso_week` + `iso_year` zijn gedenormaliseerde kolommen op `bookings` — al geïndexeerd.

**Impact fase 2:** voor attendance-based cap vervangen we de filter `.eq("status", "booked")` door een join of aparte query op `check_ins`. De structuur is goed om aan te passen. Het is één plek, niet inline over 5 bestanden.

### 6. Eligibility-helpers

**Bestand:** `src/lib/member/plan-coverage.ts`, functie `planCovers(plan_type, pillar)`

Simpele pillar-map, hergebruikt in `canBook()` via `memberships.find(m => planCovers(m.plan_type, session.pillar))`.

**Geen generieke `getEligiblePillars(user)` helper.** In fase 1 heb ik `eligibleForVrijTrainen` direct op layout-niveau berekend uit `membership.covered_pillars` (array-kolom op memberships, denormalized). Dat patroon werkt prima maar is nu 1:1 gebonden aan vrij-trainen.

**Impact fase 2:** voor "welke pillars kun jij checken-in-voor" is `membership.covered_pillars` dé bron. Eén generieke helper `getCoveredPillars(profileId): Promise<string[]>` zou clean zijn — kunnen we in PR 1 toevoegen.

### 7. MemberNav eligibility-binding

**Bestand:** `src/components/nav/MemberNav.tsx` + `src/app/app/layout.tsx`

Na fase 1:
- Server: `/app/app/layout.tsx` fetcht membership, derived `eligibleForVrijTrainen`
- Doorgegeven via `AppChrome` (client wrapper) → `MemberNav`
- MemberNav is `"use client"`, ontvangt boolean-prop
- 5e nav-item conditional + mobile-grid schakelt tussen 4/5 cols

**Impact fase 2:** check-in geeft geen nieuwe member-nav-entry (tablet-route is publiek op eigen subdomein/pad). Wel relevant voor status-hints in `/app/rooster` + `/app/boekingen` — die zijn server-rendered, dus data direct uit query. Geen prop-cascade issue.

### 8. Herbruikbare weekstrip

**Twee bestaande, verschillende componenten:**
- `src/app/app/rooster/_components/DayStrip.tsx` — 7-daags dag-navigator, laat open/booked tellers zien, navigeert via URL-params naar geselecteerde dag.
- `src/app/app/vrij-trainen/_components/DayPassStrip.tsx` (uit fase 1) — 7 dag-tiles met state `past|booked|open|capped|paused`, elke tile is één boek/cancel-knop.

**Geen shared abstractie.** Ze hebben overlapping visuals maar verschillende interactie-modellen. Fase 2 hoeft hier niks mee — admin tablet-UI is geen weekstrip, member-views krijgen check-in-status inline bij bestaande lijsten.

### 9. Check-in / attendance placeholders in codebase

**Bestaande concepten (niet "check-in" maar wel attendance):**
- `bookings.status in ('booked', 'attended', 'no_show', 'cancelled')` — **booking heeft vier statussen, al model**
- `bookings.attended_at timestamptz` — al aanwezig
- `src/app/app/_shared/attendance/AttendanceList.tsx` — admin/trainer UI om attendance per sessie te markeren (handmatig, post-sessie)
- `src/app/app/_shared/attendance/AvatarBubble.tsx`, `PlanBadge.tsx`, `InjuryFlag.tsx` — visuele primitives voor de lijst
- `src/lib/admin/attendance-actions.ts` — server actions `markAttendance`, `autoMarkNoShows`, etc.
- `no_show_strikes` tabel — automatisch strikes bij no-shows, met cron `expire-strikes`

**Zero "kiosk" / "tablet" / "check-in" / "present" strings.** Check-in als concept bestaat niet.

**Impact fase 2:** dit is een ARCHITECTURAL beslissing:
- **Optie A** — `check_ins` tabel naast `bookings.status`. Twee waarheden. Legacy wordt `bookings.status='attended'` onzichtbaar, check-ins is source of truth.
- **Optie B** — vervangen: `bookings.status` wordt vanaf launch alleen nog `booked | cancelled`; `attended | no_show` verhuist naar `check_ins`. `AttendanceList` wordt gerefactored tot een check-in-viewer met correction-knop. Eén waarheid.
- **Optie C** — niet nieuwe tabel. `bookings.status='attended'` blijft, nieuwe kolom `attended_via text check in ('self_tablet', 'admin_tablet', 'admin_web')` op bookings, plus een aparte `walkin_checkins` tabel voor gevallen zonder booking.

Mijn aanbeveling hieronder.

### 10. Signup-landing

**Pad:** `/auth/callback` (of `/auth/callback/implicit`) → rol-redirect. Member-default is `/app/rooster`.

**Intake:** niet verplicht. De pagina `/app/profiel/intake` bestaat (health-intake vragenlijst), getriggerd via `IntakeBanner` op rooster wanneer `health_intake_completed_at is null`. Gebruiker kan het overslaan.

Payment-flow: bij eerste signup stuurt `startSignup()` de user naar Mollie, die redirect terug naar `/app/abonnement/bedankt?membership=...`. Daar staat `Confetti` + terug-naar-dashboard knop.

**Impact fase 2:** geen verplichte tussen-stap om "gast → lid" te modelleren. Een gast die lid wordt doorloopt gewoon de normale signup (geen "upgrade gast-profiel" pad nodig).

---

## Samenvattende aannames-check

| Spec-aanname | Check | Betekenis |
|---|---|---|
| `(app)` route-groups | Flat in onze code | Zoals altijd: ik vertaal naar `src/app/app/...` |
| `profiles.phone` klaar om te upgraden naar unique+required | Ja, sinds geen leden | Low-risk migration |
| Gasten hebben profile-rij | **Nee**, vrije-tekst in `guest_bookings` | **Spec PR 1 groter dan gesuggereerd**: schema-wijziging `profiles.id` FK + migratie pad |
| Drop-in checkout bestaat | **Nee**, alleen prijzen in settings | Nieuwe flow ontwerpen nodig, of scope reducen |
| `check_ins` naast `bookings.status` | Schema-conflict | Architecturale keuze tussen A/B/C (zie hieronder) |
| Middleware dekt `(app)` auth | Ja, via `src/proxy.ts` — matcher `/app/**` + `/login` | `/checkin` valt buiten matcher → zonder extra code publiek. Werkt. |
| `libphonenumber-js` als norm-layer | Niet geïnstalleerd, ~40 KB | Server-side OK; client-side input kan met regex voor NL-format |

---

## Aanpassingen aan fase 2 MD

Voorstel per open beslissing:

### A. Gast-profile flow

**Huidig:** `guest_bookings` met vrije-tekst (name, email). Geen profile.
**Spec:** alle gasten krijgen profile-rij.

**Voorstel — gesoepeerde versie:**
Houd `guest_bookings` (voor member-invited guests via guest-pass quota) ongewijzigd. Wél: wanneer een gast binnenkomt via de **check-in tablet in admin-modus** ("Nieuwe gast/drop-in"), maak een profile-rij. Dat is een wezenlijk ander scenario (walk-in vs. member-invited). Verschil:

- **member-invited guest** (`guest_bookings`) — heeft geen check-in nodig, loopt via bestaande flow, hergebruikt de member's allocatie
- **walk-in / drop-in via tablet** (nieuw: `profiles` + `check_ins`) — admin voert in, betaling apart

Dit maakt PR 1 scope-baar: we migreren `guest_bookings` **niet** naar profiles, we bouwen alleen het nieuwe walk-in-pad bovenop. Later kan `guest_bookings` consolideren richting profiles, maar niet in deze release.

**Schema-wijziging die wél nodig is:** maak `profiles.id → auth.users.id` FK **nullable** zodat profiles zonder auth-user kunnen bestaan. Beveilig met RLS: anonieme profiles zijn alleen leesbaar voor admin.

### B. Identifier

**Primary:** `profiles.phone text not null unique` — toegevoegd met format-check (regex op NL-mobiel `^\+31[0-9]{9}$`). E.164 genormaliseerd server-side.

**Fallback:** `profiles.member_code text unique` — 6-cijferig random, auto-generated in `handle_new_auth_user` trigger. Zichtbaar op `/app/profiel`. Voor edge-cases: gezinnen met gedeeld nummer, gasten zonder mobiel.

**Tablet-input:**
- 10 cijfers → phone lookup
- 6 cijfers → member_code lookup
- Ander → error "Ongeldig nummer"

Signup-flow vraagt verplicht phone + first/last name. Email is al verplicht (auth).

### C. `check_ins` tabel — architectuur-keuze

**Aanbeveling: Optie B (consolideren).**

Maak `check_ins` de enige waarheid over aanwezigheid. Wijzig `bookings.status` enum naar `booked | cancelled` (verwijder `attended`/`no_show`). De bestaande `AttendanceList` wordt refactored tot check-in viewer + admin-correction tool.

Waarom geen A (twee waarheden):
- Cap-logica moet kiezen welke te vertrouwen — bron van bugs
- `no_show_strikes` raakt onnatuurlijk (strikes uit bookings-no_show vs. uit missing-check-in)

Waarom geen C (attended_via kolom):
- `bookings.attended_via` + `walkin_checkins` = nog steeds twee plekken, plus verwarring bij analytics

Consequentie voor no-show strikes: cron `expire-strikes` blijft, maar de strike-trigger komt uit een cron die `booking_id is not null and NOT EXISTS check_in` controleert, X minuten na session end.

### D. Settings-schema

**Voorstel:** geen 7 aparte kolommen `check_in_pillar_*`. Één array-kolom:

```sql
alter table public.booking_settings add column
  check_in_enabled boolean not null default true,
  check_in_pillars text[] not null default
    array['yoga_mobility','kettlebell','vrij_trainen'],
  check_in_required_for_cap boolean not null default true,
  no_show_release_minutes integer not null default 10;
```

Als een pillar niet in `check_in_pillars` staat: booking-based cap (huidig model) blijft voor die pillar.

### E. No-show beleid

Hybride, zoals spec voorstelt. Extra: `no_show_release_minutes` toggle op bovenstaande settings (default 10).

### F. Frequency-cap migratie

Geen leden = geen historische bookings om te backfillen. **Optie A/B uit spec is allebei niet van toepassing.** Cap start schoon vanaf launch. Geen backfill-script nodig.

### G. Vrij trainen na check-in launch

**Voorstel:** booking-flow houden, maar cap-telling verhuizen naar check-ins. Dus:
- Lid boekt een dag (claim van virtuele capaciteit, signaleert intentie)
- Cap-meter telt alleen ingeboekte-én-ingecheckte dagen
- No-show van een vrij-trainen-dag kost geen cap-tik, wel strike na X no-shows

Dat is rijker dan spec's "afschaffen" en kost weinig extra werk. Als Marlon het té complex vindt, zetten we `check_in_pillars` zonder `vrij_trainen` en blijft fase-1-gedrag intact.

### H. Tablet admin-auth

PIN (4-6 cijfers) opgeslagen in `booking_settings.admin_checkin_pin text`, bcrypt-gehashed. Logout na 5 min inactiviteit. Geen account per admin — gedeelde PIN voor het team.

### I. Tablet-device registratie

Skip in v1. Fraud-threat laag (fysieke tablet, Marlon aanwezig). Evalueer later als het openstaat zonder toezicht wordt.

### J. Credit-decrement (ten-ride)

**Voorstel:** bij check-in. Als gast geboekt heeft (rittenkaart pre-auth), maar niet verschijnt → credit niet afgeschreven. Stemt natuurlijk af met "intentie vs. feit" uit spec.

### K. Guest-pass quota

**Voorstel:** reserveren bij uitnodiging, definitief verbruiken bij gast-check-in. Als gast niet komt → quota terug. Vereist: zelfde cron die no-shows detecteert, returnt quota via server action.

---

## Nieuwe PR-volgorde (herzien)

Originele spec-volgorde is correct, maar PR 1 is kleiner dan gesuggereerd omdat we `guest_bookings` niet migreren.

**PR 1 — Data-model + phone/member_code**
- Migratie: `phone` unique + not null check constraint; `member_code` text unique genereren in trigger
- Migratie: `profiles.id` FK nullable zodat gast-profiles kunnen (voor walk-ins via tablet)
- Migratie: `check_ins` tabel + RLS + indices
- Migratie: `booking_settings` uitbreiden (check_in_enabled, check_in_pillars array, check_in_required_for_cap, no_show_release_minutes, admin_checkin_pin)
- Migratie: `bookings.status` enum → `booked | cancelled` (strip attended/no_show); data-migratie N.V.T. (geen leden)
- Helper `normalizePhone` + `generateMemberCode` server-side
- Server actions: `checkInByIdentifier`, `checkInByProfileId`, `undoCheckIn`, `createWalkInProfile`
- Refactor `canBook()` + booking-actions query om check-in-based counts te gebruiken wanneer `check_in_pillars` bevat pillar

**PR 2 — Tablet UI** `/checkin`
- Publieke route (zit buiten `/app/**` proxy-matcher, dus automatisch geen auth)
- Zelf-modus: numeriek keypad + lookup + confirm + reset
- Admin-modus: PIN-lock, splitscreen (today-checkins + search + new-walkin)
- Member-views: inline status-hints in `/app/rooster` + `/app/boekingen` + `/app/vrij-trainen`

**PR 3 — Admin polish + cron + analytics**
- `/app/admin/sessies/[id]` uitbreiding: per-deelnemer status, 1-click check-in knop
- `/app/admin/instellingen`: check-in settings sectie + PIN-setter
- Cron `/api/cron/release-no-shows` — markeert bookings zonder check-in na `no_show_release_minutes` + triggert strike
- Analytics events (trackCheckIn, trackCheckInUndo, trackWalkInCreated, trackAdminModeToggle)

---

## Rode vlaggen / vragen voor Ilja

1. **Gast-profiles** — ik stel voor dat member-invited guests (`guest_bookings`) ongewijzigd blijven en walk-ins via tablet een eigen profile-pad krijgen. Dat is minder ambitieus dan spec ("iedereen profile") maar respecteert bestaande flow. Akkoord of forceer consolidatie?
2. **`bookings.status` afslanken** naar `booked | cancelled` — attendance gaat volledig naar `check_ins`. Akkoord of liever optie A (beide concepten naast elkaar)?
3. **Drop-in betaling op tablet** — cash / Tikkie / Mollie-link? Spec zwijgt hierover. Voor launch: admin noteert "drop-in" op tablet, gast betaalt separately bij Marlon (out-of-band). Akkoord of willen we dit in scope?
4. **PIN voor admin-modus** — gedeelde PIN voor het team, of per admin een eigen PIN via `profiles.admin_checkin_pin`? Voorstel: gedeeld (eenvoud).
5. **Vrij-trainen gedrag post-launch** — booking + check-in gecombineerd (mijn voorstel) of pure check-in (spec)? Raakt UI van `/app/vrij-trainen` uit fase 1.

---

## Schatting

- PR 1: 4-5 uur (migraties zijn kernwerk, data-migratie N.V.T.)
- PR 2: 6-8 uur (kiosk-UI + admin-modus zijn veel states)
- PR 3: 3-4 uur

Totaal: 13-17 uur verdeeld over 3 mergeable PR's.

---

**Stop hier. Wacht op go + beslissingen op de 5 rode-vlag-vragen.**
