import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageSchemas } from "@/lib/hormoonprofiel/jsonld";
import { HP_PATHS, type HpPageKey } from "@/lib/hormoonprofiel/slugs";
import {
  HP_PAGES,
  PROFILES,
  HOME_TRAJECT,
  HOME_WEL,
  HOME_NIET,
  HOME_META,
  HOME_LEAD,
  HOME_PROFIELEN_INTRO,
  HOME_MARLON_INTRO,
  PROFIELEN_WARN_LEAD,
  PROFIELEN_WARN_REST,
  BREADCRUMB_LABEL,
  CONTACT,
  CTA_LABEL,
  DISCLAIMER_LEAD,
  DISCLAIMER_REST,
  MARLON,
  RELATED_CARD,
  credentialLine,
  experienceLine,
  meetpuntText,
  type HpBlock,
  type HpFaqItem,
  type HpPage,
} from "../../../content/hormoonprofiel";
import { Kennismaking } from "./Kennismaking";
import { SectionBar, StandaloneFooter, StandaloneNav } from "./Chrome";
import { pageHref, tmcHref, type HpVariant } from "./links";
import s from "./hp.module.css";

// COPY: confirm met Marlon (alle teksten in dit bestand)

const FIGURE = (
  <svg className={s.figure} viewBox="0 0 100 160" fill="currentColor" aria-hidden="true">
    <circle cx="50" cy="26" r="16" />
    <path d="M18 160c0-44 12-92 32-92s32 48 32 92z" />
  </svg>
);

/** Datum als "21 november 2026". */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

function Crumbs({ variant, current }: { variant: HpVariant; current: HpPageKey }) {
  const items: { label: string; href?: string }[] =
    variant === "standalone"
      ? current === "home"
        ? []
        : [{ label: "Home", href: "/" }, { label: BREADCRUMB_LABEL[current] }]
      : [
          { label: "Home", href: "/" },
          current === "home"
            ? { label: "Hormoonprofiel" }
            : { label: "Hormoonprofiel", href: pageHref("section", "home") },
          ...(current === "home" ? [] : [{ label: BREADCRUMB_LABEL[current] }]),
        ];
  if (items.length === 0) return null;
  return (
    <nav className={s.crumbs} aria-label="Kruimelpad">
      <div className={s.wrap}>
        {items.map((item, i) => (
          <span key={item.label + i}>
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </span>
        ))}
      </div>
    </nav>
  );
}

function Byline({ page }: { page: HpPage }) {
  return (
    <div className={s.byline}>
      <div className={s.photo} aria-hidden="true" />
      <div>
        <b>{MARLON.name}</b>, gecertificeerd {MARLON.jobTitle}
        <br />
        Bijgewerkt {formatDate(page.dateModified)}
      </div>
    </div>
  );
}

function Kort({ text }: { text: string }) {
  return (
    <div className={s.kort}>
      <div className={s.eyebrow}>In het kort</div>
      <p>{text}</p>
    </div>
  );
}

function PageHead({ page }: { page: HpPage }) {
  return (
    <section className={s.pageHead}>
      <div className={s.wrap}>
        <div className={s.eyebrow}>{page.eyebrow}</div>
        <h1 className={s.display}>{page.h1}</h1>
        <Byline page={page} />
        <Kort text={page.inHetKort} />
      </div>
    </section>
  );
}

function Faq({ items, variant, openFirst = true }: { items: readonly HpFaqItem[]; variant: HpVariant; openFirst?: boolean }) {
  return (
    <div className={s.faq}>
      {items.map((q, i) => (
        <details key={q.vraag} open={openFirst && i === 0}>
          <summary>{q.vraag}</summary>
          <p>
            {q.antwoord}
            {q.link ? (
              <>
                {" "}
                <Link href={pageHref(variant, q.link.key, q.link.anchor)}>{q.link.label}</Link>.
              </>
            ) : null}
          </p>
        </details>
      ))}
    </div>
  );
}

