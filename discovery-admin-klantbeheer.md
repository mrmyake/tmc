# Discovery: admin-ledenbeheer, voorkant

Read-only discovery. Doel: bepalen of een centraal klantdetailscherm met
alle lifecycle-acties voortbouwt op bestaande infrastructuur, of dat een
ledenlijst-plus-selectie eerst gebouwd moet worden. Kernbevinding vooraf:
die infrastructuur bestaat AL, volledig. Zie "Aanbevolen opzet" onderaan.

---

## A. Leden vinden en selecteren

### 1. Admin-ledenlijst

BESTAAT — `src/app/app/admin/leden/page.tsx`, route `/app/admin/leden`.

- Data komt uit `src/lib/admin/members-query.ts` (`listMembers()`), exact
  het bestand dat de eerdere spec noemde. Bevestigd aanwezig:
  `MemberStatus`, `MemberSort`, `PAGE_SIZE = 50`, `INACTIVE_WINDOW_DAYS = 30`
  met een `inactive`-filter (actieve leden zonder sessie in de laatste 30
  dagen).
- Query joint `profiles` (role = member) met `memberships` en de laatste
  `bookings`-datum; retourneert per lid: naam, e-mail, plan_type/variant,
  membership-status (met prioriteitsvolgorde bij meerdere memberships),
  credits, laatste sessie, MRR.
- UI eromheen bestaat volledig: `MembersToolbar` (zoekveld `q`, status-,
  plan- en inactive-filter, sort), `MembersTable` (checkbox-selectie per
  rij), `Pagination`, `SortableHeader`, `MembershipStatusBadge`.
- Elke rij in `MembersTable` is klikbaar door naar de detailpagina
  (`AvatarBubble` + naam linken naar `/app/admin/leden/{profileId}`).
- Checkbox-selectie (`BulkActions.tsx`) voedt op dit moment alleen
  `pushSelectionToMailerLite()` (marketing-groep aanmaken) — geen
  lifecycle-bulk-acties.

### 2. Admin klant/lid-detailpagina

BESTAAT, volledig — `src/app/app/admin/leden/[id]/page.tsx`, route
`/app/admin/leden/[id]`.

- Data komt uit `src/lib/admin/member-detail-query.ts`
  (`loadMemberDetail(profileId)`): profiel, alle memberships (niet alleen
  primary), upcoming/past bookings, payments, notes, audit-log (laatste 50
  `admin_audit_log`-rijen voor dit profiel), en berekende stats (sessies,
  favoriete pilaar, laatste sessie, MRR, actieve no-show-strikes).
- Layout: `MemberHeader` (naam, contact, plan-badge, status-badge,
  blessure-waarschuwing, `ActionMenu`) + `MemberTabs` met zeven tabs:
  `overzicht`, `boekingen`, `facturen` (payments), `schema`
  (trainingsprogramma), `historie` (oefening-progressie, niet de
  audit-log), `health` (intake), `notities` (member-notes + audit-log
  samen).
- **Al uitbreidbaar met actieknoppen**: `ActionMenu.tsx` bestaat al als
  losse client-component in `MemberHeader`, met een toolbar-patroon
  (`role="toolbar"`) en per-actie een `<Dialog>`. Momenteel vier knoppen:
  Pauze toekennen, Credits aanpassen, Abonnement wijzigen (disabled stub),
  Account verwijderen. Zie punt 5 voor wat ontbreekt.

Conclusie: dit hoeft NIET nieuw gebouwd te worden. Het bestaat, inclusief
het patroon om er actieknoppen aan toe te voegen.

### 3. Hoe wordt een lid geïdentificeerd/geselecteerd

Twee sleutels, bewust gescheiden:

- **`profileId`** (dynamic route-segment `[id]` onder `/app/admin/leden/`)
  is de identiteit van het LID. Alle bestaande admin-flows verwijzen naar
  een lid via deze URL: `PauseRow` (pauze-queue) linkt naar
  `/app/admin/leden/{profileId}`, `ActionMenu` krijgt `profileId` als prop,
  server actions (`grantPause`, `addCredits`, `deleteMember`, ...) nemen
  `profileId` als input en valideren dat de meegegeven `membershipId`
  daadwerkelijk bij dat profiel hoort (`membership.profile_id !==
  input.profileId` → reject).
