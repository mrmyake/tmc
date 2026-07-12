# Discovery: klantbeheer- en lifecycle-laag (gedeeld admin + lid)

**Status: discovery-only, read-only. Geen code, geen migratie, geen schemawijziging.**
Datum: 2026-07-12. Model: Fable. Branch: `discovery-klantbeheer-lifecycle`.

Doel: de lifecycle- en SEPA-mandaat-laag vastleggen die zowel het admin-klantbeheer (Marlon
wijzigt/pauzeert/stopt) als de lid-self-service (`spec-ledenomgeving.md` Stap 2, WS-7 in
`spec-membership-flow.md`) aanstuurt. Eén laag, twee dunne voorkanten.

Alle definer-functies zijn geverifieerd tegen de LIVE database (project `xoivleieyfcxcfawgveh`,
schema `tmc`) via `pg_get_functiondef`, `pg_policies` en `information_schema`; niet vertrouwd op
repo-bestanden of geheugen. Code-paden zijn geverifieerd in de werkkopie op `main`.

**Huishoudelijke bevinding vooraf:** `spec-ledenomgeving.md` stond NIET in de repo (het bestand
leefde alleen in `~/Downloads`). Het is in deze PR meegecommit naar de repo-root, zelfde les als
eerder met `spec-membership-flow.md` (cutover-checklist stap 1).

---

## A. Lifecycle-fix (de harde blokker, spec-ledenomgeving §5.8)

### A1. Bestaat de fix (status naar `cancelled` + Mollie-subscription-stop) live? — BESTAAT, als tweetrapsmechanisme

De fix is live en bestaat uit een RPC plus een cron, met de veilige volgorde "Mollie eerst,
dan pas lokaal cancelled":

1. **`tmc.request_membership_cancellation(p_membership_id uuid)`** — LIVE, SECURITY DEFINER,
   `search_path tmc, extensions`, ACL alleen `authenticated` (geen `anon`, geen `service_role`).
   Geverifieerd via `pg_get_functiondef`. Gedrag: eigenaarschap via `profile_id = auth.uid()`,
   toegestaan vanuit `active`, `paused`, `payment_failed`; idempotent-geweigerd bij
   `cancellation_requested`; zet `status = 'cancellation_requested'`,
   `cancellation_requested_at = now()` en
   `cancellation_effective_date = greatest(commit_end_date, current_date + 28)`.
   Aangeroepen door de member-action `requestMembershipCancellation`
   (`src/lib/member/membership-actions.ts:119`, dialoog op `/app/abonnement`).

2. **Cron `/api/cron/process-cancellations`** (vercel.json, `30 3 * * *`,
   `src/app/api/cron/process-cancellations/route.ts`): selecteert `cancellation_requested` met
   `cancellation_effective_date <= today`, roept per rij eerst `cancelMollieSubscription`
   (`src/lib/mollie.ts:24`, `customerSubscriptions.cancel`, idempotent, `canceled`/`completed`
   telt als succes). Faalt Mollie, dan blijft de rij `cancellation_requested` en retry't de
   volgende nacht. Pas na Mollie-succes: `.update({status:'cancelled', end_date: today})` guarded
   op `status='cancellation_requested'`, plus event `membership.cancelled`. Incasso kan dus nooit
   doorlopen op een rij die lokaal al `cancelled` is.

3. **Trigger `tmc.expire_lock_in_on_cancel`** (LIVE, geen definer nodig, BEFORE-trigger): bij
   overgang naar `cancelled` wordt `lock_in_active` uitgezet en `lock_in_expired_at` gestempeld.

4. **Admin-pad**: `deleteMember` (`src/lib/admin/member-actions.ts:439`) zet alle actieve/gepauzeerde
   memberships bulk op `cancelled`, roept per rij `cancelMollieSubscription` (luide ntfy bij
   falen) en verwijdert daarna de auth-user.

**Wat ontbreekt (TE BOUWEN):**
- Er is GEEN admin-primitief "zeg dit abonnement op" los van account-verwijderen. Marlon kan een
  membership niet opzeggen zonder het hele account te wissen. De RPC is bovendien hard gebonden
  aan `auth.uid()`, dus admin kan hem niet namens een lid aanroepen.
