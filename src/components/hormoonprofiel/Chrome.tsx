import Link from "next/link";
import {
  CONTACT,
  CTA_LABEL,
  FOOTER_INFO,
  NAV_SECTION,
  NAV_STANDALONE,
} from "../../../content/hormoonprofiel/shared";
import type { HpPageKey } from "@/lib/hormoonprofiel/slugs";
import { pageHref, tmcHref, type HpVariant } from "./links";
import s from "./hp.module.css";

// COPY: confirm met Marlon (alle teksten in dit bestand)

/** Woordmerk "hormoon" + "profiel" (cursief, accent) met "bij The Movement Club". */
export function Wordmark() {
  return (
    <Link className={s.hpMark} href="/">
      <b>
        hormoon<span>profiel</span>
      </b>
      <small>bij The Movement Club</small>
    </Link>
  );
}

/** Navigatie van hormoonprofiel.com (standalone). */
export function StandaloneNav() {
  return (
    <nav className={s.hpNav} aria-label="Hoofdmenu">
      <div className={s.wrap}>
        <Wordmark />
        <ul className={s.navlinks}>
          {NAV_STANDALONE.map((item) => (
            <li key={item.key}>
              <Link href={pageHref("standalone", item.key)}>{item.label}</Link>
            </li>
          ))}
          <li className={s.navbtn}>
            <a href="#kennismaken">{CTA_LABEL}</a>
          </li>
        </ul>
        <details className={s.mobileMenu}>
          <summary aria-label="Menu">
            <span className={s.menu} />
          </summary>
          <ul>
            {NAV_STANDALONE.map((item) => (
              <li key={item.key}>
                <Link href={pageHref("standalone", item.key)}>{item.label}</Link>
              </li>
            ))}
            <li>
              <a href="#kennismaken">{CTA_LABEL}</a>
            </li>
          </ul>
        </details>
      </div>
    </nav>
  );
}

/** Sectiebalk onder de TMC-hoofdnavigatie (sectie op themovementclub.nl). */
export function SectionBar({ active }: { active: HpPageKey }) {
  return (
    <div className={s.secbar}>
      <div className={s.wrap}>
        <b>
          <Link href={pageHref("section", "home")}>Hormoonprofiel</Link>
        </b>
        {NAV_SECTION.map((item) => (
          <Link
            key={item.key}
            href={pageHref("section", item.key)}
            className={item.key === active ? s.on : undefined}
            aria-current={item.key === active ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Footer van hormoonprofiel.com (standalone). */
export function StandaloneFooter() {
  const v: HpVariant = "standalone";
  return (
    <footer className={s.siteFoot}>
      <div className={s.wrap}>
        <div className={s.footGrid}>
          <div>
            <Wordmark />
            <p style={{ marginTop: 14, lineHeight: 1.55 }}>
              Personal Hormonal Profiling bij Marlon van der Leij, in The Movement Club in
              Loosdrecht.
            </p>
          </div>
          <div>
            <h4>Informatie</h4>
            <ul>
              {FOOTER_INFO.map((item) => (
                <li key={item.key}>
                  <Link href={pageHref(v, item.key)}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className={s.hl}>
            <h4>The Movement Club</h4>
            <ul>
              <li>
                <a href={tmcHref(v, "/personal-training")}>Personal training</a>
              </li>
              <li>
                <a href={tmcHref(v, "/12-weken-programma")}>12-weken programma</a>
              </li>
              <li>
                <a href={tmcHref(v, "/aanbod")}>Groepslessen</a>
              </li>
              <li>
                <a href={tmcHref(v, "/")}>themovementclub.nl</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li>{CONTACT.street}</li>
              <li>
                {CONTACT.zip} {CONTACT.city}
              </li>
              <li>
                <a href={`mailto:${CONTACT.emailStandalone}`}>{CONTACT.emailStandalone}</a>
              </li>
              <li>
                <a href={`tel:${CONTACT.phoneE164}`}>{CONTACT.phoneDisplay}</a>
              </li>
              <li>
                <a href={CONTACT.instagramUrl}>Instagram {CONTACT.instagramHandle}</a>
              </li>
            </ul>
          </div>
        </div>
        <div className={s.footLegal}>
          <a href={tmcHref(v, "/privacybeleid")}>Privacybeleid</a>
          <span>Een onderdeel van The Movement Club</span>
        </div>
      </div>
    </footer>
  );
}