- **`membershipId`** is de sleutel voor het ABONNEMENT waarop een
  lifecycle-actie werkt. Een lid kan meerdere memberships hebben (bijv. een
  actief abonnement plus een losse PT-credit-rij); `member-detail-query.ts`
  laadt ze allemaal en kiest een `primaryMembership` via een
  statusprioriteit (`active` > `paused` > `payment_failed` >
  `cancellation_requested` > `pending` > `cancelled` > `expired`).
  `ActionMenu` opereert vooralsnog uitsluitend op die `primaryMembership`.

Voor een centraal klantdetailscherm is het mechanisme dus: navigeer op
`profileId` (al zo), en kies binnen die pagina expliciet welke
`membershipId` een actie raakt zodra een lid meer dan één membership heeft
— dat is vandaag nog niet zichtbaar gemaakt in `ActionMenu` (die pakt
altijd de primary), maar `OverviewTab` toont wel alle memberships in een
lijstje.

---

## B. Bestaande admin-actie-UI

### 4. Pauzeflow (`/app/admin/pauzes`)

BESTAAT, en is bewust een QUEUE, geen per-lid-actie-scherm.

- `src/app/app/admin/pauzes/page.tsx` laadt twee lijsten uit
  `membership_pauses`: `status = 'pending'` (te beoordelen) en
  `status in ('approved','rejected')` (recent afgehandeld, laatste 20).
- `PauseRow.tsx` (client) toont per pending-aanvraag: lid, plan, periode,
  reden, bijlage (medisch attest), met Goedkeuren/Afwijzen-knoppen die
  `approveMembershipPause` / `rejectMembershipPause`
  (`src/lib/admin/pauses-actions.ts`) aanroepen.
- Elke rij linkt door naar `/app/admin/leden/{profileId}` voor wie meer
  context wil, maar de actie zelf (goedkeuren/afwijzen) gebeurt in de
  queue, niet op de detailpagina.
- Dit is functioneel duidelijk anders dan `ActionMenu`'s "Pauze toekennen"
  (dat is een DIRECT-toekennen-pad zonder pending-aanvraag, zie
  `grantPause` in `member-actions.ts` — de RPC `admin_pause_membership`
  ondersteunt beide paden via het optionele `p_pause_request_id`).

Aanbeveling voor het klantdetailscherm: de queue (wachtrij van
lid-ingediende aanvragen, met bijlage-review) hoort een eigen plek te
houden — dat is een werklijst-patroon (triage over meerdere leden), geen
per-lid-actie. Alleen wanneer een admin AL op een lid-detailpagina staat en
zelf een pauze wil toekennen (het `grantPause`-pad) hoort dat in het
klantdetailscherm — en dat bestaat al (`ActionMenu` → "Pauze toekennen").

### 5. Opzeggen, wisselen, undo, e-mailcorrectie: bestaat er al UI?

| Actie | Core-laag (Mollie-orkestratie) | Server action (TS) | UI-knop/scherm |
|---|---|---|---|
| Pauzeren (direct toekennen) | `pauseMembershipCore` in `membership-lifecycle.ts` | `grantPause` in `member-actions.ts` | JA — `ActionMenu` → "Pauze toekennen" |
| Credits aanpassen | — (directe RPC `adjust_membership_credits`) | `addCredits` in `member-actions.ts` | JA — `ActionMenu` → "Credits aanpassen" |
| Account verwijderen | — | `deleteMember` in `member-actions.ts` | JA — `ActionMenu` → "Account verwijderen" |
| **Hervatten (resume)** | `resumeMembershipCore` | `resumeMembership` in `member-actions.ts` | **NEE** — action bestaat, geen enkele `.tsx` importeert hem |
| **Opzeggen/admin-stop (cancel)** | `cancelMembershipCore` | `cancelMembership` in `member-actions.ts` | **NEE** — idem, geen UI-caller |
| **Undo van een geplande opzegging** | — (rechtstreeks RPC `admin_undo_cancellation`) | `undoMembershipCancellation` in `membership-lifecycle.ts` (zelf al de dunne laag, geen aparte member-actions-wrapper) | **NEE** — geen UI-caller |
| **Wisselen (plan change)** | `requestMembershipChangeCore`, `cancelMembershipChangeCore` | in `membership-lifecycle.ts` | **NEE** — `ActionMenu` heeft er een knop voor ("Abonnement wijzigen"), maar die is bewust `disabled` met tooltip "Plan-switch flow komt in een latere release"; de knop roept niets aan |
| **E-mailcorrectie** | — | `correctCustomerEmail` in `src/lib/admin/customer-actions.ts` | **NEE** — geen UI-caller |

