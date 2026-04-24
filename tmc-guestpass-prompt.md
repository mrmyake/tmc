# TMC — Implementatie: Guest Passes + Yoga Verhuur

## Context

Je werkt aan The Movement Club (`themovementclub.nl`), een boutique gym in Loosdrecht. Het member systeem draait op:
- **Next.js 15** App Router, routes onder `/app`
- **Supabase** voor auth + database (tabellen: `profiles`, `memberships`, `sessions`, `bookings`, `membership_types`)
- **Tailwind CSS 4** + shadcn/ui + Framer Motion
- **Resend** voor transactionele e-mail
- **Taal**: Nederlands (user-facing), Engels (code/comments)

Lees eerst de bestaande Supabase migrations in `supabase/migrations/` en de membership-gerelateerde components in `app/app/` voordat je begint. Rapporteer de relevante tabelstructuur vóór je gaat coderen.

---

## Wat te bouwen

### 1. Guest Passes

#### Businesslogica

Elk actief lidmaatschap heeft recht op een bepaald aantal gratis guest passes per 4-weken-periode:

| Membership type | Guest passes per periode |
|---|---|
| Yoga/Mobility 2× of 3×/4wk | 1 |
| Yoga/Mobility Onbeperkt | 2 |
| Kettlebell Club | 1 |
| Alle Groepslessen 2× of 3×/4wk | 1 |
| Alle Groepslessen Onbeperkt | 2 |
| All Access | 2 |
| Vrij Trainen (alle varianten) | 0 |

Regels:
- Passes vervallen aan het einde van de 4-weken-periode. Niet opsparen.
- Een gast mag **geen actief lidmaatschap** bij TMC hebben (check via e-mailadres in `profiles`).
- Dezelfde gast mag maximaal **2× per 3 maanden** als gast komen (bij een derde bezoek krijgt het lid een melding dat de gast een lidmaatschap kan overwegen).
- Een gast boekt via het lid: het lid logt in, gaat naar een sessie en voegt een gast toe.
- Bij gebruik van een guest pass ontvangt de gast een bevestigingsmail (via Resend) met de sessidetails en een zachte CTA: "Beviel de les? Word lid van The Movement Club."

#### Database

Maak een nieuwe Supabase migration aan (`supabase/migrations/YYYYMMDDHHMMSS_guest_passes.sql`) met:

```sql
-- guest_passes tabel: bijhouden van passes per lid per periode
create table public.guest_passes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.profiles(id) on delete cascade not null,
  period_start date not null,          -- start van de 4-weken-periode
  period_end date not null,            -- einde van de 4-weken-periode
  passes_allocated integer not null,   -- aantal passes op basis van abbo
  passes_used integer not null default 0,
  created_at timestamptz default now()
);

-- guest_bookings tabel: wie is er als gast geweest
create table public.guest_bookings (
  id uuid primary key default gen_random_uuid(),
  guest_pass_id uuid references public.guest_passes(id) on delete cascade not null,
  session_id uuid references public.sessions(id) on delete cascade not null,
  guest_name text not null,
  guest_email text not null,
  booked_by uuid references public.profiles(id) not null,  -- het lid
  booked_at timestamptz default now(),
  reminder_sent boolean default false
);

-- Index voor snel opzoeken van gasthistorie per e-mailadres
create index on public.guest_bookings (guest_email);
create index on public.guest_bookings (booked_by);

-- RLS: leden zien alleen hun eigen passes en gasten
alter table public.guest_passes enable row level security;
alter table public.guest_bookings enable row level security;

create policy "Member sees own passes"
  on public.guest_passes for select
  using (auth.uid() = member_id);

create policy "Member sees own guest bookings"
  on public.guest_bookings for select
  using (auth.uid() = booked_by);

-- Admin ziet alles (gebruik bestaande admin-role check patroon uit andere tabellen)
```

Voeg ook een helper-functie toe:
```sql
-- Geeft het aantal resterende passes terug voor het huidige lid in de huidige periode
create or replace function public.get_remaining_guest_passes(p_member_id uuid)
returns integer as $$
  -- implementatie: haal de actieve periode op voor dit lid, return passes_allocated - passes_used
$$ language sql security definer;
```

#### API routes

Maak aan:

**`/api/guest-passes/status`** (GET)
- Geeft terug: `{ allocated, used, remaining, periodEnd }`
- Auth required (Supabase session)

**`/api/guest-passes/book`** (POST)
- Body: `{ sessionId, guestName, guestEmail }`
- Validaties:
  1. Heeft het lid nog passes over deze periode?
  2. Is het gast-e-mailadres niet actief in `profiles`?
  3. Heeft deze gast de afgelopen 3 maanden al 2× als gast geboekt?
  4. Is de sessie niet al vol?
- Bij succes: boek de gast in (`guest_bookings`), verhoog `passes_used`, stuur bevestigingsmail naar gast via Resend
- Bij validatiefout: geef duidelijke Nederlandse foutmelding terug

