// Handgeschreven service worker voor de member-PWA (/app/**).
//
// Bewust GEEN Workbox/Serwist: dit project bouwt standaard met Turbopack
// (`next build` → "▲ Next.js 16.2.3 (Turbopack)"), en Serwist's
// webpack-plugin-integratie (@serwist/next) draait niet onder Turbopack.
// De Turbopack-variant (@serwist/turbopack) bestaat wel, maar is expliciet
// experimenteel en werkt via een esbuild-in-route-handler-workaround
// ("while plugins are still not supported"). Voor een betalingen-
// aangrenzende productie-app (boekingen, Mollie-incasso) is een klein,
// leesbaar, dependency-vrij bestand hier de veiligere keuze dan een
// experimentele build-integratie.
//
// Cache-versionering: handmatig, geen build-time manifest. Bump
// CACHE_VERSION bij elke materiële wijziging aan de caching-logica; oude
// caches worden in `activate` opgeruimd.
const CACHE_VERSION = "tmc-pwa-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ALL_CACHES = [STATIC_CACHE, PAGES_CACHE, SHELL_CACHE];

const OFFLINE_URL = "/offline.html";

// Routes die de SW NOOIT onderschept — altijd rechtstreeks naar het
// netwerk, geen cache-fallback. Auth-flows, webhooks/cron/leads-API's en
// de Sanity Studio horen hier nooit gecachet content te tonen.
const BYPASS_PREFIXES = ["/api/", "/auth/", "/studio", "/login"];

function shouldBypass(url) {
  return BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname === "/manifest.json"
  );
}

// Rooster is de enige route met een expliciete "offline-caching"-eis (zie
// discovery-plan): meteen tonen wat er is, verversen op de achtergrond.
// Andere member-schermen (boekingen/facturen/abonnement/profiel) blijven
// bewust op NetworkFirst — dat is financiële/persoonlijke data, geen
// staleness-risico nemen door standaard eerst de cache te tonen.
function isRoosterRoute(url) {
  return url.pathname === "/app/rooster";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.add(OFFLINE_URL);
      // Nieuwe SW meteen actief maken i.p.v. wachten tot alle tabs sluiten —
      // cache-versionering in `activate` vangt eventuele mismatch op.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("tmc-pwa-") && !ALL_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// CacheFirst: content-hashed Next.js-assets (_next/static/*) en de
// public/images-map veranderen nooit onder eenzelfde URL — veilig om
// voor altijd te cachen, lazily gevuld bij eerste fetch.
// Geen build-time precache-manifest (zie bovenstaande toelichting), dus
// caches groeien puur runtime — o.a. door Next.js Link-prefetch, dat voor
// het rooster meerdere dag/pijler-queryparam-varianten van dezelfde route
// vooraf ophaalt. Zonder cap zou dat onbegrensd blijven groeien op een
// lang-geïnstalleerde PWA. FIFO-cap per cache, geen echte LRU nodig voor
// dit volume.
const MAX_ENTRIES = { [STATIC_CACHE]: 120, [PAGES_CACHE]: 40 };

async function trimCache(cacheName) {
  const max = MAX_ENTRIES[cacheName];
  if (!max) return;
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - max;
  if (excess > 0) {
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trimCache(STATIC_CACHE);
  }
  return response;
}

// NetworkFirst met timeout: probeer eerst live data (max NETWORK_TIMEOUT_MS),
// val terug op de laatst gecachete versie. Voor navigaties die zowel
// netwerk als cache missen: offline.html i.p.v. een kale browserfout.
const NETWORK_TIMEOUT_MS = 4000;

async function networkFirst(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const networkPromise = fetch(request);
    // Voorkom een onbehandelde rejection als de timeout wint maar de
    // fetch later alsnog faalt.
    networkPromise.catch(() => {});
    const response = await Promise.race([
      networkPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("network-timeout")), NETWORK_TIMEOUT_MS),
      ),
    ]);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      await trimCache(PAGES_CACHE);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw new Error("network-first-failed");
  }
}

// StaleWhileRevalidate: geef meteen de laatst gecachete versie terug (geen
// wachttijd), ververs tegelijk op de achtergrond voor het volgende bezoek.
// Eerste bezoek (nog niets in cache) wacht alsnog op het netwerk, met
// dezelfde offline-fallback als networkFirst.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(PAGES_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
        await trimCache(PAGES_CACHE);
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Achtergrond-refresh mag falen zonder de responder te raken — de user
    // heeft al een antwoord. `.catch` hierboven vangt dat al af.
    return cached;
  }

  const response = await networkPromise;
  if (response) return response;
  if (request.mode === "navigate") {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
  }
  throw new Error("stale-while-revalidate-failed");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Alleen same-origin GET onderscheppen. Server actions zijn POST (nooit
  // cachen); cross-origin calls (bv. rechtstreeks naar Supabase) laten we
  // ongemoeid — geen cache-interferentie met live user-data.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (shouldBypass(url)) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isRoosterRoute(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Alle overige same-origin GET's (paginanavigatie binnen /app/**, en
  // overige app-routes) — NetworkFirst als veilige default.
  event.respondWith(networkFirst(request));
});
