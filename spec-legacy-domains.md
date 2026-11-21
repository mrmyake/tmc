# spec-legacy-domains.md

Doorverwijzing van oude domeinen naar themovementclub.nl, met een schakelbare modus per domein.

---

## Doel

PT Loosdrecht bestaat niet meer. `ptloosdrecht.nl` draaide als WordPress-site op SiteGround met verouderde prijzen en concurreerde met TMC. Al het verkeer en alle SEO-waarde gaat permanent naar `https://www.themovementclub.nl`. `hormoonprofiel.com` krijgt in dezelfde configuratie een plek met modus `off`; de inhoudelijke afhandeling volgt in een aparte opdracht.

De redirect draait in `src/proxy.ts` (Next 16, Node-runtime) als eerste stap, vóór auth en de Supabase-client. De code staat in `src/lib/legacy-domains/`.

## Modi

| Modus | Response | Cache-Control | Betekenis |
|---|---|---|---|
| `redirect_permanent` | 308 naar de TMC-doel-URL | `public, max-age=3600` | Normale eindstand. Een uur cache, zodat omschakelen niet lang in browsercaches blijft hangen. |
| `redirect_temporary` | 307 naar de TMC-doel-URL | `no-store` | Voor een proefperiode of bij twijfel. |
| `off` | 404 met `X-Robots-Tag: noindex` | `no-store` | Geen redirect en nooit TMC-inhoud onder een oud domein. |

Standaardmodi in code: `ptloosdrecht.nl` is `redirect_permanent`, `hormoonprofiel.com` is `off`.

## Global Config-item

Store `tmc-legacy-domains` (Vercel Global Config, voorheen Edge Config), gekoppeld aan het project. Package `@vercel/global-config` leest `GLOBAL_CONFIG` en valt terug op `EDGE_CONFIG`. Item `legacy_domains`:

```json
{
  "ptloosdrecht.nl": "redirect_permanent",
  "hormoonprofiel.com": "off"
}
```

Toegestane waarden: `off`, `redirect_temporary`, `redirect_permanent`. Global Config bepaalt alleen de modus; de mapping staat in code.

## Fallbackgedrag

Bij een ontbrekende connection string, een leesfout (of timeout van 2 seconden), een ontbrekend item, een item dat geen object is, een ontbrekende waarde voor het domein of een ongeldige waarde: de standaardmodus uit code en een enkele `console.warn` met de reden. Zolang de store niet bestaat of niet gekoppeld is, gedraagt de code zich dus volgens de standaardmodi.

## Gedrag in het kort

- **Host:** lowercase, poort eraf, trailing dot eraf, `www.` eraf. Staat de host niet in het register, dan loopt de bestaande proxy-flow ongewijzigd door.
- **Pad voor matching:** decoderen, lowercase, dubbele slashes samenvoegen, trailing slash weg; de query string telt niet mee. Exact (en het sitemap-patroon) gaat voor prefix; de langste prefix wint; wat niet matcht valt terug op `/`.
- **Doel-URL:** altijd absoluut op `https://www.themovementclub.nl`, zonder trailing slash (behalve de root), plus `?utm_source=ptloosdrecht&utm_medium=redirect` (voor `hormoonprofiel.com`: `utm_source=hormoonprofiel`). Inkomende query strings worden niet doorgegeven. De technische bestanden (robots, sitemaps, favicon) krijgen geen UTM.
- **ACME:** `/.well-known/acme-challenge/*` op oude hosts wordt nooit afgevangen, in geen enkele modus.
- **Eén hop:** Next's ingebouwde trailing-slash-redirect draait vóór de proxy en zou op een oud domein een extra hop geven (`/kosten/` naar `/kosten` op het oude domein, dan pas naar TMC). `next.config.ts` zet die daarom uit (`skipTrailingSlashRedirect`) en herstelt exact dezelfde redirect expliciet voor alle niet-oude hosts (`missing`-conditie op host). Voor TMC-bezoekers verandert er niets.
- **Matcher:** twee items erbij in `src/proxy.ts`, een host-conditie voor de oude hosts en een header-conditie voor de testhook. TMC-assets en TMC-pagina's veroorzaken daardoor geen extra proxy-aanroepen.

## Testhook

Header `x-legacy-host-test: ptloosdrecht.nl` simuleert een oude host. Alleen actief als `VERCEL_ENV=preview` of `NODE_ENV=development`; op productie wordt de header genegeerd. Op een preview is de echte host TMC, dus de expliciete trailing-slash-redirect (alleen voor niet-oude hosts) grijpt bij `/pad/` eerder in. Dat is een artefact van de testhook; het controlescript slaat die variant daarom over met `--host-header`. Op de echte oude host is het één hop (unit-tests en de live-controle zonder `--host-header` dekken dat).

## Mapping ptloosdrecht.nl