Alle vijf ontbrekende stukken zijn dus puur een voorkant-gat: de
RPC + TS-actionlaag is af en (voor cancel/resume) zelfs al voorzien van een
`MemberActionResult`-vorm die identiek is aan wat `ActionMenu` al
consumeert voor pauze/credits/verwijderen. Voor undo en e-mailcorrectie
moet er nog een dunne `member-actions.ts`-wrapper met
`admin_audit_log`-insert + `revalidateDetail()` bijkomen (naar het patroon
van `grantPause`/`cancelMembership`) — de RPC-aanroep zelf staat al klaar
in respectievelijk `membership-lifecycle.ts` en `customer-actions.ts`.

### 6. Bestaand actie-met-bevestiging-patroon

BESTAAT, en wordt al drie keer hergebruikt binnen `ActionMenu.tsx`:

- `src/components/ui/Dialog.tsx` — gedeelde `<Dialog>` (native
  `<dialog>`-element, escape/backdrop-close, `tone="neutral"|"danger"`,
  `size="narrow"|"wide"`) + `<DialogFooter>` (annuleren/bevestigen-knoppen,
  inline succes/fout-melding via `result`, `confirmTone="danger"` voor
  destructieve acties).
- Voorbeeld destructief-met-typed-confirmatie:
  `DeleteMemberDialog` in `ActionMenu.tsx` — moet de voornaam van het lid
  intypen voor de knop actief wordt.
- Voorbeeld gewoon formulier-in-dialoog: `GrantPauseDialog`,
  `AddCreditsDialog` — form-state in de dialoog, `useTransition` voor de
  pending-state, `router.refresh()` bij succes.
- Los daarvan bestaat ook het queue-patroon zonder dialoog:
  `PauseRow.tsx` gebruikt inline goedkeuren/afwijzen-knoppen met een
  uitklap-tekstveld voor de afwijsreden — geen `<Dialog>`, want het is een
  rij in een lijst, geen detailscherm-actie.

Voor consistentie: nieuwe lifecycle-knoppen (stop, hervatten, undo,
e-mailcorrectie) horen als extra `Dialog`-varianten in `ActionMenu.tsx`,
exact hetzelfde patroon als de bestaande drie.

---

## C. Status en context tonen

### 7. Leesbare membership-velden voor de admin

BEVESTIGD leesbaar en al (deels) geladen in `member-detail-query.ts`:

- `status`, `commit_end_date`, `start_date`, `end_date`
- Pauze: `pause_planned_at`, `pause_effective_date`, `resume_blocked_reason`
  (kolommen bestaan in `tmc.memberships`, maar `member-detail-query.ts`
  selecteert ze momenteel NIET mee — alleen `commit_end_date`/`end_date`/
  `cancellation_*` staan in de select. Voor het klantdetailscherm moeten
  deze drie kolommen aan de select worden toegevoegd.)
- Opzegging: `cancellation_requested_at`, `cancellation_effective_date` —
  WEL al geladen. `cancellation_source`, `cancellation_prior_status` (de
  undo-provenance-kolommen) — bestaan in de tabel, NIET in de huidige
  select; ook die moeten toegevoegd worden om undo-zichtbaarheid te
  bepalen.
- Mollie: er is GEEN `mollie_subscription_status`-kolom op `memberships`.
  Alleen `mollie_customer_id` en `mollie_subscription_id` zijn lokaal
  opgeslagen; de daadwerkelijke Mollie-status (`active`, `nextPaymentDate`,
  mandaatgeldigheid) wordt live opgevraagd via
  `getMollieSubscriptionInfo()` / `hasValidMollieMandate()` in de
  core-laag, niet uit de DB gelezen. Een klantdetailscherm dat de
  Mollie-status wil TONEN (niet alleen gebruiken tijdens een actie) moet
  dus zelf zo'n live-call doen of zich beperken tot de lokale velden.

