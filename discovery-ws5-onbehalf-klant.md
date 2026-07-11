# Discovery WS-5 PR B: on-behalf klant-aanmaak (Fable)

Datum: 2026-07-11. Discovery-only, geen code, geen migraties, geen writes. Alle databasedefinities live opgehaald uit het echte project (xoivleieyfcxcfawgveh, schema tmc) via pg_get_functiondef en catalogusqueries; code-referenties tegen de huidige main (na merge PR #79/#80). Scope: het aanmaken van het doelprofiel voor admin_create_order wanneer de klant nog niet bestaat, plus het zoeken van bestaande klanten. Overstap en custom bedragen buiten scope.

---

## 1. Profiel versus auth-gebruiker: een schil kan niet bestaan

**Elk profiel hangt verplicht aan een auth-gebruiker.** Live geverifieerd:

```
profiles_id_fkey: FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
profiles_pkey:    PRIMARY KEY (id)
```

`tmc.profiles.id` IS het `auth.users.id`. Een profiel-schil zonder auth-rij is fysiek onmogelijk; zelfs de service-role kan geen profiel inserten zonder bestaande auth-user (FK-violation). De vraag "schil of gekoppeld" is daarmee beantwoord: PR B maakt onvermijdelijk een echte auth-gebruiker aan, en dat is precies wat het samenvallen bij latere login veilig maakt (zie punt 2).

**Normale aanmaak loopt via de trigger.** Live definitie:

```
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION tmc.handle_new_auth_user()
```

`tmc.handle_new_auth_user()` (SECURITY DEFINER, search_path tmc/extensions, live opgehaald): mint een uniek 6-cijferig `member_code` (collision-loop, max 50 pogingen), insert een profielrij met `id`, `email`, `first_name`/`last_name` (uit `raw_user_meta_data`, coalesce naar lege string), `phone`, attributievelden (`acquisition_*`, `signup_path`, `first_touch_at`) en doet dat met `ON CONFLICT (id) DO NOTHING`.

**De drie bestaande aanmaakpaden:**

1. **Zelf-signup via OTP**: `src/app/login/LoginForm.tsx:61-73` en `src/app/abonnement/IdentifyStage.tsx:42-55` roepen `supabase.auth.signInWithOtp` aan zonder `shouldCreateUser`, dus op de default `true`. Besluit expliciet vastgelegd in `spec-otp-login.md` (addendum, regel 75): `/login` is bewust het gecombineerde login- plus signup-entrypoint. GoTrue maakt de auth-user, de trigger maakt het profiel.
2. **Walk-in tablet**: `createWalkInProfile` in `src/lib/check-in/actions.ts:445-518`, gate `requireStaff()` (admin, trainer, of tablet-PIN). Gebruikt `admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { first_name, last_name, phone } })` (regel 486-494), dedupet vooraf op telefoon (regel 470-477), valt bij ontbrekende e-mail terug op een synthetisch adres `walkin-<laatste 8 telefooncijfers>@walkin.tmc.internal`, en update daarna het door de trigger gemaakte profiel. Dit is het directe precedent voor PR B.
3. **Trainer-invite**: `inviteTrainer` in `src/lib/admin/trainer-actions.ts:331-434`, gate `requireAdmin()`. Gebruikt `admin.auth.admin.inviteUserByEmail(email, { data: { first_name, last_name } })` (regel 352-355), zet daarna `role: 'trainer'` op het profiel.

**Vangnet**: `ensureProfile` (`src/lib/supabase/ensure-profile.ts:21-59`, aangeroepen op elke ingelogde `/app`-page-load via `src/app/app/layout.tsx:57`) doet een service-role upsert met `ignoreDuplicates: true` en synct profielnamen terug naar `auth.users.user_metadata`. Kanttekening: het insert-pad van dit vangnet zou in de praktijk stuklopen op `member_code NOT NULL` (geen default, en de upsert geeft geen member_code mee); het werkt alleen als de trigger het profiel al maakte. Voor PR B geen probleem zolang de aanmaak via `auth.admin.createUser` loopt (trigger vuurt dan gewoon).

Live datacheck: 20 profielen, 20 auth-users, 1-op-1, nul dubbele e-mails (case-insensitief).

## 2. DE KERNVRAAG: wat gebeurt er bij latere OTP-login op hetzelfde adres

**Antwoord: er ontstaat EEN samenvallend account, geen twee.** Het mechanisme, stap voor stap:

1. Marlon maakt via `auth.admin.createUser` een auth-user met e-mail X. E-mail is uniek op auth-niveau, live geverifieerd:
   ```
   users_email_partial_key: CREATE UNIQUE INDEX ... ON auth.users (email) WHERE (is_sso_user = false)
   ```
2. De trigger maakt het profiel onder datzelfde `id`, met naam en member_code.
3. De klant gaat later naar `/login` en vraagt een OTP-code aan voor X. GoTrue zoekt op e-mail, vindt de BESTAANDE user (uniek index), en stuurt de code naar X. Er wordt geen tweede user aangemaakt; `shouldCreateUser: true` is alleen relevant als het adres onbekend is.
4. De klant verifieert de code (`verifyLoginOtp`, `src/lib/actions/auth.ts:104-108`) en krijgt een sessie voor HETZELFDE `auth.users.id`, dus hetzelfde profiel, dezelfde orders, memberships en betaalhistorie.
5. De attributie-metadata in `signInWithOtp options.data` wordt door GoTrue alleen bij aanmaak toegepast; op een bestaande user verandert die niets. De trigger vuurt niet (geen nieuwe insert). `ensureProfile` no-opt (`ignoreDuplicates: true`) en back-fillt hooguit de door Marlon ingevoerde naam naar de auth-metadata. Niets overschrijft wat Marlon aanmaakte.

De convergentie is dus het ingebouwde gedrag, geen toeval: hij volgt uit (a) de FK die profiel-id aan auth-id gelijkstelt, (b) de e-mail-uniciteit op auth-niveau, en (c) de idempotente trigger en het idempotente vangnet.

**De echte risico's zitten er omheen:**

- **Typo-overname (het gevaarlijkste pad)**: typt Marlon per ongeluk het adres van iemand ANDERS (bestaand, verkeerd gespeld naar een echt mailadres van een derde), dan kan die derde via OTP inloggen en bezit die het profiel, inclusief order, betaallink en later membership en betaalhistorie van de walk-in-klant. Dit is geen aanval maar een invoerfout; de OTP-flow doet dan precies wat hij moet doen voor de verkeerde persoon. Mitigatie in punt 7.
- **Split-brain bij afwijkende spelling**: logt de klant later in met een NET ANDER adres (jan@ vs jan.jansen@), dan maakt `shouldCreateUser: true` stilletjes een tweede, leeg account. Geen overname en geen dataverlies, maar de klant ziet zijn tegoed en historie niet. Zoeken-eerst in de wizard verkleint de kans dat Marlon de duplicaat-kant veroorzaakt; de klant-kant is inherent aan het gecombineerde login/signup-entrypoint.
- **Pre-creatie zelf voegt geen aanvalsvector toe**: het aangemaakte account heeft geen wachtwoord en is uitsluitend te betreden door mailbox-bezit te bewijzen via OTP. Wie de mailbox niet heeft, komt er niet in.
- **Herstel-pad bij een typo is e-mail-correctie, niet verwijderen**: `orders.profile_id` heeft een FK ZONDER cascade (live geverifieerd: `FOREIGN KEY (profile_id) REFERENCES tmc.profiles(id)`, geen ON DELETE-clausule). Een profiel met een order kan dus niet hard verwijderd worden; het bestaande `deleteMember`-pad (`src/lib/admin/member-actions.ts:439-533`, `auth.admin.deleteUser`) zou daarop stuklopen. Correctie = `auth.admin.updateUserById` (e-mail) plus `profiles.email`-update.

## 3. Bestaande admin-paden voor klant-aanmaak

Er is GEEN generiek admin-pad om een gewone klant aan te maken. Volledige lijst `auth.admin.*`-aanroepen in de codebase (grep, compleet):

| Plek | Aanroep | Gate |
|---|---|---|
| `src/lib/check-in/actions.ts:486` | `createUser` (walk-in) | `requireStaff()` (admin/trainer/tablet-PIN) |
| `src/lib/admin/trainer-actions.ts:353` | `inviteUserByEmail` (trainer) | `requireAdmin()` |
| `src/lib/admin/member-actions.ts:524` | `deleteUser` (lid verwijderen) | `requireAdmin()` |
| `ensure-profile.ts:48`, `actions/profile.ts:84` | `updateUserById` (naam-sync) | server-side vangnet |

Geen `generateLink` in de hele codebase, geen andere `createUser` dan de walk-in.

De guards zelf: `requireAdmin` (`src/lib/admin/require-admin.ts:13-31`) eist role `admin` via de sessie-client; `requireStaff` (`src/lib/check-in/actions.ts:821-843`) accepteert ook `trainer` en heeft een tablet-PIN-fallback waarbij `userId` null is. De DB-kant gate is `tmc.is_admin()` -> `tmc.current_user_role() = 'admin'` (leest `profiles.role` op `auth.uid()`, SECURITY DEFINER, beide live opgehaald).

`admin_create_order` (live opgehaald, zie punt 6 voor de eisen) heeft precies een TS-caller: `createPaymentRequest` in `src/lib/admin/payment-request-actions.ts:70-186` (PR A). Die eist een BESTAAND `profileId`; het commentaar op regel 13 zegt letterlijk dat on-behalf aanmaken PR B is. Belangrijk voor de planning: `createPaymentRequest` is nog nergens vanuit de UI aangeroepen; er is momenteel geen enkel admin-scherm dat een betaalverzoek kan sturen. PR B (aanmaak plus zoeken) en PR C (wizard-UI) vullen samen dat gat.

## 4. Klant zoeken

Twee bestaande zoekpaden, beide bruikbaar als precedent:

- **Admin-ledenlijst**: `listMembers` in `src/lib/admin/members-query.ts:142-315`. Service-role client (geen RLS), `ilike`-OR op `first_name`/`last_name`/`email` met een geescaped LIKE-patroon (`likePattern`, regel 72-74), gefilterd op `role = 'member'`, met memberships-join. Dit voedt `/app/admin/leden`.
- **Tablet-zoek**: `searchProfiles` in `src/lib/check-in/admin-queries.ts:48-65`, zelfde `ilike`-OR, limit 20.

Daarnaast staat RLS het ook direct toe: policy `profiles_admin_all` (ALL, using en check `tmc.is_admin()`, live geverifieerd) betekent dat een admin-SESSIE de profielen ook zonder service-role kan doorzoeken. De wizard kan dus kiezen; het bestaande precedent (listMembers, na een `requireAdmin`-gate) is service-role, en dat is ook wat PR C waarschijnlijk hergebruikt.

Voor dubbele treffers en tikfouten:

- De beslissende check hoort exact te zijn op genormaliseerde e-mail (trim, lowercase). `profiles_email_idx` (non-uniek, btree) ondersteunt dat. GoTrue normaliseert e-mail zelf naar lowercase bij aanmaak, dus profielen die via de normale flow ontstonden zijn al lowercase.
- De UI-zoek hoort breed te zijn (`ilike` op naam en e-mail, zoals `listMembers`) en de treffers te tonen VOORDAT "nieuwe klant aanmaken" beschikbaar wordt. Dat vangt de spelvariant-tikfout (jan@ vs jan.jansen@) af op het moment dat het nog een klik is in plaats van een tweede account.
- Let op een subtiel verschil met `listMembers`: die filtert op `role = 'member'`. De wizard-zoek moet dat filter waarschijnlijk NIET hebben (een trainer kan ook iets kopen), of er bewust voor kiezen; dat is een PR C-beslissing.

## 5. Duplicaat-preventie

Live geverifieerde constraints op `tmc.profiles`:

```
profiles_phone_unique:          UNIQUE (phone)
profiles_phone_e164_nl:         CHECK (phone ~ '^\+31[0-9]{9}$')
profiles_member_code_unique:    UNIQUE (member_code)
profiles_member_code_format:    CHECK (member_code ~ '^[0-9]{6}$')
profiles_mollie_customer_id_key: UNIQUE (mollie_customer_id)
profiles_role_check, profiles_age_category_check
```

**E-mail is op profielniveau NIET uniek** (`email` is NOT NULL maar heeft alleen een non-unieke index). De feitelijke uniciteit komt van de auth-laag: `users_email_partial_key` (uniek op `auth.users.email` waar `is_sso_user = false`). Zolang aanmaak via `auth.admin.createUser` loopt, is een stille duplicaat op e-mail onmogelijk: een tweede create op hetzelfde adres faalt hard met "email address already registered". Dat is tegelijk het vangnet tegen de race (twee admins, of admin en klant-zelf-signup, tegelijk): een van de twee wint, de ander krijgt de fout en moet die afvangen door opnieuw te zoeken en het bestaande profiel terug te geven.

Twee valkuilen:

- **Telefoon in de metadata is riskanter dan hij lijkt**: de trigger insert `phone` uit `raw_user_meta_data`. Botst die op `profiles_phone_unique` of faalt de E164-check, dan rolt de exception in de AFTER INSERT-trigger de HELE auth-user-aanmaak terug. De walk-in-flow dedupet daarom vooraf op telefoon. De wizard kan telefoon het beste weglaten (naam plus e-mail volstaan volgens de mockup) of vooraf checken en normaliseren.
- **Directe service-role inserts in profiles omzeilen de e-mail-uniciteit**: een insert die niet via de auth-laag loopt kan wel een tweede profiel met dezelfde e-mail maken (er is geen unieke constraint). Nog een reden waarom PR B via `auth.admin.createUser` moet lopen en niet via een eigen insert.

## 6. Minimale data voor een profiel dat een order plus betaallink kan dragen

Schema-verplicht (NOT NULL zonder default): `id`, `email`, `first_name`, `last_name`, `member_code`. De trigger levert `member_code` en coalescet ontbrekende namen naar lege strings; `age_category` (adult), `role` (member), `locale` (nl), `country` (NL), `marketing_opt_in` (false) hebben defaults.

Strikt technisch minimum is dus alleen een e-mailadres. Het praktische minimum voor de betaallink-keten is **voornaam, achternaam en e-mail**, want:

- `admin_create_order` eist alleen dat het profiel bestaat (`profile_not_found`-check, live definitie).
- De betaalverzoek-mail gebruikt `first_name` in de aanhef (`payment-request-actions.ts:151-154`).
- `/betaal/[token]` toont de voornaam.
- De Mollie-customer krijgt `first_name last_name` als naam en valt bij lege namen terug op het e-mailadres (`src/lib/orders/payment-link-core.ts:171-173`); werkt, maar een klant zonder naam in Mollie is rommelig.
- De betaallink-flow weigert een profiel zonder e-mail (`payment-link-core.ts:161-164`), dus het synthetische walk-in-adres (`@walkin.tmc.internal`) kan geen betaalverzoek per mail ontvangen. Voor de wizard: e-mail verplicht, echt adres.

Dit matcht de mockup: naam en e-mail volstaan om een betaallink te sturen.

## 7. Aanbevolen vorm (nog niet bouwen)

**Een TS server action, geen SQL RPC.** De doorslaggevende reden: het doelprofiel MOET aan een `auth.users`-rij hangen (FK, punt 1), en auth-users maak je uitsluitend via de GoTrue Admin API met de service-role. Een SECURITY DEFINER RPC kan geen auth-user aanmaken (direct inserten in `auth.users` is unsupported en gevaarlijk). De DB-kant heeft bovendien al zijn eigen gates: de trigger doet de profiel-insert, en `admin_create_order` gate't zelf op `tmc.is_admin()`. Er is dus geen nieuwe RPC nodig; alle bouwstenen bestaan.

Beoogde vorm, `findOrCreateCustomer` in `src/lib/admin/customer-actions.ts` (naamgeving conform `trainer-actions.ts`/`payment-request-actions.ts`):

1. **Gate**: `requireAdmin()`. Bewust NIET `requireStaff`: dat heeft een tablet-PIN-pad zonder persoonsgebonden `userId`, en dit raakt geldstromen. Zelfde dubbele-laag-gedachte als PR A: TS-gate hier, `tmc.is_admin()` in de RPC die erna komt.
2. **Normaliseer**: e-mail trimmen en lowercasen voor zowel zoeken als aanmaken.
3. **Zoek eerst, exact**: service-role select op `profiles` met genormaliseerde e-mail. Treffer: retourneer het bestaande profiel (id, naam, member_code) met een indicator "bestaand", zodat de wizard toont wie het is in plaats van een duplicaat te maken. Dit is stap (a) uit de vraagstelling.
4. **Anders aanmaken via de auth-laag** (stap b): `admin.auth.admin.createUser({ email, email_confirm: false, user_metadata: { first_name, last_name, signup_path: 'admin_wizard' } })`. De trigger maakt het profiel plus member_code; geen eigen profiel-insert. Het samenvallen met een latere OTP-login op datzelfde adres is daarmee automatisch geregeld (punt 2): zelfde auth-user, zelfde profiel, en `signInWithOtp` op een nog onbevestigde user is gewoon het standaard OTP-pad (de code-verificatie bevestigt het adres alsnog).
   - `email_confirm: false` in plaats van het walk-in-precedent `true`: Marlon heeft het adres niet geverifieerd, dus het als bevestigd markeren is onwaar. Functioneel maakt het voor OTP-login en de betaallink niets uit; laat de eerste echte OTP-verificatie het adres bevestigen. Als er in de bouw toch iets op unconfirmed blijkt te struikelen is `true` het gedocumenteerde walk-in-precedent om op terug te vallen.
   - `phone` weglaten (punt 5: een botsing in de trigger rolt de hele aanmaak terug).
5. **Race-afhandeling**: faalt `createUser` op "already registered", herhaal dan de zoekstap en retourneer het bestaande profiel. Daarmee is de action idempotent op e-mail, ook bij gelijktijdigheid met een zelf-signup van de klant.
6. **Audit**: `emitEvent member.created` met `actorType: 'admin'` en `payload.source: 'admin_wizard'` (walk-in-precedent gebruikt `source: 'walk_in'`, `check-in/actions.ts:508-515`).
7. **Account-overname-afhandeling, expliciet** (de vraag-2-risico's):
   - Convergentie is het ontwerp: aanmaak via de auth-laag garandeert dat de klant later op hetzelfde adres in HETZELFDE account belandt. Geen schaduwprofielen, geen merge nodig.
   - Typo-mitigatie: de wizard (PR C) toont een expliciete bevestigstap met het getypte adres voordat er iets wordt aangemaakt of gemaild; op aanmaakmoment bevat het profiel niets gevoeligs (naam plus e-mail); en het pre-created account is zonder mailbox-bezit niet te betreden.
   - Herstel-pad: e-mail corrigeren via `auth.admin.updateUserById` plus `profiles.email`-update; verwijderen kan niet meer zodra er een order hangt (FK zonder cascade, punt 2). Dit herstel-pad hoeft geen UI te krijgen in PR B, maar het bestaan ervan hoort in de PR-beschrijving zodat een typo geen paniek-delete uitlokt.
   - Split-brain (klant logt later met ander adres in) is niet door PR B op te lossen; zoeken-eerst in de wizard beperkt de admin-kant, een eventuele merge-werkstroom is bewust buiten scope.
8. **Zoek-action voor de wizard** (zelfde PR of PR C): `ilike`-OR op naam en e-mail conform `listMembers`, met het geescapete LIKE-patroon, ZONDER het `role = 'member'`-filter tenzij bewust gekozen, limit circa 20. Resultaten tonen voordat "nieuwe klant aanmaken" vrijkomt.

Wat PR B bewust NIET doet: geen wijziging aan `admin_create_order` (eist al een bestaand profiel en gate't zelf), geen migratie (er is geen schemawijziging nodig; alle constraints en de trigger staan er al), geen e-mail-uniekheidsconstraint op `profiles` toevoegen (de auth-laag dwingt het af zolang aanmaak daar doorheen loopt; een constraint achteraf is een aparte afweging wegens bestaande data en de walk-in-synthetics), geen wachtwoord- of invite-mail (de betaalverzoek-mail uit PR A is het eerste contactmoment; een aparte invite-mail zou verwarren).

---

## Live geverifieerde objecten

Via mcp execute_sql tegen het echte project, 2026-07-11:

- `tmc.handle_new_auth_user()` (pg_get_functiondef): member_code-loop, insert uit raw_user_meta_data, ON CONFLICT (id) DO NOTHING.
- Trigger `on_auth_user_created` AFTER INSERT ON auth.users (pg_get_triggerdef).
- `tmc.admin_create_order(...)` (pg_get_functiondef): is_admin-gate, profile_not_found-check, prijsberekening via `tmc._compute_order_price`, token plus expiry geklemd op 1 tot 14 dagen.
- `tmc.is_admin()` en `tmc.current_user_role()` (pg_get_functiondef).
- Constraints en indexen op `tmc.profiles` (pg_constraint, pg_indexes): FK naar auth.users met cascade, phone/member_code/mollie_customer_id uniek, e-mail NIET uniek, E164- en formaat-checks.
- `users_email_partial_key` op `auth.users` (pg_indexes, alleen gelezen).
- RLS-policies op `tmc.profiles` (pg_policy): profiles_admin_all, profiles_self_select, profiles_self_update, profiles_trainer_read_relevant.
- Alle FK's die naar `tmc.profiles` wijzen, inclusief `orders.profile_id` zonder cascade.
- Volledige functielijst schema tmc: er bestaat geen profiel-aanmaak-RPC.
- Datacheck: 20 profielen, 20 auth-users, 0 dubbele e-mails.

Code-referenties (huidige main): `LoginForm.tsx:61-73`, `IdentifyStage.tsx:42-55`, `actions/auth.ts:104-108`, `auth/callback/route.ts`, `ensure-profile.ts:21-59`, `app/layout.tsx:57`, `check-in/actions.ts:445-518` en `:821-843`, `trainer-actions.ts:331-434`, `member-actions.ts:439-533`, `payment-request-actions.ts:13,70-186`, `members-query.ts:72-74,142-315`, `check-in/admin-queries.ts:48-65`, `payment-link-core.ts:161-179`, `spec-otp-login.md:75`.

## Vaste afsluitstap voor de uiteindelijke PR B

Bij het afronden van de daadwerkelijke PR B (niet nu): de WS-ledger in `spec-membership-flow.md` bijwerken met de PR B-status (PR-nummer, merge-commit), geverifieerd tegen git, conform de vaste conventie van deze werkstroom.
