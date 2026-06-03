/**
 * Seed script (PR-Y1): pusht de yoga-content naar Sanity.
 *
 * Run met: npx tsx sanity/seed-yoga.ts
 *
 * Vereist SANITY_TOKEN env var (maak aan op sanity.io/manage → API → Tokens,
 * met schrijfrechten). Idempotent: deterministische _id's + createOrReplace,
 * dus opnieuw draaien synchroniseert wijzigingen zonder dubbele documenten.
 *
 * Docenten worden eerst aangemaakt, daarna de vormen die naar hen verwijzen.
 * De "vormen die een docent geeft" worden niet apart opgeslagen maar afgeleid
 * via een reverse reference in de GROQ-query (references(^._id)).
 */
import { createClient } from "@sanity/client";

const client = createClient({
  projectId: "hn9lkvte",
  dataset: "production",
  apiVersion: "2026-04-01",
  token: process.env.SANITY_TOKEN,
  useCdn: false,
});

// ---------- Portable Text helper --------------------------------------------

/** Bouw een Portable Text array uit losse alinea-strings. */
function blocks(keyPrefix: string, paragraphs: string[]) {
  return paragraphs.map((text, i) => ({
    _type: "block",
    _key: `${keyPrefix}-${i}`,
    style: "normal",
    markDefs: [],
    children: [{ _type: "span", _key: `${keyPrefix}-${i}-s`, text }],
  }));
}

function teacherRef(id: string) {
  return { _type: "reference", _key: `ref-${id}`, _ref: `yogaTeacher-${id}` };
}

function faqItems(items: Array<{ q: string; a: string }>) {
  return items.map((f, i) => ({
    _key: `faq-${i}`,
    question: f.q,
    answer: f.a,
  }));
}

// ---------- Content ----------------------------------------------------------

const teachers = [
  {
    id: "kim",
    name: "Kim",
    slug: "kim",
    specialty: "Flow",
    heroQuote:
      "De mat is een spiegel; wat zich daarop afspeelt, vertaalt zich naar je leven.",
    bio: [
      "Ik ben Kim, 40 jaar, moeder en daarnaast werkzaam bij een maatschappelijke organisatie waar ik veel verschillende mensen spreek.",
      "Mijn yoga-reis begon twaalf jaar geleden heel fysiek, als aanvulling op mijn krachttraining. Gaandeweg ontdekte ik dat yoga veel verder gaat dan het lichaam en bracht het mij diepe mentale voordelen. Inmiddels is yoga mijn way of life.",
      "Voor mij is de yogamat een spiegel: wat zich daarop afspeelt, vertaalt zich direct naar het dagelijks leven. Of we nu de dynamiek opzoeken in een flow of de diepe vertraging in Yin en Restorative, ik nodig je uit om te voelen wat er is, zonder oordeel, en van daaruit terug te komen bij jezelf.",
    ],
    isActive: true,
    internalNote: "",
    order: 1,
  },
  {
    id: "bionda",
    name: "Bionda",
    slug: "bionda",
    specialty: "Restorative",
    heroQuote: "Niet presteren, maar thuiskomen in je lichaam.",
    bio: [
      "Hi, ik ben Bionda. Op maandag geef ik Restorative Yoga bij The Movement Club, een zachte les waarin ontspanning, ademhaling en het resetten van je zenuwstelsel centraal staan.",
      "In mijn lessen draait het niet om presteren, maar om thuiskomen in je lichaam. Met rustige houdingen, de steun van props en een warme sfeer nodig ik je uit om spanning los te laten en weer ruimte, rust en zachtheid te voelen.",
      "Een moment voor jezelf, om te vertragen, op te laden en gewoon even te zijn.",
    ],
    isActive: true,
    internalNote: "Foto vervangen voor live: huidige foto is geen yogafoto.",
    order: 2,
  },
  {
    id: "connie",
    name: "Connie",
    slug: "connie",
    specialty: "Yoga Nidra & iRest",
    heroQuote: "Alignment is geen plaatje, het is een gevoel.",
    bio: [
      "Ik heb lang gedacht dat bewegen vooral doen was: harder, sneller, meer. Tot ik ontdekte dat het ook kon gaan over hoe je leeft, ademt en herstelt.",
      "Mijn achtergrond ligt in communicatie, media en de culturele sector. Ik ken de wereld van altijd aan staan van binnenuit, en juist daarom weet ik hoe waardevol het is om even echt te landen.",
      "Als gecertificeerd Yoga Nidra- en iRest-docent combineer ik diepe ontspanning met bewustwording, adem en lichamelijk herstel. Geen zweverigheid, geen prestatiedruk. Jouw lichaam is het uitgangspunt, niet een ideaalbeeld.",
      "Ik geef sessies rondom Yoga Nidra, iRest, breathwork en nervous system regulatie, en werk rond thema's als hormonen, energie, slaap, stress en burn-out.",
    ],
    isActive: false,
    internalNote:
      "Samenwerking bevestigen voordat naam en foto live gaan. Geen eigen conceptnamen gebruiken tenzij expliciet afgesproken.",
    order: 3,
  },
  {
    id: "annouschka",
    name: "Annouschka",
    slug: "annouschka",
    specialty: "Yin, ook Restorative & Nidra",
    heroQuote:
      "Een veilige, zachte ruimte om te vertragen en jezelf te voelen.",
    bio: [
      "Ik ben Annouschka, geboren in België en al 27 jaar helemaal thuis in Nederland. Als echt mensen-mens zocht ik altijd naar wat werkelijk verbindt en heelt.",
      "Die zoektocht leidde me via de zorg, mindfulness, holistisch coachen en NLP uiteindelijk naar yoga. Afgelopen jaar rondde ik mijn opleiding tot docent af, en nu geef ik met veel plezier Yin, Restorative en Yoga Nidra.",
      "In mijn lessen vind je een veilige, zachte ruimte om te vertragen en volledig jezelf te zijn. Je leert je lichaam echt te voelen, spanning los te laten en je zenuwstelsel te kalmeren, zodat er diep herstel en meer rust ontstaat.",
    ],
    isActive: true,
    internalNote: "",
    order: 4,
  },
];