RLS: bevestigd via `pg_policies` — `memberships_admin_all` en
`profiles_admin_all` geven `tmc.is_admin()` volledige (`ALL`) toegang tot
beide tabellen. `tmc.is_admin()` is `security definer`, leest
`tmc.current_user_role() = 'admin'`. De bestaande query-laag gebruikt
sowieso `createAdminClient()` (service-role, RLS-bypass), dus dit is vooral
relevant als een toekomstig scherm ooit via de cookie-client zou lezen.

### 8. Zichtbaarheidsregels uit de live RPC-guards

Gelezen uit `supabase/migrations/20260725000000_lifecycle_pause_primitives.sql`,
`20260726000000_admin_cancel_membership.sql`,
`20260727000000_change_requests_and_email_correction.sql`,
`20260728000000_lifecycle_undo_cancellation.sql`:

- **Pauzeren toestaan** (`admin_pause_membership`) alleen als:
  `status = 'active'` EN `billing_cycle_weeks > 0` (credit-rijen als
  rittenkaart/PT hebben geen incasso) EN er nog geen
  `pause_effective_date` gepland staat. Anders `not_pausable` /
  `not_pausable_plan` / `already_planned` / `already_paused`.
- **Hervatten toestaan** (`admin_resume_membership`) alleen als
  `pause_effective_date is not null` EN `status in ('active','paused')`.
  Anders `not_paused`. (Mandaat-check en Mollie-subscription-aanmaak
  gebeuren in de TS-laag vóór de RPC; `mandate_invalid` /
  `no_mollie_customer` zijn TS-laag-uitkomsten, geen RPC-reasons.)
- **Stopzetten toestaan** (`admin_cancel_membership`) alleen als
  `status in ('active','paused','cancellation_requested','payment_failed')`
  EN `billing_cycle_weeks > 0` EN een niet-lege `reason`. Op een reeds
  geplande opzegging (`cancellation_requested`) mag admin de datum alleen
  VERVROEGEN, nooit verlaten — en dat vervroegen zet de rij op
  `cancellation_source = 'admin'`, wat undo daarna blokkeert.
- **Undo toestaan** (`admin_undo_cancellation`) alleen als
  `status = 'cancellation_requested'` EN
  `cancellation_source = 'member'` EN `cancellation_prior_status =
  'active'` EN `cancellation_effective_date > current_date` (nog niet
  geëffectueerd). Elke admin-geïnitieerde stop, of een opzegging vanuit
  een andere staat dan `active`, of een legacy rij zonder provenance
  (NULL), is `not_safely_undoable`. Een reeds voorbije effective_date geeft
  `effectuation_due`.
- **Wisselen toestaan** (`request_membership_change`) alleen als
  `status = 'active'` EN `billing_cycle_weeks > 0` EN geen actieve pauze
  (`pause_effective_date is null`) EN `lock_in_active = false` (Early
  Member-prijsslot) EN het doelplan STRIKT duurder is dan het huidige
  (`not_an_upgrade` anders) EN er nog geen ander pending wijzigingsverzoek
  loopt voor dit membership (`pending_exists`, tenzij het exact hetzelfde
  verzoek is → idempotent `already_pending`).
- **E-mailcorrectie toestaan** (`admin_correct_customer_email`) alleen als
  het doel-adres syntactisch geldig is, het account geen SSO-user is
  (`sso_user`), en het nieuwe adres niet al bij een ANDER account hoort
  (`email_exists`). Geen membership-statuscondities — dit is een
  profiel/auth-actie, niet membership-lifecycle.