function RelatedCards({ keys, variant }: { keys: readonly HpPageKey[]; variant: HpVariant }) {
  if (keys.length === 0) return null;
  return (
    <section className={`${s.sec} ${s.alt}`}>
      <div className={s.wrap}>
        <div className={s.eyebrow}>Verder lezen</div>
        <h2 className={s.display}>Meer over je profiel</h2>
        <div className={`${s.related} ${s.pcards}`}>
          {keys.map((key) => (
            <Link key={key} className={s.pcard} href={pageHref(variant, key)}>
              <h3>{RELATED_CARD[key].title}</h3>
              <p>{RELATED_CARD[key].text}</p>
              <span className={s.go}>Lees meer →</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Disclaimer() {
  return (
    <div className={s.disclaimer}>
      <div className={s.wrap}>
        <b>{DISCLAIMER_LEAD}</b> {DISCLAIMER_REST}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blokken van een inhoudspagina
// ---------------------------------------------------------------------------

function renderBlock(block: HpBlock, i: number, variant: HpVariant) {
  switch (block.type) {
    case "h2":
      return (
        <h2 key={i} className={s.display} id={block.id}>
          {block.text}
          {block.duration ? <span className={s.dur}>{block.duration}</span> : null}
        </h2>
      );
    case "p":
      return <p key={i}>{block.text}</p>;
    case "questions":
      return (
        <ul key={i} className={s.q}>
          {block.items.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      );
    case "list":
      return (
        <ul key={i} className={`${s.q} ${s.plain}`}>
          {block.items.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      );
    case "get":
      return (
        <ul key={i} className={s.get}>
          {block.items.map((g) => (
            <li key={g.label}>
              {g.label}
              <span>{g.detail}</span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div key={i} className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                {block.head.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, c) => (
                    <td key={c}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "wn":
      return (
        <div key={i} className={s.wn}>
          <div className={s.yes}>
            <h3>Wel</h3>
            <ul>
              {block.yes.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div className={s.no}>
            <h3>Niet</h3>
            <ul>
              {block.no.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    case "sources":
      return (
        <div key={i}>
          <p>{block.intro}</p>
          <ul className={s.links}>
            {block.items.map((l) => (
              <li key={l.href}>
                <a href={l.href} rel="noopener noreferrer" target="_blank">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      );
    case "tmcLinks":
      return (
        <div key={i}>
          <p>{block.intro}</p>
          <ul className={s.links}>
            {block.links.map((l) => (
              <li key={l.href}>
                <a href={tmcHref(variant, l.href)}>{l.label}</a>
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

function ArticleBody({ page, variant }: { page: HpPage; variant: HpVariant }) {
  const toc = page.blocks.filter((b): b is Extract<HpBlock, { type: "h2" }> => b.type === "h2");
  return (
    <div className={`${s.wrap} ${s.article}`}>
      <div className={s.prose}>{page.blocks.map((b, i) => renderBlock(b, i, variant))}</div>
      <aside className={s.aside}>
        <div className={s.toc}>
          <h4>Op deze pagina</h4>
          <ol>
            {toc.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`}>{h.text.replace(/^\d+\.\s*/, "")}</a>
              </li>
            ))}
          </ol>
        </div>
        <div className={s.ctacard}>
          <h4>Eerste stap</h4>
          <p>Kennismaken met Marlon, vrijblijvend.</p>
          <a href="#kennismaken">{CTA_LABEL} →</a>
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina's
// ---------------------------------------------------------------------------

function Home({ variant }: { variant: HpVariant }) {
  const page = HP_PAGES.home;
  const exp = experienceLine();
  return (
    <>
      <section className={s.hero}>
        <div className={`${s.wrap} ${s.heroGrid}`}>
          <div>
            <div className={s.eyebrow}>{page.eyebrow}</div>
            <h1 className={s.display}>{page.h1}</h1>
            <p className={s.lead}>{HOME_LEAD}</p>
            <div className={s.btnRow}>
              <a className={s.btn} href="#kennismaken">
                {CTA_LABEL} →
              </a>
              <Link className={`${s.btn} ${s.ghost}`} href={pageHref(variant, "hoewerkt")}>
                Hoe werkt het?
              </Link>
            </div>
            <div className={s.meta}>
              {HOME_META.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </div>
          <div className={`${s.photo} ${s.heroPhoto}`} aria-hidden="true">
            {FIGURE}
          </div>
        </div>
      </section>

      <section style={{ paddingBottom: 36 }}>
        <div className={s.wrap}>
          <Kort text={page.inHetKort} />
        </div>
      </section>

      <section className={s.sec}>
        <div className={s.wrap}>
          <div className={s.eyebrow}>Het traject</div>
          <h2 className={s.display}>Van kennismaking tot hermeting</h2>
          <ol className={`${s.steps} ${s.row}`}>
            {HOME_TRAJECT.map((st) => (
              <li key={st.n}>
                <span className={s.n}>{st.n}</span>
                <div>
                  <b>{st.titel}</b>
                  <span>{st.tekst}</span>
                  {st.duur ? <em>{st.duur}</em> : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${s.sec} ${s.alt}`}>
        <div className={s.wrap}>
          <div className={s.eyebrow}>De profielen</div>
          <h2 className={s.display}>Zes hormonen, zes profielen</h2>
          <p className={s.intro}>{HOME_PROFIELEN_INTRO}</p>
          <div className={s.pcards}>
            {PROFILES.map((p) => (
              <Link key={p.id} className={s.pcard} href={pageHref(variant, "profielen", p.id)}>
                <h3>{p.name}</h3>
                <p>{p.short}</p>
                <span className={s.go}>Lees meer →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={s.sec}>
        <div className={`${s.wrap} ${s.person}`}>
          <div className={s.photo} aria-hidden="true">
            {FIGURE}
          </div>
          <div>
            <div className={s.eyebrow}>Wie je begeleidt</div>
            <h2 className={s.display}>{MARLON.name}</h2>
            <p className={s.intro}>{HOME_MARLON_INTRO}</p>
            <ul className={s.creds}>
              <li>{credentialLine()}</li>
              <li>{MARLON.other}</li>
              {exp ? <li>{exp}</li> : null}
            </ul>
          </div>
        </div>
      </section>

      <section className={s.sec}>
        <div className={s.wrap}>
          <div className={s.eyebrow}>Eerlijk is eerlijk</div>
          <h2 className={s.display}>Wat het wel is, en wat niet</h2>
          <div className={s.wn}>
            <div className={s.yes}>
              <h3>Wel</h3>
              <ul>
                {HOME_WEL.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div className={s.no}>
              <h3>Niet</h3>
              <ul>
                {HOME_NIET.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={s.sec}>
        <div className={`${s.wrap} ${s.two}`}>
          <div>
            <div className={s.eyebrow}>Veelgestelde vragen</div>
            <h2 className={s.display}>Goed om te weten</h2>
            <p className={s.intro} style={{ marginTop: 6 }}>
              <Link className={s.link} href={pageHref(variant, "faq")}>
                Alle vragen
              </Link>
            </p>
          </div>
          <Faq items={page.faq ?? []} variant={variant} />
        </div>
      </section>
    </>
  );
}

function Profielen({ variant }: { variant: HpVariant }) {
  const page = HP_PAGES.profielen;
  return (
    <>
      <section className={s.pageHead}>
        <div className={s.wrap}>
          <div className={s.eyebrow}>{page.eyebrow}</div>
          <h1 className={s.display}>{page.h1}</h1>
          <Byline page={page} />
          <Kort text={page.inHetKort} />
          <div className={s.chips}>
            {PROFILES.map((p) => (
              <a key={p.id} href={`#${p.id}`}>
                {p.name}
              </a>
            ))}
          </div>
          <p className={s.warn}>
            <b>{PROFIELEN_WARN_LEAD}</b> {PROFIELEN_WARN_REST}
          </p>
        </div>
      </section>

      {PROFILES.map((p, i) => (
        <section key={p.id} className={s.prof} id={p.id}>
          <div className={`${s.wrap} ${s.profGrid}`}>
            <div>
              <span className={s.idx}>0{i + 1}</span>
              <h2 className={s.display}>{p.name}</h2>
              <p className={s.sub}>{p.short}</p>
            </div>
            <div className={s.facets}>
              <div className={`${s.facet} ${s.wide}`}>
                <h3>Wat doet het</h3>
                <p>{p.does}</p>
              </div>
              <div className={s.facet}>
                <h3>Waar mensen mee komen</h3>
                <p>{p.signs}</p>
              </div>
              <div className={s.facet}>
                <h3>Wat je zelf kunt doen</h3>
                <p>{p.self}</p>
              </div>
              <div className={`${s.facet} ${s.wide} ${s.note2}`}>
                <h3>In de meting</h3>
                <p>{meetpuntText(p)}</p>
              </div>
            </div>
          </div>
        </section>
      ))}
      <RelatedCards keys={page.related} variant={variant} />
    </>
  );
}

function FaqPage({ variant }: { variant: HpVariant }) {
  const page = HP_PAGES.faq;
  return (
    <>
      <PageHead page={page} />
      <section className={s.sec}>
        <div className={s.wrap}>
          <Faq items={page.faq ?? []} variant={variant} />
        </div>
      </section>
      <RelatedCards keys={page.related} variant={variant} />
    </>
  );
}

function ContactPage({ variant }: { variant: HpVariant }) {
  const page = HP_PAGES.contact;
  const email = variant === "standalone" ? CONTACT.emailStandalone : CONTACT.emailSection;
  return (
    <>
      <PageHead page={page} />
      <section className={s.sec}>
        <div className={s.wrap}>
          <div className={s.contactGrid}>
            <div className={s.contactCard}>
              <h3>Adres</h3>
              <address>
                The Movement Club
                <br />
                {CONTACT.street}
                <br />
                {CONTACT.zip} {CONTACT.city}
              </address>
            </div>
            <div className={s.contactCard}>
              <h3>Bereikbaar</h3>
              <p>
                <a href={`tel:${CONTACT.phoneE164}`}>{CONTACT.phoneDisplay}</a>
                <br />
                <a href={`mailto:${email}`}>{email}</a>
                <br />
                <a href={CONTACT.instagramUrl}>Instagram {CONTACT.instagramHandle}</a>
              </p>
            </div>
            <div className={s.contactCard}>
              <h3>Tijden</h3>
              <p>{CONTACT.hours}</p>
            </div>
          </div>
        </div>
      </section>
      <RelatedCards keys={page.related} variant={variant} />
    </>
  );
}

/** Eigen 404 in de hormoonprofiel-stijl (standalone). */
export function HpNotFound() {
  return (
    <div className={`${s.screen} ${s.hp}`}>
      <StandaloneNav />
      <section className={s.notFound}>
        <div className={s.wrap}>
          <div className={s.eyebrow}>404</div>
          <h1 className={s.display}>Deze pagina bestaat niet</h1>
          <p className={s.lead}>
            De pagina die je zoekt is verplaatst of bestaat niet meer. Begin bij het overzicht, of
            plan direct een kennismaking met Marlon.
          </p>
          <div className={s.btnRow}>
            <Link className={s.btn} href="/">
              Naar het overzicht
            </Link>
            <Link className={`${s.btn} ${s.ghost}`} href={HP_PATHS.contact}>
              Contact
            </Link>
          </div>
        </div>
      </section>
      <StandaloneFooter />
    </div>
  );
}

/** Een pagina in de gekozen schil. */
export function PageView({ pageKey, variant }: { pageKey: HpPageKey; variant: HpVariant }) {
  const page = HP_PAGES[pageKey];
  const isArticle = page.blocks.length > 0;

  let body: React.ReactNode;
  if (pageKey === "home") body = <Home variant={variant} />;
  else if (pageKey === "profielen") body = <Profielen variant={variant} />;
  else if (pageKey === "faq") body = <FaqPage variant={variant} />;
  else if (pageKey === "contact") body = <ContactPage variant={variant} />;
  else if (isArticle) {
    body = (
      <>
        <PageHead page={page} />
        <ArticleBody page={page} variant={variant} />
        <RelatedCards keys={page.related} variant={variant} />
      </>
    );
  }

  return (
    <>
      <JsonLd data={pageSchemas(variant, pageKey)} />
      <div className={`${s.screen} ${variant === "standalone" ? s.hp : s.tmc}`}>
        {variant === "standalone" ? <StandaloneNav /> : <SectionBar active={pageKey} />}
        <Crumbs variant={variant} current={pageKey} />
        {body}
        <Kennismaking variant={variant} />
        <Disclaimer />
        {variant === "standalone" ? <StandaloneFooter /> : null}
      </div>
    </>
  );
}