"Tijdelijk" betekent dat het doel nu een tussenoplossing is ("wacht op locatiepagina" of op een besluit). De kolom eindbestemming staat als niet-actief veld `finalTarget` in het register en wordt nergens voor routing gebruikt; de PR van de lokale landingspagina's hoeft alleen de doelen om te zetten.

| Oud pad | Doel nu | Type | Tijdelijk | Eindbestemming |
|---|---|---|---|---|
| `/` | `/` | exact | nee | `/` |
| `/personal-training-loosdrecht` | `/aanbod` | exact | ja, wacht op PT-pagina | `/personal-training` |
| `/kettlebell-training` | `/aanbod` | exact | ja, wacht op kettlebellpagina | `/kettlebell-training` |
| `/kettlebell-bootcamp` | `/aanbod` | exact | ja, wacht op kettlebellpagina | `/kettlebell-training` |
| `/training-en-begeleiding`, `/training-en-begeleiding-old` | `/aanbod` | exact | nee | `/aanbod` |
| `/ervaren-personal-trainer`, `/ervaren-personal-trainer-2` | `/over` | exact | nee | `/over` |
| `/personal-hormonal-profiling` | `/over` | exact | ja, hangt af van het hormoonprofiel-besluit | open |
| `/kosten` | `/prijzen` | exact | nee | `/prijzen` |
| `/personal-training-loosdrecht-contact`, `/neem-contact-op` | `/contact` | exact | nee | `/contact` |
| `/personal-trainer-hilversum` | `/aanbod` | exact | ja, wacht op locatiepagina | `/personal-trainer-hilversum` |
| `/personal-trainer-bussum` | `/aanbod` | exact | ja, wacht op locatiepagina | `/personal-trainer-bussum` |
| `/personal-trainer-laren` | `/aanbod` | exact | ja, wacht op locatiepagina | `/personal-trainer-laren` |
| `/personal-trainer-gooi` | `/aanbod` | exact | ja, wacht op locatiepagina | `/personal-trainer-gooi` |
| `/personal-trainer-wijdemeren` | `/aanbod` | exact | ja, wacht op locatiepagina | `/personal-training` |
| `/account`, `/login`, `/logout`, `/members`, `/password-reset`, `/register`, `/user` | `/` | exact | nee | `/` |
| `/product`, `/product-category`, `/product-tag`, `/portfolio`, `/portfolio-category` (met alles eronder) | `/` | prefix | nee | `/` |
| `/category`, `/tag`, `/author`, `/page`, `/feed`, `/comments` (met alles eronder) | `/` | prefix | nee | `/` |
| `/wp-content`, `/wp-json`, `/wp-admin`, `/wp-includes` (met alles eronder) | `/` | prefix | nee | `/` |
| `/wp-login.php`, `/xmlrpc.php` | `/` | exact | nee | `/` |
| `/robots.txt` | `/robots.txt` | exact, geen UTM | nee | `/robots.txt` |
| `/sitemap.xml`, `/sitemap_index.xml`, `/wp-sitemap.xml`, `/sitemap.rss` en elk pad dat eindigt op `-sitemap.xml` | `/sitemap.xml` | exact en patroon, geen UTM | nee | `/sitemap.xml` |
| `/favicon.ico` | `/favicon.ico` | exact, geen UTM | nee | `/favicon.ico` |
| alles anders | `/` | fallback | nee | `/` |
| `/.well-known/acme-challenge/*` | nooit afgevangen | n.v.t. | n.v.t. | n.v.t. |

**Keuze `/training-en-begeleiding` (en `-old`):** doel is `/aanbod`. De live pagina (gelezen op 2026-11-21) beschrijft kettlebell training, T.O.P. personal training, herstel training, individuele trainingsschema's, personal hormonal profiling en Mylogenics; het 12-wekenprogramma komt er niet in voor. De `-old`-variant heeft dezelfde inleiding en is een eerdere versie van dezelfde pagina.

`hormoonprofiel.com`: lege mapping, fallback `/`, standaardmodus `off`.

## DNS-baseline ptloosdrecht.nl (2026-11-21)