const styles = [
  {
    id: "yoga-nidra",
    title: "Yoga Nidra",
    slug: "yoga-nidra",
    intensity: 1,
    definition:
      "Yoga Nidra is een geleide rustvorm waarbij je comfortabel ligt en met je aandacht naar een diepe staat van ontspanning wordt begeleid.",
    shortDescription:
      "Een geleide rustsessie waarin je niets hoeft te doen, alleen ontvangen.",
    forWho:
      "Voor wie veel stress ervaart, slecht slaapt, vermoeid is of merkt dat het hoofd altijd aan staat.",
    benefits: [
      "Diepe ontspanning zonder inspanning",
      "Een rustiger en helderder hoofd",
      "Beter inslapen en doorslapen",
      "Herstel van een overvol systeem",
    ],
    body: [
      "Bij Yoga Nidra lig je comfortabel op je mat, vaak onder een dekentje, en word je met een stem begeleid naar een diepe staat van ontspanning. Het voelt meer als een geleide rustsessie dan als een actieve yogales.",
      "Je hoeft niets te presteren en niets te kunnen. Juist door los te laten krijgt je zenuwstelsel de ruimte om te herstellen.",
    ],
    teachers: ["connie"],
    faqs: [
      {
        q: "Moet ik ervaring hebben met yoga?",
        a: "Nee. Bij Yoga Nidra lig je en laat je je begeleiden, dus het is geschikt voor iedereen, ook als je nog nooit yoga hebt gedaan.",
      },
      {
        q: "Val ik in slaap?",
        a: "Dat mag. Veel mensen doezelen weg, en ook dan doet de sessie zijn werk op je zenuwstelsel.",
      },
      {
        q: "Wat neem ik mee?",
        a: "Niets bijzonders. Draag comfortabele kleding; matten, dekens en kussens zijn aanwezig.",
      },
    ],
    order: 1,
  },
  {
    id: "irest",
    title: "iRest",
    slug: "irest",
    intensity: 2,
    definition:
      "iRest is een therapeutische vorm van Yoga Nidra waarbij je bewust contact maakt met je lichaam, je emoties en je gevoel van innerlijke veiligheid.",
    shortDescription:
      "Yoga Nidra, maar een laag dieper en therapeutisch van opzet.",
    forWho:
      "Voor wie te maken heeft met stress, burn-out, angst, trauma of een overprikkeld zenuwstelsel.",
    benefits: [
      "Spanning en emoties veilig leren herkennen",
      "Je zenuwstelsel leren reguleren",
      "Meer innerlijke rust en veiligheid",
      "Diep fysiek en mentaal herstel",
    ],
    body: [
      "iRest lijkt op Yoga Nidra, maar gaat nog een laag dieper. Het is een meer therapeutische vorm, waarbij je leert om bewust contact te maken met je lichaam, je emoties en je innerlijke gevoel van veiligheid.",
      "Waar Yoga Nidra vooral ontspanning brengt, helpt iRest je ook om spanning en emoties op een veilige manier te leren herkennen en reguleren.",
    ],
    teachers: ["connie"],
    faqs: [
      {
        q: "Wat is het verschil met Yoga Nidra?",
        a: "iRest lijkt op Yoga Nidra maar gaat therapeutisch een laag dieper, met aandacht voor je emoties en je gevoel van innerlijke veiligheid.",
      },
      {
        q: "Is iRest geschikt bij stress of burn-out?",
        a: "Ja. iRest wordt vaak ingezet bij stress, burn-out, angst en een overprikkeld zenuwstelsel.",
      },
      {
        q: "Moet ik over mijn emoties praten?",
        a: "Nee. Je beweegt in je eigen tempo en hoeft niets te delen; het gaat om veilig herkennen en reguleren.",
      },
    ],
    order: 2,
  },
  {
    id: "restorative-yoga",
    title: "Restorative Yoga",
    slug: "restorative-yoga",
    intensity: 3,
    definition:
      "Restorative Yoga is een rustige vorm waarbij je yogahoudingen volledig ondersteund aanneemt met kussens, dekens en blokken, zodat je geen kracht hoeft te gebruiken.",
    shortDescription:
      "Volledig ondersteunde houdingen waarin je lichaam zich veilig voelt om los te laten.",
    forWho:
      "Voor wie vermoeid is, stress ervaart, herstelt van een drukke periode of behoefte heeft aan diepe rust.",
    benefits: [
      "Diepe rust zonder inspanning",
      "Je zenuwstelsel resetten",
      "Spanning loslaten",
      "Ruimte, rust en zachtheid voelen",
    ],
    body: [
      "Restorative Yoga is heel rustig, maar hierbij neem je wel yogahoudingen aan. Je lichaam wordt volledig ondersteund met kussens, dekens en blokken, zodat je geen kracht hoeft te gebruiken.",
      "Het doel is dat je lichaam zich veilig genoeg voelt om los te laten. Daarom is Restorative Yoga heel geschikt bij vermoeidheid, stress, herstel na een drukke periode of wanneer je lichaam behoefte heeft aan diepe rust.",
    ],
    teachers: ["bionda"],
    faqs: [
      {
        q: "Heb ik kracht of lenigheid nodig?",
        a: "Nee. Je lichaam wordt volledig ondersteund met props, zodat je geen kracht hoeft te gebruiken.",
      },
      {
        q: "Voor wie is Restorative Yoga?",
        a: "Voor wie vermoeid is, herstelt van een drukke periode of behoefte heeft aan diepe rust.",
      },
      {
        q: "Hoe voelt een les?",
        a: "Rustig en warm. Je houdt houdingen langer vast met steun, zodat je lichaam zich veilig voelt om los te laten.",
      },
    ],
    order: 3,
  },
  {
    id: "yin-yoga",
    title: "Yin Yoga",
    slug: "yin-yoga",
    intensity: 4,
    definition:
      "Yin Yoga is een rustige maar iets intensere vorm waarbij je houdingen een paar minuten vasthoudt om bindweefsel, gewrichten en fascia zachtjes te belasten.",
    shortDescription:
      "Langer in een houding blijven, zodat je rek en ruimte tot diep in het bindweefsel voelt.",
    forWho:
      "Voor wie spanning wil loslaten, soepeler wil worden en meer ruimte in het lichaam zoekt.",
    benefits: [
      "Spanning loslaten",
      "Soepeler en beweeglijker worden",
      "Meer ruimte in het lichaam",
      "Rustig maar voelbaar werken",
    ],
    body: [
      "Yin Yoga is rustig, maar iets actiever en intenser dan Restorative Yoga. Tijdens Yin blijf je langer in een houding, vaak een paar minuten. Je voelt hierbij meer rek en druk in het lichaam, vooral rondom bindweefsel, gewrichten en fascia.",
      "Het is niet de bedoeling dat het pijnlijk is, maar je mag wel voelen dat er iets gebeurt. Yin Yoga helpt om spanning los te laten, soepeler te worden en meer ruimte te creëren in het lichaam.",
    ],
    teachers: ["annouschka"],
    faqs: [
      {
        q: "Is Yin Yoga pijnlijk?",
        a: "Nee. Je mag voelen dat er iets gebeurt rond gewrichten en bindweefsel, maar het hoort niet pijnlijk te zijn.",
      },
      {
        q: "Wat is het verschil met Restorative?",
        a: "Yin is iets actiever en intenser; je houdt houdingen langer vast en voelt meer rek en druk.",
      },
      {
        q: "Word ik er soepeler van?",
        a: "Ja. Yin helpt spanning los te laten, maakt soepeler en creëert meer ruimte in het lichaam.",
      },
    ],
    order: 4,
  },
  {
    id: "flow-yoga",
    title: "Flow Yoga",
    slug: "flow-yoga",
    intensity: 5,
    definition:
      "Flow Yoga is de meest actieve van deze vijf vormen, waarbij je vloeiend van houding naar houding beweegt op het ritme van je ademhaling.",
    shortDescription: "Dynamisch en energiek bewegen op je adem.",
    forWho:
      "Voor wie wil werken aan kracht, mobiliteit, balans, lichaamsbewustzijn en vitaliteit.",
    benefits: [
      "Meer kracht en mobiliteit",
      "Betere balans en lichaamsbewustzijn",
      "Energie en vitaliteit",
      "Vloeiend bewegen op je adem",
    ],
    body: [
      "Flow Yoga is de meest actieve vorm van deze vijf. In een Flow-les beweeg je vloeiend van de ene houding naar de andere, vaak op het ritme van je ademhaling. Dit maakt de les dynamischer en energieker.",
      "Waar de andere vormen vooral vertragen, brengt Flow juist beweging en energie. Het helpt bij kracht, mobiliteit, balans, lichaamsbewustzijn en vitaliteit.",
    ],
    teachers: ["kim"],
    faqs: [
      {
        q: "Is Flow Yoga zwaar?",
        a: "Flow is de meest actieve vorm, maar je beweegt op je eigen adem en tempo, dus je bepaalt zelf de intensiteit.",
      },
      {
        q: "Voor wie is Flow Yoga?",
        a: "Voor wie wil werken aan kracht, mobiliteit, balans en vitaliteit.",
      },
      {
        q: "Heb ik ervaring nodig?",
        a: "Nee. Je leert de houdingen stap voor stap; vloeiend bewegen komt vanzelf.",
      },
    ],
    order: 5,
  },
];

