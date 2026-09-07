# Inventaris: ledenomgeving en admin-cockpit

Resultaat van FASE 1 van de read-only evaluatie-opdracht (zie de bijlage onderaan voor de
opdrachttekst van FASE 2). Dit document is een routekaart, geen beoordeling: er staan hier
geen oordelen, alleen wat er is en hoe het aan elkaar hangt.

Datum: 2026-07-25. Branch: `docs/evaluatie-admin-leden`, afgetakt van `main` (`bab4894`).

---

## 0. Scope, methode en een correctie op de opdracht

**Correctie op het opgegeven pad.** De opdracht noemt `src/app/admin/` als admin-oppervlak.
Die directory bestaat niet. De admin-cockpit leeft onder `src/app/app/admin/`, dus binnen het
`/app`-segment en daarmee onder dezelfde buitenste auth-guard als de ledenomgeving. Alle
admin-URL's beginnen met `/app/admin/`. Dat is geen bevinding, alleen een feitelijke
vaststelling die de rest van dit document leesbaar houdt.

**Oppervlakken in deze inventaris:**
- Leden (member): alles onder `src/app/app/` dat niet onder `admin/` of `trainer/` valt.
- Trainer: `src/app/app/trainer/**`. Formeel een derde oppervlak; meegenomen omdat admins er
  standaard op landen en het de PT-keten draagt die het lid in `/app/boekingen` terugziet.
- Admin: `src/app/app/admin/**`.

**Methode.** Statische lezing van alle `page.tsx`- en `layout.tsx`-bestanden onder
`src/app/app/`, plus de server-action- en query-modules in `src/lib/{admin,member,trainer,orders,actions,check-in}/`.
De datalaag is read-only bevraagd via de Supabase MCP (`pg_proc`, `pg_class`,
`pg_get_functiondef`). Voor live functiedefinities is `pg_get_functiondef` de autoriteit, niet
de migratiebestanden in de repo.

**Leesaanwijzing bij de kolommen.**
- *Auth- en rolcheck*: wat de route zelf afdwingt, bovenop de guards die het erft. Alles onder
  `/app/**` erft de sessiecheck uit `src/app/app/layout.tsx`; alles onder `/app/admin/**` erft
  daarnaast de rolcheck uit `src/app/app/admin/layout.tsx`.
- *Gelezen* en *Geschreven*: tabellen en views in schema `tmc`, inclusief wat via de aangeroepen
  action- of query-module gebeurt, niet alleen wat letterlijk in `page.tsx` staat.
- *Nav*: is de route bereikbaar via een navigatie-element (tab, sidebar, menu, bell), of alleen
  via een in-page link, een redirect of een directe URL.

---

## 1. Auth- en rollenmodel (de gedeelde basis)

### 1.1 Layout-guards

| Bestand | Wat het doet |
|---|---|
| `src/app/app/layout.tsx:49-57` | `auth.getUser()`, redirect naar `/login` bij geen sessie; `ensureProfile(user)` self-healt een ontbrekende profielrij. |
| `src/app/app/layout.tsx:59-121` | Leest `profiles` (first_name, role), `memberships` (active/paused), `training_programs` (active), `workout_sessions`. Berekent `eligibleForSchema = everHadProgram && isActiveMember` en `eligibleForPt = isActiveMember` voor de nav-condities. |
| `src/app/app/admin/layout.tsx:23-31` | Leest `profiles.role`; redirect naar `/app` als rol niet exact `admin` is. Rendert `AdminShell`. |
| `src/app/app/trainer/layout.tsx:22-31` | Leest `profiles.role`; redirect naar `/app` als rol niet `trainer` of `admin` is. Let op: deze guard controleert alleen de rol, niet of er een actieve `trainers`-rij bestaat. |
| `src/app/app/AppChrome.tsx` | Client-switcher op `usePathname()`: MemberNav, TrainerNav, of niets (admin heeft eigen shell). |

### 1.2 Action-guards

| Helper | Definitie | Semantiek |
|---|---|---|
| `requireAdmin()` | `src/lib/admin/require-admin.ts:13-31` | Sessie plus `profiles.role === 'admin'`. |
| `requireTrainerOrAdmin()` | `src/lib/admin/require-trainer-or-admin.ts:18-50` | Admin-rol, of een `trainers`-rij met `is_active = true`. TS-spiegel van `tmc.is_staff()`. Geeft `actorType` terug voor de event-log. |
| `authorizeForSession()` | `src/lib/admin/attendance-actions.ts:95-152` | Eigen guard van de aanwezigheidslaag: admin, of de trainer die aan deze specifieke `class_sessions`-rij hangt. Bepaalt tevens `canSeeHealthDetail` via `trainers.has_health_access`. |

Modules zonder een van deze helpers bewaken zichzelf op een andere manier: de member-modules
in `src/lib/member/**` en `src/lib/actions/**` gebruiken de user-scoped Supabase-client en
leunen op RLS plus de `auth.uid()`-checks binnen de aangeroepen SECURITY DEFINER RPC's.

### 1.3 Clientkeuze per module

