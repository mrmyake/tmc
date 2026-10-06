# Spec: e-mailaanmeldingen in de admin-cockpit

Admin-pagina `/app/admin/aanmeldingen` (alleen admins) met alle e-mailadressen die zich via de site hebben aangemeld voor "blijf op de hoogte", Early Member-interesse en vergelijkbare formulieren, plus de leden met marketing opt-in. Een rij per uniek adres, met naam, bronnen, aanmelddatum en status. Alleen lezen.

## Doel

Marlon wil zonder in MailerLite in te loggen zien wie zich waar heeft aangemeld, of een adres nog actief is, en hoeveel nieuwe aanmeldingen er de laatste tijd zijn. De pagina is een leesvenster, geen tweede administratie: afmelden en mailen blijven in MailerLite.

## Databron: combinatie, lichte vorm (besluit Ilja, 2026-10-06)

Afgewogen in de discovery van 2026-10-06:

- **Live uit MailerLite (a)**: volledig voor alles wat de formulieren ooit stuurden, exacte afmeldstatus, al ontdubbeld per adres; wel een tiental API-calls per weergave en afhankelijk van MailerLite.
- **Eigen Supabase-tabel (b)**: elke lead-route zou een extra insert krijgen en afmeldingen zouden teruggesynct moeten worden; twee bronnen die uit elkaar kunnen lopen, en historie alleen via een eenmalige backfill.
- **Combinatie (c)**: MailerLite als bron voor aanmeldingen en status, aangevuld met de leden uit Supabase die in `/app/profiel` marketing opt-in hebben aangezet.

Gekozen: **c, lichte vorm**. Geen migratie, geen nieuw schrijfpad, geen MailerLite-key of service-role client in de browser.

**Opbouw (`src/lib/admin/email-signups-query.ts`, server-only).** `listGroups()` haalt alle groepen op; per groep met leden `listGroupSubscribers()` (per status, want de groepen-endpoint geeft zonder filter alleen actieve leden); daarna `listAllSubscribers()` (alle statussen) zodat ook adressen zonder groep meekomen. Alles wordt samengevoegd op lowercased, getrimd e-mailadres: naam uit `fields.name` plus `fields.last_name`, bronnen als de groepen waar het adres in zit, vroegste `subscribed_at` (terugval `created_at`), status van de subscriber. Dit MailerLite-deel staat vijf minuten in `unstable_cache` met tag `email-signups`; de knop "Verversen" (server action `refreshEmailSignups`, `requireAdmin()`) gooit die cache weg. Daarna uit Supabase (service-role) de profielen met `marketing_opt_in = true` en `is_test` niet true: bestaat het adres al, dan komt de bron "Lid, marketing opt-in" erbij; anders een eigen rij met status Actief en datum `first_touch_at` of `created_at`. Faalt MailerLite (getypeerde `MailerLiteError` uit `src/lib/mailerlite.ts`), dan toont de pagina een melding plus alleen de Supabase-rijen; een gegooide fout wordt niet gecachet.

**Bronnen en labels.** Op groepsnaam, omdat de ids per omgeving verschillen:

| MailerLite-groep | Label | Gevoed door |
|---|---|---|
| Early Member Interested | Blijf op de hoogte / Early Member | `InfoOptInBanner` (`/api/leads/info`) en `EarlyMemberOptInForm` (`/api/leads/early-member`); beide schrijven naar dezelfde groep en zijn niet te onderscheiden |
| Members | Leden | marketing opt-in op `/app/profiel` (spiegel van `profiles.marketing_opt_in`) |
| Yoga Wachtlijst | Yoga-wachtlijst | `YogaWaitlistForm` (`/api/leads/yoga-waitlist`) |
| Intake | 12-weken-programma intake | `/12-weken-programma/intake` (`/api/leads/programma-intake`) |
| Contact | Contactformulier | `ContactForm` (`/api/contact`) |
| Proefles | Proefles terugbellen | terugbelformulier op `/proefles` (`/api/proefles`; de aanvraag zelf staat in `tmc.trial_requests`) |
| Overstap | Overstap | overstapkaart op `/early-member` (`/api/leads/overstap`); zonder `MAILERLITE_OVERSTAP_GROUP_ID` komt het adres zonder groep binnen |
| PDF Lead, Mobility Check, Mobility Reset | ... (oude funnel) | restanten van de in PR #189 verwijderde lead-magnet-funnel; geen code schrijft er nog naartoe |
| Crowdfunding Backer | Crowdfunding | restant; de module is verwijderd in PR #120 |
| geen groep | Zonder groep | subscribers die in geen enkele groep zitten (bijvoorbeeld Overstap zonder groep-id, of handmatig toegevoegd) |
| n.v.t. | Lid, marketing opt-in | `tmc.profiles` met `marketing_opt_in = true` |

Een onbekende groep toont de eigen MailerLite-naam. Statuslabels: Actief, Afgemeld, Onbevestigd, Bounced, Junk. Afgemeld, bounced en junk zijn standaard verborgen; de toggle "Toon afgemeld" of een expliciet statusfilter toont ze.

**Pagina.** KPI's (actieve adressen, nieuw in de laatste 30 dagen op aanmelddatum, afgemeld), zoekveld op e-mail of naam, bronfilter, statusfilter, toggle, tabel met e-mail (mailto), naam, bronnen als chips, aangemeld op (dd-mm-jjjj, Europe/Amsterdam) en status; standaard gesorteerd op aanmelddatum, nieuwste eerst. Sidebar-item "Aanmeldingen". Filters als URL-params (`q`, `bron`, `status`, `afgemeld`).

## Bewust buiten de bron

- `tmc.trial_bookings`: proefles-boekingen zijn klanten, geen marketingaanmelding.
- `tmc.checkout_intents` en profielen zonder opt-in: de checkout heeft geen opt-in-vinkje en `marketing_opt_in` staat default op false.
- Operationele e-mailkolommen (`guest_bookings.guest_email`, `pt_sessions.prospect_email`, `invoices.bill_to_email`, `account_deletions.email_at_request`).
- De UTM-velden die `utmToMailerliteFields` meestuurt bestaan niet als custom field in de MailerLite-account en zijn dus nergens opgeslagen; de campagnebron per adres is niet beschikbaar. Buiten deze PR.
- `crowdfunding_backers` heeft nog table-grants voor `anon` en `authenticated` (RLS laat alleen de publieke wall-select toe); opruimwerk voor een aparte PR.

## Ledger

- **PR #275 (2026-10-06, e-mailaanmeldingen in de admin)**: branch `feat/admin-email-signups`, `github.com/mrmyake/tmc/pull/275`, GEMERGED met squash-commit `af0a2c8` (2026-10-06); Vercel-preview groen voor de merge, productie-deploy op de merge-commit groen (GitHub-status Vercel: success); geen migratie, geen `db push`. Fable. `src/lib/mailerlite.ts` (server-only; `MailerLiteError`, `listGroups`, `listGroupSubscribers`, `listAllSubscribers` met cursor- en paginanummer-paginatie), `src/lib/admin/email-signups-query.ts` (samenvoegen, cache met tag `email-signups`, KPI's, filters), `src/lib/admin/email-signups-actions.ts` (`refreshEmailSignups`), pagina `/app/admin/aanmeldingen` (page, loading, toolbar, tabel, chips, verversknop), sidebar-item. Bewust niet aangeraakt: de lead-routes, MailerLite custom fields, de grants van `crowdfunding_backers`, `trial_bookings` als bron.