- Er is GEEN directe-cancel (per direct in plaats van per `cancellation_effective_date`), bv. voor
  coulance of de Early-Member "maandelijks opzegbaar"-belofte. De 28-dagen-ondergrens zit
  hardcoded in de RPC.
- De lid-facing UI bestaat al (CancellationDialog); het §5.8-blok is voor het LID dus opgeheven.
  Voor ADMIN is opzeggen nog niet af.

### A2. Booking/membership-annulering en de Akiles-deurtoegang — LOOPT VOLLEDIG LOS (er is niets)

Er is nul Akiles-code, -config of -env in de repo; grep op `akiles` raakt alleen markdown-specs.
`spec-akiles-access.md` is expliciet een onbesloten draft die zelf bevestigt dat er geen code is.
Er bestaat dus geen entitlement die "meestopt": annulering of pauze verandert vandaag niets aan
deurtoegang, want deurtoegang is nog niet gebouwd. De spec-intentie (sync-laag op de bestaande
events `membership.activated/cancelled/payment_failed`, `membership.pause_granted`) sluit goed aan
op wat er WEL live is: die events worden al geëmit (`tmc.events`, append-only). De lifecycle-laag
hoeft Akiles nu niet te bouwen, maar moet de event-emissie op elke nieuwe transitie (pauze-einde,
wissel) consequent doorzetten, zodat de latere Akiles-sync er kant-en-klaar op kan abonneren.

---

## B. Mandaat- en wissel-primitieven

### B3. Live RPC's voor pauzeren, hervatten, opzeggen, wijzigen

Geverifieerd via `pg_get_functiondef` over alle functies in schema `tmc`:

| Operatie | Live primitief | Signatuur en status |
|---|---|---|
| Opzeggen (lid) | **BESTAAT**: `request_membership_cancellation(p_membership_id uuid)` | SECURITY DEFINER, returns TABLE(id, status, cancellation_requested_at, cancellation_effective_date); ACL authenticated |
| Opzeggen (effectuering) | **BESTAAT**: cron `process-cancellations` + `cancelMollieSubscription` | TS/service-role, geen RPC |
| Pauzeren | **GEEN RPC.** Directe table-writes | Lid: insert `membership_pauses` status `pending` via RLS-policy `pauses_self_insert` (`requestMembershipPause`, `src/lib/member/membership-actions.ts:21`). Admin: `approveMembershipPause`/`rejectMembershipPause` (`src/lib/admin/pauses-actions.ts`) en `grantPause` (`src/lib/admin/member-actions.ts:35`) schrijven direct `membership_pauses` en `memberships.status='paused'` onder de admin-ALL-policies |
| Pauze-effect op commitment | **BESTAAT**: trigger `apply_pause_to_commit()` | SECURITY DEFINER trigger: bij `status='approved'` schuift `commit_end_date` op met het aantal pauzedagen |
| Hervatten (pauze-einde) | **BESTAAT NIET** | Geen RPC, geen cron. Niets zet `paused` terug naar `active` als `membership_pauses.end_date` bereikt is, en niets zet `active` naar `paused` bij een toekomstige `start_date`. Alleen synchroon-bij-goedkeuring als het venster al loopt |
| Wijzigen (plan/frequentie/add-on) | **BESTAAT NIET** | Geen RPC, geen tabel, geen action. De admin-knop "Abonnement wijzigen" is hardcoded `disabled` (`ActionMenu.tsx:57`, "Plan-switch flow komt in een latere release") |
| Credits | **BESTAAT**: `adjust_membership_credits(p_membership_id, p_delta, p_reason, p_source, p_actor_type, p_actor_id, p_booking_id)` | SECURITY DEFINER, row lock, expiry-handhaving (`credits_expires_at`), audit-event `credits.adjusted` |

RLS-context (live uit `pg_policies`): `memberships` heeft alleen `memberships_self_read` en
`memberships_admin_all`; een lid kan zijn membership dus nooit direct muteren (daarom is de
cancel-RPC een definer). `membership_pauses` heeft `pauses_self_read`, `pauses_self_insert`
(alleen eigen membership) en `pauses_admin_all`.