// ---------- Seed -------------------------------------------------------------

async function seed() {
  if (!process.env.SANITY_TOKEN) {
    console.error(
      "Ontbrekende SANITY_TOKEN. Run met: SANITY_TOKEN=xxx npx tsx sanity/seed-yoga.ts",
    );
    process.exit(1);
  }

  console.log("Seeding yoga-content naar Sanity...");

  for (const t of teachers) {
    await client.createOrReplace({
      _id: `yogaTeacher-${t.id}`,
      _type: "yogaTeacher",
      name: t.name,
      slug: { _type: "slug", current: t.slug },
      specialty: t.specialty,
      heroQuote: t.heroQuote,
      bio: blocks(`bio-${t.id}`, t.bio),
      isActive: t.isActive,
      internalNote: t.internalNote || undefined,
      order: t.order,
    });
  }
  console.log(`✓ yogaTeacher (${teachers.length})`);

  for (const s of styles) {
    await client.createOrReplace({
      _id: `yogaStyle-${s.id}`,
      _type: "yogaStyle",
      title: s.title,
      slug: { _type: "slug", current: s.slug },
      intensity: s.intensity,
      definition: s.definition,
      shortDescription: s.shortDescription,
      forWho: s.forWho,
      benefits: s.benefits,
      body: blocks(`body-${s.id}`, s.body),
      teachers: s.teachers.map(teacherRef),
      faqs: faqItems(s.faqs),
      order: s.order,
    });
  }
  console.log(`✓ yogaStyle (${styles.length})`);

  console.log("\nKlaar. Yoga-content staat in Sanity.");
  console.log(
    "Let op: Connie staat op isActive=false tot de samenwerking is bevestigd; Bionda heeft een foto-vervang-notitie.",
  );
}

seed().catch(console.error);
