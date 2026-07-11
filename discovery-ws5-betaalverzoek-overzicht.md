# Discovery: admin betaalverzoek-overzicht (WS-5 vervolg-PR)

Datum: 2026-07-11. Discovery-only, geen code, geen writes. Live DB-definities opgehaald via `pg_get_functiondef` en catalog-queries op het echte project (schema `tmc`); repo-verwijzingen geverifieerd op de huidige `main` (PR C, merge `9a400c2`, zit erin).

Doel: een admin-scherm onder `/app/admin/betaalverzoeken` (of subroute) dat de door Marlon via de wizard aangemaakte betaalverzoeken toont met betaalstatus, plus acties: opnieuw versturen (zelfde adres), opnieuw versturen (ander adres) en annuleren van openstaande verzoeken. Scope: alleen `created_by = 'admin'`, niet de self-service orders. Verwijderen is uit scope; annuleren is een status-overgang, geen delete.

De WS-ledger (`spec-membership-flow.md`, sectie "WS-ledger (huidige staat)") noemt dit overzicht al expliciet als openstaande vervolg-PR onder WS-5 PR C: "betaalverzoek-overzicht als aparte vervolg-PR (lezen + statusfilter + opnieuw versturen + annuleren-van-openstaande met betaling-wint, geen verwijderen)".

---

## 1. Order-statussen en wat "betaald" betekent

**Statusdomein (live constraint):**

```sql
-- pg_get_constraintdef, tmc.orders
orders_status_check: CHECK (status = ANY (ARRAY['draft','pending','paid','activated','expired','cancelled']))
```

Betekenis per status, afgeleid uit de live functies en de code:

| Status | Betekenis | Wie zet hem |
|---|---|---|
| `draft` | Verzoek aangemaakt, klant heeft de checkout nog niet gestart. De betaallink is al geldig. | `tmc.admin_create_order` (insert, live def: `'admin', v_admin_uid, 'draft', now() + make_interval(days => v_expires_days)`) |
| `pending` | Klant heeft op de link geklikt, er staat een Mollie-payment open. | `markOrderPending` in `src/lib/orders/payment-link.ts:64-76`, guarded `.in("status", ["draft","pending"])` |
| `paid` | Geld is binnen maar activatie is geblokkeerd (`blocked_reason` = `duplicate_membership` of `product_not_supported`). Ops-signaal: refund of tegoed regelen. | `tmc.activate_order` (blocked-takken) |
| `activated` | Betaald en membership aangemaakt. Dit is de normale "betaald"-eindtoestand. `paid_at` en `activated_at` gezet. | `tmc.activate_order` (succes-tak) |
| `expired` | `expires_at` verstreken zonder betaling. Puur opruimen: een late betaling wordt daarna nog steeds gehonoreerd. | Cron `src/app/api/cron/expire-orders/route.ts:27-32` (`draft`/`pending` waar `expires_at < now`) |
| `cancelled` | Afgebroken. Wordt vandaag alleen gezet door `abandonOrder` in de self-service flow (`src/lib/orders/create-order.ts:65-76`); er bestaat nog geen admin-annuleeractie en geen DB-functie ervoor. | (nog) alleen `abandonOrder` |

**Hoe de Mollie-webhook de status omzet** (`src/app/api/mollie/webhook/route.ts:228-353`): alleen bij `payment.status === 'paid'` roept de webhook `tmc.activate_order(p_order_id, p_mollie_payment_id)` aan (regel 243-246). Bij failed/expired/canceled aan Mollie-kant blijft de order gewoon `pending` staan (regel 234-241, alleen een ntfy-waarschuwing) en is hij opnieuw betaalbaar tot `expires_at`.

`tmc.activate_order` (live via `pg_get_functiondef`), de relevante statuslogica:

```sql
select * into v_order from tmc.orders where id = p_order_id for update;   -- rijlock
...
if v_order.status = 'activated' then
  return ... 'already_activated', true ...;                              -- idempotent
if v_order.status not in ('pending', 'expired') then
  return jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_order.status);
...
-- subscription met bestaand membership: geld binnen, geen tweede mandaat
update tmc.orders set status = 'paid', paid_at = v_now, blocked_reason = 'duplicate_membership' ...
...
update tmc.orders set status = 'activated', paid_at = coalesce(paid_at, v_now), activated_at = v_now, membership_id = v_membership_id ...
```

Let op drie dingen die het overzicht moet weten:

1. `activate_order` accepteert bewust ook `expired` (late betaling wint; return bevat `late_payment: true`, webhook ntfy't "Order geactiveerd na verlopen deadline", `route.ts:278-284`). Een `expired` order is dus niet dood, alleen opgeruimd.
2. `cancelled` valt in `invalid_status`: de webhook logt dan "Order-activatie geweigerd, handmatig naklopen" (`route.ts:258-276`) en de order blijft `cancelled` terwijl het geld binnen is. Dit is het gat waar vraag 6 over gaat.
3. `paid` is geen succes-status maar een geblokkeerd-betaald-status. Het overzicht moet hem tonen als "betaald, actie nodig" met `blocked_reason`, niet als gewoon betaald.

**Betrouwbare lees-mapping voor het overzicht:**

- Betaald: `status in ('activated', 'paid')`, waarbij `paid` een waarschuwingsbadge krijgt (`blocked_reason`).
- Wacht op betaling: `status in ('draft', 'pending')` en `expires_at > now()`. (`draft`/`pending` met verstreken `expires_at` bestaat kortstondig tussen twee cron-runs; toon die als "verlopen" op basis van `expires_at`, zoals `/betaal/[token]/page.tsx:60-98` ook doet.)
- Verlopen: `status = 'expired'` of (`draft`/`pending` en `expires_at <= now()`).
- Geannuleerd: `status = 'cancelled'`.

De index `orders_status_expires_idx (status, expires_at)` bestaat al en past precies op dit filter.

## 2. Admin-filter

Het exacte filter is `created_by = 'admin'`. Bevestigd uit de live constraints:

```sql
orders_created_by_check:      CHECK (created_by = ANY (ARRAY['self','admin']))
orders_admin_provenance_check: CHECK ((created_by = 'admin') = (created_by_profile_id IS NOT NULL))
```

Er is geen `source`-kolom op `tmc.orders` (het begrip `admin_manual`/`walk_in`/`direct` leeft op `memberships.source` en op events, niet op orders). `tmc.create_order` (self-service) insert `'self'`; `tmc.admin_create_order` insert `'admin'` plus `created_by_profile_id = auth.uid()` van de admin. De provenance-check garandeert dat `created_by_profile_id` bij admin-orders altijd gevuld is, dus het overzicht kan ook tonen welke admin het verzoek maakte.

## 3. Beschikbare gegevens per verzoek

Alles wat de lijst nodig heeft bestaat al; er hoeft geen kolom bij:

| Lijstveld | Bron |
|---|---|
| Klant (naam, e-mail) | `tmc.profiles.first_name / last_name / email` via `orders.profile_id` |
| Product | `orders.catalogue_slug`, display-naam via `tmc.catalogue.display_name` (zelfde join als `payment-request-actions.ts:134-138`) |
| Bedrag | `orders.first_charge_cents` (eerste incasso) en `recurring_cents` (bij abonnement) |
| Status | `orders.status` + `blocked_reason` (mapping uit punt 1) |
| Aanmaakdatum | `orders.created_at` |
| Geldig tot | `orders.expires_at` |
| Betaling binnen | `orders.paid_at` / `activated_at`; detail via `tmc.payments` (kolommen `order_id`, `status`, `amount_cents`, `paid_at`, `mollie_payment_id`; `payments_order_id_fkey` bestaat) |
| Betaallink | `orders.token` (uniek, `orders_token_key`), link = `${siteUrl()}/betaal/${token}` |
| Aangemaakt door | `orders.created_by_profile_id` |

Wat er NIET is: een `recipient_email`, `sent_at` of resend-teller op de order. De mail ging naar `profiles.email` op het moment van versturen en dat is nergens vastgelegd (wel is er een `order.created`-event in `tmc.events`, `payment-request-actions.ts:110-123`). Voor audit van resends kan een `order.payment_request_resent`-event dezelfde vorm volgen; een kolom is niet nodig.

Toegang: RLS-policy `orders_admin_all` (`USING tmc.is_admin()`) plus SELECT-grant voor `authenticated` maakt lezen via de user-client mogelijk; schrijven kan alleen via SECURITY DEFINER RPC's of service-role (authenticated heeft geen INSERT/UPDATE/DELETE-grant, live geverifieerd). Voor de lijst-query is `src/lib/admin/members-query.ts` het bestaande patroon (paginated admin read), en `src/app/app/admin/leden/` de UI-referentie voor lijst + filter + rij-acties.

## 4. Opnieuw versturen (zelfde adres)

Sluit vrijwel naadloos aan. De bestaande machinerie:

- Template: `src/emails/payment_request.tsx` (props `firstName, itemLabel, amountEuro, recurringEuro, payUrl, expiresAtLabel`).
- Verzending: generieke `sendEmail` uit `src/lib/email` (logt-en-slikt fouten zelf).
- Adres en naam: live uit `profiles.email` / `first_name` (`payment-request-actions.ts:128-151`).
- Link: `${siteUrl()}/betaal/${order.token}` (`payment-request-actions.ts:108`).

**Opnieuw versturen mint geen nieuwe order.** Dat is geverifieerd op twee niveaus: (a) de token staat als kolom op de order (`token uuid default gen_random_uuid() unique`) en verandert nooit na insert; geen enkele bestaande code muteert hem; (b) de enige plek die orders aanmaakt zijn de RPC's `create_order` en `admin_create_order`, en een resend hoeft die niet aan te raken. Een resend is dus letterlijk: order + profiel + catalogusnaam lezen, `sendEmail` met de bestaande `payUrl` en de bestaande `expires_at`.

Wel moet er een kleine nieuwe server action komen (`resendPaymentRequest(orderId)` of vergelijkbaar), want `createPaymentRequest` maakt altijd eerst een order aan; er is geen los verzendpad. De action is een compositie van bestaande stukken: `requireAdmin` + lees order (check `created_by = 'admin'` en status `draft`/`pending` met `expires_at > now()`) + zelfde mail-blok. Puur lezen plus een e-mail, geen order-write.

Randgeval: een `expired` order opnieuw versturen heeft weinig zin zonder verlenging, want `/betaal/[token]` toont dan "link verlopen" en `startCheckoutCore` weigert (`payment-link-core.ts`, expired-guard), ook al zou een late betaling technisch nog gehonoreerd worden. "Verleng geldigheid" (alleen `expires_at` vooruitzetten op een `draft`/`pending`/`expired`-order, met terugzet naar `pending`/`draft`) is denkbaar maar een order-write en dus voor de gevoelige PR, of gewoon buiten scope: het bestaande antwoord op verlopen is een nieuw verzoek maken via de wizard.

## 5. De gevoelige vraag: opnieuw versturen naar een ANDER adres

**Het antwoord: de mail gaat naar het profiel-e-mailadres.** Er is geen apart bezorgadres op de order; `tmc.orders` heeft geen enkel e-mailveld (kolommenlijst live geverifieerd) en `createPaymentRequest` leest het adres op verzendmoment uit `profiles.email` (`payment-request-actions.ts:128-151`). "Een ander adres" is dus per definitie geen simpele bezorg-wijziging; het is ofwel een profiel-e-mailwijziging, ofwel het bewust mailen van andermans betaallink.

**Wat er nu zou gebeuren als je de link naar een ander adres stuurt:** de order verschuift NIET naar een andere klant. De koppeling is `orders.profile_id`, en die wordt nergens in de betaalflow herzien: `/betaal/[token]` is loginloos (token is de enige poort), `startCheckoutCore` haalt het profiel op via `order.profile_id` (`payment-link.ts:43-49`), en `activate_order` maakt het membership aan op `v_order.profile_id`. Wie de link ook betaalt, het resultaat is een actief membership (met SEPA-mandaat en Mollie-customer) op naam van de oorspronkelijke klant. De ontvanger van de mail ziet bovendien de voornaam en het bedrag van de oorspronkelijke klant.

Daaruit volgen de twee scenario's:

1. **Het adres op het profiel was fout (typefout), de klant is dezelfde persoon.** De juiste fix is het profiel-e-mailadres corrigeren, en dat raakt exact de PR B-regels (gedocumenteerd in de headers van `src/lib/admin/customer-core.ts:1-28` en `customer-actions.ts:13-34`): e-mail-uniciteit leeft op `auth.users` (partial unique index), niet op `tmc.profiles` (niet uniek). Corrigeren moet dus via `auth.admin.updateUserById` (of equivalent) zodat auth en profiel synchroon blijven, anders gaat de magic-link-login naar het oude adres terwijl de betaalmail naar het nieuwe gaat. En vooraf zoek-eerst: als het gecorrigeerde adres al bij een ANDER bestaand auth-account hoort, mag de wijziging niet doorgaan. Stilzwijgend "de order omhangen naar het gevonden profiel" is het account-overname-risico uit PR B: je koppelt een order, en na betaling een membership plus betaalgeschiedenis, aan een account waarvan niet vaststaat dat de betalende klant het bezit of beheert.
2. **Het is echt een andere klant.** Dan is het juiste pad niet versturen-naar-ander-adres maar: dit verzoek annuleren en via de bestaande wizard (met de PR B `findOrCreateCustomer`-flow) een nieuw verzoek voor de juiste klant maken. De wizard kan dat al.

Aanbeveling: bouw "opnieuw versturen naar een ander adres" NIET als vrij invoerveld op het overzicht. Bied twee expliciete routes: "corrigeer het e-mailadres van deze klant" (profiel-e-mailwijziging met volledige PR B-zorg: dubbele invoer, zoek-eerst, weigeren bij bestaand ander account, auth-niveau-update, audit-event) gevolgd door een gewone resend; en "annuleer en maak een nieuw verzoek" voor het andere-klant-geval. Beide horen in de Fable-PR (punt 7).

## 6. Annuleren en de race met een gelijktijdige betaling

**Wat er al is:** de status `cancelled` zit in de CHECK-constraint en `abandonOrder` (`create-order.ts:65-76`) toont het veilige update-patroon: `update ... set status='cancelled' ... .in("status", ["draft","pending"])`. Er bestaat geen `cancel_order`-DB-functie (live geverifieerd: geen enkele tmc-functie matcht `%cancel%` behalve booking/membership-cancels) en geen admin-annuleeractie.

**Wat de bestaande constraints al afdwingen, en wat niet.** De race heeft twee vensters:

1. **DB-venster (annuleren vs. webhook-activatie, gelijktijdig).** `activate_order` neemt een `for update`-rijlock. Een guarded UPDATE zoals hierboven wacht op diezelfde rijlock. Wint de activatie: status wordt `activated` (of `paid`), de WHERE van de annuleer-update matcht niet meer, 0 rijen, annuleren verliest. Correct. Wint de annulering: zie venster 2.
2. **Mollie-venster (klant heeft betaald, webhook is nog onderweg).** De order staat in de DB nog op `pending`, dus de guarded annulering slaagt. Daarna komt de webhook: `activate_order` ziet `cancelled`, valt in `invalid_status`, en het eindresultaat is geld binnen op een order die `cancelled` blijft. De webhook ntfy't wel ("Order-activatie geweigerd, handmatig naklopen", `route.ts:258-276`) en de payment-rij staat in `tmc.payments` (upsert gebeurt vóór de order-tak, `route.ts:99-156`), maar de harde eis "annuleren mag nooit een betaalde order dood verklaren" wordt hier geschonden: de betaling verliest.

Een annuleer-actie heeft dus een expliciete guard nodig; de bestaande constraints dekken alleen venster 1. Voorstel voor de Fable-PR, twee lagen:

- **Nieuwe SECURITY DEFINER RPC `tmc.admin_cancel_order(p_order_id)`** naar het patroon van `admin_create_order`: `tmc.is_admin()`-gate, `select ... for update`, alleen annuleren als `created_by = 'admin'` en `status in ('draft','pending')` EN er geen paid payment aan de order hangt (`not exists (select 1 from tmc.payments where order_id = ... and status = 'paid')`), anders `{ok:false, reason:...}`. De rijlock serialiseert tegen `activate_order`. Nieuwe migratie; `20260503` blijft onaangeraakt. Bonus: annuleren maakt het slot in `orders_one_open_subscription_idx` vrij (die index dekt alleen `draft`/`pending`), dus direct daarna een nieuw verzoek voor dezelfde klant maken werkt.
- **Betaling-wint-sluitstuk: breid `activate_order` uit zodat `cancelled` net als `expired` gehonoreerd wordt** (`if v_order.status not in ('pending','expired','cancelled')`, met een eigen marker in de return zodat de webhook kan melden "betaling kwam binnen op een geannuleerd verzoek en is alsnog gehonoreerd"). Daarmee verliest annuleren de race per constructie, ook in het Mollie-venster: het ergste dat annuleren dan kan doen is een order annuleren die een seconde later alsnog geactiveerd wordt. Zonder deze uitbreiding blijft het Mollie-venster een handmatig-naklopen-gat. Optioneel daarbovenop, geen vervanging: in de TS-wrapper vóór het annuleren de openstaande Mollie-payment live checken (`orders.mollie_payment_id`) en zo mogelijk cancellen, zodat de klant niet betaalt op een net geannuleerd verzoek.
- De `/betaal/[token]`-kant is al goed: een `cancelled` order geeft `notFound()` op de pagina en `not_found` in `startCheckoutCore` (`payment-link-core.ts:113-134`), dus na annulering kan er geen NIEUWE checkout meer starten; alleen een al gestarte betaling kan nog binnenkomen.

Verwijderen is uit scope en dat klopt ook met de DB-realiteit: `payments_order_id_fkey` heeft geen ON DELETE-gedrag, dus een delete op een order met payments zou sowieso stuklopen.

## 7. Aanbevolen opdeling

**PR 1, Sonnet-veilig (puur lezen + resend zelfde adres):**

- Lijstpagina onder `/app/admin/betaalverzoeken` (bestaande wizard-route krijgt een lijst-tab of subroute), filter `created_by = 'admin'`, statusfilter en verloop-sortering op `orders_status_expires_idx`, patroon van `members-query.ts` + `admin/leden/`.
- Status-mapping uit punt 1 inclusief `paid`-met-`blocked_reason`-waarschuwing en de "verlopen op klok, nog niet op status"-nuance.
- Kopieer-link-knop (token staat al op de order, zelfde UI-idee als `VerstuurStap`).
- `resendPaymentRequest(orderId)`: alleen `created_by='admin'`, status `draft`/`pending`, `expires_at > now()`; mail naar `profiles.email` met bestaande token en `expires_at`; `order.payment_request_resent`-event voor audit. Geen enkele order-write.
- Sidebar-item in `AdminSidebar.tsx`.

**PR 2, Fable-zorg (de schrijvende en PR B-gevoelige kant):**

- `tmc.admin_cancel_order` RPC (migratie) + annuleerknop met bevestiging, guard zoals in punt 6.
- `activate_order`-uitbreiding: betaling wint ook van `cancelled` (migratie, zelfde PR als de RPC zodat de invariant nooit half live staat) + webhook-melding voor dat pad.
- "Ander adres": geen vrij bezorgveld, maar de twee expliciete routes uit punt 5: profiel-e-mailcorrectie met PR B-machinerie (zoek-eerst, weigeren bij bestaand ander account, auth-niveau-update via de `customer-core`-aanpak, audit-event) gevolgd door resend; en "annuleer + nieuw verzoek via de wizard" voor het andere-klant-geval.
- Optioneel: "verleng geldigheid" voor verlopen verzoeken (kleine order-write, zelfde PR).

Deze snede houdt PR 1 volledig vrij van order-mutaties en van alles wat auth of geld raakt, terwijl PR 2 de twee invarianten bewaakt die er echt toe doen: betaling wint altijd van annulering, en een betaallink verhuist nooit stilzwijgend naar een ander account.

Na de bouw van de uiteindelijke PR('s): WS-ledger in `spec-membership-flow.md` bijwerken (dit overzicht staat daar als openstaand punt onder WS-5 PR C).

---

## Bewijs-index

- Live via `pg_get_functiondef`: `tmc.admin_create_order`, `tmc.create_order`, `tmc.activate_order`, `tmc._compute_order_price`, `tmc.is_admin`.
- Live catalog-queries: kolommen `tmc.orders` (geen e-mailveld, wel `token`, `expires_at`, `created_by`, `created_by_profile_id`, `blocked_reason`), alle CHECK/UNIQUE-constraints op `orders` en `payments`, indexes (`orders_status_expires_idx`, `orders_one_open_subscription_idx`, `orders_paid_blocked_idx`), RLS-policies (`orders_admin_all`, `orders_self_read`), grants (authenticated: alleen SELECT), triggers (alleen `touch_updated_at`). Geen pg_cron in de database; expiry loopt via de Vercel-cron-route.
- Repo: `src/lib/admin/payment-request-actions.ts` (order-aanmaak via RPC r.70-101, payUrl r.108, mail naar `profiles.email` r.128-165), `src/lib/orders/payment-link.ts` (`markOrderPending` r.64-76, profiel-lookup via `order.profile_id` r.43-49), `src/lib/orders/payment-link-core.ts` (statusguards checkout), `src/lib/orders/create-order.ts` (`abandonOrder` r.65-76), `src/app/api/mollie/webhook/route.ts` (order-tak r.228-353, `invalid_status`-afhandeling r.258-276), `src/app/api/cron/expire-orders/route.ts` (sweep r.27-32, admin-ntfy r.39-46), `src/app/betaal/[token]/page.tsx` (ViewState-mapping r.34-98), `src/lib/admin/customer-core.ts` en `customer-actions.ts` (PR B e-mail-uniciteit en zoek-eerst), `src/lib/admin/members-query.ts` en `src/app/app/admin/leden/` (lijst-patronen), `src/app/app/admin/betaalverzoeken/` (wizard, PR C), `spec-membership-flow.md` (WS-ledger).