Vrijwel alle admin- en trainer-modules gebruiken de service-role-client (`createAdminClient()`),
waarbij RLS niet van toepassing is en de guard in TS de enige poort is. Uitzonderingen die
alleen de user-client gebruiken: `checkin-pin-actions.ts`, `payment-request-cancel-actions.ts`,
`pt-busy-actions.ts`, `trial-codes-actions.ts` en `customer-core.ts`. Die leunen dus op de
`is_admin()`- of `is_staff()`-gate binnen de RPC zelf.

---

## 2. Routekaart: ledenomgeving (`/app/**`, member)

| Pad | Doel | Auth- en rolcheck | Gelezen | Geschreven | Actions / RPC's | Nav |
|---|---|---|---|---|---|---|
| `/app` | Home-dashboard: begroeting, plan-status, eerstvolgende les, tegoed, schema-teaser, entitlements | Erft layout-guard | via `loadDashboardData()`: `memberships`, `bookings`, `class_sessions`, `training_programs`, `workout_sessions`, `profiles` | geen | `src/app/app/_lib/dashboard-data.ts` (alleen lezen) | Ja, MemberNav-tab "Home" |
| `/app/rooster` | Weekrooster, boeken, wachtlijst, coverage-badges vooraf | Erft layout-guard; `auth.getUser()` opnieuw op regel 187 | `class_sessions`, `bookings`, `waitlist_entries`, `booking_settings`, `profiles`, `check_ins`, `memberships`, `v_active_strikes`, `v_session_availability` | `bookings`, `waitlist_entries` (via RPC/action) | `createBooking`, `cancelBooking` (`rpc:book_class_session`, `rpc:cancel_class_booking`), `canBook()`, `getGuestPassStatus`, `bookGuest` (`rpc:book_guest_session`) | Ja, tab "Rooster" |
| `/app/boekingen` | Komende boekingen, historie, wachtlijststatus, PT-boekingen, annuleerverzoeken | Erft layout-guard | `booking_settings`, `bookings`, `check_ins`, `pt_bookings`, `pt_sessions`, `pt_cancellation_requests` | `bookings` (annuleren), `pt_cancellation_requests` | `cancelBooking` (`rpc:cancel_class_booking`), `requestPtCancellation` (`rpc:request_pt_cancellation`) | Ja, tab "Boekingen" |
| `/app/producten` | Losse producten kopen (tab Kopen) en tegoed inzien (tab Tegoed) | Erft layout-guard plus eigen `auth.getUser()` (regel 38) | `memberships`, `orders`, `payments`, `catalogue` | `orders`, `payments`, `profiles` (via checkout) | `createOrderAndCheckout` (`rpc:create_order`) | Ja, tab "Producten" |
| `/app/abonnement` | Lidmaatschapsoverzicht, plan, status, guest passes, lifecycle-acties | Erft layout-guard plus eigen `auth.getUser()` | `memberships`, `catalogue`, `guest_passes`, `guest_bookings` | `membership_pauses` (aanvraag), `memberships` (via RPC) | `requestMembershipPause`, `requestMembershipCancellation` (`rpc:request_membership_cancellation`), `getGuestPassStatus` | Ja, Meer-menu "Account en instellingen" |
| `/app/abonnement/bedankt` | Bevestiging na betaling, pollt de orderstatus | Erft layout-guard plus eigen `auth.getUser()` | `orders`, `catalogue` | geen | `PaymentTracker` (client, polling) | Nee, alleen redirect na Mollie |
| `/app/facturen` | Betalingshistorie en mandaatstatus | Erft layout-guard plus eigen `auth.getUser()` | `payments`, `memberships`, `catalogue` | geen | geen | Nee, alleen link op `/app/abonnement:280` en uit `payment_failed`-mail |
| `/app/profiel` | Persoonsgegevens, avatar, noodcontact, marketing opt-in, account verwijderen | Erft layout-guard plus eigen `auth.getUser()` | `profiles` | `profiles`, `admin_audit_log` | `updateProfile`, `saveIdentityDetails`, `updateEmergencyContact`, `uploadAvatar`, `removeAvatar`, `updateMarketingOptIn`, `requestAccountDeletion` | Ja, Meer-menu en AvatarDropdown |
| `/app/profiel/intake` | Gezondheidsintake invullen | Erft layout-guard plus eigen `auth.getUser()` | `profiles` | `profiles` | `submitHealthIntake` | Nee, via link op `/app/profiel` en de `IntakeBanner` op `/app/rooster` |
| `/app/schema` | Actief trainingsschema per dag, read-only | Erft layout-guard plus eigen `auth.getUser()` | `training_programs`, `program_days`, `program_exercises`, `exercises`, `workout_sessions` | geen | `loadActiveProgramForMember` | Ja, Meer-menu, conditioneel op `eligibleForSchema` |
| `/app/schema/[dayId]/workout` | Workout loggen: sets, gewicht, reps | Erft layout-guard plus eigen `auth.getUser()` | `program_days`, `set_logs`, `workout_sessions` | `workout_sessions`, `set_logs` (via RPC) | `startWorkoutSession`, `logSet`, `completeWorkoutSession` (`rpc:start_workout_session`, `rpc:log_set`, `rpc:complete_workout_session`) | Nee, via `DayScheduleCard` op `/app/schema` |
| `/app/schema/geschiedenis` | Eigen loghistorie en progressie per oefening | Erft layout-guard plus eigen `auth.getUser()` | `set_logs` | geen | `listLoggedExercisesForSelf`, `loadOwnExerciseHistory` | Nee, via link op `/app/schema:41` |
| `/app/pt` | Informatieve landing: PT wordt door Marlon ingepland, geen zelfbediening | Erft layout-guard plus eigen `auth.getUser()` | geen | geen | geen | Ja, Meer-menu, conditioneel op `eligibleForPt` |
| `/app/support` | Contactkanalen (WhatsApp, telefoon, mail) | Erft layout-guard | geen (statisch uit `SITE`-constanten) | geen | geen | Ja, Meer-menu |
| `/app/vrij-trainen` | Vrij trainen: dagselector, eligibility, check-in-historie | Erft layout-guard plus eigen `auth.getUser()` | `booking_settings`, `memberships`, `check_ins`, `class_sessions`, `bookings` | `bookings` (via boek-action) | `createBooking` (`rpc:book_class_session`) | **Nee.** Geen enkele inbound `href` in de codebase; zie §6.1 |