- Nameservers: `ns1.siteground.net` en `ns2.siteground.net` (bij SiteGround). Registrar: GoDaddy. DNSSEC: uit. CAA: geen.
- A apex (TTL 30): `34.120.190.48`, `34.149.36.179`, `34.149.120.3`, `34.160.17.71`. Geen AAAA.
- A www (TTL 30): `34.149.120.3`, `34.160.17.71`, `35.227.194.51`, `34.160.81.203`. Geen CNAME, geen AAAA.
- MX (TTL 86400): `10 mx10.antispam.mailspamprotection.com.`, `20 mx20.antispam.mailspamprotection.com.`, `30 mx30.antispam.mailspamprotection.com.`
- TXT apex: drie `google-site-verification`-records (`mpVB4xYBK81o0TYRqaAVwIq6iagGzYYGyaLDdxTdH08`, `D7un53mxOMLDfzNDblyoX5shHE-kurJP549eUW4oOX4`, `kW9JtU72zuYV-vgXhABcYOChwzyB_IF-J9XMDpc2Rrw`), `Sendinblue-code:219d12a82d0b4f1ebc299960a97a55a5` en `v=spf1 include:_spf.google.com ~all`.
- `_dmarc`: `v=DMARC1; p=none; sp=none; rua=mailto:dmarc@mailinblue.com!10m; ruf=mailto:dmarc@mailinblue.com!10m; rf=afrf; pct=100; ri=86400`
- `_domainkey`: `v=DKIM1; o=~`. Er is geen `google._domainkey`.
- `mail`, `ftp`, `autodiscover` (A): `35.204.44.59`.

Vergelijken na de omzetting (de MX-, TXT-, `_dmarc`-, `_domainkey`- en mail-A-uitvoer moet gelijk blijven aan de baseline hierboven; alleen de A-records van apex en www veranderen):

```sh
for q in "ptloosdrecht.nl MX" "ptloosdrecht.nl TXT" "_dmarc.ptloosdrecht.nl TXT" "_domainkey.ptloosdrecht.nl TXT" "mail.ptloosdrecht.nl A"; do
  echo "## $q"; dig +noall +answer $q | sort
done
# Autoritatief, zonder resolvercache:
dig +noall +answer @ns1.siteground.net ptloosdrecht.nl MX
```

## Mail

`marlon@ptloosdrecht.nl` moet blijven werken. De MX wijst naar `*.antispam.mailspamprotection.com` (SiteGround), dus de mail hangt aan het SiteGround-hostingpakket. MX-, SPF-, DKIM- en DMARC-records mogen nooit wijzigen in dit traject. **SiteGround niet opzeggen voordat de mail is gemigreerd** (apart traject). De nameservers blijven bij SiteGround; er wordt niets naar Vercel-nameservers verhuisd.

## Uitrol (handmatig door Ilja)

Alleen de volgorde:

1. Global Config-store `tmc-legacy-domains` aanmaken en aan het project koppelen.
2. Item `legacy_domains` toevoegen (voorbeeld hierboven).
3. Na merge: domeinen `ptloosdrecht.nl` en `www.ptloosdrecht.nl` toevoegen in Vercel, zonder domeinredirect.
4. Pre-DNS-test met `curl --resolve`. Het certificaat is dan nog niet uitgegeven, dus met `-k`:
   `curl -sk -o /dev/null -D - --resolve ptloosdrecht.nl:443:76.76.21.21 https://ptloosdrecht.nl/kosten`
5. In SiteGround DNS alleen de A-records van apex en www vervangen (www wordt een CNAME). Gebruik de waarden die Vercel bij het domein toont (standaard A `76.76.21.21` en CNAME `cname.vercel-dns.com`).
6. Controle: `npm run check:legacy-redirects -- --base https://ptloosdrecht.nl` (zonder `--host-header`) en de `www`-variant, daarna de dig-vergelijking en een testmail naar en van `marlon@ptloosdrecht.nl`.
7. Search Console: adreswijziging van `ptloosdrecht.nl` naar `themovementclub.nl`.

## Rollback

De oude A-records van apex en www terugzetten (waarden uit de baseline hierboven; de www-CNAME weer verwijderen). Daarna kan de modus desgewenst op `off` of `redirect_temporary` staan terwijl de site wordt hersteld. Door de TTL van 30 seconden werkt een terugzetting snel; browsers kunnen een 308 maximaal een uur cachen.

## Moduswijzigingen

| Datum | Domein | Oude modus | Nieuwe modus | Door wie |
|---|---|---|---|---|
| 2026-11-21 | ptloosdrecht.nl | geen (nieuw) | redirect_permanent | Standaard in code (deze PR); Ilja zet het Global Config-item bij de uitrol |
| 2026-11-21 | hormoonprofiel.com | geen (nieuw) | off | Standaard in code (deze PR); Ilja zet het Global Config-item bij de uitrol |

## Ledger

| PR | Branch | Merge-hash | Datum | Omschrijving |
|---|---|---|---|---|
| #359 | feat/legacy-domain-redirects | (volgt bij de volgende PR op deze spec) | 2026-11-21 | **Legacy-domeinredirects:** register, modus uit Global Config met fallback, proxy-stap vóór auth, matcher met host- en headeritem, trailing-slash-redirect expliciet voor niet-oude hosts, tests en controlescript. Bewust niet aangeraakt: DNS, Vercel-domeininstellingen, Global Config-store en -items, Supabase, hormoonprofiel.com-mapping, lokale landingspagina's (`finalTarget` is nergens in gebruik). |