**Conclusie B3:** opzeggen is als enige operatie een echte gedeelde primitief. Pauzeren is
admin-side app-code met directe writes (werkt, maar is geen herbruikbare laag), hervatten en
wijzigen bestaan niet.

### B4. `membership_change_requests` — BESTAAT NIET, TE BOUWEN

Live geverifieerd: geen enkele tabel in `tmc` matcht `%change%` of `%request%`
(`information_schema.tables`). De tabel uit spec-ledenomgeving §1.2 (upgrade op volgende
factuurdatum, geen proratie) moet volledig gebouwd worden: tabel, RLS (self-insert-eigen-membership
plus admin-ALL, naar het `membership_pauses`-patroon), en een verwerkingsmechanisme. Er is nog
geen cron die "volgende factuurdatum" kent; de logische plek is een nieuwe nachtelijke cron naast
`process-cancellations`, of verwerking in de webhook-recurring-branch op het moment dat de
volgende incasso binnenkomt (dat moment IS de factuurdatum). Die keuze is een ontwerpbesluit voor
de bouwfase, met een belangrijke randvoorwaarde: het recurring-bedrag bij Mollie moet vóór de
volgende incasso aangepast zijn (zie B5).

### B5. Verhouding tot het Mollie SEPA-mandaat en de 28-daagse subscription

Live situatie, per operatie:

- **Opzeggen**: de Mollie-subscription wordt écht geannuleerd
  (`customerSubscriptions.cancel`), en pas daarna gaat de lokale status naar `cancelled`. Het
  MANDAAT wordt bewust NIET ingetrokken: nergens in de codebase bestaat een
  `customerMandates.revoke`. Dat is correct: het mandaat blijft op de Mollie-customer staan en
  een terugkerend lid kan zonder nieuwe mandaat-capture opnieuw een subscription krijgen.
- **Pauzeren**: ALLEEN LOKAAL. Er is geen enkele code die een Mollie-subscription pauzeert of het
  bedrag op nul zet. Een gepauzeerd lid (`memberships.status='paused'`) wordt gewoon
  doorgeïncasseerd door Mollie's eigen subscription-engine. **Dit is het grootste geldlek in de
  huidige laag** en moet in de bouwfase opgelost worden (Mollie-subscription cancel bij
  pauze-start plus hercreatie bij pauze-einde, of `customerSubscriptions.update`; ontwerpkeuze
  Fable). De trigger `apply_pause_to_commit` verlengt wel netjes de commitment.
- **Wijzigen**: bestaat niet, maar de mandaat-invariant staat er al goed voor. Eén Mollie-customer
  per profiel is structureel: `profiles.mollie_customer_id` is canoniek,
  `create-order.ts:135` en `payment-link-core.ts:169` maken alleen een customer aan als het veld
  null is en schrijven terug naar `profiles`. `memberships.mollie_customer_id` wordt uitsluitend
  gekopieerd door `activate_order`, nooit zelfstandig gemint. De subscription-creatie in de
  webhook is idempotent (`idempotencyKey: order-<id>-sub`, write-back guarded op
  `.is("mollie_subscription_id", null)`). Een toekomstige wissel moet dus lopen als
  subscription-mutatie (update of cancel-plus-create) ONDER DEZELFDE customer; er is geen pad dat
  per ongeluk een tweede mandaat mint. Eén bekende restwissel: twee écht gelijktijdige eerste
  orders van hetzelfde profiel kunnen allebei null lezen en elk een customer aanmaken (geen lock);
  bestaand, klein, en los van dit werk.