### 2.1 MemberNav-structuur (`src/components/nav/MemberNav.tsx`)

Vijf vaste tabs: Home (`/app`), Rooster, Boekingen, Producten, Meer. Het Meer-menu
(`MemberMoreMenu.tsx:82-134`) bevat Profiel, Account en instellingen (`/app/abonnement`),
Schema (conditioneel), PT (conditioneel), Support, en een externe link naar `/`.

Ter registratie: de bekende-issues-lijst in de opdracht noemt een ontbrekende MemberNav-ingang
voor `/app/producten`. Die is inmiddels aanwezig (`MemberNav.tsx:53`); het item staat als vaste
vierde tab in de bar. `/app/facturen` staat wel in de `MORE_PATHS`-lijst voor
actief-markering (`MemberNav.tsx:65`) maar heeft geen eigen menu-item.

---

## 3. Routekaart: trainer-oppervlak (`/app/trainer/**`)

| Pad | Doel | Auth- en rolcheck | Gelezen | Geschreven | Actions / RPC's | Nav |
|---|---|---|---|---|---|---|
| `/app/trainer` | Trainer-dashboard: sessies vandaag, uren, aankondigingen | Layout-rolcheck; eigen `trainers`-lookup, `notFound()` als er geen trainersrij is | `trainers`, `class_sessions`, `trainer_hours`, `v_session_availability`, `announcements` | geen | `listVisibleAnnouncements`, `loadParticipants` | **Nee.** Geen TrainerNav-item; alleen terug-links vanaf `/app/trainer/uren:131` en `/app/trainer/sessies:117` |
| `/app/trainer/agenda` | PT-agenda dag/week/maand, sessiedetail, blokken, boeken vanaf leeg moment | `requireTrainerOrAdmin()` (regel 129) plus layout-rolcheck | `trainers`, `pt_sessions`, `pt_bookings`, `profiles`, `memberships`; `rpc:pt_trainer_settings`, `rpc:get_pt_busy` | `pt_sessions`, `pt_bookings` (via RPC's) | `getAgendaSessions`, `markPtAttendance`, `cancelPtBookingAsStaff`, `reschedulePtBookingAsStaff`, `createPtBlock`, `deletePtBlock`, `completePtIntake`, `cancelPtIntake`, `bookPtForMember` | Ja, TrainerNav-tab "Agenda"; tevens post-login landing voor trainer en voor admin met actieve trainersrij |
| `/app/trainer/boeken` | Boek-voor-klant-scherm: losse sessie, 12-wekenprogramma, intake | `requireTrainerOrAdmin()` (regel 32) plus layout-rolcheck | `trainers`, `catalogue`, `memberships`, `profiles` | `pt_sessions`, `pt_bookings`, `pt_programs`, `orders` | `bookPtForMember` (`rpc:admin_book_pt_for_member`), `planPtProgram` (`rpc:admin_plan_pt_program`), `createPtIntake` (directe insert op `pt_sessions`), `searchCustomers`, `getPtCreditSummary`, `getPtBusy` | Ja, TrainerNav-tab "Boeken" en AdminSidebar "PT boeken" |
| `/app/trainer/sessies` | Eigen groepslessen van vandaag en verder | Layout-rolcheck; eigen `trainers`-lookup, `notFound()` zonder trainersrij | `trainers`, `class_sessions`, `v_session_availability` | geen | geen | Ja, TrainerNav-tab "Mijn sessies" |
| `/app/trainer/sessies/[id]` | Aanwezigheid vastleggen op een groepsles (mobiele lijst) | `authorizeForSession()` binnen `loadParticipants` | `class_sessions`, `bookings`, `profiles`, `check_ins`, `guest_bookings`, `no_show_strikes` | `bookings.attended_at`, `check_ins`, `no_show_strikes`, `guest_bookings`, `admin_audit_log` | `loadParticipants`, `markAttendance`, `markGuestAttendance`, `autoMarkNoShows`, `refundCredit` (`rpc:adjust_membership_credits`) | Nee, via de sessielijst |
| `/app/trainer/uren` | Eigen gewerkte uren indienen en inzien | Layout-rolcheck; eigen `trainers`-lookup, `notFound()` zonder trainersrij | `trainers`, `trainer_hours` | `trainer_hours` | `submitOwnHours` | Nee, alleen vanaf `/app/trainer:352`, dat zelf geen nav-ingang heeft |
| `/app/trainer/klant/[id]` | Smalle read-only klantweergave: naam, contact, actief schema | `requireTrainerOrAdmin()` plus `trainerHasClient()`-eigen-klantcheck | `profiles`, `pt_bookings`, `training_programs`, `program_days`, `program_exercises` | geen | `loadTrainerClientProfile`, `loadActiveProgramForProfile` | Nee, via `SessionDetailPanel.tsx:261` in de agenda |

---

## 4. Routekaart: admin-cockpit (`/app/admin/**`)

Alle routes hieronder erven de rolcheck uit `src/app/app/admin/layout.tsx` (`role === 'admin'`,
anders redirect naar `/app`). De kolom "Auth- en rolcheck" noemt alleen wat daar bovenop komt.

| Pad | Doel | Extra auth-check | Gelezen | Geschreven | Actions / RPC's | Nav |
|---|---|---|---|---|---|---|
| `/app/admin` | Cockpit-dashboard: KPI's, bezetting, activiteit, snelkoppelingen | geen (service-role in de pagina zelf) | `vw_admin_kpis`, `class_sessions`, `bookings`, `memberships`, `payments`, `membership_pauses` | geen | geen | Ja, sidebar "Dashboard" |
| `/app/admin/rooster` | Roostereditor: sessies, series, vrij-trainen-blokken | geen | `class_sessions`, `trainers`, `class_types`, `schedule_templates`, `v_session_availability`, `trial_bookings`, `guest_bookings` | `class_sessions`, `schedule_templates`, `bookings` | `adminCreateSession`, `adminUpdateSession`, `adminCancelSession`, `adminCreateSeries`, `adminUpdateSeries`, `adminCancelSeries` (`rpc:adjust_membership_credits` bij annulering) | Ja, sidebar "Rooster" |
| `/app/admin/sessies/[id]` | Aanwezigheid vastleggen op een groepsles (desktoplijst) | `authorizeForSession()` binnen `loadParticipants` | `class_sessions`, `bookings`, `profiles`, `check_ins`, `guest_bookings`, `no_show_strikes` | `bookings.attended_at`, `check_ins`, `no_show_strikes`, `guest_bookings`, `admin_audit_log` | `loadParticipants`, `markAttendance`, `markGuestAttendance`, `autoMarkNoShows`, `refundCredit` | Nee, alleen via `AdminBookingRow.tsx:57` op de ledendetailpagina |
| `/app/admin/leden` | Ledenlijst: zoeken, filteren, sorteren, pagineren, bulkacties | geen | `profiles`, `memberships`, `bookings` | `admin_audit_log` | `listMembers`, `pushSelectionToMailerLite` | Ja, sidebar "Leden" |
| `/app/admin/leden/[id]` | Ledendetail: overzicht, boekingen, betalingen, notities, intake, training, historie plus alle lifecycle-acties | geen | `profiles`, `memberships`, `bookings`, `payments`, `check_ins`, `member_notes`, `v_active_strikes`, `admin_audit_log`, `training_programs`, `set_logs`, `exercises` | `memberships`, `bookings`, `check_ins`, `no_show_strikes`, `member_notes`, `admin_audit_log` | `grantPause`, `resumeMembership`, `cancelMembership`, `undoCancellation`, `requestPlanChange`, `listUpgradeOptions`, `addCredits`, `overrideNoShow`, `createNote`, `deleteMember`, `correctCustomerEmail`; RPC's: `admin_pause_membership`, `admin_resume_membership`, `admin_cancel_membership`, `admin_undo_cancellation`, `request_membership_change`, `admin_correct_customer_email`, `adjust_membership_credits` | Nee, via de ledenlijst |
| `/app/admin/leden/[id]/schema/[programId]` | Programmabouwer: dagen, oefenslots, sets/reps/tempo, activeren | geen | `training_programs`, `program_days`, `program_exercises`, `exercises` | `training_programs`, `program_days`, `program_exercises` | `createDraftProgram`, `updateProgramMeta`, `deleteDraftProgram`, `activateProgram` (`rpc:activate_training_program`), `duplicateProgram` (`rpc:duplicate_training_program`), `addProgramDay`, `updateProgramDayLabel`, `deleteProgramDay`, `saveProgramExercise`, `deleteProgramExercise` | Nee, via de Training-tab op ledendetail |
| `/app/admin/trainers` | Trainersbeheer: uitnodigen, activeren, tier, health-toegang, uren goedkeuren | geen | `trainers`, `trainer_hours`, `schedule_templates` | `trainers`, `trainer_hours`, `profiles`, `admin_audit_log` | `listTrainers`, `loadTrainerDetail`, `inviteTrainer`, `toggleTrainerActive`, `toggleTrainerHealthAccess`, `updateTrainerTier`, `approveTrainerHours`, `rejectTrainerHours`, `logAdminHours` | Ja, sidebar "Trainers" |
| `/app/admin/betaalverzoeken` | Wizard voor een nieuw betaalverzoek, plus overzichtstab | geen | `catalogue`, `orders`, `profiles` | `orders`, `payments`, `profiles`, `auth.users` (bij nieuwe klant) | `createPaymentRequest` (`rpc:admin_create_order`), `findOrCreateCustomer`, `searchCustomers`, `listPaymentRequests`, `resendPaymentRequest`, `cancelPaymentRequest` (`rpc:admin_cancel_order`) | Ja, sidebar "Betaalverzoeken"; tabs via `?tab=overzicht` |
| `/app/admin/pauzes` | Openstaande pauzeverzoeken en PT-annuleerverzoeken afhandelen | geen | `membership_pauses`, `pt_cancellation_requests`, `profiles`; `rpc:pt_trainer_settings` | `membership_pauses`, `memberships`, `pt_bookings`, `admin_audit_log` | `approveMembershipPause`, `rejectMembershipPause`, `resolvePtCancellation` (`rpc:admin_pause_membership`, `rpc:resolve_pt_cancellation`) | Ja, sidebar "Pauzes" plus `PauzeRequestBell` in de header |
| `/app/admin/proefcodes` | Proefcodes genereren, intrekken, batch-overzicht en KPI's | geen | `trial_codes`, `events` | `trial_codes` (via RPC) | `generateTrialCodes`, `revokeTrialCode`, `revokeTrialCodeBatch`, `getTrialCodeKpis`, `listTrialCodeBatches`, `listTrialCodes` | Ja, sidebar "Proefcodes" |
| `/app/admin/aankondigingen` | Aankondigingen voor leden en trainers beheren | geen | `announcements` | `announcements` | `saveAnnouncement`, `deleteAnnouncement` | Ja, sidebar "Aankondigingen" |
| `/app/admin/oefeningen` | Oefeningenbibliotheek: toevoegen, hernoemen, deactiveren | geen | `exercises` | `exercises` | `saveExercise`, `setExerciseActive` | Ja, sidebar "Oefeningen" |
| `/app/admin/lestypes` | Lestypes en pijlers beheren | geen | `class_types`, `class_pillars` | `class_types` | `saveClassType`, `setClassTypeActive` | Ja, sidebar "Lestypes" |
| `/app/admin/instellingen` | Boekingsinstellingen, check-in-pincode, openingstijden en uitzonderingen | geen | `booking_settings`, `opening_hours`, `opening_hours_exceptions` | `booking_settings`, `opening_hours`, `opening_hours_exceptions`, `admin_audit_log` | `saveBookingSettings`, `setAdminCheckinPin` (`rpc:set_admin_checkin_pin`), `saveOpeningHours`, `addOpeningHoursException`, `deleteOpeningHoursException` | Ja, sidebar "Instellingen" |
| `/app/admin/dropoff` | Leden zonder recente aanwezigheid (churn-signaal) | geen | `v_member_last_attendance`, `memberships`, `profiles`, `events` | geen | `listOpenDropoffFlags`, `countOpenDropoffFlags` | Nee, alleen via `DropoffBell` in de AdminHeader |
| `/app/admin/pt-boeken` | Redirect-stub | geen | geen | geen | `redirect("/app/trainer/boeken")` | Nee, historisch pad |

### 4.1 AdminSidebar (`src/app/app/admin/_components/AdminSidebar.tsx:45-74`)

Primair: Dashboard, Rooster, Leden, Trainers. Secundair: Betaalverzoeken, PT boeken
(wijst naar `/app/trainer/boeken`, buiten de cockpit), Pauzes, Proefcodes, Aankondigingen,
Oefeningen, Lestypes, Instellingen. Extern: Content (`/studio`, nieuw tabblad).

De AdminHeader (`src/components/nav/AdminHeader.tsx:29-30`) draagt twee bells: `DropoffBell`
(naar `/app/admin/dropoff`) en `PauzeRequestBell` (naar `/app/admin/pauzes`).

Ter registratie: de sidebarbeschrijving in `CLAUDE.md` (Dashboard, Rooster, Leden, Trainers,
Pauzes, Aankondigingen, Instellingen, Content) is achterhaald. Betaalverzoeken, PT boeken,
Proefcodes, Oefeningen en Lestypes staan er inmiddels ook in.

---

## 5. Datalaag

### 5.1 Tabellen en views in schema `tmc` (live)

Alle 44 basistabellen hebben `rowsecurity = true`.

**Identiteit en profiel:** `profiles`, `device_push_tokens`, `member_notes`, `admin_audit_log`, `events`.

**Lidmaatschap en geld:** `memberships`, `membership_pauses`, `membership_change_requests`,
`orders`, `payments`, `catalogue`, `early_member_pools`, `guest_passes`.

**Rooster en boeken:** `class_sessions`, `class_types`, `class_pillars`, `schedule_templates`,
`bookings`, `waitlist_entries`, `guest_bookings`, `check_ins`, `no_show_strikes`,
`booking_settings`, `opening_hours`, `opening_hours_exceptions`.

**PT:** `pt_sessions`, `pt_bookings`, `pt_programs`, `pt_settings`, `pt_cancellation_requests`.

**Training:** `exercises`, `training_programs`, `program_days`, `program_exercises`,
`workout_sessions`, `set_logs`.

**Trial en groei:** `trial_bookings`, `trial_codes`, `announcements`.

**Personeel:** `trainers`, `trainer_hours`.

**Legacy crowdfunding:** `crowdfunding_backers`, `crowdfunding_stats`, `crowdfunding_tiers`
(de endpoints zijn verwijderd in `bab4894`; de tabellen staan er nog).

**Views:** `v_active_strikes`, `v_member_last_attendance`, `v_session_availability` (allemaal
zonder eigen RLS). **Materialized view:** `vw_admin_kpis`.

### 5.2 SECURITY DEFINER RPC's (live, uit `pg_proc`)

Gegroepeerd naar functie. De ACL-kolom is samengevat: "auth" betekent `EXECUTE` voor
`authenticated`, "svc" voor `service_role`, "anon" voor `anon`.

| RPC | Args (kort) | ACL | Aangeroepen vanuit |
|---|---|---|---|
| `book_class_session` | session, rental_mat, rental_towel | auth | `createBooking` |
| `cancel_class_booking` | booking | auth | `cancelBooking` |
| `book_guest_session` | session, guest_pass, naam, e-mail | auth | `bookGuest` |
| `request_membership_cancellation` | membership | auth | `requestMembershipCancellation` |
| `request_membership_change` | membership, target_slug, extended_access, effective_date | auth, svc | `requestMembershipChangeCore` |
| `cancel_membership_change_request` | request | auth, svc | `cancelMembershipChangeCore` |
| `request_pt_cancellation` | pt_booking, reason | auth, svc | `requestPtCancellation` |
| `cancel_pt` | pt_booking, with_restitution | auth, svc | `cancelPtBooking`, staff-variant |
| `reschedule_pt` | pt_booking, new_start, 2x override | auth, svc | `reschedulePtBooking`, staff-variant |
| `mark_pt_attendance` | pt_booking, status | auth, svc | `markPtAttendance` |
| `resolve_pt_cancellation` | request, approve, restitution, note | auth, svc | `resolvePtCancellation` |
| `create_pt_block` / `delete_pt_block` | tijdvenster, trainer, overrides | auth, svc | `createPtBlock`, `deletePtBlock` |
| `complete_pt_intake` / `cancel_pt_intake` | pt_session | auth | `completePtIntake`, `cancelPtIntake` |
| `admin_book_pt_for_member` | profile, trainer, start, format, payment_mode, ... | auth, svc | `bookPtForMember` |
| `admin_plan_pt_program` | profile, trainer, type, starts, payment_mode | auth, svc | `planPtProgram` |
| `get_pt_busy` | trainer, from, to | auth, svc | `getPtBusy` |
| `pt_trainer_settings` | trainer | auth, svc | agenda- en pauzes-pagina |
| `pt_check_slot` | trainer, venster, turnaround, overrides | alleen postgres | intern in de PT-RPC's |
| `has_own_pt_booking` | session | auth, svc | RLS-helper op `pt_sessions` |
| `create_order` | slug, extended_access, commit_24m, EM, sessies | auth, svc | `createOrderAndCheckout` |
| `admin_create_order` | profile, slug, waivers, expiry, pt_session | auth, svc | `createPaymentRequest` |
| `admin_cancel_order` | order | auth, svc | `cancelPaymentRequest` |
| `activate_order` | order, mollie_payment | svc | Mollie-webhook |
| `_compute_order_price` | slug, toggles, admin_context | alleen postgres | intern in de order-RPC's |
| `admin_pause_membership` | membership, effective_date, reason, request | auth, svc | `pauseMembershipCore` |
| `admin_resume_membership` | membership, new_subscription, resume_date | auth, svc | `resumeMembershipCore` |
| `admin_flag_resume_blocked` | membership, reason | auth, svc | `resumeMembershipCore` |
| `admin_cancel_membership` | membership, reason, hard_stop, effective_date | auth, svc | `cancelMembershipCore` |
| `admin_undo_cancellation` | membership | auth, svc | `undoMembershipCancellation` |
| `admin_correct_customer_email` | profile, new_email | auth, svc | `correctCustomerEmail` |
| `adjust_membership_credits` | membership, delta, reason, source, actor, booking | (geen expliciete grant) | `addCredits`, `refundCredit`, sessie-annulering |
| `apply_credit_adjustment` | idem | alleen postgres | interne kern onder de vorige |
| `process_due_membership_pauses` | geen | svc | cron `/api/cron/process-pauses` |
| `process_due_membership_change_requests` | geen | svc | cron `/api/cron/process-change-requests` |
| `activate_training_program` | program | svc | `activateProgram` |
| `duplicate_training_program` | program | svc | `duplicateProgram` |
| `start_workout_session` / `log_set` / `complete_workout_session` | sessie, set-velden | auth | workout-logging |
| `generate_trial_codes` | count, pillar, label, valid_days | auth, svc | `generateTrialCodes` |
| `revoke_trial_code` / `revoke_trial_batch` | id / batch | auth, svc | `revokeTrialCode(Batch)` |
| `redeem_trial_code` | code, session, naam, e-mail, telefoon | svc | `redeemTrialCodeBooking` |
| `get_admin_kpis` | geen | anon, auth, svc | (nergens aangeroepen in app-code) |
| `refresh_admin_kpis` | geen | anon, auth, svc | cron `refresh-kpis` |
| `set_admin_checkin_pin` | pin | anon, auth, svc | `setAdminCheckinPin` |
| `verify_admin_checkin_pin` | pin | anon, auth, svc | check-in-kiosk |
| `is_admin` / `is_staff` / `is_trainer` / `current_user_role` | geen | anon, auth, svc | RLS- en RPC-gates |
| `get_campaign_deadline` / `get_campaign_window` | geen | anon, auth, svc | campagne-fase |
| `get_remaining_guest_passes` | profile | anon, auth, svc | guest-pass-laag |
| `plan_covers` | plan_type, pillar | auth | dekkingslogica |
| `session_occupancy` | session | svc | bezetting |
| `cleanup_expired_strikes` | geen | anon, auth, svc | cron |

Triggerfuncties (geen directe aanroep): `enforce_session_capacity`, `events_block_mutation`
(de append-only-bewaking op `tmc.events`), `expire_lock_in_on_cancel`, `set_commit_end_date`,
`touch_updated_at`, `handle_new_auth_user`, `trial_bookings_release_code`.

Legacy: `increment_cf_stats` (twee overloads) en `increment_cf_tier_slot` uit de verwijderde
crowdfundingmodule staan nog in de database.

---

## 6. Vastgestelde feiten die in FASE 2 beoordeeld moeten worden

Dit zijn waarnemingen uit de traversal, bewust zonder oordeel of severity. Ze staan hier zodat
FASE 2 gericht bewijs kan ophalen in plaats van de traversal te herhalen.

### 6.1 Bereikbaarheid

1. `/app/vrij-trainen` heeft nul inbound links. Een repo-brede zoekactie op de route levert
   alleen twee toelichtende comments op (`src/app/app/rooster/page.tsx:244` en `:595`) en de
   pagina's eigen bestanden. `CLAUDE.md` stelt dat de ingang "loopt via de bestaande link op
   `/app/rooster`"; die link bestaat niet in de code.
2. `/app/trainer` (het trainer-dashboard) staat niet in TrainerNav en is alleen bereikbaar via
   terug-links vanaf twee onderliggende pagina's. `/app/trainer/uren` hangt daar exclusief
   onder.
3. `/app/facturen` heeft geen menu-item, alleen een link op `/app/abonnement` en een link in de
   `payment_failed`-mail.
4. `/app/admin/sessies/[id]` is alleen bereikbaar via de boekingenrij op een ledendetailpagina,
   niet vanuit `/app/admin/rooster`.

### 6.2 Rechten en gates

5. `verify_admin_checkin_pin` is SECURITY DEFINER, heeft `EXECUTE` voor `anon`, en bevat zelf
   geen rolcheck of rate-limiting. Hij geeft alleen een boolean terug.
6. `refresh_admin_kpis` en `get_admin_kpis` hebben `EXECUTE` voor `anon`. `get_admin_kpis`
   bevat wel een `is_admin()`-gate; `refresh_admin_kpis` niet.
7. `src/app/app/trainer/layout.tsx` controleert alleen `profiles.role`, terwijl
   `requireTrainerOrAdmin()` daarnaast een actieve `trainers`-rij eist. Twee pagina's onder
   `/app/trainer/**` roepen de strengere gate wel aan, drie niet.
8. `src/lib/admin/member-actions.ts` schrijft op sommige plekken direct naar `memberships`,
   `bookings`, `check_ins` en `no_show_strikes` met de service-role-client, naast de
   lifecycle-RPC's.

### 6.3 Aanwezigheid en status

9. Aanwezigheid loopt via `bookings.attended_at` plus `check_ins`. `trial_bookings` heeft een
   eigen `status`-domein met `attended`/`no_show` dat door geen enkel codepad wordt gezet
   (bevestigd in `spec-community-growth.md` §1 en niet weersproken door de traversal).
10. `/app/admin` draait op `export const revalidate = 300` in plaats van `force-dynamic`, als
    enige pagina in de cockpit.

### 6.4 Restanten

11. De crowdfundingtabellen en drie `increment_cf_*`-functies staan nog in de database nadat de
    endpoints in `bab4894` zijn verwijderd.
12. `/app/admin/pt-boeken` is een redirect-stub naar `/app/trainer/boeken`.

---

## Bijlage: opdracht fase 2

FASE 2: BEOORDELING
Beoordeel per oppervlak op deze assen:

1. Flow-volledigheid. Kan een lid zelfstandig het volledige levenspad afleggen: onboarding, abonnement bekijken, boeken, wijzigen, afmelden, wachtlijst, tegoed inzien, PT aanvragen, betalingsgeschiedenis, gegevens wijzigen, opzeggen? Kan Marlon het volledige beheerspad afleggen: rooster zetten, sessie wijzigen of annuleren, aanwezigheid vastleggen, lid opzoeken, abonnement muteren, betaling of mislukte betaling opvolgen, tegoed corrigeren, PT-verzoek afhandelen? Noem per pad waar een lid of Marlon vastloopt of naar buiten het systeem moet.
2. Doodlopende straten en ontbrekende terugwegen. Pagina's zonder navigatie-ingang, acties zonder bevestiging of terugkoppeling, foutstatussen zonder herstelpad, lege staten zonder vervolgactie.
3. Interne consistentie. Zelfde concept, verschillende benaming of eenheid; zelfde actie, verschillende plek of gedrag; statuslabels die niet één-op-één op de databasewaarden aansluiten; ruwe DB-codes of interne CMS-taal die zichtbaar is voor gebruikers.
4. Destructieve en onomkeerbare acties. Waar kan iemand met één klik iets kapotmaken dat geld of aanwezigheid raakt, zonder bevestiging, zonder audit trail, zonder herstelpad?
5. Rol- en rechtenlogica. Klopt de scheiding lid, trainer, admin in de UI met de daadwerkelijke RLS en de rolchecks in de actions? Meld elke plek waar de UI iets verbergt dat de datalaag niet blokkeert, of omgekeerd.
6. Mobiel-eerst. Deze app wordt overwegend op telefoon gebruikt via de Capacitor-wrapper. Beoordeel per drukke route of de belangrijkste actie binnen bereik en zonder horizontaal scrollen bruikbaar is. Tabellen in de cockpit zijn hier een specifiek aandachtspunt.
7. Feedback en tijd. Laadstaten, optimistische updates, dubbelklik-bescherming op alles wat een boeking of betaling raakt, en of tijdzone- en datumweergave consistent is.

HARDE UITGANGSPUNTEN, niet ter discussie
- tmc.catalogue is de enige bron van waarheid voor prijzen. Display-equals-charge.
- Aanwezigheid loopt via bookings.attended_at plus de check_ins tabel. bookings.status kent alleen booked, cancelled, waitlisted. Elke aanname over status='attended' is fout.
- De append-only trigger op tmc.events mag nooit geschonden worden.
- Prijzen worden altijd gelabeld als "per 4 weken", nooit "per maand".
- Gebruikersgerichte copy is Nederlands, technische identifiers Engels.

AL BEKEND, NIET OPNIEUW MELDEN
- Navigatiestructuur en het bottom-nav 5-tab model, inclusief de ontbrekende MemberNav-ingang voor /app/producten.
- no_show_rate_30d in vw_admin_kpis staat permanent op 0.
- Firebase-project bestaat niet, alle push-call-sites no-oppen stil.
- Sanity faq wordt niet live gefetcht, er bestaan hardcoded duplicaten.
- Het phase-gate en Early Member-mechaniek in de configurator. Niet aanraken, niet beoordelen.
- Kettlebell-capaciteit staat op 8 in plaats van onbeperkt.
- De twee onverenigbare producttaxonomieën op de homepage.
Als je iets vindt dat hier tegenaan schuurt maar wezenlijk anders is, mag je het melden met expliciete vermelding waarom het niet hetzelfde issue is.

RAPPORT
Schrijf docs/evaluatie-admin-leden.md met deze opbouw:
1. Samenvatting, maximaal 15 regels, met de drie zwaarste bevindingen.
2. Verwijzing naar docs/inventaris-admin-leden.md. De routekaart niet dupliceren.
3. Bevindingen, gegroepeerd per oppervlak (leden, admin, gedeeld), en per bevinding:
   - Titel
   - Severity: P1 (breekt een flow of raakt geld of aanwezigheid), P2 (verwarrend of inconsistent, flow blijft mogelijk), P3 (afwerking)
   - Zeker weten: hoog, midden of laag. Hoog betekent: je hebt het gedrag in de code of in de live functiedefinitie zelf gezien. Midden: je leidt het af uit twee plekken die niet op elkaar aansluiten. Laag: het is een vermoeden dat handmatig getest moet worden. Zet nooit hoog bij iets dat je niet direct hebt gelezen.
   - Bewijs: bestandspad met regelnummer, of functienaam uit pg_get_functiondef. Geen bevinding zonder bewijs.
   - Waarom het een probleem is, in één alinea
   - Aanbeveling, zo klein mogelijk gehouden. Geef de kleinste ingreep die het probleem oplost, niet de mooiste herbouw.
4. Ontbrekende essentiële functionaliteit, apart. Maximaal 8 items, gerangschikt. Per item: welke flow er nu stukloopt en wat er nu handmatig moet gebeuren.
5. Wat goed staat. Kort, maar wel benoemd, zodat duidelijk is wat niet aangeraakt moet worden.

Maximaal 12 bevindingen per severity-niveau. Bij meer: rangschik en laat de staart weg, met een regel dat er is afgekapt. Liever 20 bevindingen met bewijs dan 60 zonder.

WERKWIJZE
Doe eerst git status. Maak dan branch docs/evaluatie-admin-leden vanaf een schone tree. Alleen de twee documentbestanden committen. Push en open een PR tegen main. Ik merge zelf.

Stop en rapporteer als je iets vindt dat volgens jou een acuut geldrisico of datalek is, in plaats van het onderin een lange lijst te zetten.

Geen em-dashes in de documenten. Gebruik komma, puntkomma, dubbele punt, of herformuleer.