Praktisch voor het scherm: elke actieknop kan (en moet) client-side al
disablen op basis van `primaryStatus` + de aanwezige membership-velden
(zodra punt 7's ontbrekende kolommen zijn toegevoegd aan de select), zodat
de gebruiker nooit een knop ziet die de RPC toch met een `reason` zou
weigeren. `ActionMenu` doet dit al voor pauze/credits (`disabled={!
hasActiveMembership}`) — hetzelfde patroon moet uitgebreid worden met de
fijnere condities hierboven (bijv. undo alleen tonen bij
`cancellation_source === 'member' && cancellation_prior_status ===
'active' && cancellation_effective_date > today`).

---

## D. Rol en toegang

### 9. Afscherming van `/app/admin/**`

BESTAAT — `src/app/app/admin/layout.tsx`. Server-side guard: haalt de
ingelogde user op, valt terug op `redirect("/login")` zonder sessie, laadt
`profiles.role` en redirect't (naar de member-landing) als
`role !== "admin"`. `AdminShell` (met `AdminSidebar` + `AdminHeader`) wordt
alleen gerenderd voor bevestigde admins.

Een nieuw klantdetailscherm hoeft geen eigen guard te bouwen zolang het
onder `/app/admin/**` blijft — `/app/admin/leden/[id]` (de bestaande
detailpagina) valt al onder deze layout-guard, en elke uitbreiding daarvan
(nieuwe tabs, nieuwe dialogen in `ActionMenu`) erft die bescherming
automatisch. Er is geen aparte RPC/DB-check per actie nodig bovenop wat er
al is: elke lifecycle-RPC herhaalt zelf `tmc.is_admin()` als DB-gate,
en elke server action begint met `requireAdmin()` in TS — dat blijft zo
voor nieuwe UI-callers.

---

## Aanbevolen opzet

**(1) Selectie-infrastructuur: NIET nodig, bestaat volledig.**
`/app/admin/leden` (lijst, met zoek/filter/sort/paginatie) en
`/app/admin/leden/[id]` (detailpagina met header, status-badges, tabs, en
een uitbreidbare `ActionMenu`) zijn al gebouwd en in productie-vorm
aanwezig. Een "centraal klantdetailscherm" is dus geen nieuw scherm — het
IS `/app/admin/leden/[id]`, en de vraag is puur: welke van de vijf
ontbrekende acties (hervatten, opzeggen/admin-stop, undo, wisselen,
e-mailcorrectie) krijgen een `Dialog` in `ActionMenu.tsx`, in dezelfde
vorm als de drie die er al staan.

**(2) Wat hoort in het detailscherm versus een eigen plek:**
- IN `ActionMenu` (per-lid, admin-geïnitieerd, direct effect op één
  membership): hervatten, opzeggen/admin-stop, undo, wisselen (zodra
  gebouwd), e-mailcorrectie, en de bestaande pauze/credits/verwijderen.
  Elk als een `Dialog`-variant met dezelfde confirm/result-flow.
- EIGEN PLEK, blijft zoals het is: de pauze-AANVRAAG-queue
  (`/app/admin/pauzes`) — dat is triage over meerdere leden tegelijk
  (bijlage bekijken, goedkeuren/afwijzen), geen per-lid-actie. Eventuele
  toekomstige queues met hetzelfde karakter (bijv. een
  wijzigingsverzoeken-queue voor `membership_change_requests` als die ooit
  ook een lid-ingediend pad krijgt) horen om dezelfde reden apart te
  blijven — vandaag bestaat zo'n queue-UI voor change-requests nog niet
  (alleen de cron-verwerking).

**(3) Grove scherm-indeling op basis van wat leesbaar is:**
De bestaande structuur dekt dit al goed en hoeft niet heringedeeld te
worden:
- Header (`MemberHeader`): identiteit + huidige status + acties — dit is
  waar de nieuwe knoppen bijkomen.
- Tab "Overzicht" (`OverviewTab`): stats, contactgegevens, en een lijst van
  ALLE memberships van dit lid (niet alleen primary) — bruikbaar als
  membership-kiezer wanneer een actie een specifieke (niet-primary)
  membership moet raken.
- Tabs "Boekingen", "Facturen", "Schema", "Historie", "Health": blijven
  ongewijzigd, geen lifecycle-raakvlak.
- Tab "Notities": bevat al de audit-log-weergave (`admin_audit_log`) — elke
  nieuwe actie die als `admin_audit_log`-insert wordt gelogd (zoals de
  bestaande drie doen) verschijnt daar automatisch.

Twee kleine gaten om mee te nemen bij het bouwen (niet blokkerend voor de
aanpak, wel voor de zichtbaarheidsregels uit punt 8): `pause_effective_date`
/ `pause_planned_at` / `resume_blocked_reason` en `cancellation_source` /
`cancellation_prior_status` moeten aan de select in
`member-detail-query.ts` worden toegevoegd voordat de nieuwe knoppen hun
zichtbaarheidscondities correct kunnen bepalen.