**`/api/cron/reset-guest-passes`** (POST, Vercel Cron)
- Draait elke 4 weken
- Maakt nieuwe `guest_passes` records aan voor alle actieve leden op basis van hun `membership_type`
- Configureer in `vercel.json` als cron job

#### UI — Member dashboard

In `app/app/rooster/` of een nieuw component `GuestPassBooking`:

- Toon bij elke boekbare sessie een "Neem een gast mee" knop (alleen zichtbaar als `remaining > 0`)
- Bij klikken: een modal/sheet met:
  - Naam gast (text input)
  - E-mail gast (email input)
  - Bevestigingsknop
  - Klein informatieblokje: "Je hebt nog X pass(es) deze periode (loopt af op [datum])"
- Na succesvolle boeking: toast "Gast toegevoegd — [naam] ontvangt een bevestiging"
- Als `remaining === 0`: toon in plaats van de knop een zachte melding "Je guest passes voor deze periode zijn op"

In `app/app/abonnement/` of een nieuw tabblad:
- Sectie "Guest Passes" met:
  - Huidig saldo (gebruikt / totaal)
  - Lijst van gasten uitgenodigd deze periode (naam, sessie, datum)
  - Verloopdatum huidige periode

#### E-mail templates (Resend + React Email)

Maak `emails/GuestConfirmation.tsx`:
- Begroeting op naam van de gast
- Sessiedetails (naam, datum, tijd, locatie: Industrieweg 14P Loosdrecht)
- Naam van het lid dat de gast heeft uitgenodigd
- Zachte CTA onderaan: "Wil je vaker komen trainen? Bekijk onze lidmaatschappen op themovementclub.nl"
- Gebruik bestaande email-styling uit het project (zelfde huisstijl als andere Resend-mails)

---

### 2. Yoga Verhuur (mat + handdoek)

#### Businesslogica

Alleen van toepassing op sessies van het type `yoga` of `mobility`. Bij het boeken van zo'n sessie kan een lid optioneel aanvinken:
- Yogamat huren (€2,50)
- Handdoek huren (€1,50)
- Beide (€3,50 — automatisch bundeling)

Betaling gebeurt **niet** via het systeem — dit wordt ter plekke afgerekend of achteraf verrekend. Het systeem registreert alleen de vraag, zodat Marlon van tevoren weet wat er nodig is.

#### Database

Voeg toe aan de bestaande `bookings` tabel via een nieuwe migration:

```sql
alter table public.bookings
  add column if not exists rental_mat boolean default false,
  add column if not exists rental_towel boolean default false;
```

#### API

Pas de bestaande booking-aanmaak route aan om `rental_mat` en `rental_towel` te accepteren in de request body. Alleen toegestaan als de sessie van type `yoga` of `mobility` is — anders worden de velden genegeerd (geen foutmelding).

#### UI — Boekingsflow

In het bestaande boekingscomponent, na de bevestigingsstap en vóór de submit-knop:

- Conditioneel (alleen bij yoga/mobility sessies): toon een sectie "Wil je iets huren?" met twee checkboxes:
  - `[ ] Yogamat (€2,50 — ter plekke betalen)`
  - `[ ] Handdoek (€1,50 — ter plekke betalen)`
- Als beide aangevinkt: toon "Combinatie: €3,50"
- Kleine disclaimer onder de checkboxes: *"Verhuur wordt ter plekke afgerekend."*

#### Admin — Sessiebeheer

In `app/app/admin/rooster/` of de sessiedetailpagina:

- Toon bij elke yoga/mobility sessie een "Verhuuroverzicht" tabje of sectie
- Lijst van boekingen met kolommen: Naam lid | Mat | Handdoek
- Totaaltelling onderaan: "X matten · Y handdoeken verwacht"
- Dit helpt Marlon voor aanvang van de les te weten hoeveel spullen klaar moeten liggen

---

## Wat je NIET doet

- Geen betalingslogica voor verhuur — alleen registratie
- Geen nieuwe dependencies zonder te vragen
- Geen wijzigingen aan bestaande Sanity schemas
- Geen hardcoded kleuren of spacing buiten de bestaande Tailwind tokens
- Geen nieuwe auth-logica — gebruik het bestaande Supabase Auth patroon

## Volgorde van implementatie

1. **Stap 1 — Discovery**: lees migrations, rapporteer tabelstructuur `memberships`, `sessions`, `bookings`, `membership_types`. Wacht op go.
2. **Stap 2 — Database**: schrijf en push de migrations. Laat me de SQL zien vóór je pusht.
3. **Stap 3 — API routes**: implementeer de drie guest pass routes + update de booking route voor verhuur.
4. **Stap 4 — UI**: voeg de UI-componenten toe. Hergebruik bestaande componenten maximaal.
5. **Stap 5 — E-mail**: maak de `GuestConfirmation` email template.
6. **Stap 6 — Cron**: configureer de reset-cron in `vercel.json`.
7. **Stap 7 — Verify**: `pnpm typecheck && pnpm lint`, rapporteer eventuele issues.