- **Guard tegen dubbele subscriptions**: live geverifieerd dat `create_order`,
  `admin_create_order` en `activate_order` alle drie de `existing_membership`-guard bevatten
  (weigering bij bestaande `pending/active/paused/cancellation_requested`), en dat
  `activate_order` de betaling-wint-semantiek heeft (`late_payment`, accepteert `cancelled`
  orders, PR #84). ACL: `activate_order` alleen `service_role`; de andere twee `authenticated`
  met interne `is_admin()`-gate waar nodig. Een wissel-flow moet deze guard bewust passeren
  (change-pad), nooit omzeilen door de guard te verzwakken.

### B6. Bestaat de admin-pauze-flow al? — BESTAAT

- Route: `/app/admin/pauzes` (`src/app/app/admin/pauzes/page.tsx`), wachtrij van `pending`
  verzoeken plus afgehandelde; `PauzeRequestBell` in de admin-header telt open verzoeken.
- Actions: `approveMembershipPause(pauseId)` en `rejectMembershipPause(pauseId, reason)` in
  `src/lib/admin/pauses-actions.ts` (audit-log plus events `membership.pause_granted` /
  `membership.pause_rejected`), en `grantPause(input)` in `src/lib/admin/member-actions.ts`
  (direct-toekennen vanuit het lid-detail, insert meteen `approved`).
- Lid-kant bestaat OOK al: `requestMembershipPause` plus `PauseDialog` op `/app/abonnement`.

**Maar**: dit zijn directe `.from().update()/.insert()`-writes in app-code, geen gedeelde
RPC-laag, en de Mollie-kant ontbreekt volledig (B5). De lid-kant en admin-kant delen vandaag
alleen de tabel en de RLS, niet de logica: de "membership op paused zetten als het venster al
loopt"-regel staat twee keer in TS (`pauses-actions.ts:67` en `member-actions.ts:86`). De
gedeelde laag moet die logica één keer vangen (RPC of één service-module) en de
Mollie-subscription-stop toevoegen; beide voorkanten worden er daarna dun op.

---

## C. Adres (besluit Ilja: facturatie via het profielveld)

### C7. Factuuradres uit het profiel, geen aparte billing-entity — BEVESTIGD

Live kolommen op `tmc.profiles`: `street_address`, `postal_code`, `city`, `country`
(default `'NL'`). Er bestaat geen aparte mandaat- of billing-adres-entity: geen enkele tabel in
`tmc` matcht `%mandate%`, `%invoice%` of `%factuur%`. Het lid muteert het adres via
`updateProfile` (`src/lib/actions/profile.ts:44`).

### C8. Leest een factuur het adres live of gesnapshot? — GEEN VAN BEIDE: er zijn nog geen facturen

Het factuur-genererende pad bestaat niet. `/app/facturen`
(`src/app/app/facturen/page.tsx`) leest `tmc.payments` (kolommen live geverifieerd: bedrag,
status, method, description, Mollie-ids; GEEN adresvelden), de actieve membership en
`catalogue.display_name`, en toont expliciet "PDF-facturen komen binnenkort". Een adreswijziging
kan dus vandaag niets terugwerkend raken, want geen enkel betaal- of factuurrecord bevat een
adres. Het enige PDF-pad in de app is de TRAINER-factuur
(`src/app/api/admin/trainers/[id]/invoice/route.ts`) met een hardcoded studio-adres.

**Ontwerpregel voor later (facturatie-besluit met de accountant, geparkeerde WS-5 PR D):** bij
echte facturen moet het adres op factuurmoment GESNAPSHOT worden in het factuurrecord, naar
analogie van de prijssnapshot op `orders`. Nu niets bouwen; alleen vastleggen dat "live uit het
profiel renderen" bij facturen de foute keuze zou zijn.

### C9. Houdt Mollie een adres vast dat gesynchroniseerd moet worden? — NEE

De Mollie-customer wordt aangemaakt met naam en e-mail (`mollie.customers.create` in
`create-order.ts:137` en `payment-link.ts:96`); nergens wordt een adres meegestuurd en nergens
bestaat een `customers.update`-aanroep. Een SEPA-mandaat hangt aan de IBAN van de rekeninghouder,
niet aan een woonadres. **Bevestigd: een adreswijziging is een pure profiel-update, geen
mandaat-operatie en geen Mollie-sync.** Adres-bijwerken is daarmee het enige onderdeel van dit
cluster dat veilig door Sonnet kan zonder Fable-ontwerp.

---

## D. Geparkeerde e-mailcorrectie (login-adres)

### D10. Huidige staat — VOLLEDIG TE BOUWEN; de PR B-bouwstenen bestaan wel

Er bestaat geen enkele code die een login-e-mail wijzigt na aanmaak. De enige
`auth.admin.updateUserById`-aanroep (`src/lib/actions/profile.ts:84`) werkt uitsluitend
`user_metadata` (voor- en achternaam) bij. `profiles.email` wordt alleen door de
`handle_new_auth_user`-trigger geschreven en daarna nooit meer; er is geen e-mailwijzig-UI, niet
voor admin en niet voor het lid.

Wat de correctie synchroon moet houden (conform de geparkeerde WS-5 PR 2-notitie in
`spec-membership-flow.md`, sectie "GEPARKEERD (klantbeheer-cluster)"):
1. `auth.users.email` (via `auth.admin.updateUserById`),
2. `auth.identities` (de e-mail-identity; wijzigt bij een admin-update niet automatisch
   gegarandeerd mee, expliciet verifiëren en zo nodig bijwerken),
3. `tmc.profiles.email` (de kopie die de betaalverzoek-mails en admin-zoek gebruiken; PR #83
   verstuurt naar `profiles.email`, dus een stale kopie stuurt betaallinks naar het oude adres).

PR B-strengheid die gespiegeld moet worden (bestaat als patroon in
`src/lib/admin/customer-actions.ts`, `findOrCreateCustomer`): zoek-eerst op genormaliseerde
e-mail tegen de unieke sleutel `users_email_partial_key`; bestaat het doeladres al op een ANDER
account, dan hard weigeren (nooit mergen, nooit overschrijven); de `email_exists`/422-race
afhandelen als re-search. Extra voor de correctie zelf: audit-event (`member.email_changed`),
en een besluit over `email_confirm` (direct bevestigd zetten of het lid opnieuw laten verifiëren;
OTP-login convergeert bij eerste verificatie, bewezen in de PR B-smoke-test). Dit wijzigt een
login-adres: Fable.

---

## E. Volgorde en botsing met lopend werk

### E11. Raakt dit WS-4/WS-5? Moet daar iets eerst af? — NEE, de baan is vrij; wel drie raakvlakken

Tegen de WS-ledger (bijgewerkt 2026-07-11, geverifieerd tegen git): WS-4 (PR #73, #78), de
credit-fundering (PR #75, #76, #77), WS-6 (PR #79) en heel WS-5 (PR #80 t/m #85) zijn GEMERGED;
er staan geen WS-4/WS-5-PR's open. De spec zegt expliciet: "Klantbeheer is een APARTE
admin-workstream na WS-5, met eigen discovery en eigen Fable-stukken". Dat moment is nu.

Openstaande punten elders zijn niet blokkerend voor deze laag: de productie-check van het
betaalverzoek-overzicht, de WS-6 redirect-verificatie, de MemberNav-ingang voor `/app/producten`
(navigatie-project), de overstap-CTA-integriteit en Fase 2 Early Member. Geen daarvan deelt
schrijfpaden met lifecycle.

Drie raakvlakken waar dit werk NIET overheen mag walsen:
1. **`activate_order` en de webhook zijn vers (PR #84).** De betaling-wint-van-annuleren-semantiek
   (`late_payment`, row lock) is net live bewezen. Lifecycle-werk dat de webhook-recurring-branch
   aanpast (bv. change-request-verwerking op incassomoment) moet die semantiek en de bestaande
   `payment_failed`/`reactivated`-transities intact laten.
2. **De `existing_membership`-guard in alle drie de order-RPC's** is de seam met wisselen: een
   upgrade mag niet als "nieuwe order naast bestaand membership", dus de wissel-flow heeft een
   eigen pad nodig in plaats van die guard los te maken.
3. **Eventual-consistency met de Early-Member-belofte**: EM-Groepslessen is "maandelijks direct
   opzegbaar" (Fase 2). De huidige cancel-RPC hardcodet `current_date + 28` als ondergrens. De
   gedeelde laag moet de opzegtermijn parametriseerbaar maken (uit catalogue/membership-voorwaarden)
   voordat Fase 2 aanklapt, anders breekt de belofte op het gevoeligste moment.

### E12. Health-intake-gate en credits, alleen waar ze de lifecycle raken

- **Health-intake-gate (§5.6)**: live geverifieerd dat `book_class_session` en `book_pt_credits`
  GEEN check op `health_intake_completed_at` bevatten; er is dus geen DB-gate op boeken, en in de
  onderzochte app-paden is ook geen blokkade aangetroffen. Voor de lifecycle-laag is er geen
  koppeling; de vraag "moet intake boeken blokkeren" is een los besluit voor de
  ledenomgeving-workstream, niet voor deze laag.
- **Credits (§5.1)**: het model bestaat en is af (`adjust_membership_credits` onder row lock,
  expiry-handhaving op alle debit-paden, PR #75-77). Raakvlak met lifecycle: NIETS koppelt vandaag
  annulering of pauze aan credits (een `cancelled` membership houdt zijn `credits_remaining`;
  rittenkaarten zijn eigen membership-rijen met `credits_expires_at`, dus feitelijk onafhankelijk
  van het abonnement). Het volledige tegoed-verhaal is de aparte Stap 3-discovery
  (`discovery-producten-tegoed.md`); hier alleen de vaststelling dat de lifecycle-laag credits
  niet hoeft aan te raken.

---

## Aanbevolen bouwvolgorde en model-allocatie

Volgorde binnen de gedeelde laag (eerst de primitieven, dan de voorkanten):

1. **Fable: de gedeelde lifecycle-primitieven (het hart).**
   a. Pauze-laag herbouwen als één primitief met Mollie-stop: pauze-start stopt de incasso bij
      Mollie, pauze-einde herstart hem (plus de ontbrekende cron die `paused` naar `active` terugzet
      en toekomstige pauzes activeert). Dit dicht het bestaande geldlek (incasso loopt nu door
      tijdens pauze) en vervangt de dubbele TS-logica.
   b. Admin-opzeggen: een admin-variant van de cancel-primitief (los van `deleteMember`), inclusief
      per-direct-optie en een parametriseerbare opzegtermijn (E11 punt 3).
   c. `membership_change_requests` plus verwerking op de volgende factuurdatum, met het
      Mollie-bedrag aangepast vóór de eerstvolgende incasso; alleen-upgraden-regel server-side.
   Alles SECURITY DEFINER of service-role, elk met events voor de latere Akiles-sync.
2. **Fable: de e-mailcorrectie (D10).** Zelfstandig blok, PR B-strengheid, drie stores synchroon.
   Kan parallel aan of direct na 1; deelt geen schrijfpaden met de lifecycle-primitieven.
3. **Sonnet: de admin-voorkant.** "Abonnement wijzigen" enablen op de bestaande ActionMenu,
   opzeg-knop, pauze-flow omhangen naar de nieuwe primitieven, e-mailcorrectie-formulier. Dun.
4. **Sonnet: de lid-voorkant (ledenomgeving Stap 2).** Uitgebreide `/app/abonnement`-pagina met
   status-regel, wisselen (alleen upgrade), pauzeren en opzeggen op dezelfde primitieven, na
   mockup-approval. Adres-bijwerken bestaat al (`updateProfile`) en kan meteen mee.

**Welke surface eerst: admin.** Drie redenen: Marlon heeft het vandaag al nodig (er zijn twee
memberships live en zij kan nu niet eens opzeggen zonder een account te wissen), de admin-kant is
het kleinste UI-werk bovenop de primitieven (ActionMenu bestaat al, knop staat al klaar op
disabled), en de lid-kant wacht toch op de mockup-ronde van de ledenomgeving. De lid-kant volgt
daarna als tweede dunne voorkant op exact dezelfde RPC's, wat precies de bedoeling van deze
gedeelde discovery is.

**STOP.** Dit rapport is discovery-only. Er wordt niets gebouwd voordat Ilja het gelezen heeft en
expliciet go geeft.
